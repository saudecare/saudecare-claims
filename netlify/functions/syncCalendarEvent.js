const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  });
}

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const idToken = authHeader.replace(/^Bearer /, '');
    if (!idToken) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Sem token de autenticação.' }) };
    const decoded = await admin.auth().verifyIdToken(idToken);

    const { tenantId, action, googleEventId, summary, description, location, startISO, endISO } = JSON.parse(event.body || '{}');

    if (decoded.tenantId !== tenantId) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Sem permissão.' }) };
    }

    const tenantSnap = await admin.firestore().doc(`tenants/${tenantId}`).get();
    const refreshToken = tenantSnap.data()?.googleCalendar?.refreshToken;
    if (!refreshToken) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, skipped: 'not_connected' }) };
    }

    const accessToken = await getAccessToken(refreshToken);
    if (!accessToken) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Não foi possível renovar o acesso ao Google Calendar.' }) };
    }

    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    if (action === 'delete') {
      if (googleEventId) {
        const delRes = await fetch(`${base}/${googleEventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        // 404/410 significa que já não existe no Google (ex: apagado à mão
        // por lá) — nesse caso o objetivo já está cumprido, não é erro.
        if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
          const errBody = await delRes.text().catch(() => '');
          console.error('Falha ao apagar evento no Google Calendar:', delRes.status, errBody);
          return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'A Google recusou apagar o evento (sessão pode ter expirado).' }) };
        }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    const body = {
      summary, description, location,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    };

    let res;
    if (action === 'update' && googleEventId) {
      res = await fetch(`${base}/${googleEventId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Falha ao sincronizar.');

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, googleEventId: data.id }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Falha ao sincronizar com o Google Calendar.' }) };
  }
};
