const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Valores de reserva, caso settings/platformConfig ainda não tenha estes
// campos. O valor real é sempre controlado pela administradora da
// plataforma, no painel de administração.
const DEFAULT_RENEW_DAYS = 7;
const DEFAULT_MAX_RENEWALS = 4;

// Prolonga automaticamente o período de teste de quem já o tem a expirar,
// durante a fase de testes da plataforma.
//
// Porque é seguro deixar o próprio subscritor chamar isto:
//   1. Só funciona se a administradora tiver ligado "trialAutoRenew" nas
//      definições da plataforma — está desligado por omissão.
//   2. Só mexe no tenant com o MESMO id do uid de quem chama. Não há
//      forma de prolongar o período de outra pessoa.
//   3. Só actua sobre contas em "trial" cujo período JÁ terminou — não
//      acumula tempo nem deixa esticar um período que ainda está a correr.
//   4. Tem um tecto de renovações (trialMaxRenewals). Chegado ao tecto,
//      a conta expira normalmente e a decisão volta a ser manual.
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

    const configSnap = await admin.firestore().collection('settings').doc('platformConfig').get();
    const config = configSnap.exists ? configSnap.data() : {};

    // Desligado por omissão: só renova se a administradora tiver ligado.
    if (config.trialAutoRenew !== true) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, renewed: false, reason: 'disabled' }) };
    }

    const renewDays = Number.isFinite(config.trialRenewDays) ? config.trialRenewDays : DEFAULT_RENEW_DAYS;
    const maxRenewals = Number.isFinite(config.trialMaxRenewals) ? config.trialMaxRenewals : DEFAULT_MAX_RENEWALS;

    if (renewDays <= 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, renewed: false, reason: 'zero_days' }) };
    }

    const tenantRef = admin.firestore().collection('tenants').doc(uid);
    const resultado = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(tenantRef);
      if (!snap.exists) return { renewed: false, reason: 'not_found' };

      const t = snap.data();
      if (t.status !== 'trial') return { renewed: false, reason: 'not_trial' };
      if (!t.trialEndsAt) return { renewed: false, reason: 'no_end_date' };

      // Só renova depois de terminar. Assim não é possível chamar isto
      // repetidamente para ir somando dias ao período em curso.
      if (t.trialEndsAt.toMillis() > Date.now()) return { renewed: false, reason: 'still_active' };

      const jaFeitas = Number.isFinite(t.trialRenewals) ? t.trialRenewals : 0;
      if (jaFeitas >= maxRenewals) return { renewed: false, reason: 'max_reached' };

      const novoFim = admin.firestore.Timestamp.fromMillis(Date.now() + renewDays * 24 * 60 * 60 * 1000);
      tx.update(tenantRef, {
        trialEndsAt: novoFim,
        trialRenewals: jaFeitas + 1,
        trialLastRenewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { renewed: true, days: renewDays, renewals: jaFeitas + 1, maxRenewals };
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ...resultado }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao renovar o período de teste.' }) };
  }
};
