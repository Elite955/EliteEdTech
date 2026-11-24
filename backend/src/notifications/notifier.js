import nodemailer from 'nodemailer';

function envValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function smtpPassword() {
  // Gmail app passwords are displayed in four groups with spaces; the spaces
  // are not part of the password and break SMTP AUTH if pasted as shown.
  const value = envValue('SMTP_PASSWORD') || envValue('SMTP_PASS');
  return value.replace(/\s+/g, '');
}

function emailApiKey() {
  return envValue('BREVO_API_KEY');
}

function emailApiConfigured() {
  return Boolean(emailApiKey() && envValue('SMTP_FROM'));
}

function senderDetails() {
  const from = envValue('SMTP_FROM') || 'ELITE <noreply@example.com>';
  const match = from.match(/^(.*?)<([^>]+)>$/);
  if (!match) return { name: 'ELITE', email: from };
  return { name: match[1].trim() || 'ELITE', email: match[2].trim() };
}

// Render's free tier blocks outbound SMTP ports. Brevo's HTTPS API uses port
// 443, which hosting providers do not block, and has a free 300/day plan.
async function sendEmailViaApi(pool, recipient, { subject, body, html, attachments = [], bookingId, kind }) {
  const sender = senderDetails();
  const payload = {
    sender,
    to: [{ email: recipient.email, name: recipient.name ?? '' }],
    subject,
    textContent: body,
    htmlContent: html || `<p>${String(body).replaceAll('<', '&lt;')}</p>`,
  };
  if (attachments.length) {
    payload.attachment = attachments.map((item) => ({
      name: item.filename,
      content: Buffer.from(item.content).toString('base64'),
    }));
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': emailApiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Brevo responded ${response.status}`);
  await record(pool, {
    recipientId: recipient.id, channel: 'email', subject, body, status: 'sent',
    providerId: String(data.messageId ?? ''), bookingId, kind,
  });
  return { recipientId: recipient.id, channel: 'email', status: 'sent', providerId: String(data.messageId ?? '') };
}

function testEnvironment() {
  return ['development', 'test'].includes(process.env.NODE_ENV);
}

function emailTestRecipients() {
  return envValue('BOOKING_EMAIL_TEST_RECIPIENTS')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function emailProvider() {
  return emailApiConfigured() ? 'brevo' : 'smtp';
}

export function notificationConfiguration() {
  const emailMissing = [];
  if (!emailApiConfigured()) {
    if (!envValue('SMTP_HOST')) emailMissing.push('SMTP_HOST');
    if (!envValue('SMTP_USER')) emailMissing.push('SMTP_USER');
    if (!smtpPassword()) emailMissing.push('SMTP_PASSWORD or SMTP_PASS');
    if (!envValue('SMTP_FROM')) emailMissing.push('SMTP_FROM');
  }
  if (testEnvironment() && !emailTestRecipients().length) emailMissing.push('BOOKING_EMAIL_TEST_RECIPIENTS');

  return {
    email: { configured: emailMissing.length === 0, missingKeys: emailMissing, provider: emailProvider() },
  };
}

function smtpConfigured() {
  return notificationConfiguration().email.configured;
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

async function sendEmail(pool, recipient, { subject, body, html, bookingId, kind = 'booking_confirmation', attachments = [] }) {
  if (!smtpConfigured()) {
    await record(pool, {
      recipientId: recipient.id, channel: 'email', subject, body, status: 'skipped',
      providerId: 'skipped: email is not configured.', bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'email', status: 'skipped', error: 'Email is not configured.' };
  }
  if (!recipient.email) {
    await record(pool, { recipientId: recipient.id, channel: 'email', subject, body, status: 'failed', bookingId, kind });
    return { recipientId: recipient.id, channel: 'email', status: 'failed', error: 'Recipient has no email address.' };
  }
  if (testEnvironment() && !emailTestRecipients().includes(recipient.email.trim().toLowerCase())) {
    await record(pool, {
      recipientId: recipient.id, channel: 'email', subject, body, status: 'skipped',
      providerId: 'skipped: recipient is not on the email test allowlist.', bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'email', status: 'skipped', error: 'Recipient is not on the email test allowlist.' };
  }
  const port = Number(envValue('SMTP_PORT') || 587);
  try {
    if (emailApiConfigured()) {
      return await sendEmailViaApi(pool, recipient, { subject, body, html, attachments, bookingId, kind });
    }
    const transport = nodemailer.createTransport({
      host: envValue('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: envValue('SMTP_USER'), pass: smtpPassword() },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const info = await transport.sendMail({
      from: envValue('SMTP_FROM'),
      to: recipient.email,
      subject,
      text: body,
      html,
      attachments,
    });
    await record(pool, {
      recipientId: recipient.id, channel: 'email', subject, body, status: 'sent',
      providerId: info.messageId ?? null, bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'email', status: 'sent' };
  } catch (error) {
    console.error('Booking email delivery failed:', error.message);
    await record(pool, {
      recipientId: recipient.id, channel: 'email', subject, body, status: 'failed',
      providerId: `failed: ${String(error.message).slice(0, 180)}`, bookingId, kind,
    });
    return { recipientId: recipient.id, channel: 'email', status: 'failed', error: error.message };
  }
}

function portalUrl(context, role) {
  const origin = role === 'teacher'
    ? (envValue('TEACHER_ORIGIN') || envValue('PORTAL_ORIGIN') || 'http://localhost:5174')
    : (envValue('STUDENT_ORIGIN') || envValue('PORTAL_ORIGIN') || 'http://localhost:5175');
  const path = role === 'teacher' ? '/sessions' : '/sessions';
  const url = new URL(path, origin);
  if (context.bookingId) url.searchParams.set('bookingId', context.bookingId);
  return url.toString();
}

function escapeHtml(value) {
  const escapedCharacters = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => escapedCharacters[character]);
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function htmlEmail(recipient, context, subject, body) {
  const meetingUrl = safeHttpUrl(context.meetingUrl);
  const joinUrl = meetingUrl && (recipient.role === 'teacher' || context.directMeetingLinkForStudent)
    ? meetingUrl
    : null;
  const actionUrl = joinUrl ?? safeHttpUrl(portalUrl(context, recipient.role === 'teacher' ? 'teacher' : 'student'));
  const actionLabel = joinUrl
    ? (recipient.role === 'teacher' ? 'Join class' : 'Join your class')
    : context.kind === 'booking_approved'
      ? 'Review and pay'
      : (recipient.role === 'teacher' ? 'Open teacher portal' : 'Open student portal');
  const paragraphs = body.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/https?:\/\/[^\s]+/);
    if (!match) return `<p style="margin:0 0 14px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`;
    const url = safeHttpUrl(match[0]);
    if (!url) return `<p style="margin:0 0 14px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`;
    const beforeLink = escapeHtml(line.slice(0, match.index));
    const afterLink = escapeHtml(line.slice(match.index + match[0].length));
    return `<p style="margin:0 0 14px;line-height:1.6;color:#334155;">${beforeLink}<a href="${escapeHtml(url)}" style="color:#4338ca;word-break:break-all;">${escapeHtml(url)}</a>${afterLink}</p>`;
  }).join('');
  const button = actionUrl
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;background:#4338ca;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:600;">${escapeHtml(actionLabel)}</a></p>`
    : '';
  const joinGuidance = joinUrl
    ? '<p style="margin:0 0 14px;line-height:1.6;color:#334155;">For a smooth session, please join a few minutes early.</p>'
    : '';
  const preheader = joinUrl
    ? 'Your EDtech session details and class link are ready.'
    : 'An update about your EDtech session.';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;">
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;color:#4338ca;font-size:18px;font-weight:700;">EDtech</p>
        <h1 style="margin:0 0 24px;color:#0f172a;font-size:24px;line-height:1.3;">${escapeHtml(subject)}</h1>
        ${paragraphs}
        ${button}
        ${joinGuidance}
      </td></tr>
    </table>
  </body>
</html>`;
}

function createBookingCopy(recipient, context, subject, lines) {
  const body = lines.join('\n');
  return { subject, body, html: htmlEmail(recipient, context, subject, body) };
}

export function bookingCopy(recipient, context) {
  const joinLine = recipient.role === 'student'
    ? context.directMeetingLinkForStudent && context.meetingUrl
      ? `Join link: ${context.meetingUrl}`
      : `Student portal: ${portalUrl(context, 'student')}`
    : context.meetingUrl
      ? `Join link: ${context.meetingUrl}`
      : 'Join link: not ready yet. Open the portal Sessions page before the class.';
  const when = `Date: ${context.date}\nTime: ${context.startTime} - ${context.endTime} IST`;
  if (context.kind === 'booking_request') {
    return createBookingCopy(recipient, context, 'We received your EDtech session request', [
        `Hi ${context.studentName},`,
        '',
        `Thank you for selecting a session with ${context.teacherName}. Your request is waiting for teacher approval.`,
        when,
        '',
        `Track the request in the student portal: ${portalUrl(context, 'student')}`,
        '',
        'The EDtech Team',
      ]);
  }
  if (context.kind === 'booking_rejected') {
    return createBookingCopy(recipient, context, 'Update on your EDtech session request', [
        `Hi ${context.studentName},`,
        '',
        `${context.teacherName} was unable to accept your requested session time. Please choose another available slot in the student portal.`,
        when,
        '',
        `Open the student portal: ${portalUrl(context, 'student')}`,
        '',
        'The EDtech Team',
      ]);
  }
  if (context.kind === 'booking_approved') {
    return createBookingCopy(
      recipient,
      context,
      'Your EDtech session is approved - payment required',
      [
        `Hi ${context.studentName},`,
        '',
        `Thank you for selecting this session. Your session with ${context.teacherName} is confirmed and awaiting payment.`,
        when,
        '',
        `Open the student portal to review and pay: ${portalUrl(context, 'student')}`,
        'The meeting link will be sent after payment is confirmed.',
        '',
        'The EDtech Team',
      ],
    );
  }
  if (context.kind === 'join_details') {
    if (recipient.role === 'teacher') {
      return createBookingCopy(recipient, context, `EDtech class link - ${context.date}`, [
          `Hi ${context.teacherName},`,
          '',
          `Your one-to-one class with ${context.studentName} is scheduled.`,
          when,
          joinLine,
          '',
          'Join a few minutes early to check your connection.',
          '',
          'The EDtech Team',
        ]);
    }
    return createBookingCopy(recipient, context, `Your EDtech class link - ${context.date}`, [
        `Hi ${context.studentName},`,
        '',
        `Your one-to-one class with ${context.teacherName} is scheduled.`,
        when,
        joinLine,
        '',
        'Join a few minutes early to check your connection.',
        '',
        'The EDtech Team',
      ]);
  }
  if (recipient.role === 'teacher') {
    return createBookingCopy(recipient, context, `Paid EDtech session - ${context.date}`, [
        `Hi ${context.teacherName},`,
        '',
        `Your one-to-one session with ${context.studentName} is confirmed and paid.`,
        when,
        `Amount: Rs. ${context.amount}`,
        joinLine,
        '',
        `Open the teacher portal to review the session: ${portalUrl(context, 'teacher')}`,
        '',
        'The EDtech Team',
      ]);
  }
  return createBookingCopy(recipient, context, `Your EDtech class is booked - ${context.date}`, [
      `Hi ${context.studentName},`,
      '',
      `Your one-to-one session with ${context.teacherName} is confirmed.`,
      when,
      `Amount paid: Rs. ${context.amount}`,
      joinLine,
      '',
      `Open the student portal to join the session: ${portalUrl(context, 'student')}`,
      '',
      'The EDtech Team',
    ]);
}
export async function sendWelcomeEmail(pool, recipient, { documentBuffer }) {
  const subject = `Welcome to ELITE, ${recipient.name ?? 'there'} - your account is ready`;
  const body = [
    `Hi ${recipient.name ?? 'there'},`,
    '',
    'Your account was created successfully.',
    '',
    roleLabel(recipient.role),
    '',
    `Open your portal: ${portalUrl({}, recipient.role === 'teacher' ? 'teacher' : 'student')}`,
    '',
    'Your registration bill is INR 0.00. You only pay for booked classes.',
    'A PDF summary is attached with the bill and step-by-step instructions.',
    '',
    'The ELITE Team',
  ].join('\n');
  return sendEmail(pool, recipient, {
    subject,
    body,
    html: htmlEmail(recipient, {}, subject, body),
    kind: 'general',
    attachments: [{
      filename: 'ELITE-welcome-summary.pdf',
      contentType: 'application/pdf',
      content: documentBuffer,
    }],
  });
}

function roleLabel(role) {
  return role === 'teacher'
    ? 'Next: open Availability to publish your subject, teaching times, and hourly rate.'
    : 'Next: browse teachers, book a slot, and pay after the teacher approves it.';
}

export async function sendBookingDetails(pool, recipients, context) {
  const results = [];
  for (const recipient of recipients) {
    const copy = bookingCopy(recipient, context);
    const attachments = recipient.role === 'student' && context.receiptBuffer
      ? [{
          filename: context.receiptFilename ?? 'payment-receipt.pdf',
          contentType: 'application/pdf',
          content: context.receiptBuffer,
        }]
      : [];
    results.push(await sendEmail(pool, recipient, { ...copy, bookingId: context.bookingId, kind: context.kind ?? 'booking_confirmation', attachments }));
  }
  return results;
}

export function deliverBookingConfirmation(pool, recipients, context) {
  void sendBookingDetails(pool, recipients, context).catch((error) => {
    console.error('Booking notification delivery failed:', error.message);
  });
}
