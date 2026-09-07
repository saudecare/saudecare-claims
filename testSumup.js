// Função só de diagnóstico — testa se a chave SUMUP_API_KEY e o
// SUMUP_MERCHANT_CODE configurados no Netlify realmente funcionam,
// chamando a SumUp diretamente. Não faz nada mais, não mexe em dados.
// Depois de resolvido o problema, este ficheiro pode ser apagado.
exports.handler = async function () {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const key = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!key || !merchantCode) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: false,
        problema: 'Uma das variáveis não está configurada no Netlify (ou o deploy ainda não as aplicou).',
        temApiKey: !!key,
        temMerchantCode: !!merchantCode
      }, null, 2)
    };
  }

  try {
    const res = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkout_reference: 'teste-diagnostico-' + Date.now(),
        amount: 1,
        currency: 'EUR',
        merchant_code: merchantCode,
        description: 'Teste de diagnóstico Vindora'
      })
    });
    const data = await res.json();
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: res.ok,
        respostaDaSumUp: data,
        explicacao: res.ok
          ? 'Funcionou! A SumUp aceitou o pedido de teste — o pagamento automático deve estar operacional.'
          : 'A SumUp recusou — ver "respostaDaSumUp" para o motivo exato.'
      }, null, 2)
    };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, erro: String(e && e.message || e) }, null, 2) };
  }
};
