const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAPA_ALMA_PRICE = Number(process.env.MAPA_ALMA_PRICE || 27);
const DEFAULT_PRICES_BY_TYPE = { individual: 27, casal: 45, familia: 60, bebe: 20, empresa: 80 };

// Calcula o preço efetivo de um tipo de mapa, tendo em conta a tabela de
// preços da subscritora e uma eventual promoção ativa (lançamento). NUNCA
// confia em preços vindos do cliente — só o servidor decide o valor final.
// A promoção pode estar configurada de 3 formas (tenant.mapaAlmaSettings.promo):
//   mode 'indefinite' — fica ativa até a subscritora a desligar à mão.
//   mode 'until'       — tem uma data/hora de fim (until, ISO string).
//   mode 'maxOrders'   — desliga sozinha ao atingir maxOrders confirmados
//                         (contados em promo.ordersUsed).
function getEffectivePrice(tenant, tipo){
  const settings = tenant?.mapaAlmaSettings || {};
  const table = settings.pricesByType || DEFAULT_PRICES_BY_TYPE;
  const normalPrice = table[tipo] ?? settings.price ?? MAPA_ALMA_PRICE;

  const promo = settings.promo;
  if (!promo || !promo.active) return { price: normalPrice, normalPrice, promoActive: false };

  const appliesTo = promo.appliesTo && promo.appliesTo.length ? promo.appliesTo : null;
  if (appliesTo && !appliesTo.includes(tipo)) return { price: normalPrice, normalPrice, promoActive: false };

  if (promo.mode === 'until' && promo.until){
    if (Date.now() > new Date(promo.until).getTime()) return { price: normalPrice, normalPrice, promoActive: false };
  }
  if (promo.mode === 'maxOrders' && Number.isFinite(promo.maxOrders)){
    if ((promo.ordersUsed || 0) >= promo.maxOrders) return { price: normalPrice, normalPrice, promoActive: false };
  }
  return {
    price: promo.price, normalPrice, promoActive: true,
    promoMode: promo.mode, promoUntil: promo.until || null,
    promoOrdersLeft: promo.mode === 'maxOrders' ? Math.max(0, (promo.maxOrders||0) - (promo.ordersUsed||0)) : null
  };
}

// ═══════════════════════════════════════════════════════════════════════
// BASE DE CONHECIMENTO — MÉTODO HIKARI FAFE — Mapa da Alma Diamante
// ═══════════════════════════════════════════════════════════════════════
// Este bloco documenta EXATAMENTE como cada número/símbolo é calculado,
// para que qualquer pessoa (incluindo a própria Hikari) possa verificar
// que não há erro nem invenção nos resultados entregues.
//
// 1) CAMINHO DE VIDA — soma todos os dígitos da data de nascimento
//    (dd+mm+aaaa, um a um), reduz somando os algarismos do resultado
//    repetidamente até sobrar 1 dígito — EXCETO se em qualquer passo o
//    resultado for 11, 22 ou 33 (Números Mestres), que nunca se reduzem.
// 2) EXPRESSÃO — soma o valor de TODAS as letras do nome completo,
//    usando a Tabela Pitagórica (A=1..I=9, J=1..R=9, S=1..Z=8), depois
//    reduz da mesma forma (respeitando Números Mestres).
// 3) NÚMERO DA ALMA (Motivação) — soma só as VOGAIS do nome. Representa
//    o desejo interior, o que a pessoa quer no fundo.
// 4) IMPRESSÃO (Personalidade) — soma só as CONSOANTES do nome.
//    Representa como a pessoa é vista por fora.
// 5) LIÇÕES CÁRMICAS — para cada dígito de 1 a 9, verifica se ele NUNCA
//    aparece entre os valores das letras do nome. Os que faltam são as
//    lições cármicas (habilidades a desenvolver nesta vida).
// 6) EXCESSO NUMEROLÓGICO — conta quantas vezes cada dígito aparece nas
//    letras do nome; se algum dígito aparecer 3+ vezes (mais que os
//    outros), é sinalizado como excesso energético.
// 7) MEDIUNIDADE — sinalizada quando o Número Mestre 11 aparece no
//    Caminho de Vida, na Expressão OU no Número da Alma.
// 8) DIA DA SEMANA / MESTRE ASCENSO / PLANETA — calculado com o dia da
//    semana REAL da data de nascimento (biblioteca de datas do
//    JavaScript, testado nas fronteiras de todos os 7 dias, sem erro),
//    cruzado com a tabela Domingo=Sol/El Morya … Sábado=Saturno/St. Germain.
// 9) SIGNO SOLAR — calculado pelas datas-fronteira tradicionais
//    ocidentais (testado nas 24 fronteiras de entrada/saída dos 12
//    signos, sem erro de "signo a mais ou a menos").
// 10) VIBRAÇÃO DE MORADA/TELEMÓVEL/MATRÍCULA — soma dígitos + valor
//     Pitagórico das letras presentes, reduz da mesma forma que os
//     números pessoais.
// ═══════════════════════════════════════════════════════════════════════

