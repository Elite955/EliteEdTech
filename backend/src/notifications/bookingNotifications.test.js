import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingNoticeCopy, isBookingEmailAllowed } from './bookingNotifications.js';

const emailEnv = {
  NODE_ENV: 'development',
  SMTP_HOST: 'mail.test.invalid',
  SMTP_USER: 'test-user',
  SMTP_PASSWORD: 'test-password',
  SMTP_FROM: 'EdTech <test@example.com>',
  BOOKING_EMAIL_TEST_RECIPIENTS: 'student@example.com',
};

test('booking notice links into the portal and never includes a Zoom URL', () => {
  const copy = bookingNoticeCopy({
    kind: 'confirmed',
    studentName: 'Taylor',
    teacherName: 'Morgan',
    startsAt: '2030-01-02T10:00:00.000Z',
    portalUrl: 'https://portal.example/student/dashboard?sessionId=session-1',
  });
  assert.match(copy.subject, /confirmed/);
  assert.match(copy.body, /https:\/\/portal\.example\/student\/dashboard\?sessionId=session-1/);
  assert.match(copy.body, /countdown and join/);
  assert.doesNotMatch(copy.body, /zoom\.us|join_url/i);
});

test('request and rejection notices clearly describe their booking status', () => {
  const values = {
    studentName: 'Taylor',
    teacherName: 'Morgan',
    startsAt: '2030-01-02T10:00:00.000Z',
    portalUrl: 'https://portal.example/student/dashboard',
  };
  assert.match(bookingNoticeCopy({ ...values, kind: 'requested' }).body, /waiting for the teacher's response/);
  assert.match(bookingNoticeCopy({ ...values, kind: 'rejected' }).body, /unable to accept/);
});

test('booking email is restricted to configured development/test recipients', () => {
  assert.equal(isBookingEmailAllowed(emailEnv, 'STUDENT@example.com'), true);
  assert.equal(isBookingEmailAllowed(emailEnv, 'other@example.com'), false);
  assert.equal(isBookingEmailAllowed({ ...emailEnv, NODE_ENV: 'production' }, 'student@example.com'), false);
  assert.equal(isBookingEmailAllowed({ ...emailEnv, SMTP_PASSWORD: '' }, 'student@example.com'), false);
});