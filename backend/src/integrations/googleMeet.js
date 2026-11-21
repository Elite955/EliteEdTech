import { ProviderError } from './providerError.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_MEET_SPACES_URL = 'https://meet.googleapis.com/v2/spaces';

function envValue(env, key) {
  const value = env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function googleMeetConfigurationStatus(env = process.env) {
  const missingKeys = [];
  if (!envValue(env, 'GOOGLE_MEET_CLIENT_ID')) missingKeys.push('GOOGLE_MEET_CLIENT_ID');
  if (!envValue(env, 'GOOGLE_MEET_CLIENT_SECRET')) missingKeys.push('GOOGLE_MEET_CLIENT_SECRET');
  if (!envValue(env, 'GOOGLE_MEET_REFRESH_TOKEN')) missingKeys.push('GOOGLE_MEET_REFRESH_TOKEN');
  return { configured: missingKeys.length === 0, missingKeys };
}

export function isGoogleMeetTestConfigured(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) &&
    env.GOOGLE_MEET_TEST_MODE === 'true' &&
    googleMeetConfigurationStatus(env).configured;
}

async function readJson(response, message, uncertainOnMalformedResponse = false) {
  if (!response.ok) {
    throw new ProviderError(message, {
      outcomeUncertain: uncertainOnMalformedResponse && response.status >= 500,
    });
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError(message, { outcomeUncertain: uncertainOnMalformedResponse });
  }
}

async function accessToken(env, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: envValue(env, 'GOOGLE_MEET_CLIENT_ID'),
        client_secret: envValue(env, 'GOOGLE_MEET_CLIENT_SECRET'),
        refresh_token: envValue(env, 'GOOGLE_MEET_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Google authentication could not be reached.', { status: 503 });
  }
  const payload = await readJson(response, 'Google Meet authentication failed.');
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new ProviderError('Google did not return an access token.');
  }
  return payload.access_token;
}

async function createSpace({ env, fetchImpl }) {
  const configuration = googleMeetConfigurationStatus(env);
  if (!configuration.configured) {
    throw new ProviderError(`Google Meet is not configured. Missing: ${configuration.missingKeys.join(', ')}.`, { status: 503 });
  }

  const token = await accessToken(env, fetchImpl);
  let response;
  try {
    response = await fetchImpl(GOOGLE_MEET_SPACES_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Google Meet did not confirm space creation; reconcile it in the connected Google account before retrying.', {
      outcomeUncertain: true,
    });
  }

  const space = await readJson(
    response,
    'Google Meet rejected the space request; reconcile uncertain outcomes in the connected Google account.',
    true,
  );
  let meetingUrl;
  try {
    meetingUrl = new URL(space.meetingUri);
  } catch {
    throw new ProviderError('Google Meet returned an invalid link; reconcile it in the connected Google account before retrying.', {
      outcomeUncertain: true,
    });
  }
  if (meetingUrl.protocol !== 'https:' || meetingUrl.hostname !== 'meet.google.com') {
    throw new ProviderError('Google Meet returned an unexpected link; reconcile it in the connected Google account before retrying.', {
      outcomeUncertain: true,
    });
  }
  return {
    id: typeof space.name === 'string' ? space.name : null,
    joinUrl: meetingUrl.toString(),
  };
}

export async function createGoogleMeetSpace({ env = process.env, fetchImpl = fetch } = {}) {
  return createSpace({ env, fetchImpl });
}

export async function createTestGoogleMeetSpace({ env = process.env, fetchImpl = fetch } = {}) {
  if (!isGoogleMeetTestConfigured(env)) {
    throw new ProviderError('Google Meet creation is disabled. Configure OAuth credentials and enable test mode.', { status: 503 });
  }
  return createSpace({ env, fetchImpl });
}