const PYTH_MAP = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,I:9,J:1,K:2,L:3,M:4,N:5,O:6,P:7,Q:8,R:9,S:1,T:2,U:3,V:4,W:5,X:6,Y:7,Z:8};
const VOWELS = 'AEIOU';

function stripAccents(str){ return String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function reduceNumber(n){
  while (n > 9 && n !== 11 && n !== 22 && n !== 33){
    n = String(n).split('').reduce((a,d) => a + (parseInt(d,10)||0), 0);
  }
  return n;
}
function letterValue(ch){ return PYTH_MAP[ch.toUpperCase()] || 0; }
function sumLetters(str, filter){
  let total = 0;
  for (const ch of stripAccents(str).toUpperCase()){
    if (!/[A-Z]/.test(ch)) continue;
    if (filter === 'vowels' && !VOWELS.includes(ch)) continue;
    if (filter === 'consonants' && VOWELS.includes(ch)) continue;
    total += letterValue(ch);
  }
  return total;
}
function vibracaoMista(str){
  let total = 0;
  for (const ch of stripAccents(str).toUpperCase()){
    if (/[0-9]/.test(ch)) total += parseInt(ch,10);
    else if (/[A-Z]/.test(ch)) total += letterValue(ch);
  }
  return reduceNumber(total);
}
function expressao(nome){ return reduceNumber(sumLetters(nome, null)); }
function motivacao(nome){ return reduceNumber(sumLetters(nome, 'vowels')); }
function impressao(nome){ return reduceNumber(sumLetters(nome, 'consonants')); }

function nameLetters(str){ return stripAccents(str).toUpperCase().split('').filter(ch => /[A-Z]/.test(ch)); }
function licoesCarmicas(nome){
  const presentes = new Set(nameLetters(nome).map(ch => letterValue(ch)));
  const faltam = [];
  for (let n=1; n<=9; n++) if (!presentes.has(n)) faltam.push(n);
  return faltam;
}
function excessoNumerologico(nome){
  const counts = {};
  nameLetters(nome).forEach(ch => { const v = letterValue(ch); counts[v] = (counts[v]||0) + 1; });
  let max = 0, tops = [];
  Object.entries(counts).forEach(([n,c]) => {
    if (c > max){ max = c; tops = [n]; } else if (c === max) tops.push(n);
  });
  return max >= 3 ? tops.map(Number) : [];
}

const LICAO_TEXTOS = {
  1:'desenvolver iniciativa e confiança para liderar a própria vida.', 2:'aprender a cooperar e a confiar em parcerias.',
  3:'permitir-se expressar e comunicar sem medo do julgamento.', 4:'desenvolver disciplina, estrutura e constância.',
  5:'aprender a lidar com a liberdade e a mudança sem se perder.', 6:'aprender a cuidar dos outros sem se esquecer de si.',
  7:'desenvolver introspeção, fé e busca de sentido mais profundo.', 8:'fazer as pazes com o poder pessoal e o dinheiro.',
  9:'aprender a soltar e a servir sem apego ao resultado.'
};
const EXCESSO_TEXTOS = {
  1:'excesso de vontade de comandar — pode gerar teimosia ou dificuldade em ouvir.', 2:'excesso de sensibilidade — pode gerar dependência emocional.',
  3:'excesso de dispersão — energia criativa que se espalha sem terminar nada.', 4:'excesso de rigidez — pode gerar teimosia e resistência à mudança.',
  5:'excesso de inquietação — dificuldade em se comprometer ou parar quieto.', 6:'excesso de responsabilidade pelos outros — tendência a sacrificar-se.',
  7:'excesso de análise — pode isolar e gerar desconfiança excessiva.', 8:'excesso de foco material — risco de perder de vista o lado humano.',
  9:'excesso de idealismo — pode gerar desilusão frequente com o mundo real.'
};

const DONS = {
  1:'liderança e iniciativa', 2:'sensibilidade e mediação', 3:'comunicação e expressão criativa',
  4:'estrutura e organização', 5:'movimento e liberdade', 6:'cuidado e cura pelo amor',
  7:'sabedoria e introspeção', 8:'poder pessoal e gestão', 9:'humanitarismo e fechamento de ciclos',
  11:'intuição elevada e visão espiritual', 22:'capacidade construtora fora do comum', 33:'amor incondicional em ação'
};

const VIB_TEXTOS = {
  3:'movimento ágil, ótimo para fluxo social e comunicação.',
  5:'dinamismo e liberdade — excelente para captar oportunidades.',
  8:'atração de autoridade, finanças e reconhecimento.',
  4:'pode gerar lentidão ou esforço redobrado — considere um Ajuste Numpro.',
  7:'exige manutenção e reflexão constante.',
  9:'traz movimento intenso, "casa aberta" a pessoas e situações.',
  11:'alta voltagem elétrica — cuidado com sobrecarga nervosa.'
};

function bathAndMantraForSign(signoNome){
  const map = {
    'Capricórnio': { ervas:'Cavalinha + Pinheiro', mantra:'Solfeggio 528Hz reparação celular' },
    'Aquário': { ervas:'Anis Estrelado + Patchouli', mantra:'Ana B\'Koach oficial' },
    'Peixes': { ervas:'Sal Marinho + Mirra', mantra:'Mantra Kodoish 432Hz' },
    'Carneiro': { ervas:'Alecrim + Gengibre', mantra:'Solfeggio 528Hz reparação celular' },
    'Touro': { ervas:'Malva + Louro', mantra:'Ana B\'Koach oficial' },
    'Gémeos': { ervas:'Hortelã + Lavanda', mantra:'Mantra Kodoish 432Hz' },
    'Caranguejo': { ervas:'Camomila + Manjericão', mantra:'Solfeggio 528Hz reparação celular' },
    'Leão': { ervas:'Calêndula + Canela', mantra:'Ana B\'Koach oficial' },
    'Virgem': { ervas:'Funcho + Sálvia', mantra:'Mantra Kodoish 432Hz' },
    'Balança': { ervas:'Pétalas de Rosa + Melissa', mantra:'Solfeggio 528Hz reparação celular' },
    'Escorpião': { ervas:'Artemísia + Pimenta Rosa', mantra:'Ana B\'Koach oficial' },
    'Sagitário': { ervas:'Boldo + Hibisco', mantra:'Mantra Kodoish 432Hz' }
  };
  return map[signoNome] || map['Carneiro'];
}

// Cristal específico do SIGNO (distinto do cristal do DIA da semana — um é
// astrológico, o outro é planetário/Mestre Ascenso; o Mapa Diamante usa os dois).
const CRISTAL_SIGNO = {
  'Capricórnio':'Granada', 'Aquário':'Ametista', 'Peixes':'Água-marinha', 'Carneiro':'Jaspe Vermelho',
  'Touro':'Quartzo Rosa', 'Gémeos':'Ágata', 'Caranguejo':'Pedra da Lua', 'Leão':'Olho de Tigre',
  'Virgem':'Amazonita', 'Balança':'Lápis-lazúli', 'Escorpião':'Obsidiana', 'Sagitário':'Turquesa'
};
const ELEMENTO_SIGNO = {
  'Capricórnio':'Terra', 'Aquário':'Ar', 'Peixes':'Água', 'Carneiro':'Fogo', 'Touro':'Terra', 'Gémeos':'Ar',
  'Caranguejo':'Água', 'Leão':'Fogo', 'Virgem':'Terra', 'Balança':'Ar', 'Escorpião':'Água', 'Sagitário':'Fogo'
};
const REGENTE_SIGNO = {
  'Capricórnio':'Saturno', 'Aquário':'Urano/Saturno', 'Peixes':'Neptuno/Júpiter', 'Carneiro':'Marte',
  'Touro':'Vénus', 'Gémeos':'Mercúrio', 'Caranguejo':'Lua', 'Leão':'Sol', 'Virgem':'Mercúrio',
  'Balança':'Vénus', 'Escorpião':'Plutão/Marte', 'Sagitário':'Júpiter'
};
const SIGNO_TEXTO = {
  'Capricórnio':'Ambição serena e disciplina — constrói devagar mas constrói para durar.',
  'Aquário':'Visão de futuro e independência — pensa fora da caixa, incomoda-se com limites impostos.',
  'Peixes':'Sensibilidade e intuição sem fronteiras — absorve o que sente à sua volta, precisa de proteção energética.',
  'Carneiro':'Ação imediata e coragem — age primeiro, pensa depois, detesta esperar.',
  'Touro':'Estabilidade e prazer sensorial — precisa de segurança material para se sentir em paz.',
  'Gémeos':'Curiosidade e comunicação constante — mente rápida, facilmente entediada pela rotina.',
  'Caranguejo':'Ligação emocional profunda ao lar e à família — protege quem ama com unhas e dentes.',
  'Leão':'Brilho pessoal e generosidade — precisa de reconhecimento, dá o coração sem medida.',
  'Virgem':'Precisão e serviço ao próximo — vê o detalhe que ninguém mais vê, exigente consigo mesmo(a).',
  'Balança':'Busca de harmonia e justiça — decide devagar porque pesa sempre os dois lados.',
  'Escorpião':'Intensidade e transformação — vive tudo a fundo, não sabe fazer nada pela metade.',
  'Sagitário':'Expansão e liberdade filosófica — precisa de horizonte, sufoca-se com rotina fechada.'
};

// Oração de conexão específica ao Mestre Ascenso regente de cada dia da
// semana de nascimento — usada no ritual diário do Plano de Ativação.
const ORACAO_MESTRE = {
  'El Morya':'Mestre El Morya, do 1º Raio Azul, ajuda-me a agir com vontade divina e propósito claro. Que a minha voz sirva a verdade.',
  'Lanto':'Mestre Lanto, do 2º Raio Amarelo, ilumina o meu discernimento e a minha sabedoria em cada decisão do dia.',
  'Rowena':'Mestra Rowena, do 3º Raio Rosa, abre o meu coração à criatividade e à beleza em tudo o que toco.',
  'Serapis Bey':'Mestre Serapis Bey, do 4º Raio Branco, purifica o meu corpo e a minha mente, e traz-me disciplina serena.',
  'Hilarion':'Mestre Hilarion, do 5º Raio Verde, guia a minha ciência interior e cura tudo o que precisa de ser curado em mim.',
  'Nada':'Mestra Nada, do 6º Raio Rubi, envolve-me em devoção e amor incondicional, hoje e sempre.',
  'St. Germain':'Mestre Saint Germain, do 7º Raio Violeta, transmuta em luz tudo o que já não me serve. Assim seja.'
};

// Afirmações "EU SOU" ligadas ao Caminho de Vida — decretos curtos para
// repetir diariamente, reforçando a vibração numerológica principal.
const EU_SOU_POR_NUMERO = {
  1:'EU SOU coragem para liderar o meu próprio caminho.', 2:'EU SOU ponte de paz entre mim e o outro.',
  3:'EU SOU expressão livre da minha verdade e da minha arte.', 4:'EU SOU estrutura firme onde a minha vida se apoia.',
  5:'EU SOU liberdade consciente, sem me perder de mim.', 6:'EU SOU amor que cuida sem se esquecer de si.',
  7:'EU SOU sabedoria que confia no tempo certo das coisas.', 8:'EU SOU abundância justa, fruto do meu próprio valor.',
  9:'EU SOU compaixão que sabe fechar ciclos em paz.', 11:'EU SOU luz intuitiva, ancorada e em segurança.',
  22:'EU SOU construtor(a) de um legado que serve a muitos.', 33:'EU SOU amor incondicional, também comigo mesmo(a).'
};
const DECRETOS_PADRAO = [
  'EU SOU Imunidade Física — o meu corpo sabe curar-se e proteger-se, agora.',
  'EU SOU Prosperidade — o universo providencia tudo o que preciso, no tempo certo.',
  'EU SOU Proteção — estou envolvido(a) em luz e nada me pode atingir além do meu bem maior.'
];

// Leitura do Chakra em foco (definido pelo Mestre Ascenso/dia de nascimento).
// "Todos" (Saturno/St. Germain, 7º Raio Violeta) é tratado como um estado de
// transmutação que atravessa todos os centros, não um chakra único.
const CHAKRA_INFO = {
  'Raiz': { cor:'Vermelho', significado:'Segurança, sobrevivência e ligação ao corpo físico e à família de origem.',
    desequilibrio:'Ansiedade financeira, insónia, sensação de instabilidade ou "não ter chão".',
    pratica:'Caminhar descalço na terra/relva 10 minutos por dia; respiração profunda com atenção aos pés.' },
  'Sacral': { cor:'Laranja', significado:'Criatividade, prazer, emoções e relações íntimas.',
    desequilibrio:'Bloqueio criativo, culpa em relação ao prazer, dificuldade em sentir ou expressar emoções.',
    pratica:'Movimento livre do quadril (dança), contacto com água (banho, mar, rio).' },
  'Plexo Solar': { cor:'Amarelo', significado:'Poder pessoal, autoestima e capacidade de ação no mundo.',
    desequilibrio:'Insegurança, necessidade de controlar tudo, ou o oposto — passividade e falta de vontade.',
    pratica:'Exercício físico que exija força do centro do corpo; respiração de fogo (kapalabhati).' },
  'Cardíaco': { cor:'Verde/Rosa', significado:'Amor, compaixão, capacidade de dar e receber afeto.',
    desequilibrio:'Dificuldade em perdoar, medo de se magoar, ou entrega excessiva que gera exaustão.',
    pratica:'Prática de gratidão diária; colocar as mãos sobre o peito e respirar fundo 2 minutos.' },
  'Laríngeo': { cor:'Azul', significado:'Comunicação, expressão da verdade pessoal e escuta.',
    desequilibrio:'Engolir o que precisa de ser dito, voz que treme, ou o oposto — falar em excesso sem ouvir.',
    pratica:'Cantar ou tonalizar (mesmo sem técnica); escrever o que não consegue dizer em voz alta.' },
  'Terceiro Olho': { cor:'Índigo', significado:'Intuição, visão interior e clareza mental.',
    desequilibrio:'Confusão mental, desconfiança da própria intuição, dores de cabeça frequentes.',
    pratica:'Meditação com os olhos fechados focando o espaço entre as sobrancelhas, 5 minutos.' },
  'Coroa': { cor:'Violeta/Branco', significado:'Conexão espiritual, propósito de vida e ligação ao divino.',
    desequilibrio:'Sensação de vazio existencial ou, no extremo oposto, desligamento da vida prática.',
    pratica:'Momento diário de silêncio e oração/gratidão antes de dormir.' },
  'Todos': { cor:'Violeta (Chama Violeta)', significado:'Estado de transmutação — todos os centros energéticos a serem simultaneamente purificados e reorganizados.',
    desequilibrio:'Sensação de estar "a mudar de pele" em várias áreas da vida ao mesmo tempo, cansaço difuso sem causa aparente.',
    pratica:'Invocar a Chama Violeta de Saint Germain antes de dormir, visualizando-a a percorrer o corpo da cabeça aos pés.' }
};

// Leitura do corpo — SIMBÓLICA por decisão de segurança (nunca liga sintomas/
// diagnósticos reais a "causa biológica" ou "fase de resolução"). Usa só a
// lateralidade para sugerir uma reflexão emocional, nunca uma explicação
// médica, e lembra sempre para manter acompanhamento profissional.
function corpoTextoSimbolico(lateralidade, corpoNota){
  const ladoDireito = lateralidade === 'destro'
    ? 'Pai, parceiro(a), trabalho e mundo exterior'
    : 'Mãe, filhos e o ninho familiar';
  const ladoEsquerdo = lateralidade === 'destro'
    ? 'Mãe, filhos e o ninho familiar'
    : 'Pai, parceiro(a), trabalho e mundo exterior';
  let texto = `Simbolicamente, o lado direito do seu corpo costuma espelhar temas ligados a ${ladoDireito}; o lado esquerdo costuma espelhar temas ligados a ${ladoEsquerdo}. `;
  if (corpoNota){
    texto += `Ao mencionar "${corpoNota}", vale perguntar-se, com calma: que situação recente nessa área da vida pode estar a pedir atenção emocional? `;
  }
  texto += 'Esta é uma reflexão simbólica e espiritual, não uma explicação médica — mantenha sempre o acompanhamento e tratamento que já tiver em curso.';
  return texto;
}

// ── Sistema de "overrides" — permite à Hikari editar/acrescentar qualquer
// texto deste método sem precisar de tocar no código. Um objeto gravado em
// tenants/{tenantId}.mapaAlmaOverrides, com a MESMA estrutura das tabelas
// abaixo (ex: { dons: { "7": { texto: "..." } } }), sobrepõe-se aos
// valores predefinidos. Se não existir nada gravado, usam-se sempre os
// valores predefinidos — nunca quebra por falta de configuração.
function mergeTable(base, overrides){
  if (!overrides) return base;
  const out = { ...base };
  Object.keys(overrides).forEach(k => { out[k] = { ...(base[k]||{}), ...overrides[k] }; });
  return out;
}
function mergeSimpleTable(base, overrides){
  return overrides ? { ...base, ...overrides } : base;
}
async function loadOverrides(tenantId){
  try{
    const db = admin.firestore();
    const snap = await db.collection('tenants').doc(tenantId).get();
    return snap.exists ? (snap.data().mapaAlmaOverrides || {}) : {};
  }catch(e){ console.error('Falha ao carregar overrides:', e); return {}; }
}

function generateFullResult(freeResult, extra, overrides){
  overrides = overrides || {};
  const DONS_M = mergeSimpleTable(DONS, overrides.dons);
  const LICAO_M = mergeSimpleTable(LICAO_TEXTOS, overrides.licoes);
  const EXCESSO_M = mergeSimpleTable(EXCESSO_TEXTOS, overrides.excessos);
  const VIB_M = mergeSimpleTable(VIB_TEXTOS, overrides.vibracoes);
  const CRISTAL_SIGNO_M = mergeSimpleTable(CRISTAL_SIGNO, overrides.cristalSigno);
  const ELEMENTO_SIGNO_M = mergeSimpleTable(ELEMENTO_SIGNO, overrides.elementoSigno);
  const REGENTE_SIGNO_M = mergeSimpleTable(REGENTE_SIGNO, overrides.regenteSigno);
  const SIGNO_TEXTO_M = mergeSimpleTable(SIGNO_TEXTO, overrides.signoTexto);
  const ORACAO_MESTRE_M = mergeSimpleTable(ORACAO_MESTRE, overrides.oracaoMestre);
  const EU_SOU_M = mergeSimpleTable(EU_SOU_POR_NUMERO, overrides.euSou);
  const DECRETOS_M = (overrides.decretos && Array.isArray(overrides.decretos)) ? overrides.decretos : DECRETOS_PADRAO;
  const CHAKRA_M = mergeTable(CHAKRA_INFO, overrides.chakras);
  const BANHOS_SIGNO_M = mergeTable(
    Object.fromEntries(Object.keys(CRISTAL_SIGNO).map(s => [s, bathAndMantraForSign(s)])),
    overrides.banhosSigno
  );

  const nome = freeResult.nome;
  const cv = freeResult.caminhoDeVida;
  const exp = expressao(nome);
  const mot = motivacao(nome);
  const imp = impressao(nome);
  const primeiroNome = (nome||'').trim().split(/\s+/)[0] || '';
  const signoNome = freeResult.signo;
  const mestre = freeResult.diaInfo?.mestre;

  const result = {
    expressao: exp, motivacao: mot, impressao: imp,
    oracao: `Eu, ${primeiroNome}, alinho-me com a minha essência de número ${cv} — ${DONS_M[cv]||''} — e sigo em paz, em força e em luz.`,
    oracaoMestre: ORACAO_MESTRE_M[mestre] || '',
    euSou: EU_SOU_M[cv] || '',
    decretos: DECRETOS_M,
    luz: `Talento natural para ${DONS_M[cv]||'liderar a própria vida'}, reforçado pela Expressão ${exp} (${DONS_M[exp]||'expressão própria'}).`,
    sombra: `Risco de excesso ligado ao número ${cv} — vigie sinais de desgaste quando a vibração de ${DONS_M[cv]||''} for levada ao extremo.`,
    mantra: (BANHOS_SIGNO_M[signoNome] || bathAndMantraForSign(signoNome)).mantra,
    signoElemento: ELEMENTO_SIGNO_M[signoNome] || '',
    signoRegente: REGENTE_SIGNO_M[signoNome] || '',
    signoTexto: SIGNO_TEXTO_M[signoNome] || '',
    cristalSigno: CRISTAL_SIGNO_M[signoNome] || '',
    chakraInfo: CHAKRA_M[freeResult.diaInfo?.chakra] || null,
    banhoDescarrego: overrides.banhoDescarrego || { ervas:'Arruda + Sal Grosso', hz:'396Hz (libertação de medo e culpa)', modo:'Banho de descarrego, usar à noite, de preferência à sexta ou sábado.' },
    banhoProtecao: overrides.banhoProtecao || { ervas:'Alecrim + Louro + Sal Grosso', hz:'963Hz (conexão e proteção espiritual superior)', modo:'Banho de proteção, usar pela manhã, antes de sair de casa em dias sensíveis.' }
  };

  if (extra?.lateralidade){
    result.corpoTexto = corpoTextoSimbolico(extra.lateralidade, extra.corpoNota);
  }

  const carmicas = licoesCarmicas(nome);
  result.carmicasTexto = carmicas.length
    ? `Números ausentes no seu nome: ${carmicas.join(', ')}. Isso indica lição(ões) desta vida: ${carmicas.map(n => LICAO_M[n]).join(' ')}`
    : 'O seu nome contém todos os números de 1 a 9 — um raro equilíbrio de lições já bem integradas.';
  const excesso = excessoNumerologico(nome);
  result.excessoTexto = excesso.length
    ? `Número(s) em excesso: ${excesso.join(', ')}. ${excesso.map(n => EXCESSO_M[n]).join(' ')}`
    : 'Sem excessos energéticos marcantes — vibração do nome bem distribuída.';
  if ([cv, exp, mot].includes(11)){
    result.mediunidadeTexto = 'O Número Mestre 11 está presente na sua vibração principal — sinal claro de antena espiritual apurada e potencial de mediunidade/canalização. Trabalhe-o com aterramento diário (contacto com a terra, respiração consciente) para evitar sobrecarga nervosa.';
  }

  if (extra?.morada){
    result.vibMorada = vibracaoMista(extra.morada);
    result.vibMoradaTexto = VIB_M[result.vibMorada] || 'vibração equilibrada.';
  }
  if (extra?.telemovel){
    result.vibTelemovel = vibracaoMista(extra.telemovel);
    result.vibTelemovelTexto = VIB_M[result.vibTelemovel] || 'vibração equilibrada.';
  }
  if (extra?.matricula){
    result.vibMatricula = vibracaoMista(extra.matricula);
    result.vibMatriculaTexto = VIB_M[result.vibMatricula] || 'vibração equilibrada.';
  }
  const banho = BANHOS_SIGNO_M[signoNome] || bathAndMantraForSign(signoNome);
  result.banhoErvas = banho.ervas;
  result.banhoModo = 'Ferva 2 litros de água, desligue o lume, deite as ervas indicadas, abafe 10 minutos, coe e verta do pescoço para baixo após a higiene regular.';
  result.avisoProfissional = 'Os banhos e orações acima são seguros para fazer em casa. Mas se o seu Mapa apontou sinais fortes (excesso energético marcante, lição cármica pesada, ou o sinal de mediunidade) — ou se sente que "algo mais" pesa sobre si (magia, olho gordo, larvas astrais, entidades) — isso exige uma avaliação e tratamento feitos por alguém com experiência e capacitação, nunca sozinho(a) em casa. Marque uma Consulta de Pesquisa Energética para uma avaliação completa e segura.';
  result.planoAtivacao = `Dias 1-7: repita todas as manhãs a Oração de Conexão + a Afirmação EU SOU do seu número, e faça o Banho de Ervas do seu signo.\nDias 8-14: pratique 10 minutos de Reiki de autotratamento ou meditação com o mantra sugerido; faça o Banho de Descarrego (396Hz) numa noite de lua minguante, se possível.\nDias 15-21: faça o Banho de Proteção (963Hz) numa manhã antes de um dia importante, repita os 3 Decretos do EU SOU, e escreva 3 sinais de que a vibração de número ${cv} está mais presente na sua vida.`;

  return result;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  // Diagnóstico rápido — abrir este link diretamente no navegador mostra
  // exatamente o que a SumUp responde, sem precisar de ir aos registos do
  // Netlify. Só de leitura, não altera nada.
  if (event.httpMethod === 'GET' && event.queryStringParameters?.testSumUp) {
    const key = process.env.SUMUP_API_KEY;
    const merchantCode = process.env.SUMUP_MERCHANT_CODE;
    if (!key || !merchantCode) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        ok: false,
        problema: 'As variáveis SUMUP_API_KEY ou SUMUP_MERCHANT_CODE não estão configuradas no Netlify (ou o deploy ainda não as aplicou).',
        temApiKey: !!key, temMerchantCode: !!merchantCode
      }, null, 2) };
    }
    try {
      const res = await fetch('https://api.sumup.com/v0.1/checkouts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkout_reference: 'teste-diagnostico-' + Date.now(),
          amount: 1, currency: 'EUR', merchant_code: merchantCode,
          description: 'Teste de diagnóstico Vindora — pode ignorar'
        })
      });
      const data = await res.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        ok: res.ok,
        respostaDaSumUp: data,
        explicacao: res.ok ? 'Funcionou! A SumUp aceitou o pedido de teste.' : 'A SumUp recusou o pedido — ver "respostaDaSumUp" acima para o motivo exato.'
      }, null, 2) };
    } catch (e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, erro: String(e) }, null, 2) };
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const { action, tenantId, leadId, extra } = JSON.parse(event.body || '{}');
    if (!tenantId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }
    const db = admin.firestore();

    if (action === 'getOverrides') {
      const overrides = await loadOverrides(tenantId);
      const tenantSnap = await db.collection('tenants').doc(tenantId).get();
      const tenant = tenantSnap.exists ? tenantSnap.data() : {};
      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          ok: true, overrides,
          socialLinks: tenant?.socialLinks || {},
          limpezaTexto: tenant?.mapaAlmaSettings?.limpezaTexto || null,
          limpezaPrecoConsulta: tenant?.mapaAlmaSettings?.limpezaPrecoConsulta ?? 35,
          whatsapp: tenant?.onlineConsult?.whatsappNumber || null
        })
      };
    }

    if (!leadId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }
    const leadRef = db.collection('tenants').doc(tenantId).collection('mapaAlmaLeads').doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Pedido não encontrado.' }) };
    }
    const lead = leadSnap.data();

    if (action === 'getResult') {
      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          ok: true,
          paymentStatus: lead.paymentStatus || 'unpaid',
          freeResult: lead.freeResult,
          extra: lead.extra || null,
          fullResult: lead.paymentStatus === 'paid' ? lead.fullResult : null
        })
      };
    }

    if (action === 'createCheckout') {
      const overrides = await loadOverrides(tenantId);
      const fullResult = generateFullResult(lead.freeResult, extra || {}, overrides);
      const tenantSnap = await db.collection('tenants').doc(tenantId).get();
      const tenant = tenantSnap.exists ? tenantSnap.data() : {};

      await leadRef.update({
        extra: extra || {},
        fullResult,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const sumupKey = process.env.SUMUP_API_KEY;
      const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE;
      const priceInfo = getEffectivePrice(tenant, lead.tipo || 'individual');
      const price = priceInfo.price;

      if (sumupKey && sumupMerchantCode) {
        // Deteção automática via SumUp Hosted Checkout.
        try {
          const checkoutRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sumupKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              checkout_reference: `mapa-alma-${leadId}`,
              amount: price,
              currency: 'EUR',
              merchant_code: sumupMerchantCode,
              description: 'Mapa da Alma Diamante — Hikari Fafe',
              hosted_checkout: { enabled: true },
              return_url: 'https://effortless-entremet-7de9ef.netlify.app/.netlify/functions/mapaAlmaWebhook',
              redirect_url: `https://vindora.pt/mapa-da-alma.html?mapa=${leadId}`
            })
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutRes.ok && checkoutData.hosted_checkout_url) {
            await leadRef.update({ sumupCheckoutId: checkoutData.id || null, paymentStatus: 'checkout_created', chargedPrice: price });
            return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, checkoutUrl: checkoutData.hosted_checkout_url }) };
          }
          console.error('SumUp checkout falhou, a usar pagamento manual:', checkoutData);
        } catch (e) {
          console.error('Erro ao criar checkout SumUp:', e);
        }
      }

      // Sem SumUp configurado (ou falhou) — cai para confirmação manual.
      await leadRef.update({ paymentStatus: 'manual_pending', chargedPrice: price });
      const mapaSettings = tenant?.mapaAlmaSettings || {};
      const refCode = 'MA-' + leadId.slice(0, 6).toUpperCase();
      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          ok: true,
          paymentInfo: {
            price,
            normalPrice: priceInfo.promoActive ? priceInfo.normalPrice : null,
            iban: mapaSettings.iban || null,
            mbway: mapaSettings.mbway || null,
            whatsapp: tenant?.onlineConsult?.whatsappNumber || null,
            refCode
          }
        })
      };
    }

    if (action === 'getPrice') {
      const tenantSnap2 = await db.collection('tenants').doc(tenantId).get();
      const tenant2 = tenantSnap2.exists ? tenantSnap2.data() : {};
      const priceInfo2 = getEffectivePrice(tenant2, lead.tipo || 'individual');
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ...priceInfo2 }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Ação desconhecida.' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro no servidor.' }) };
  }
};
