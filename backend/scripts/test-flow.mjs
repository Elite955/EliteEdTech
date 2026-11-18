import { createHmac } from 'node:crypto';

const BASE = 'http://localhost:4000/api';
let cookie = '';

function jar(res) {
  for (const entry of res.headers.getSetCookie?.() ?? []) {
    const [pair] = entry.split(';');
    if (pair.startsWith('edtech_session=')) cookie = pair;
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar(res);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` -> ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.toUpperCase().replace(/=+$/, '')) {
    const idx = ALPHA.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

async function nextBookingDate(db, teacherId) {
  const { rows } = await db.query(`SELECT max(starts_at) AS last FROM bookings WHERE teacher_id = $1`, [teacherId]);
  const [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-').map(Number);
  const floor = new Date(Date.UTC(y, m - 1, d + 14));
  let last = rows[0]?.last ? new Date(rows[0].last) : null;
  if (!last || last < floor) last = floor;
  for (let i = 1; i <= 7; i += 1) {
    const probe = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + i));
    if (probe.getUTCDay() >= 1 && probe.getUTCDay() <= 5) return probe.toISOString().slice(0, 10);
  }
  return null;
}

const email = `vinay${Date.now()}@edtech.test`;

let r = await api('POST', '/auth/register', { name: 'Vinay Kumar', email, phone: '+919876543210', password: 'Password@123', age: 11, grade: 'Grade 6' });
check('register student', r.status === 201 && r.data?.user?.id, JSON.stringify(r.data).slice(0, 120));

r = await api('POST', '/auth/register', { name: 'Dup', email, phone: '+919876543210', password: 'Password@123', age: 11 });
check('duplicate email rejected', r.status === 409, JSON.stringify(r.data).slice(0, 120));

r = await api('POST', '/auth/login', { email, password: 'Password@123' });
check('login requires MFA setup', r.status === 200 && r.data?.requiresMfaSetup && Boolean(r.data?.otpAuthUrl), JSON.stringify(r.data).slice(0, 80));
const challenge = r.data.challenge;
const secret = new URL(r.data.otpAuthUrl).searchParams.get('secret');

r = await api('POST', '/auth/mfa/confirm', { challenge, code: totp(secret) });
check('MFA enrollment sets session', r.status === 200 && r.data?.user?.roleCode === 'student' && r.data?.user?.age === 11 && Boolean(cookie), JSON.stringify(r.data).slice(0, 140));

r = await api('GET', '/auth/me');
check('/me returns profile', r.status === 200 && r.data?.user?.age === 11 && r.data?.user?.grade === 'Grade 6', JSON.stringify(r.data).slice(0, 140));

r = await api('GET', '/teachers');
check('teachers listed', r.status === 200 && r.data?.teachers?.length === 2, `count=${r.data?.teachers?.length} first=${r.data?.teachers?.[0]?.name}`);
check('availability has weekday names', r.data?.teachers?.[0]?.availability?.[0]?.day, JSON.stringify(r.data?.teachers?.[0]?.availability?.slice(0, 2)));

r = await api('GET', '/teachers?search=Physics');
check('teacher search filters', r.status === 200 && r.data?.teachers?.length === 1 && r.data.teachers[0].name.includes('Rohit'), JSON.stringify(r.data?.teachers?.map((t) => t.name)));

const teacherId = r.data.teachers.length ? r.data.teachers[0].id : r2?.id;
r = await api('GET', '/teachers');
const chosen = r.data.teachers.find((t) => t.subjects.includes('Science')) ?? r.data.teachers[0];
const { default: pg } = await import('pg');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/edtech' });
await db.connect();
const bookingDate = await nextBookingDate(db, chosen.id);
const hourly = chosen.hourly_rate;

r = await api('POST', '/bookings', { teacher_id: chosen.id, date: bookingDate, start_time: '16:30', end_time: '17:00' });
const expectedAmount = Math.round(0.5 * hourly * 100) / 100;
check('booking created with computed amount', r.status === 201 && r.data?.booking?.amount === expectedAmount && r.data?.booking?.status === 'pending', `date=${bookingDate} amount=${r.data?.booking?.amount} expected=${expectedAmount}`);

const bookingId = r.data?.booking?.id;
r = await api('POST', '/bookings', { teacher_id: chosen.id, date: bookingDate, start_time: '16:45', end_time: '17:15' });
check('overlapping slot rejected', r.status === 409, JSON.stringify(r.data).slice(0, 100));

r = await api('POST', '/bookings', { teacher_id: chosen.id, date: bookingDate, start_time: '10:00', end_time: '11:00' });
check('outside availability rejected', r.status === 400, JSON.stringify(r.data).slice(0, 100));

r = await api('GET', '/bookings/mine');
check('bookings/mine lists booking', r.status === 200 && r.data?.bookings?.length === 1, JSON.stringify(r.data?.bookings?.map((b) => ({ id: b.id, status: b.status }))));

r = await api('POST', '/payments/order', { booking_id: bookingId });
check('payment order refused without Razorpay keys', r.status === 503, JSON.stringify(r.data).slice(0, 120));

await db.query(`UPDATE bookings SET status = 'approved' WHERE id = $1`, [bookingId]);
await db.end();

r = await api('GET', '/payments/mine');
check('payments/mine empty', r.status === 200 && r.data?.payments?.length === 0, `count=${r.data?.payments?.length}`);

r = await api('GET', '/sessions/mine');
check('sessions/mine empty', r.status === 200 && r.data?.sessions?.length === 0, `count=${r.data?.sessions?.length}`);

r = await api('GET', '/chat/messages');
check('chat messages empty', r.status === 200 && r.data?.messages?.length === 0, `count=${r.data?.messages?.length}`);

r = await api('POST', '/feedback', { booking_id: bookingId, rating: 5, testimony_text: 'Great session', allow_display: true });
check('feedback refused before completion', r.status === 400, JSON.stringify(r.data).slice(0, 100));

const { censorContent } = await import('./../src/security/profanity.js');
check('content filter masks profanity', censorContent('hello shit world') === 'hello s**t world' && censorContent('fuck you') === 'f**k you', censorContent('hello shit world'));

r = await api('GET', '/admin/overview');
check('student blocked from admin API', r.status === 401, `status=${r.status}`);

console.log('Flow test finished.');
