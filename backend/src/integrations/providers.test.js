import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullRefund, getRefundStatus, isRazorpayTestConfigured } from './razorpay.js';
import { getWhatsAppMessageStatus, isTwilioSandboxConfigured, sendWhatsAppTestMessage } from './twilio.js';
import { createTestZoomMeeting, isZoomTestConfigured } from './zoom.js';

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

const zoomEnv = {
  NODE_ENV: 'development',
  ZOOM_TEST_MODE: 'true',
  ZOOM_CLIENT_ID: 'test-client',
  ZOOM_CLIENT_SECRET: 'test-secret',
  ZOOM_ACCOUNT_ID: 'test-account',
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

test('Zoom meetings require explicit development test mode and use the test account', async () => {
  let fetchCount = 0;
  assert.equal(isZoomTestConfigured({ ...zoomEnv, NODE_ENV: 'production' }), false);
  await assert.rejects(
    createTestZoomMeeting({
      topic: 'Test',
      startTime: '2027-01-01T10:00:00.000Z',
      durationMinutes: 30,
      env: { ...zoomEnv, NODE_ENV: 'production' },
      fetchImpl: async () => { fetchCount += 1; },
    }),
    /disabled/,
  );
  assert.equal(fetchCount, 0);

  const requests = [];
  const result = await createTestZoomMeeting({
    topic: 'Test class',
    startTime: '2027-01-01T10:00:00.000Z',
    durationMinutes: 30,
    env: zoomEnv,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { ok: true, status: 200, json: async () => ({ access_token: 'test-token' }) }
        : { ok: true, status: 201, json: async () => ({ id: 123, join_url: 'https://us02web.zoom.us/j/123' }) };
    },
  });
  assert.equal(result.id, '123');
  assert.equal(result.joinUrl, 'https://us02web.zoom.us/j/123');
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    topic: 'Test class',
    type: 2,
    start_time: '2027-01-01T10:00:00.000Z',
    duration: 30,
    timezone: 'UTC',
    settings: { waiting_room: true, join_before_host: false },
  });
});
