import nodemailer from 'nodemailer';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function envValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function smtpPassword() {
  return envValue('SMTP_PASSWORD') || envValue('SMTP_PASS');
}

export function notificationConfiguration() {
  const emailMissing = [];
  if (!envValue('SMTP_HOST')) emailMissing.push('SMTP_HOST');
  if (!envValue('SMTP_USER')) emailMissing.push('SMTP_USER');
  if (!smtpPassword()) emailMissing.push('SMTP_PASSWORD or SMTP_PASS');
  if (!envValue('SMTP_FROM')) emailMissing.push('SMTP_FROM');

  const whatsappMissing = [];
  if (!envValue('TWILIO_ACCOUNT_SID')) whatsappMissing.push('TWILIO_ACCOUNT_SID');
  if (!envValue('TWILIO_AUTH_TOKEN')) whatsappMissing.push('TWILIO_AUTH_TOKEN');
  if (!whatsappFrom()) whatsappMissing.push('TWILIO_WHATSAPP_FROM');

  return {
    email: { configured: emailMissing.length === 0, missingKeys: emailMissing },
    whatsapp: { configured: whatsappMissing.length === 0, missingKeys: whatsappMissing },
  };
}

function smtpConfigured() {
  return notificationConfiguration().email.configured;
}

function twilioConfigured() {
  return notificationConfiguration().whatsapp.configured;
}

