import nodemailer from 'nodemailer';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

async function record(pool, { recipientId, channel, subject, body, status, providerId = null }) {
  try {
    await pool.query(
      `INSERT INTO notifications (recipient_id, channel, subject, body, status, provider_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recipientId, channel, subject, body, status, providerId],
    );
  } catch (error) {
    console.error('Notification record failed:', error.message);
  }
}

async function sendEmail(pool, recipient, subject, body) {
  if (!smtpConfigured()) return;
  const port = Number(process.env.SMTP_PORT || 587);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    const info = await transport.sendMail({ from: process.env.SMTP_FROM, to: recipient.email, subject, text: body });
    await record(pool, { recipientId: recipient.id, channel: 'email', subject, body, status: 'sent', providerId: info.messageId });
  } catch (error) {
    console.error('Booking email delivery failed:', error.message);
    await record(pool, { recipientId: recipient.id, channel: 'email', subject, body, status: 'failed' });
  }
}

async function sendWhatsApp(pool, recipient, body) {
  if (!twilioConfigured()) return;
  if (!recipient.phone) {
    await record(pool, { recipientId: recipient.id, channel: 'whatsapp', subject: 'Booking confirmation', body, status: 'failed' });
    return;
  }
  try {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const form = new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_FROM,
      To: `whatsapp:${recipient.phone}`,
      Body: body,
    });
    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`Twilio responded ${response.status}`);
    const payload = await response.json();
    await record(pool, { recipientId: recipient.id, channel: 'whatsapp', subject: 'Booking confirmation', body, status: 'sent', providerId: payload.sid ?? null });
  } catch (error) {
    console.error('Booking WhatsApp delivery failed:', error.message);
    await record(pool, { recipientId: recipient.id, channel: 'whatsapp', subject: 'Booking confirmation', body, status: 'failed' });
  }
}

export function deliverBookingConfirmation(pool, recipients, context) {
  const subject = `Your ${context.teacherName} session is confirmed`;
  const body = `Hi ${context.studentName},\n\nYour one-on-one session with ${context.teacherName} is confirmed.\nDate: ${context.date}\nTime: ${context.startTime} - ${context.endTime}\nAmount paid: Rs. ${context.amount}\nJoin link: ${context.meetingUrl || 'will be shared before the session'}\n\nThank you for learning with EDTECH.`;
  for (const recipient of recipients) {
    void sendEmail(pool, recipient, subject, body);
    void sendWhatsApp(pool, recipient, body);
  }
}
