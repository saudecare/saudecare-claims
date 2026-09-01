const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Domínios onde a app pode legitimamente estar a correr — protege contra
// alguém usar este redirecionamento para outro sítio qualquer.
const ALLOWED_APP_HOSTS = ['saudecare.github.io', 'vindora.pt', 'www.vindora.pt', 'app.vindora.pt'];
const FALLBACK_APP_URL = 'https://saudecare.github.io/Saudecare-app-/saudecare-core.html';

function resolveAppUrl(state){
  const [, encodedReturnUrl] = (state || '').split('::');
  if (!encodedReturnUrl) return FALLBACK_APP_URL;
  try {
    const returnUrl = decodeURIComponent(encodedReturnUrl);
    const host = new URL(returnUrl).hostname;
    return ALLOWED_APP_HOSTS.includes(host) ? returnUrl : FALLBACK_APP_URL;
  } catch (e) {
    return FALLBACK_APP_URL;
  }
}

exports.handler = async function (event) {
  const { code, state, error } = event.queryStringParameters || {};
  const appUrl = resolveAppUrl(state);
  const tenantIdFromState = (state || '').split('::')[0];

  if (error) {
    console.error('Google devolveu um erro antes da troca de tokens:', error);
    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0` } };
  }
  if (!code || !tenantIdFromState){
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

    if (!tokenRes.ok || !tokenData.refresh_token) {
      // Regista SEMPRE a resposta completa do Google quando algo falha,
      // para conseguirmos ver a causa real no log do Netlify
      // (ex: invalid_grant, redirect_uri_mismatch, invalid_client, etc.)
      console.error('Troca de tokens falhou ou sem refresh_token. Resposta do Google:', JSON.stringify(tokenData));
      return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0&reason=norefresh` } };
    }

    // Guarda o refresh token no documento do subscritor (via Admin SDK,
    // que não está sujeito às regras normais do Firestore).
    await admin.firestore().doc(`tenants/${tenantIdFromState}`).update({
      googleCalendar: {
        refreshToken: tokenData.refresh_token,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=1` } };
  } catch (err) {
    console.error('Erro inesperado na função googleOAuthCallback:', err);
    return { statusCode: 302, headers: { Location: `${appUrl}?calendarConnected=0` } };
  }
};

