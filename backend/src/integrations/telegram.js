const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

function envValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function chatDirectory() {
  const map = new Map();
  let fallback = envValue('TELEGRAM_CHAT_ID');
  for (const entry of envValue('TELEGRAM_CHAT_IDS').split(',')) {
    const value = entry.trim();
    if (!value) continue;
    const separator = value.indexOf(':');
    if (separator > 0) {
      map.set(value.slice(0, separator).trim().toLowerCase(), value.slice(separator + 1).trim());
    } else {
      fallback = value;
    }
  }
  return { map, fallback };
}

export function telegramConfigured() {
  return Boolean(envValue('TELEGRAM_BOT_TOKEN') && chatDirectory().fallback);
}

// Chat IDs are mapped by the account email so each student receives their own
// messages. A bare TELEGRAM_CHAT_ID acts as the fallback for demos/tests.
export function telegramChatForEmail(email) {
  const { map, fallback } = chatDirectory();
  if (!email) return fallback;
  return map.get(String(email).trim().toLowerCase()) ?? fallback;
}

export function telegramAllowedChatIds() {
  const { map, fallback } = chatDirectory();
  return [...new Set([fallback, ...map.values()].filter(Boolean))];
}

export async function sendTelegramMessage({ chatId, text, document = null, filename = 'receipt.pdf' }) {
  const token = envValue('TELEGRAM_BOT_TOKEN');
  if (!token || !chatId) throw new Error('Telegram is not configured.');

  const form = new FormData();
  form.append('chat_id', String(chatId));
  const isDocument = Boolean(document);
  if (isDocument) {
    form.append('document', new Blob([document], { type: 'application/pdf' }), filename);
    form.append('caption', String(text).slice(0, 1000));
  } else {
    form.append('text', String(text));
  }

  const endpoint = isDocument ? 'sendDocument' : 'sendMessage';
  const response = await fetch(`${TELEGRAM_API_BASE}${token}/${endpoint}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram responded ${response.status}`);
  }
  return { messageId: String(payload.result?.message_id ?? '') };
}
