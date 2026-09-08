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

// ═══════════════════════════════════════════════════════════════════════
// BASE CARTOMÂNTICA — MÉTODO HIKARI FAFE — Cartomancia Prática
// ═══════════════════════════════════════════════════════════════════════
// Baralho de 52 cartas, tradição clássica de cartomancia (francesa/cigana):
//   Paus   ♣ — Ação / iniciativa / trabalho prático  → unidade de tempo: DIAS
//   Copas  ♥ — Emoções / relações / desejos           → unidade de tempo: SEMANAS
//   Espadas♠ — Mente / conflitos / decisões            → unidade de tempo: MESES
//   Ouros  ♦ — Matéria / dinheiro / resultados          → unidade de tempo: ANOS
// Valor da carta (Ás=1 … 10=10, Valete=11, Dama=12, Rei=13) indica a
// QUANTIDADE dessa unidade de tempo — ex: 7 de Copas → tendência a
// concretizar-se em 7 semanas. Cartas da corte (J/Q/K) representam mais
// frequentemente pessoas/energias do que prazos rígidos — por isso o
// relatório assinala isso sempre que uma delas calha na "carta de tempo".
// Esta é uma ferramenta de reflexão espiritual — os prazos são indicativos,
// nunca uma promessa, e nunca substituem aconselhamento profissional.
// ═══════════════════════════════════════════════════════════════════════

const NAIPES = {
  paus:    { simbolo: '♣', nome: 'Paus',    tema: 'Ação/Iniciativa', unidade: 'dias' },
  copas:   { simbolo: '♥', nome: 'Copas',   tema: 'Emoções/Relações', unidade: 'semanas' },
  espadas: { simbolo: '♠', nome: 'Espadas', tema: 'Mente/Decisões', unidade: 'meses' },
  ouros:   { simbolo: '♦', nome: 'Ouros',   tema: 'Matéria/Resultados', unidade: 'anos' }
};
const VALORES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const VALOR_NUM = { A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13 };

const SIGNIFICADOS = {
  paus: {
    A:'novo projeto ou faísca de iniciativa a nascer', 2:'escolha entre dois caminhos de ação',
    3:'expansão, primeiros resultados de um esforço', 4:'estabilidade conquistada, celebração merecida',
    5:'competição ou tensão que exige ação', 6:'vitória reconhecida publicamente',
    7:'defender uma posição com persistência', 8:'movimento rápido, notícias a caminho',
    9:'resiliência, quase lá apesar do cansaço', 10:'sobrecarga — pedir ajuda ou delegar',
    J:'mensageiro entusiasta, ideia nova a explorar', Q:'pessoa confiante e independente que inspira ação',
    K:'liderança visionária, agir com autoridade'
  },
  copas: {
    A:'novo sentimento a nascer, abertura emocional', 2:'ligação, parceria ou reconciliação',
    3:'celebração em conjunto, amizade que floresce', 4:'apatia ou oportunidade emocional a ser vista',
    5:'perda a lamentar, mas ainda resta algo', 6:'nostalgia, reencontro com o passado',
    7:'escolhas emocionais confusas, ilusões a clarificar', 8:'afastar-se do que já não nutre',
    9:'satisfação e desejo realizado', 10:'harmonia familiar plena',
    J:'mensagem afetuosa ou pessoa sensível a chegar', Q:'pessoa intuitiva e compassiva, cuidado emocional',
    K:'maturidade emocional, equilíbrio entre razão e sentimento'
  },
  espadas: {
    A:'clareza mental repentina, verdade que emerge', 2:'impasse, decisão adiada por medo de escolher',
    3:'dor ou desilusão que precisa de ser sentida', 4:'pausa necessária, descanso da mente',
    5:'conflito com custo maior que o ganho', 6:'transição para águas mais calmas',
    7:'estratégia discreta, cuidado com meias-verdades', 8:'sensação de estar preso — a saída existe',
    9:'ansiedade noturna, medos maiores na mente que na realidade', 10:'fim de um ciclo doloroso, o pior já passou',
    J:'notícia direta ou pessoa muito analítica a chegar', Q:'pessoa clara e independente, corte necessário',
    K:'autoridade racional, decisão justa e fria'
  },
  ouros: {
    A:'nova oportunidade material ou financeira', 2:'equilibrar duas prioridades práticas',
    3:'trabalho em equipa a dar frutos', 4:'segurança conquistada — cuidado para não fechar demasiado a mão',
    5:'dificuldade material passageira, ajuda por perto', 6:'partilha justa de recursos',
    7:'paciência — o investimento ainda está a amadurecer', 8:'dedicação e aperfeiçoamento de uma competência',
    9:'independência conquistada pelo próprio esforço', 10:'estabilidade duradoura, legado a construir',
    J:'proposta prática ou pessoa jovem e trabalhadora', Q:'pessoa prática e generosa, cuidado com o concreto',
    K:'sucesso material consolidado, visão estratégica de longo prazo'
  }
};

