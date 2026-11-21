import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullRefund, getRefundStatus, isRazorpayTestConfigured } from './razorpay.js';
import { getWhatsAppMessageStatus, isTwilioSandboxConfigured, sendWhatsAppTestMessage } from './twilio.js';
import { createTestGoogleMeetSpace, isGoogleMeetTestConfigured } from './googleMeet.js';

const razorpayEnv = {
  NODE_ENV: 'development',
  RAZORPAY_TEST_MODE: 'true',
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'test-secret',
};

const twilioEnv = {
  NODE_ENV: 'development',
  TWILIO_SANDBOX_MODE: 'true',
  TWILIO_ACCOUNT_SID: 'AC-test',
  TWILIO_AUTH_TOKEN: 'test-secret',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
  TWILIO_TEST_RECIPIENTS: '+15551234567',
};

const googleMeetEnv = {
  NODE_ENV: 'development',
  GOOGLE_MEET_TEST_MODE: 'true',
  GOOGLE_MEET_CLIENT_ID: 'test-client',
  GOOGLE_MEET_CLIENT_SECRET: 'test-secret',
  GOOGLE_MEET_REFRESH_TOKEN: 'test-refresh-token',
};

test('Razorpay refunds require development test credentials and use paise', async () => {
  let fetchCount = 0;
  assert.equal(isRazorpayTestConfigured({ ...razorpayEnv, NODE_ENV: 'production' }), false);
  await assert.rejects(
    createFullRefund({
      paymentId: 'pay_test',
      amount: '12.34',
      env: { ...razorpayEnv, NODE_ENV: 'production' },
      fetchImpl: async () => { fetchCount += 1; },
    }),
    /disabled/,
  );
  assert.equal(fetchCount, 0);

  let request;
  const result = await createFullRefund({
    paymentId: 'pay_test',
    amount: '12.34',
    env: razorpayEnv,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: 'rfnd_test', status: 'processed' }) };
    },
  });
  assert.equal(result.status, 'processed');
  assert.match(request.url, /\/payments\/pay_test\/refund$/);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { amount: 1234, speed: 'normal' });

  const refundStatus = await getRefundStatus({
    refundId: 'rfnd_test',
    env: razorpayEnv,
    fetchImpl: async (url) => {
      assert.match(url, /\/refunds\/rfnd_test$/);
      return { ok: true, status: 200, json: async () => ({ id: 'rfnd_test', status: 'processed' }) };
    },
  });
  assert.equal(refundStatus.status, 'processed');
});

test('Twilio sends only to configured sandbox recipients', async () => {
  let fetchCount = 0;
  assert.equal(isTwilioSandboxConfigured({ ...twilioEnv, NODE_ENV: 'production' }), false);
  await assert.rejects(
    sendWhatsAppTestMessage({
      to: '+15550000000',
      body: 'test',
      env: twilioEnv,
      fetchImpl: async () => { fetchCount += 1; },
    }),
    /allowlist/,
  );
  assert.equal(fetchCount, 0);

  let request;
  const result = await sendWhatsAppTestMessage({
    to: '+15551234567',
    body: 'sandbox message',
    env: twilioEnv,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201, json: async () => ({ sid: 'SM-test', status: 'queued' }) };
    },
  });
  assert.equal(result.id, 'SM-test');
  assert.match(request.url, /api\.twilio\.com/);
  assert.equal(new URLSearchParams(request.options.body).get('To'), 'whatsapp:+15551234567');
  assert.equal(new URLSearchParams(request.options.body).get('From'), 'whatsapp:+14155238886');

  const messageStatus = await getWhatsAppMessageStatus({
    messageId: 'SM-test',
    env: twilioEnv,
    fetchImpl: async (url) => {
      assert.match(url, /\/Messages\/SM-test\.json$/);
      return { ok: true, status: 200, json: async () => ({ sid: 'SM-test', status: 'delivered' }) };
    },
  });
  assert.equal(messageStatus.status, 'delivered');
});

test('Google Meet creation requires development test mode and OAuth credentials', async () => {
  let fetchCount = 0;
  assert.equal(isGoogleMeetTestConfigured({ ...googleMeetEnv, NODE_ENV: 'production' }), false);
  await assert.rejects(
    createTestGoogleMeetSpace({
      env: { ...googleMeetEnv, NODE_ENV: 'production' },
      fetchImpl: async () => { fetchCount += 1; },
    }),
    /disabled/,
  );
  await assert.rejects(
    createTestGoogleMeetSpace({
      env: { ...googleMeetEnv, GOOGLE_MEET_REFRESH_TOKEN: '' },
      fetchImpl: async () => { fetchCount += 1; },
    }),
    /disabled/,
  );
  assert.equal(fetchCount, 0);
});

test('Google Meet refreshes OAuth credentials and creates a space', async () => {
  const requests = [];
  const result = await createTestGoogleMeetSpace({
    env: googleMeetEnv,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { ok: true, status: 200, json: async () => ({ access_token: 'test-access-token' }) }
        : { ok: true, status: 200, json: async () => ({ name: 'spaces/test-space', meetingUri: 'https://meet.google.com/abc-defg-hij' }) };
    },
  });

  assert.equal(result.id, 'spaces/test-space');
  assert.equal(result.joinUrl, 'https://meet.google.com/abc-defg-hij');
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(new URLSearchParams(requests[0].options.body).get('grant_type'), 'refresh_token');
  assert.equal(new URLSearchParams(requests[0].options.body).get('refresh_token'), 'test-refresh-token');
  assert.equal(requests[1].url, 'https://meet.googleapis.com/v2/spaces');
  assert.equal(requests[1].options.headers.authorization, 'Bearer test-access-token');
  assert.deepEqual(JSON.parse(requests[1].options.body), {});
});

test('Google Meet rejects a non-Meet URL as an uncertain creation result', async () => {
  let requestCount = 0;
  await assert.rejects(
    createTestGoogleMeetSpace({
      env: googleMeetEnv,
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 1
          ? { ok: true, status: 200, json: async () => ({ access_token: 'test-access-token' }) }
          : { ok: true, status: 200, json: async () => ({ meetingUri: 'https://attacker.example/join' }) };
      },
    }),
    (error) => error.outcomeUncertain === true && /unexpected link/.test(error.message),
  );
});
