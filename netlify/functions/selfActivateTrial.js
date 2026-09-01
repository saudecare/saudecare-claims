const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const TRIAL_DAYS = 14;

// Ativa automaticamente o período de teste gratuito, sem precisar de
// aprovação manual — diferente de activateTenant.js (que continua a exigir
// ser administrador da plataforma, e serve para passar alguém a plano
// pago). Esta função só pode atribuir a role "owner" ao PRÓPRIO uid de
// quem chama, sobre um tenant com o MESMO id que esse uid — exatamente o
// que o registo normal cria. Não há forma de a usar para ativar a conta
// de outra pessoa, por isso é seguro não exigir ser administrador aqui.
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
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.replace(/^Bearer /, '');
    if (!idToken) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sem token de autenticação.' }) };
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const emailKey = (decoded.email || '').toLowerCase().trim();

    const tenantRef = admin.firestore().collection('tenants').doc(uid);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Registo não encontrado.' }) };
    }
    // Só ativa quem ainda está mesmo à espera disto — evita reprocessar
    // uma conta já ativa, suspensa ou cancelada.
    const status = tenantSnap.data().status;
    if (status !== 'pending_activation') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Esta conta já não está pendente de ativação.' }) };
    }

    // Cada email só tem direito a UM período de teste automático — mesmo
    // que a conta seja apagada e recriada (o que gera um uid novo, mas o
    // email fica registado aqui de qualquer forma).
    if (emailKey) {
      const trialClaimRef = admin.firestore().collection('trialClaims').doc(emailKey);
      const trialClaimSnap = await trialClaimRef.get();
      if (trialClaimSnap.exists) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Este email já usou o período de teste gratuito antes. Contacte-nos para escolher um plano.' }) };
      }
      await trialClaimRef.set({ uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    const trialEndsAt = admin.firestore.Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await admin.auth().setCustomUserClaims(uid, { tenantId: uid, role: 'owner' });
    await tenantRef.update({ status: 'trial', trialEndsAt });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao ativar o período de teste.' }) };
  }
};
