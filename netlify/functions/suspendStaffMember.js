const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Suspende o acesso de um membro da equipa sem apagar os seus dados: a
// conta de login continua a existir, mas perde as claims (tenantId/role),
// pelo que as regras de segurança do Firestore deixam de o reconhecer como
// pertencendo a este consultório. Para reativar, usa-se de novo a função
// activateStaff.js (que volta a atribuir as claims).
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
    // 1. Confirma quem está a chamar.
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.replace(/^Bearer /, '');
    if (!idToken) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sem token de autenticação.' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);

    // 2. Lê os dados do membro a suspender.
    const { staffUid, tenantId } = JSON.parse(event.body || '{}');
    if (!staffUid || !tenantId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }

    // 3. Confirma que quem chama é o DONO deste consultório, ou
    // administrador da plataforma — nunca outra pessoa qualquer.
    const adminSnap = await admin.firestore().collection('platform_admins').doc(decoded.uid).get();
    const isPlatformAdmin = adminSnap.exists;
    const isOwnerOfThisTenant = decoded.tenantId === tenantId && decoded.role === 'owner';

    if (!isPlatformAdmin && !isOwnerOfThisTenant) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Sem permissão para suspender membros deste consultório.' }) };
    }

    // 4. Remove as claims (revoga o acesso já a partir do próximo pedido)
    // e marca o registo como suspenso.
    await admin.auth().setCustomUserClaims(staffUid, null);
    await admin.firestore().doc(`tenants/${tenantId}/staff/${staffUid}`).update({ status: 'suspended' });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao suspender.' }) };
  }
};
