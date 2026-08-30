const admin = require('firebase-admin');

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

    // 2. Lê os dados do membro de equipa a ativar.
    const { staffUid, tenantId, role } = JSON.parse(event.body || '{}');
    if (!staffUid || !tenantId || !['staff_full', 'staff_restricted'].includes(role)) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta ou inválidos.' }) };
    }

    // 3. Confirma que quem chama é o DONO deste mesmo consultório, ou
    // administrador da plataforma — nunca outra pessoa qualquer.
    const adminSnap = await admin.firestore().collection('platform_admins').doc(decoded.uid).get();
    const isPlatformAdmin = adminSnap.exists;
    const isOwnerOfThisTenant = decoded.tenantId === tenantId && decoded.role === 'owner';

    if (!isPlatformAdmin && !isOwnerOfThisTenant) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Sem permissão para ativar membros deste consultório.' }) };
    }

    // 4. Atribui as claims (tenantId + papel) e marca como ativo.
    await admin.auth().setCustomUserClaims(staffUid, { tenantId, role });
    await admin.firestore().doc(`tenants/${tenantId}/staff/${staffUid}`).update({ status: 'active', role });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao ativar.' }) };
  }
};
