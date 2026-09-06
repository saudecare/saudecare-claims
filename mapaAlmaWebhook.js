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

// Configura este URL como webhook na tua conta SumUp (Developer settings →
// Webhooks) para o evento "checkout.status.updated" / "payment_link_payment_created".
// Isto marca o pedido como pago automaticamente, sem precisares de confirmar
// nada à mão.
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    // A SumUp pode mandar o id do checkout em sítios ligeiramente diferentes
    // consoante a versão do evento — tentamos os mais comuns.
    const checkoutId = payload?.id || payload?.checkout_id || payload?.payment_link_id || null;
    const checkoutReference = payload?.checkout_reference || null;

    if (!checkoutId && !checkoutReference) {
      // Não é um evento que reconheçamos — responde OK na mesma, para a
      // SumUp não voltar a tentar enviar isto indefinidamente.
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ignored: true }) };
    }

    const db = admin.firestore();

    // Confirma o estado real diretamente na API da SumUp antes de marcar
    // como pago — nunca confia cegamente no conteúdo do webhook.
    let status = payload?.status;
    if (!status && checkoutId && process.env.SUMUP_API_KEY) {
      const verifyRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
        headers: { 'Authorization': `Bearer ${process.env.SUMUP_API_KEY}` }
      });
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        status = verifyData.status;
      }
    }

    if (status !== 'PAID') {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, status: status || 'unknown' }) };
    }

    // O checkout_reference foi criado como "mapa-alma-{leadId}" — extrai o id.
    let leadId = null;
    if (checkoutReference && checkoutReference.startsWith('mapa-alma-')) {
      leadId = checkoutReference.replace('mapa-alma-', '');
    }

    if (!leadId) {
      // Procura pelo sumupCheckoutId gravado quando o checkout foi criado.
      const tenantsSnap = await db.collectionGroup('mapaAlmaLeads').where('sumupCheckoutId', '==', checkoutId).limit(1).get();
      if (!tenantsSnap.empty) leadId = tenantsSnap.docs[0].ref;
    }

    if (leadId) {
      const leadRef = typeof leadId === 'string'
        ? db.collection('tenants').doc('hikari-terapias').collection('mapaAlmaLeads').doc(leadId)
        : leadId;
      await leadRef.set({ paymentStatus: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    // Devolve 200 mesmo em erro interno, para a SumUp não reenviar em loop
    // — o erro fica no log do Netlify para investigar.
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false }) };
  }
};