function nomeCarta(valor, naipeKey){
  const nomesEspeciais = { A:'Ás', J:'Valete', Q:'Dama', K:'Rei' };
  return `${nomesEspeciais[valor] || valor} de ${NAIPES[naipeKey].nome}`;
}

function baralhoCompleto(){
  const baralho = [];
  Object.keys(NAIPES).forEach(naipeKey => {
    VALORES.forEach(valor => baralho.push({ naipeKey, valor }));
  });
  return baralho;
}

function tirarCartas(n){
  const baralho = baralhoCompleto();
  const escolhidas = [];
  for (let i = 0; i < n && baralho.length; i++){
    const idx = Math.floor(Math.random() * baralho.length);
    escolhidas.push(baralho.splice(idx, 1)[0]);
  }
  return escolhidas.map(c => detalharCarta(c.valor, c.naipeKey));
}

function detalharCarta(valor, naipeKey){
  const naipe = NAIPES[naipeKey];
  return {
    valor, naipeKey, simbolo: naipe.simbolo, naipeNome: naipe.nome,
    nomeCarta: nomeCarta(valor, naipeKey),
    significado: SIGNIFICADOS[naipeKey][valor],
    valorNum: VALOR_NUM[valor], unidadeTempo: naipe.unidade,
    ehCorte: ['J','Q','K'].includes(valor)
  };
}

function tempoEstimado(carta){
  if (carta.ehCorte){
    return `Esta carta é de corte — representa mais uma pessoa/energia a entrar em cena do que um prazo fixo, mas se quiser uma referência, pense em ${carta.valorNum} ${carta.unidadeTempo}.`;
  }
  return `Tendência a concretizar-se em cerca de ${carta.valorNum} ${carta.unidadeTempo}.`;
}

// Sinais espirituais detetados no conjunto de cartas — cruza com o mesmo
// serviço de Limpeza Energética já oferecido no Mapa da Alma. Nunca
// afirma nada como certeza ("magia confirmada"), só assinala um padrão
// que vale a pena investigar com mais profundidade (Pêndulo Hebreu).
const CARTAS_BLOQUEIO = ['espadas:5','espadas:7','espadas:8','espadas:9','espadas:10','copas:4','copas:5','copas:8'];
const CARTAS_FAVORAVEIS = ['ouros:A','ouros:3','ouros:6','ouros:8','ouros:9','ouros:10','copas:A','copas:9','copas:10'];
function detetarSinais(cartas){
  const chaves = cartas.map(c => `${c.naipeKey}:${c.valor}`);
  const nBloqueio = chaves.filter(k => CARTAS_BLOQUEIO.includes(k)).length;
  const nFavoravel = chaves.filter(k => CARTAS_FAVORAVEIS.includes(k)).length;
  let avisoBloqueio = null, avisoFavoravel = null;
  if (nBloqueio >= 2){
    avisoBloqueio = 'O conjunto de cartas mostra várias energias densas juntas — um padrão que, em cartomancia, costuma levar-nos a investigar se há magia, olho gordo, inveja ou um "encosto" (energia/entidade agarrada) a pesar sobre a situação. Também pode ser sinal de um ritual feito (por si ou por outra pessoa) cujo retorno está agora a manifestar-se. Vale a pena aprofundar com uma Consulta de Pesquisa Energética.';
  } else if (nBloqueio === 1){
    avisoBloqueio = 'Há uma carta de energia mais densa nesta tiragem — não é motivo de alarme sozinha, mas se sentir que "algo mais" pesa sobre si, vale a pena confirmar com uma avaliação mais profunda.';
  }
  if (nFavoravel >= 2){
    avisoFavoravel = 'Há uma boa concentração de cartas de crescimento e realização — energia favorável para novos projetos, para tudo o que estiver a nascer na sua vida (incluindo, se for o caso, fertilidade/gravidez).';
  }
  return { avisoBloqueio, avisoFavoravel };
}

