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

// A SumUp chama isto sozinha (é o "return_url" que já vai dentro do pedido
// de criação do checkout, em mapaAlma.js — não é preciso configurar nada
// à parte no painel da SumUp). O formato real do aviso, confirmado na
// documentação oficial, é sempre só:
//   { "event_type": "CHECKOUT_STATUS_CHANGED", "id": "<id-do-checkout>" }
// Por segurança, a SumUp pede sempre para se confirmar o estado real do
// checkout através da API antes de confiar no aviso — é o que fazemos aqui.
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const checkoutId = payload?.id;
    if (!checkoutId) {
      // Evento que não reconhecemos — responde OK na mesma, para a SumUp
      // não ficar a tentar reenviar isto para sempre.
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ignored: true }) };
    }

    if (!process.env.SUMUP_API_KEY) {
      console.error('SUMUP_API_KEY não configurada — não é possível confirmar o checkout.');
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, skipped: true }) };
    }

    // Confirma o estado REAL diretamente na SumUp — nunca confia cegamente
    // no conteúdo do aviso.
    const verifyRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
      headers: { 'Authorization': `Bearer ${process.env.SUMUP_API_KEY}` }
    });
    if (!verifyRes.ok) {
      console.error('Falha ao confirmar checkout na SumUp:', await verifyRes.text());
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, verifyFailed: true }) };
    }
    const checkout = await verifyRes.json();

    if (checkout.status !== 'PAID') {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, status: checkout.status }) };
    }

    // O checkout_reference foi criado como "mapa-alma-{leadId}".
    const ref = checkout.checkout_reference || '';
    if (!ref.startsWith('mapa-alma-')) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ignored: true }) };
    }
    const leadId = ref.replace('mapa-alma-', '');

    const db = admin.firestore();
    const leadRef = db.collection('tenants').doc('hikari-terapias').collection('mapaAlmaLeads').doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, notFound: true }) };
    }
    if (leadSnap.data().paymentStatus === 'paid') {
      // Já tinha sido processado antes (a SumUp pode reenviar o mesmo aviso).
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, alreadyPaid: true }) };
    }

    await leadRef.set({ paymentStatus: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Se houver uma promoção por número de pedidos ativa, conta este como usado.
    const tenantRef = db.collection('tenants').doc('hikari-terapias');
    const tenantSnap = await tenantRef.get();
    const promo = tenantSnap.data()?.mapaAlmaSettings?.promo;
    if (promo?.active && promo.mode === 'maxOrders') {
      await tenantRef.update({ 'mapaAlmaSettings.promo.ordersUsed': (promo.ordersUsed || 0) + 1 });
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    // Devolve 200 mesmo em erro interno, para a SumUp não reenviar em loop
    // — o erro fica no log do Netlify para investigar.
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false }) };
  }
};
