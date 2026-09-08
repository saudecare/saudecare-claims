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

const FOCO_TEXTO = {
  amor: 'no campo do amor e das relações',
  trabalho: 'no campo do trabalho e da vida profissional',
  decisao: 'sobre a decisão rápida que está a ponderar',
  momento: 'sobre o momento presente da sua vida'
};

function gerarTendenciaGeral(cartas, foco){
  const focoTxt = FOCO_TEXTO[foco] || FOCO_TEXTO.momento;
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
      const { leadId, nome, contacto, foco, pergunta, numCartas } = body;
      if (!leadId || !nome || !contacto) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
      }
      const n = numCartas === 1 ? 1 : 3;
      const cartas = tirarCartas(n);
      const tendenciaGeral = gerarTendenciaGeral(cartas, foco);
      const primeiraReflexao = gerarPrimeiraReflexao(cartas);

      const tenantSnap = await db.collection('tenants').doc(tenantId).get();
      const tenant = tenantSnap.exists ? tenantSnap.data() : {};
      const whatsapp = tenant?.onlineConsult?.whatsappNumber || null;

      await db.collection('tenants').doc(tenantId).collection('cartomanciaLeads').doc(leadId).set({
        nome, contacto, foco: foco || 'momento', pergunta: pergunta || '',
        numCartas: n, cartas: cartas.map(c => ({ valor: c.valor, naipeKey: c.naipeKey, nomeCarta: c.nomeCarta })),
        tendenciaGeral, primeiraReflexao, origem: 'publico',
        createdAt: new Date().toISOString()
      });

      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({ ok: true, leitura: { nome, foco, cartas, tendenciaGeral, primeiraReflexao, whatsapp } })
      };
    }

    // Usado no painel da Hikari — consulta profissional (presencial, feita
    // com o baralho físico) ou sorteio na app, com 1, 3 ou 5 cartas + uma
    // carta de tempo opcional. Devolve um relatório mais completo.
    if (action === 'gerarConsultaProfissional') {
      const { nome, foco, pergunta, cartasEscolhidas, cartaTempo, sortear, numCartas } = body;
      let cartas;
      if (sortear) {
        cartas = tirarCartas(numCartas || 3);
      } else {
        cartas = (cartasEscolhidas || []).map(c => detalharCarta(c.valor, c.naipeKey));
      }
      const tendenciaGeral = gerarTendenciaGeral(cartas, foco);
      const posicoes = cartas.length === 5
        ? ['Situação atual','Desafio/bloqueio','Passado recente','Futuro próximo','Conselho/resultado provável']
        : cartas.length === 3
          ? ['Passado','Presente','Futuro']
          : ['Resposta'];
      const leituraPorPosicao = cartas.map((c, i) => ({
        posicao: posicoes[i] || `Carta ${i+1}`, carta: c.nomeCarta, simbolo: c.simbolo, significado: c.significado
      }));
      const bloqueios = cartas.filter(c => ['espadas'].includes(c.naipeKey) || ['5','7','9'].includes(c.valor))
        .map(c => `${c.nomeCarta}: ${c.significado}`);
      const conselhoPratico = `Com base no conjunto, o passo mais direto agora é agir sobre a carta "${cartas[cartas.length-1]?.nomeCarta}" — ${cartas[cartas.length-1]?.significado}.`;
      let janelaTemporal = null;
      const cartaDeTempo = cartaTempo ? detalharCarta(cartaTempo.valor, cartaTempo.naipeKey) : null;
      if (cartaDeTempo) janelaTemporal = { carta: cartaDeTempo.nomeCarta, texto: tempoEstimado(cartaDeTempo) };

      return {
        statusCode: 200, headers: cors,
        body: JSON.stringify({
          ok: true,
          relatorio: { nome, foco, pergunta, cartas, leituraPorPosicao, tendenciaGeral, bloqueios, conselhoPratico, janelaTemporal }
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
