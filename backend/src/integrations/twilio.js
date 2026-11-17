import { ProviderError } from './providerError.js';

const TWILIO_SANDBOX_SENDER = 'whatsapp:+14155238886';

export function isTwilioSandboxConfigured(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) &&
    env.TWILIO_SANDBOX_MODE === 'true' &&
    Boolean(env.TWILIO_ACCOUNT_SID) &&
    Boolean(env.TWILIO_AUTH_TOKEN) &&
    env.TWILIO_WHATSAPP_FROM === TWILIO_SANDBOX_SENDER &&
    allowedRecipients(env).length > 0;
}

function allowedRecipients(env) {
  return (env.TWILIO_TEST_RECIPIENTS ?? '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter((recipient) => /^\+[1-9]\d{7,14}$/.test(recipient));
}

export function isAllowedTwilioTestRecipient(recipient, env = process.env) {
  return allowedRecipients(env).includes(recipient);
}

export async function sendWhatsAppTestMessage({ to, body, env = process.env, fetchImpl = fetch }) {
  if (!isTwilioSandboxConfigured(env)) {
    throw new ProviderError('WhatsApp sending is disabled. Configure the Twilio sandbox and approved test recipients.', { status: 503 });
  }
  if (!isAllowedTwilioTestRecipient(to, env)) {
    throw new ProviderError('The recipient is not on the configured test allowlist.', { status: 403 });
  }
  if (typeof body !== 'string' || body.trim().length === 0 || body.length > 1600) {
    throw new ProviderError('Enter a WhatsApp test message between 1 and 1600 characters.', { status: 400 });
  }

  const form = new URLSearchParams({
    From: TWILIO_SANDBOX_SENDER,
    To: `whatsapp:${to}`,
    Body: body,
  });
  let response;
  try {
    response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Twilio did not confirm the message request; reconcile it in the Twilio console before retrying.', { outcomeUncertain: true });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('Twilio returned an unreadable response; reconcile the request in the Twilio console.', { outcomeUncertain: true });
  }
  if (!response.ok) {
    throw new ProviderError('Twilio rejected the WhatsApp test message.', { outcomeUncertain: response.status >= 500 });
  }
  if (!payload?.sid) {
    throw new ProviderError('Twilio returned an incomplete message response; reconcile it in the Twilio console.', { outcomeUncertain: true });
  }
  return { id: String(payload.sid), status: String(payload.status ?? 'queued') };
}

export async function getWhatsAppMessageStatus({ messageId, env = process.env, fetchImpl = fetch }) {
  if (!isTwilioSandboxConfigured(env)) {
    throw new ProviderError('Twilio sandbox status checks are disabled.', { status: 503 });
  }
  let response;
  try {
    response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages/${encodeURIComponent(messageId)}.json`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Twilio message status could not be retrieved.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('Twilio returned an unreadable message status.');
  }
  if (!response.ok || payload?.sid !== messageId || typeof payload.status !== 'string') {
    throw new ProviderError('Twilio message status could not be confirmed.');
  }
  return { id: messageId, status: payload.status };
}
