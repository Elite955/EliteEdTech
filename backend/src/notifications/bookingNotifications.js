import nodemailer from 'nodemailer';
import { isAllowedTwilioTestRecipient, isTwilioSandboxConfigured, sendWhatsAppTestMessage } from '../integrations/twilio.js';

const TEST_ENVIRONMENTS = new Set(['development', 'test']);

function emailTestRecipients(env = process.env) {
  return (env.BOOKING_EMAIL_TEST_RECIPIENTS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function bookingNoticeCopy({ kind, studentName, teacherName, startsAt, portalUrl }) {
  const date = new Date(startsAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  });
  const opening = `Hi ${studentName},`;
  if (kind === 'requested') {
    return {
      subject: `Session request received for ${date}`,
      body: [
        opening,
        '',
        `Thank you for choosing a session with ${teacherName}. Your request has been sent and is waiting for the teacher's response.`,
        `Requested time: ${date} (India Standard Time)`,
        '',
        `Track your request in the student portal: ${portalUrl}`,
        'We will notify you when the request is approved or declined.',
        '',
        'EdTech',
      ].join('\n'),
    };
  }
  if (kind === 'rejected') {
    return {
      subject: `Update on your session request for ${date}`,
      body: [
        opening,
        '',
        `Unfortunately, ${teacherName} is unable to accept your requested session time. You can choose another available time in the student portal:`,
        portalUrl,
        '',
        'EdTech',
      ].join('\n'),
    };
  }
  return {
    subject: `Your session with ${teacherName} is confirmed`,
    body: [
      opening,
      '',
      `Your session with ${teacherName} has been confirmed.`,
      `Session time: ${date} (India Standard Time)`,
      '',
      `Open the student portal to see the countdown and join when the session starts: ${portalUrl}`,
      'For your security, the meeting link is available only inside your signed-in student portal.',
      '',
      'EdTech',
    ].join('\n'),
  };
}

export function isBookingEmailAllowed(env, recipient) {
  return TEST_ENVIRONMENTS.has(env.NODE_ENV) &&
    Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM) &&
    emailTestRecipients(env).includes(recipient.toLowerCase());
}

async function saveNotification(pool, { recipientId, channel, subject, body, status, providerId = null }) {
  await pool.query(
    `INSERT INTO notifications (recipient_id, channel, subject, body, status, provider_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [recipientId, channel, subject, body, status, providerId],
  );
}

async function deliverEmail(pool, recipient, copy, env) {
  if (!isBookingEmailAllowed(env, recipient.email)) return { channel: 'email', status: 'skipped' };
  try {
    const port = Number(env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await transport.sendMail({ from: env.SMTP_FROM, to: recipient.email, subject: copy.subject, text: copy.body });
    await saveNotification(pool, { recipientId: recipient.id, channel: 'email', ...copy, status: 'sent' });
    return { channel: 'email', status: 'sent' };
  } catch (error) {
    console.error('Booking email delivery failed:', error.message);
    await saveNotification(pool, { recipientId: recipient.id, channel: 'email', ...copy, status: 'failed' });
    return { channel: 'email', status: 'failed' };
  }
}

async function deliverWhatsApp(pool, recipient, copy, env) {
  const phone = typeof recipient.phone === 'string' ? recipient.phone.trim() : '';
  if (!isTwilioSandboxConfigured(env) || !/^\+[1-9]\d{7,14}$/.test(phone) || !isAllowedTwilioTestRecipient(phone, env)) {
    return { channel: 'whatsapp', status: 'skipped' };
  }
  try {
    const message = await sendWhatsAppTestMessage({ to: phone, body: `${copy.subject}\n\n${copy.body}`, env });
    await saveNotification(pool, {
      recipientId: recipient.id, channel: 'whatsapp', ...copy,
      status: ['sent', 'delivered'].includes(message.status) ? 'sent' : 'queued',
      providerId: message.id,
    });
    return { channel: 'whatsapp', status: 'queued' };
  } catch (error) {
    console.error('Booking WhatsApp delivery failed:', error.message);
    await saveNotification(pool, {
      recipientId: recipient.id, channel: 'whatsapp', ...copy,
      status: error.outcomeUncertain ? 'unknown' : 'failed',
    });
    return { channel: 'whatsapp', status: error.outcomeUncertain ? 'unknown' : 'failed' };
  }
}

export async function sendBookingNotice(pool, { kind, student, teacherName, startsAt, sessionId = null }) {
  const origin = process.env.PORTAL_ORIGIN || process.env.ADMIN_ORIGIN || 'http://localhost:5173';
  const portalUrl = new URL('/student/dashboard', origin);
  if (sessionId) portalUrl.searchParams.set('sessionId', sessionId);
  const copy = bookingNoticeCopy({
    kind,
    studentName: student.name,
    teacherName,
    startsAt,
    portalUrl: portalUrl.toString(),
  });
  const results = await Promise.all([
    deliverEmail(pool, student, copy, process.env),
    deliverWhatsApp(pool, student, copy, process.env),
  ]);
  return results;
}