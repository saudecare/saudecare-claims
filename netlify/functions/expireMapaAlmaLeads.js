const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Corre uma vez por dia (agendado no netlify.toml). Apaga sozinho qualquer
// pedido do Mapa da Alma que tenha ficado "por confirmar" (MB Way ou
// transferência) há mais de 3 dias — mantém a lista da Hikari sempre limpa,
// sem ela ter de andar a apagar pedidos antigos à mão.
exports.handler = async function () {
  try {
    const db = admin.firestore();
    const tresDoisAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection('tenants').doc('hikari-terapias').collection('mapaAlmaLeads')
      .where('paymentStatus', '==', 'manual_pending')
      .get();

    let apagados = 0;
    const batch = db.batch();
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.createdAt && data.createdAt < tresDoisAtras) {
        batch.delete(docSnap.ref);
        apagados++;
      }
    });
    if (apagados > 0) await batch.commit();

    return { statusCode: 200, body: JSON.stringify({ ok: true, apagados }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: String(err) }) };
  }
};
