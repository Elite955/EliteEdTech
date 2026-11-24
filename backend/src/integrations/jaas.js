import jwt from 'jsonwebtoken';

function envValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function jaasConfigured() {
  return Boolean(envValue('JAAS_APP_ID') && envValue('JAAS_API_KEY_ID') && envValue('JAAS_PRIVATE_KEY'));
}

export function jaasDomain() {
  return `${envValue('JAAS_APP_ID')}.8x8.vc`;
}

function privateKey() {
  return envValue('JAAS_PRIVATE_KEY').replace(/\\n/g, '\n');
}

// JaaS uses RS256 tokens with the API key's "kid" in the header. The moderator
// claim is what lets a teacher start the room without a third-party login.
export function issueJaasToken({ roomName, user, moderator = false }) {
  if (!jaasConfigured() || !roomName) return null;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    aud: 'jitsi',
    iss: 'chat',
    sub: envValue('JAAS_APP_ID'),
    room: roomName,
    nbf: now - 30,
    exp: now + 2 * 60 * 60,
    context: {
      user: {
        id: String(user?.id ?? ''),
        name: String(user?.name ?? 'User'),
        email: String(user?.email ?? ''),
        moderator: Boolean(moderator),
      },
      features: {
        recording: false,
        livestreaming: false,
        transcription: false,
      },
    },
  }, privateKey(), { algorithm: 'RS256', keyid: envValue('JAAS_API_KEY_ID') });
}

export function jaasJoinDetails({ joinUrl, user, moderator = false }) {
  if (!jaasConfigured() || !joinUrl) return null;
  let roomName = '';
  try {
    const url = new URL(joinUrl);
    roomName = url.pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return null;
  }
  const token = issueJaasToken({ roomName, user, moderator });
  if (!token) return null;
  return { domain: jaasDomain(), roomName, jwt: token, moderator: Boolean(moderator) };
}
