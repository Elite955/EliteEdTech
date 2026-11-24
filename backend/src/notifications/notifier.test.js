import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingCopy, sendBookingDetails } from './notifier.js';

const recipient = {
  id: 'student-id',
  role: 'student',
  name: 'Student',
};

const context = {
  kind: 'join_details',
  bookingId: 'booking-id',
  studentName: 'Student',
  teacherName: 'Teacher',
  date: '23 Nov 2026',
  startTime: '09:30',
  endTime: '10:30',
  amount: 450,
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
};

test('student join notifications keep the portal link unless direct delivery is explicitly enabled', () => {
  const portalCopy = bookingCopy(recipient, context);
  assert.match(portalCopy.body, /Student portal: http:\/\/localhost:5175\/sessions\?bookingId=booking-id/);
  assert.doesNotMatch(portalCopy.body, /https:\/\/meet\.google\.com/);
  assert.match(portalCopy.html, /Open student portal/);
  assert.doesNotMatch(portalCopy.html, /href="https:\/\/meet\.google\.com/);

  const directCopy = bookingCopy(recipient, { ...context, directMeetingLinkForStudent: true });
  assert.match(directCopy.body, /Join link: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(directCopy.html, /href="https:\/\/meet\.google\.com\/abc-defg-hij"/);
  assert.match(directCopy.html, />Join your class</);
});

test('booking email HTML escapes dynamic content and keeps the text fallback', () => {
  const copy = bookingCopy(
    recipient,
    { ...context, studentName: '<Student>', directMeetingLinkForStudent: true },
  );
  assert.match(copy.html, /Hi &lt;Student&gt;,/);
  assert.doesNotMatch(copy.html, /<Student>/);
  assert.match(copy.text ?? copy.body, /Hi <Student>,/);
});

test('paid student confirmation includes the meeting link in the email action', () => {
  const copy = bookingCopy(recipient, {
    ...context,
    kind: 'booking_confirmation',
    directMeetingLinkForStudent: true,
  });
  assert.match(copy.body, /Join link: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(copy.html, /href="https:\/\/meet\.google\.com\/abc-defg-hij"/);
  assert.match(copy.html, />Join your class</);
});

test('development join notifications skip recipients outside the email test allowlist', async () => {
  const keys = [
    'NODE_ENV',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'BOOKING_EMAIL_TEST_RECIPIENTS',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'development',
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'test-user',
    SMTP_PASSWORD: 'test-password',
    SMTP_FROM: 'noreply@example.test',
    BOOKING_EMAIL_TEST_RECIPIENTS: 'allowed@example.test',
  });

  try {
    const result = await sendBookingDetails(
      { query: async () => { throw new Error('Unallowlisted notifications must not be recorded as sends.'); } },
      [{ ...recipient, email: 'not-allowed@example.test', phone: '+15550000000' }],
      { ...context, directMeetingLinkForStudent: true },
    );
    assert.deepEqual(result.map((item) => item.status), ['skipped']);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