const FOCO_TEXTO = {
  amor: 'no campo do amor e das relações',
  trabalho: 'no campo do trabalho e do dinheiro',
  saude: 'sobre o seu bem-estar e energia física/emocional',
  decisao: 'sobre a decisão rápida que está a ponderar',
  momento: 'sobre o momento presente da sua vida',
  simnao: 'sobre a pergunta de sim ou não que fez',
  geral: 'de forma geral, sobre a sua vida agora'
};

// Classificação tradicional sim/não/talvez por carta — usada só quando o
// foco escolhido é "Sim ou Não". Cartas de tom claramente positivo (novo
// começo, vitória, harmonia, realização) = sim; cartas de bloqueio, perda,
// conflito ou fim doloroso = não; cartas de transição/escolha = talvez.
const SIM_NAO = {
  paus:    { A:'sim', 2:'talvez', 3:'sim', 4:'sim', 5:'talvez', 6:'sim', 7:'sim', 8:'sim', 9:'sim', 10:'não', J:'talvez', Q:'sim', K:'sim' },
  copas:   { A:'sim', 2:'sim', 3:'sim', 4:'não', 5:'não', 6:'talvez', 7:'talvez', 8:'não', 9:'sim', 10:'sim', J:'talvez', Q:'sim', K:'sim' },
  espadas: { A:'talvez', 2:'não', 3:'não', 4:'talvez', 5:'não', 6:'talvez', 7:'não', 8:'não', 9:'não', 10:'não', J:'talvez', Q:'talvez', K:'talvez' },
  ouros:   { A:'sim', 2:'talvez', 3:'sim', 4:'talvez', 5:'não', 6:'sim', 7:'talvez', 8:'sim', 9:'sim', 10:'sim', J:'talvez', Q:'sim', K:'sim' }
};
function respostaSimNao(carta){
  const resposta = SIM_NAO[carta.naipeKey]?.[carta.valor] || 'talvez';
  const label = { sim: '✅ SIM', não: '❌ NÃO', talvez: '➖ TALVEZ / DEPENDE DE SI' }[resposta];
  return { resposta, texto: `${label} — ${carta.nomeCarta}: ${carta.significado}` };
}

function gerarTendenciaGeral(cartas, foco){
  const focoTxt = FOCO_TEXTO[foco] || FOCO_TEXTO.momento;
  if (foco === 'simnao' && cartas.length === 1){
    return respostaSimNao(cartas[0]).texto;
  }
  if (cartas.length === 1){
    return `A carta que saiu, ${cartas[0].nomeCarta}, fala de ${cartas[0].significado} — aplicado ${focoTxt}.`;
  }
  const [passado, presente, futuro] = cartas;
  return `Olhando ${focoTxt}: ${passado.nomeCarta} marca o que já passou — ${passado.significado}. ${presente.nomeCarta} mostra o momento atual — ${presente.significado}. ${futuro.nomeCarta} aponta para onde isto tende a ir — ${futuro.significado}.`;
}

function gerarPrimeiraReflexao(cartas){
  const ultima = cartas[cartas.length - 1];
  return `${tempoEstimado(ultima)} Isto é só a primeira camada — uma leitura completa cruza todas as cartas em conjunto, identifica bloqueios escondidos e dá um conselho prático passo a passo.`;
}

