// Envia um email para a caixa de apoio da Vindora sempre que um
// subscritor reporta um incidente ou pede apoio. Usa a Resend (tem plano
// grátis suficiente para este volume) — nunca guarda nada, só reencaminha
// por email o que já foi gravado no Firestore pelo cliente.
//
// Configuração necessária no Netlify (Site settings → Environment variables):
//   RESEND_API_KEY = a chave de API da conta Resend (grátis em resend.com)
//
// Isto é só um AVISO extra — o pedido já fica sempre guardado no Firestore
// e visível no painel de administração, mesmo que este email falhe.
const SUPPORT_INBOX = 'vindoraportugal@gmail.com';

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const { type, message, businessName, ownerEmail, tenantId } = JSON.parse(event.body || '{}');
    if (!message || !tenantId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Dados em falta.' }) };
    }

    const isIncident = type === 'incident';
    const subject = `${isIncident ? '🚨 INCIDENTE' : '💬 Pedido de apoio'} — ${businessName || tenantId}`;
    const html = `
      <h2>${isIncident ? '🚨 Novo incidente reportado' : '💬 Novo pedido de apoio'}</h2>
      <p><strong>Subscritor:</strong> ${escapeHtml(businessName || '(sem nome)')} (${escapeHtml(tenantId)})</p>
      <p><strong>Email de contacto:</strong> ${escapeHtml(ownerEmail || '(desconhecido)')}</p>
      <p><strong>Mensagem:</strong></p>
      <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
      <p style="color:#888;font-size:12px;margin-top:20px;">Este pedido já está guardado no painel de administração — Apoio & Incidentes.</p>
    `;

    // Se a chave ainda não estiver configurada, não trava nada — o pedido
    // já ficou gravado no Firestore de qualquer forma, isto é só o extra.
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, emailSkipped: true }) };
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vindora <alertas@vindora.pt>',
        to: [SUPPORT_INBOX],
        reply_to: ownerEmail || undefined,
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Falha ao enviar email via Resend:', errText);
      // Mesmo assim devolve ok — o pedido já está guardado, o email é só bónus.
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, emailSent: false }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, emailSent: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, emailSent: false }) };
  }
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
