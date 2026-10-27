// Cloudflare Pages Function: POST /api/prenota
// Invia (1) notifica a Francesca e (2) conferma di ricezione al paziente, via Resend.
// Variabili d'ambiente (Cloudflare Pages > Settings > Variables):
//   RESEND_API_KEY  (segreta)  - chiave API Resend
//   NOTIFY_EMAIL    (opz.)     - default didattivo@gmail.com
//   FROM_EMAIL      (opz.)     - default "Dr.ssa Francesca Borgia <prenotazioni@psicologaperinatale.com>"

const ORARI = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
const TEL = '+39 333 326 7417';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json({ success: false, message: 'Richiesta non valida' }, 400); }

  if (d.hp) return json({ success: true }); // honeypot: i bot restano zitti

  const name = String(d.name || '').trim();
  const phone = String(d.phone || '').trim();
  const email = String(d.email || '').trim();
  const service = String(d.service || '').trim();
  const price = String(d.price || '').trim();
  const date = String(d.date || '');
  const time = String(d.time || '');

  if (name.length < 2 || name.length > 100 || phone.length < 6 || phone.length > 30 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120 ||
      service.length < 2 || service.length > 100 || price.length > 20) {
    return json({ success: false, message: 'Dati non validi' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !ORARI.includes(time)) return json({ success: false, message: 'Data o orario non validi' }, 400);
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  if (![2, 3].includes(dow) || date < oggi) return json({ success: false, message: 'Giorno non disponibile' }, 400);

  if (!env.RESEND_API_KEY) return json({ success: false, message: 'Servizio email non configurato' }, 500);

  const dataLeggibile = new Date(date + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const from = env.FROM_EMAIL || 'Dr.ssa Francesca Borgia <prenotazioni@psicologaperinatale.com>';
  const notify = env.NOTIFY_EMAIL || 'didattivo@gmail.com';

  const riga = (k, v) => `<tr><td style="padding:6px 12px;color:#666">${k}</td><td style="padding:6px 12px"><strong>${esc(v)}</strong></td></tr>`;
  const tabella = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">
    ${riga('Servizio', service)}${riga('Importo', price)}${riga('Data', dataLeggibile)}${riga('Orario', time)}</table>`;

  const mailFrancesca = {
    from, to: [notify], reply_to: email,
    subject: `Nuova richiesta di colloquio - ${name}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px"><p>Nuova richiesta dal sito:</p>${tabella}
      <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px;margin-top:8px">
      ${riga('Nome', name)}${riga('Telefono', phone)}${riga('Email', email)}</table>
      <p style="color:#666">Rispondi a questa mail per scrivere direttamente al paziente.</p></div>`
  };
  const mailPaziente = {
    from, to: [email], reply_to: notify,
    subject: 'Abbiamo ricevuto la tua richiesta di primo colloquio',
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
      <p>Gentile ${esc(name)},</p>
      <p>abbiamo ricevuto la tua richiesta di primo colloquio. Ecco il riepilogo:</p>${tabella}
      <p><strong>La richiesta non è ancora confermata:</strong> la Dott.ssa Francesca Borgia ti ricontatterà al più presto per confermare data e orario.</p>
      <p>Per qualsiasi necessità puoi chiamare o scrivere su WhatsApp al ${TEL}.</p>
      <p>A presto,<br>Dott.ssa Francesca Borgia<br>Psicologa clinica perinatale e dell'età evolutiva</p></div>`
  };

  const invia = body => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const [r1, r2] = await Promise.all([invia(mailFrancesca), invia(mailPaziente)]);
  if (!r1.ok) {
    console.error('Resend notifica fallita', r1.status, await r1.text());
    return json({ success: false, message: 'Invio non riuscito' }, 502);
  }
  if (!r2.ok) console.error('Resend conferma paziente fallita', r2.status, await r2.text());
  return json({ success: true, confirmationSent: r2.ok });
}

export const onRequest = () => json({ success: false, message: 'Metodo non consentito' }, 405);
