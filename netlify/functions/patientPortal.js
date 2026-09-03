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

// Esta função é a ÚNICA forma de o paciente aceder aos seus dados — nunca
// fala diretamente com o Firestore (não tem conta/login). Usa o Admin SDK,
// por isso não está sujeita às regras de segurança normais: a validação
// do "token" (o código único do link) é feita aqui, à mão, antes de
// devolver ou aceitar qualquer coisa.
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const { tenantId, patientId, token, action, text, mood, sleepQuality, energyLevel, notes } = JSON.parse(event.body || '{}');
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

    if (patient.portalRevoked) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'O acesso a este portal foi revogado. Peça um novo link ao profissional.' }) };
    }

    if (action === 'sendMessage') {
      const cleanText = (text || '').trim().slice(0, 2000);
      if (!cleanText) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Mensagem vazia.' }) };
      await patientRef.collection('messages').add({
        sender: 'patient', text: cleanText, readByProfessional: false, createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'addCheckin') {
      const moodVal = Number.isInteger(mood) ? Math.max(1, Math.min(5, mood)) : null;
      const sleepVal = Number.isInteger(sleepQuality) ? Math.max(1, Math.min(5, sleepQuality)) : null;
      const energyVal = Number.isInteger(energyLevel) ? Math.max(1, Math.min(5, energyLevel)) : null;
      const cleanNotes = (notes || '').trim().slice(0, 2000);
      if (moodVal === null && sleepVal === null && energyVal === null && !cleanNotes) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Registo vazio.' }) };
      }
      await patientRef.collection('checkins').add({
        mood: moodVal, sleepQuality: sleepVal, energyLevel: energyVal, notes: cleanNotes,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    // Ação por omissão: devolver os dados do portal.
    if (!patient.portalFirstAccessedAt) {
      await patientRef.update({ portalFirstAccessedAt: admin.firestore.FieldValue.serverTimestamp() });
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

    const healingSnap = await patientRef.collection('healingProtocols').orderBy('generatedAt', 'desc').limit(5).get();
    const healingProtocols = healingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const messagesSnap = await patientRef.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
    const messages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const checkinsSnap = await patientRef.collection('checkins').orderBy('createdAt', 'desc').limit(60).get();
    const checkins = checkinsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const toIso = v => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v;

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        ok: true,
        patientName: patient.fullName || '',
        businessName: tenant.businessName || 'SaúdeCare',
        primaryColor: tenant?.branding?.primaryColor || '#1a2b26',
        onlineConsult: tenant?.onlineConsult || { tool: 'jitsi' },
        upcoming: upcoming.map(a => ({ ...a, startsAt: toIso(a.startsAt) })),
        past: past.map(a => ({ ...a, startsAt: toIso(a.startsAt) })),
        reports: reports.map(r => ({ ...r, generatedAt: toIso(r.generatedAt) })),
        healingProtocols: healingProtocols.map(h => ({ ...h, generatedAt: toIso(h.generatedAt) })),
        messages: messages.map(m => ({ ...m, createdAt: toIso(m.createdAt) })),
        checkins: checkins.map(c => ({ ...c, createdAt: toIso(c.createdAt) }))
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro no servidor.' }) };
  }
};
