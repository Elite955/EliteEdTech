import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createFullRefund, getRefundStatus, isRazorpayTestConfigured } from './razorpay.js';
import { verifyWebhookSignature } from '../payments/razorpay.js';
import { createTestGoogleMeetSpace, isGoogleMeetTestConfigured } from './googleMeet.js';

const razorpayEnv = {
  NODE_ENV: 'development',
  RAZORPAY_TEST_MODE: 'true',
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'test-secret',
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


test('Razorpay webhook signature verification uses only the configured secret', () => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
  try {
    const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test' } } } });
    const signature = createHmac('sha256', 'whsec_test').update(rawBody).digest('hex');
    assert.equal(verifyWebhookSignature({ rawBody, signature }), true);
    assert.equal(verifyWebhookSignature({ rawBody, signature: 'not-a-signature' }), false);
    assert.equal(verifyWebhookSignature({ rawBody, signature: null }), false);
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous;
  }
});
