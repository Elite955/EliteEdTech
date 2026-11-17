const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

export function zoomConfigured() {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

export async function createMeeting({ topic, startsAt, durationMinutes }) {
  if (!zoomConfigured()) return null;
  try {
    const tokenAuth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch(`${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${tokenAuth}` },
    });
    if (!tokenResponse.ok) throw new Error(`Zoom token request failed (${tokenResponse.status})`);
    const token = await tokenResponse.json();

    const meetingResponse = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: new Date(startsAt).toISOString(),
        duration: Math.max(durationMinutes, 15),
        timezone: 'Asia/Kolkata',
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    if (!meetingResponse.ok) throw new Error(`Zoom meeting creation failed (${meetingResponse.status})`);
    const meeting = await meetingResponse.json();
    return meeting.join_url ?? null;
  } catch (error) {
    console.error('Zoom meeting creation failed:', error.message);
    return null;
  }
}
