// Ajuda a preencher um rascunho da Biblioteca de Conhecimento (sintomas,
// remédios naturais, óleos, ervas, etc.) usando a Gemini como ponto de
// partida — NUNCA para guardar automaticamente. O texto devolvido entra
// sempre nos campos do formulário para o profissional rever, corrigir e
// confirmar as fontes antes de guardar — este ficheiro nunca escreve
// diretamente na base de dados. É só uma ajuda de rascunho, não uma
// fonte de verdade.
exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Pesquisa por IA ainda não está configurada (falta a GEMINI_API_KEY nas variáveis de ambiente do Netlify).' }) };
  }

  try {
    const { tema, titulo } = JSON.parse(event.body || '{}');
    if (!titulo) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Falta o título.' }) };
    }

    const prompt = `És um assistente de investigação para um profissional de saúde/terapias naturais em Portugal, a preparar uma ficha de consulta rápida sobre "${titulo}"${tema ? ` (tema: ${tema})` : ''}.

Escreve em português europeu. Responde SÓ em formato JSON válido, sem markdown, sem crases, com exatamente estas chaves:
{
  "resumo": "2-3 frases a explicar o que é / contexto geral",
  "ingredientes": "lista dos remédios/produtos/ingredientes naturais mais usados para isto, com medidas típicas quando aplicável",
  "comoFazer": "modo de preparação passo a passo, se aplicável",
  "comoTomar": "modo de uso/aplicação e frequência típica",
  "cuidados": "contraindicações, precauções de segurança, e para quem NÃO é recomendado (grávidas, crianças, condições médicas, interações)"
}

Sê concreto e prático, mas deixa claro que isto é um ponto de partida para o profissional confirmar — nunca apresentes como certeza absoluta. Não incluas nada fora do JSON.`;

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) {
      console.error('Gemini falhou:', await res.text());
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'A pesquisa falhou — tente novamente ou escreva manualmente.' }) };
    }
    const data = await res.json();
    let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    texto = texto.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

    let rascunho;
    try { rascunho = JSON.parse(texto); }
    catch (e) { return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'A resposta veio num formato inesperado — tente novamente.' }) }; }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, rascunho }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro no servidor.' }) };
  }
};
