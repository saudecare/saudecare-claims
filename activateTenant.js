const admin = require('firebase-admin');

// Inicializa o Admin SDK apenas uma vez (Netlify reaproveita o processo
// entre chamadas quando possível).
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    // 1. Confirma quem está a chamar, a partir do token de login enviado.
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.replace(/^Bearer /, '');
    if (!idToken) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sem token de autenticação.' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);

    // 2. Confirma que quem chama é mesmo administrador da plataforma —
    // sem isto, qualquer pessoa com uma conta poderia tentar usar esta função.
    const adminSnap = await admin.firestore().collection('platform_admins').doc(decoded.uid).get();
    if (!adminSnap.exists) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Esta conta não é administradora da plataforma.' }) };
    }

    // 3. Lê os dados do subscritor a ativar.
    const { uid, tenantId } = JSON.parse(event.body || '{}');
    if (!uid || !tenantId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Falta o uid ou o tenantId.' }) };
    }

    // 4. Atribui as claims (isto é o que antes exigia o Cloud Shell).
    await admin.auth().setCustomUserClaims(uid, { tenantId, role: 'owner' });

    // 5. Decide se fica "em teste" ou já "ativo", conforme o que a
    // administradora escolheu ao criar este subscritor manualmente
    // (campo pendingStartStatus). Sem esse campo (subscritores criados
    // antes desta opção existir), assume-se "ativo" — era o único
    // comportamento que este ecrã de criação manual sempre teve, já que
    // aí só se escolhe um plano pago, nunca um período de teste.
    const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    const tenantData = tenantSnap.exists ? tenantSnap.data() : {};
    const startStatus = tenantData.pendingStartStatus || 'active';

    const updates = {
      status: startStatus,
      pendingStartStatus: admin.firestore.FieldValue.delete(),
      pendingTrialDays: admin.firestore.FieldValue.delete()
    };
    if (startStatus === 'trial') {
      const days = Number.isFinite(tenantData.pendingTrialDays) ? tenantData.pendingTrialDays : 7;
      updates.trialEndsAt = admin.firestore.Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
    }
    await tenantRef.update(updates);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, startStatus }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao ativar o subscritor.' }) };
  }
};
