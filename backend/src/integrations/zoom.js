import { ProviderError } from './providerError.js';

export function isZoomTestConfigured(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) &&
    env.ZOOM_TEST_MODE === 'true' &&
    Boolean(env.ZOOM_CLIENT_ID) &&
    Boolean(env.ZOOM_CLIENT_SECRET) &&
    Boolean(env.ZOOM_ACCOUNT_ID);
}

async function readJson(response, message, outcomeUnknownOnMalformedResponse = false) {
  try {
    const payload = await response.json();
    if (!response.ok) throw new ProviderError(message, { outcomeUncertain: response.status >= 500 });
    return payload;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(message, { outcomeUncertain: outcomeUnknownOnMalformedResponse });
  }
}

export async function createTestZoomMeeting({ topic, startTime, durationMinutes, env = process.env, fetchImpl = fetch }) {
  if (!isZoomTestConfigured(env)) {
    throw new ProviderError('Zoom meeting creation is disabled. Configure a test account and enable test mode.', { status: 503 });
  }

  const basicAuth = `Basic ${Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64')}`;
  let tokenResponse;
  try {
    tokenResponse = await fetchImpl(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID)}`,
      { method: 'POST', headers: { authorization: basicAuth }, signal: AbortSignal.timeout(10000) },
    );
  } catch {
    throw new ProviderError('Zoom authentication could not be reached.', { status: 503 });
  }
  const tokenPayload = await readJson(tokenResponse, 'Zoom test account authentication failed.');
  if (typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token) {
    throw new ProviderError('Zoom did not return an access token.');
  }

  let meetingResponse;
  try {
    meetingResponse = await fetchImpl('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenPayload.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: startTime,
        duration: durationMinutes,
        timezone: 'UTC',
        settings: { waiting_room: true, join_before_host: false },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Zoom did not confirm meeting creation; reconcile it in the test account before retrying.', { outcomeUncertain: true });
  }
  const meetingPayload = await readJson(meetingResponse, 'Zoom rejected the test meeting request.', true);
  let meetingUrl;
  try {
    meetingUrl = new URL(meetingPayload.join_url);
  } catch {
    throw new ProviderError('Zoom returned an invalid meeting URL; reconcile it in the test account.', { outcomeUncertain: true });
  }
  if (meetingUrl.protocol !== 'https:' || (meetingUrl.hostname !== 'zoom.us' && !meetingUrl.hostname.endsWith('.zoom.us'))) {
    throw new ProviderError('Zoom returned an unexpected meeting URL; reconcile it in the test account.', { outcomeUncertain: true });
  }
  if (meetingPayload.id == null) {
    throw new ProviderError('Zoom returned an incomplete meeting response; reconcile it in the test account.', { outcomeUncertain: true });
  }
  return { id: String(meetingPayload.id), joinUrl: meetingUrl.toString() };
}
