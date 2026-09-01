const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Esta função existe porque, no momento em que um terapeuta convidado cria
// a sua conta, ainda não tem nenhuma "claim" (tenantId/role) atribuída — por
// isso as regras de segurança do Firestore corretamente recusam-lhe escrever
// diretamente na coleção "staff" do consultório. Fazemos essa escrita aqui,
// do lado do servidor, com a chave de administrador, depois de confirmar que
// o convite é válido — o mesmo padrão já usado em activateStaff.js.
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
    // 1. Confirma quem está a chamar, a partir do token da conta que
    // acabou de ser criada (ou com que acabou de fazer login).
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.replace(/^Bearer /, '');
    if (!idToken) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sem token de autenticação.' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);

    const { tenantId, inviteId, name } = JSON.parse(event.body || '{}');
    if (!tenantId || !inviteId || !name) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }

    // 2. Confirma que o convite existe e ainda não foi usado.
    const inviteRef = admin.firestore().doc(`tenants/${tenantId}/staffInvites/${inviteId}`);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists || inviteSnap.data().used) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Este convite já não é válido.' }) };
    }
    const role = inviteSnap.data().role;

    // 3. Cria o pedido de acesso (por ativar) e marca o convite como usado.
    await admin.firestore().doc(`tenants/${tenantId}/staff/${decoded.uid}`).set({
      name, email: decoded.email || '', role, status: 'pending_activation',
      viaInviteId: inviteId, createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await inviteRef.update({ used: true, usedByUid: decoded.uid, role });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao registar o pedido.' }) };
  }
};