function whatsappFrom() {
  const value = envValue('TWILIO_WHATSAPP_FROM');
  if (!value) return '';
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

export function normalizeWhatsAppNumber(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let candidate;
  if (digits.startsWith('+')) candidate = digits;
  else if (/^0\d{10}$/.test(digits)) candidate = `+91${digits.slice(1)}`;
  else if (/^\d{10}$/.test(digits)) candidate = `+91${digits}`;
  else if (/^91\d{10}$/.test(digits)) candidate = `+${digits}`;
  else if (/^\d{7,15}$/.test(digits)) candidate = `+${digits}`;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

async function record(pool, { recipientId, channel, subject, body, status, providerId = null, bookingId = null, kind = 'booking_confirmation' }) {
  try {
    await pool.query(
      `INSERT INTO notifications (recipient_id, channel, subject, body, status, provider_id, booking_id, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [recipientId, channel, subject, body, status, providerId, bookingId, kind],
    );
  } catch (error) {
    console.error('Notification record failed:', error.message);
  }
}

async function sendEmail(pool, recipient, { subject, body, bookingId, kind = 'booking_confirmation' }) {
  if (!smtpConfigured()) {
    return { recipientId: recipient.id, channel: 'email', status: 'skipped', error: 'SMTP is not configured.' };
  }
  if (!recipient.email) {
    await record(pool, { recipientId: recipient.id, channel: 'email', subject, body, status: 'failed', bookingId, kind });
    return { recipientId: recipient.id, channel: 'email', status: 'failed', error: 'Recipient has no email address.' };
  }
  const port = Number(envValue('SMTP_PORT') || 587);
  try {
    const transport = nodemailer.createTransport({
      host: envValue('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: envValue('SMTP_USER'), pass: smtpPassword() },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const info = await transport.sendMail({ from: envValue('SMTP_FROM'), to: recipient.email, subject, text: body });
    await record(pool, {
      recipientId: recipient.id, channel: 'email', subject, body, status: 'sent',
      providerId: info.messageId ?? null, bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'email', status: 'sent' };
  } catch (error) {
    console.error('Booking email delivery failed:', error.message);
    await record(pool, { recipientId: recipient.id, channel: 'email', subject, body, status: 'failed', bookingId, kind });
    return { recipientId: recipient.id, channel: 'email', status: 'failed', error: error.message };
  }
}

async function sendWhatsApp(pool, recipient, { subject, body, bookingId, kind = 'booking_confirmation' }) {
  if (!twilioConfigured()) {
    return { recipientId: recipient.id, channel: 'whatsapp', status: 'skipped', error: 'WhatsApp is not configured.' };
  }
  const phone = normalizeWhatsAppNumber(recipient.phone);
  if (!phone) {
    await record(pool, { recipientId: recipient.id, channel: 'whatsapp', subject, body, status: 'failed', bookingId, kind });
    return {
      recipientId: recipient.id,
      channel: 'whatsapp',
      status: 'failed',
      error: recipient.phone ? 'Recipient phone number is not in a valid international format.' : 'Recipient has no phone number.',
    };
  }
  try {
    const auth = Buffer.from(`${envValue('TWILIO_ACCOUNT_SID')}:${envValue('TWILIO_AUTH_TOKEN')}`).toString('base64');
    const form = new URLSearchParams({
      From: whatsappFrom(),
      To: `whatsapp:${phone}`,
      Body: body,
    });
    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${envValue('TWILIO_ACCOUNT_SID')}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Twilio responded ${response.status}`);
    const payload = await response.json();
    await record(pool, {
      recipientId: recipient.id, channel: 'whatsapp', subject, body, status: 'sent',
      providerId: payload.sid ?? null, bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'whatsapp', status: 'sent', providerId: payload.sid ?? null };
  } catch (error) {
    console.error('Booking WhatsApp delivery failed:', error.message);
    await record(pool, { recipientId: recipient.id, channel: 'whatsapp', subject, body, status: 'failed', bookingId, kind });
    return { recipientId: recipient.id, channel: 'whatsapp', status: 'failed', error: error.message };
  }
}

function bookingCopy(recipient, context) {
  const joinLine = context.meetingUrl
    ? `Join link: ${context.meetingUrl}`
    : 'Join link: not ready yet. Open the portal Sessions page before the class.';
  const when = `Date: ${context.date}\nTime: ${context.startTime} - ${context.endTime} IST`;
  if (context.kind === 'join_details') {
    if (recipient.role === 'teacher') {
      return {
        subject: `Class link for ${context.studentName} on ${context.date}`,
        body: [
          `Hi ${context.teacherName},`,
          '',
          `Your one-to-one class with ${context.studentName} is scheduled.`,
          when,
          joinLine,
          '',
          'Join a few minutes early to check your connection.',
          '',
          'EDTECH',
        ].join('\n'),
      };
    }
    return {
      subject: `Class link for ${context.teacherName} on ${context.date}`,
      body: [
        `Hi ${context.studentName},`,
        '',
        `Your one-to-one class with ${context.teacherName} is scheduled.`,
        when,
        joinLine,
        '',
        'Join a few minutes early to check your connection.',
        '',
        'EDTECH',
      ].join('\n'),
    };
  }
  if (recipient.role === 'teacher') {
    return {
      subject: `Paid session booked: ${context.studentName} on ${context.date}`,
      body: [
        `Hi ${context.teacherName},`,
        '',
        `Your one-to-one session with ${context.studentName} is confirmed and paid.`,
        when,
        `Amount: Rs. ${context.amount}`,
        joinLine,
        '',
        'Open the teacher portal to review the session.',
        '',
        'EDTECH',
      ].join('\n'),
    };
  }
  return {
    subject: `Session confirmed with ${context.teacherName} on ${context.date}`,
    body: [
      `Hi ${context.studentName},`,
      '',
      `Your one-to-one session with ${context.teacherName} is confirmed.`,
      when,
      `Amount paid: Rs. ${context.amount}`,
      joinLine,
      '',
      'Open the student portal to join the session.',
      '',
      'EDTECH',
    ].join('\n'),
  };
}
export async function sendBookingDetails(pool, recipients, context) {
  const results = [];
  for (const recipient of recipients) {
    const copy = bookingCopy(recipient, context);
    results.push(await sendEmail(pool, recipient, { ...copy, bookingId: context.bookingId, kind: context.kind ?? 'booking_confirmation' }));
    results.push(await sendWhatsApp(pool, recipient, { ...copy, bookingId: context.bookingId, kind: context.kind ?? 'booking_confirmation' }));
  }
  return results;
}

export function deliverBookingConfirmation(pool, recipients, context) {
  void sendBookingDetails(pool, recipients, context).catch((error) => {
    console.error('Booking notification delivery failed:', error.message);
  });
}