function calcularIdade(dataNascimento){
  if (!dataNascimento) return null;
  const nascimento = new Date(dataNascimento + 'T12:00:00');
  if (isNaN(nascimento)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAnos = (hoje.getMonth() < nascimento.getMonth()) ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAnos) idade--;
  return idade;
}

// Escreve a leitura com a Gemini, na voz da Hikari Fafe, respondendo
// diretamente à pergunta da pessoa com base nas cartas reais que saíram
// (nunca inventa cartas novas). Se a GEMINI_API_KEY não estiver
// configurada, ou a chamada falhar por qualquer motivo, devolve null e o
// código chamador usa sempre o texto de regras já calculado como reserva
// — nunca fica sem resposta por causa disto.
async function gerarInterpretacaoIA({ nome, dataNascimento, pergunta, foco, cartas, tipoTiragem }){
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const idade = calcularIdade(dataNascimento);
  const focoTxt = FOCO_TEXTO[foco] || FOCO_TEXTO.momento;
  const cartasTexto = cartas.map((c, i) => `${i+1}. ${c.nomeCarta} — significado tradicional: ${c.significado}`).join('\n');
  const instrucaoFoco = foco === 'simnao'
    ? `\nIMPORTANTE: esta é uma leitura de SIM ou NÃO. Comece a resposta com "SIM", "NÃO" ou "TALVEZ / DEPENDE DE SI" em maiúsculas, com base no tom da carta (positiva=sim, bloqueada/negativa=não, ambígua=talvez), e só depois explique porquê.`
    : foco === 'saude'
      ? `\nNota: mantenha a leitura no plano simbólico/energético (energia, ânimo, autocuidado) — nunca fale de doenças, diagnósticos ou tratamentos médicos específicos, e termine sempre a lembrar que isto não substitui uma consulta médica.`
      : '';

  const prompt = `Você é a Hikari Fafe, terapeuta espiritual e cartomante em Portugal. Escreva a interpretação desta tiragem de cartas em português europeu, na primeira pessoa, como se fosse a própria Hikari a falar diretamente com a pessoa — tom caloroso, direto e prático, sem promessas absolutas (é sempre uma tendência/reflexão, nunca uma certeza).

Cliente: ${nome}${idade != null ? ` (${idade} anos)` : ''}
Pergunta/foco: ${pergunta ? `"${pergunta}"` : `sem pergunta específica, ${focoTxt}`}
Tipo de tiragem: ${tipoTiragem}
${instrucaoFoco}
Cartas que saíram, pela ordem:
${cartasTexto}

Escreva SÓ com base nestas cartas e nos seus significados tradicionais — nunca invente outra carta. Responda diretamente à pergunta da pessoa, ligando as cartas entre si. Termine com um conselho prático e concreto para os próximos dias. Máximo 180 palavras, sem títulos nem marcadores, só texto corrido.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) { console.error('Gemini falhou:', await res.text()); return null; }
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return texto ? texto.trim() : null;
  } catch (e) {
    console.error('Erro ao chamar a Gemini:', e);
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, tenantId } = body;
    if (!tenantId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }
    const db = admin.firestore();

    if (action === 'criarLeitura') {
      const { leadId, nome, dataNascimento, contacto, foco, pergunta, numCartas } = body;
      if (!leadId || !nome || !contacto) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
      }
      const n = numCartas === 1 ? 1 : 3;
      const cartas = tirarCartas(n);
      const interpretacaoIA = await gerarInterpretacaoIA({
        nome, dataNascimento, pergunta, foco, cartas, tipoTiragem: n === 1 ? 'resposta rápida (1 carta)' : 'linha temporal (3 cartas)'
      });
      const tendenciaGeral = interpretacaoIA || gerarTendenciaGeral(cartas, foco);
      const primeiraReflexao = interpretacaoIA ? tempoEstimado(cartas[cartas.length - 1]) : gerarPrimeiraReflexao(cartas);
      const sinais = detetarSinais(cartas);

      const tenantSnap = await db.collection('tenants').doc(tenantId).get();
      const tenant = tenantSnap.exists ? tenantSnap.data() : {};
      const whatsapp = tenant?.onlineConsult?.whatsappNumber || null;
      const limpezaTexto = tenant?.mapaAlmaSettings?.limpezaTexto || null;
      const limpezaPrecoConsulta = tenant?.mapaAlmaSettings?.limpezaPrecoConsulta ?? 35;

      await db.collection('tenants').doc(tenantId).collection('cartomanciaLeads').doc(leadId).set({
        nome, dataNascimento: dataNascimento || null, contacto, foco: foco || 'momento', pergunta: pergunta || '',
        numCartas: n, cartas: cartas.map(c => ({ valor: c.valor, naipeKey: c.naipeKey, nomeCarta: c.nomeCarta })),
        tendenciaGeral, primeiraReflexao, sinais, origem: 'publico', geradoComIA: !!interpretacaoIA,
        createdAt: new Date().toISOString()
      });

      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({ ok: true, leitura: { nome, foco, cartas, tendenciaGeral, primeiraReflexao, sinais, whatsapp, limpezaTexto, limpezaPrecoConsulta } })
      };
    }

    // Usado no painel da Hikari — consulta profissional (presencial, feita
    // com o baralho físico) ou sorteio na app, com 1, 3 ou 5 cartas + uma
    // carta de tempo opcional. Devolve um relatório mais completo.
    if (action === 'gerarConsultaProfissional') {
      const { nome, dataNascimento, foco, pergunta, cartasEscolhidas, cartaTempo, sortear, numCartas } = body;
      let cartas;
      if (sortear) {
        cartas = tirarCartas(numCartas || 3);
      } else {
        cartas = (cartasEscolhidas || []).map(c => detalharCarta(c.valor, c.naipeKey));
      }
      const posicoes = cartas.length === 5
        ? ['Situação atual','Desafio/bloqueio','Passado recente','Futuro próximo','Conselho/resultado provável']
        : cartas.length === 3
          ? ['Passado','Presente','Futuro']
          : ['Resposta'];
      const interpretacaoIA = await gerarInterpretacaoIA({
        nome, dataNascimento, pergunta, foco, cartas, tipoTiragem: `${posicoes.join(' / ')}`
      });
      const tendenciaGeral = interpretacaoIA || gerarTendenciaGeral(cartas, foco);
      const leituraPorPosicao = cartas.map((c, i) => ({
        posicao: posicoes[i] || `Carta ${i+1}`, carta: c.nomeCarta, simbolo: c.simbolo, significado: c.significado
      }));
      const bloqueios = cartas.filter(c => ['espadas'].includes(c.naipeKey) || ['5','7','9'].includes(c.valor))
        .map(c => `${c.nomeCarta}: ${c.significado}`);
      const sinais = detetarSinais(cartas);
      const conselhoPratico = interpretacaoIA
        ? '(ver leitura completa acima, gerada com IA — já inclui o conselho prático)'
        : `Com base no conjunto, o passo mais direto agora é agir sobre a carta "${cartas[cartas.length-1]?.nomeCarta}" — ${cartas[cartas.length-1]?.significado}.`;
      let janelaTemporal = null;
      const cartaDeTempo = cartaTempo ? detalharCarta(cartaTempo.valor, cartaTempo.naipeKey) : null;
      if (cartaDeTempo) janelaTemporal = { carta: cartaDeTempo.nomeCarta, texto: tempoEstimado(cartaDeTempo) };

      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          ok: true,
          relatorio: { nome, foco, pergunta, cartas, leituraPorPosicao, tendenciaGeral, bloqueios, sinais, conselhoPratico, janelaTemporal, geradoComIA: !!interpretacaoIA }
        })
      };
    }

    if (action === 'listarLeituras') {
      const snap = await db.collection('tenants').doc(tenantId).collection('cartomanciaLeads')
        .orderBy('createdAt', 'desc').limit(200).get();
      const leituras = [];
      snap.forEach(d => leituras.push({ id: d.id, ...d.data() }));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, leituras }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Ação desconhecida.' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro no servidor.' }) };
  }
};
