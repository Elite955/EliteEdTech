const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

function envValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function zoomConfigurationStatus() {
  const missingKeys = [];
  if (!envValue('ZOOM_ACCOUNT_ID')) missingKeys.push('ZOOM_ACCOUNT_ID');
  if (!envValue('ZOOM_CLIENT_ID')) missingKeys.push('ZOOM_CLIENT_ID');
  if (!envValue('ZOOM_CLIENT_SECRET')) missingKeys.push('ZOOM_CLIENT_SECRET');
  return { configured: missingKeys.length === 0, missingKeys };
}

export function zoomConfigured() {
  return zoomConfigurationStatus().configured;
}

export async function createMeetingDetailed({ topic, startsAt, durationMinutes }) {
  const configuration = zoomConfigurationStatus();
  if (!configuration.configured) {
    return { ok: false, status: 'not_configured', error: 'Zoom is not configured.', missingKeys: configuration.missingKeys };
  }
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, status: 'failed', error: 'The session start time is invalid.' };
  }
  try {
    const tokenAuth = Buffer.from(`${envValue('ZOOM_CLIENT_ID')}:${envValue('ZOOM_CLIENT_SECRET')}`).toString('base64');
    const tokenResponse = await fetch(`${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(envValue('ZOOM_ACCOUNT_ID'))}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${tokenAuth}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!tokenResponse.ok) throw new Error(`Zoom token request failed (${tokenResponse.status})`);
    const token = await tokenResponse.json();

    const duration = Math.min(Math.max(Math.round(Number(durationMinutes) || 0), 15), 480);
    const meetingResponse = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: start.toISOString(),
        duration,
        timezone: 'Asia/Kolkata',
        settings: { join_before_host: true, waiting_room: false },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!meetingResponse.ok) throw new Error(`Zoom meeting creation failed (${meetingResponse.status})`);
    const meeting = await meetingResponse.json();
    if (!meeting.join_url) throw new Error('Zoom did not return a join link.');
    return {
      ok: true,
      status: 'created',
      joinUrl: meeting.join_url,
      meetingId: meeting.id == null ? null : String(meeting.id),
    };
  } catch (error) {
    console.error('Zoom meeting creation failed:', error.message);
    return { ok: false, status: 'failed', error: error.message };
  }
}

export async function createMeeting({ topic, startsAt, durationMinutes }) {
  const result = await createMeetingDetailed({ topic, startsAt, durationMinutes });
  return result.ok ? result.joinUrl : null;
}
