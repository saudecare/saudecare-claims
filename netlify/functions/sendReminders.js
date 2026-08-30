const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function fillTemplate(template, vars) {
  return (template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// Corre de hora a hora (ver netlify.toml). Em cada execução, procura
// marcações que aconteçam daqui a aproximadamente 24 horas (janela de 2h
// para garantir que nenhuma escapa entre execuções) e envia um lembrete
// por email ao paciente, uma única vez por marcação.
exports.handler = async function () {
  const db = admin.firestore();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 3600000);
  const windowEnd = new Date(now.getTime() + 25 * 3600000);

  const tenantsSnap = await db.collection('tenants').get();
  let sentCount = 0;
  let errorCount = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenant = tenantDoc.data();
    if (!tenant?.remindersSettings?.autoEmailReminders) continue; // só quem ativou a opção

    let apptsSnap;
    try {
      apptsSnap = await db.collection('tenants').doc(tenantDoc.id).collection('appointments')
        .where('startsAt', '>=', admin.firestore.Timestamp.fromDate(windowStart))
        .where('startsAt', '<=', admin.firestore.Timestamp.fromDate(windowEnd))
        .get();
    } catch (e) {
      console.error(`Erro ao ler marcações do tenant ${tenantDoc.id}:`, e);
      continue;
    }

    for (const apptDoc of apptsSnap.docs) {
      const appt = apptDoc.data();
      if (appt.status === 'cancelled' || appt.reminderSent || !appt.patientId) continue;

      const patientSnap = await db.collection('tenants').doc(tenantDoc.id)
        .collection('patients').doc(appt.patientId).get();
      const patient = patientSnap.data();
      if (!patient?.email) continue;

      const d = appt.startsAt.toDate();
      const fromName = tenant?.businessName || 'SaúdeCare';
      const vars = {
        nome: patient.fullName || '',
        data: d.toLocaleDateString('pt-PT'),
        hora: d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        servico: appt.serviceName || ''
      };
      const template = tenant?.messageTemplates?.lembrete
        || 'Olá {{nome}}, lembramos a sua consulta de {{servico}} no dia {{data}} às {{hora}}.';
      const text = fillTemplate(template, vars);

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `${fromName} <onboarding@resend.dev>`,
            to: patient.email,
            subject: `Lembrete de consulta — ${fromName}`,
            text
          })
        });
        if (!res.ok) throw new Error(await res.text());
        await apptDoc.ref.update({ reminderSent: true });
        sentCount++;
      } catch (e) {
        console.error(`Erro ao enviar lembrete (tenant ${tenantDoc.id}, marcação ${apptDoc.id}):`, e);
        errorCount++;
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent: sentCount, errors: errorCount }) };
};

