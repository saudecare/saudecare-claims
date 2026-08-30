const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

exports.handler = async function (event) {
  const appUrl = 'https://saudecare.github.io/Saudecare-app-/saudecare-core.html';
  const { code, state, error } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0` } };
  }
  if (!code || !state) {
    return { statusCode: 400, body: 'Pedido inválido — falta o código ou o identificador do consultório.' };
  }

  try {
    // Troca o código de autorização por tokens junto do Google.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'https://effortless-entremet-7de9ef.netlify.app/.netlify/functions/googleOAuthCallback',
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      // Sem refresh_token — normalmente porque já tinha autorizado antes
      // sem "prompt=consent". A pessoa precisa de revogar o acesso em
      // myaccount.google.com/permissions e tentar ligar de novo.
      return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0&reason=norefresh` } };
    }

    // Guarda o refresh token no documento do subscritor (via Admin SDK,
    // que não está sujeito às regras normais do Firestore).
    await admin.firestore().doc(`tenants/${state}`).update({
      googleCalendar: {
        refreshToken: tokenData.refresh_token,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=1` } };
  } catch (err) {
    console.error(err);
    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0` } };
  }
};
