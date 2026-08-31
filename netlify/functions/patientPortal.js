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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const { tenantId, patientId, token, action, text } = JSON.parse(event.body || '{}');
    if (!tenantId || !patientId || !token) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }

    const db = admin.firestore();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const patientRef = tenantRef.collection('patients').doc(patientId);
    const patientSnap = await patientRef.get();

    if (!patientSnap.exists || patientSnap.data().portalToken !== token) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Link inválido.' }) };
    }
    const patient = patientSnap.data();

    if (action === 'sendMessage') {
      const cleanText = (text || '').trim().slice(0, 2000);
      if (!cleanText) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Mensagem vazia.' }) };
      await patientRef.collection('messages').add({
        sender: 'patient', text: cleanText, createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    const tenantSnap = await tenantRef.get();
    const tenant = tenantSnap.data() || {};

    const apptsSnap = await tenantRef.collection('appointments').get();
    const nowMs = Date.now();
    const allAppts = apptsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.patientId === patientId && a.status !== 'cancelled' && a.startsAt);
    const upcoming = allAppts.filter(a => a.startsAt.toMillis() >= nowMs).sort((a,b) => a.startsAt.toMillis() - b.startsAt.toMillis());
    const past = allAppts.filter(a => a.startsAt.toMillis() < nowMs).sort((a,b) => b.startsAt.toMillis() - a.startsAt.toMillis()).slice(0, 10);

    const reportsSnap = await patientRef.collection('reports').orderBy('generatedAt', 'desc').limit(10).get();
    const reports = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const messagesSnap = await patientRef.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
    const messages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const toIso = v => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v;

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        ok: true,
        patientName: patient.fullName || '',
        businessName: tenant.businessName || 'SaúdeCare',
        primaryColor: tenant?.branding?.primaryColor || '#1a2b26',
        upcoming: upcoming.map(a => ({ ...a, startsAt: toIso(a.startsAt) })),
        past: past.map(a => ({ ...a, startsAt: toIso(a.startsAt) })),
        reports: reports.map(r => ({ ...r, generatedAt: toIso(r.generatedAt) })),
        messages: messages.map(m => ({ ...m, createdAt: toIso(m.createdAt) }))
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro no servidor.' }) };
  }
};
