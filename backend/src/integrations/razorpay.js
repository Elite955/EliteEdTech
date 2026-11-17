import { ProviderError } from './providerError.js';

export function isRazorpayTestConfigured(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) &&
    env.RAZORPAY_TEST_MODE === 'true' &&
    env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') &&
    Boolean(env.RAZORPAY_KEY_SECRET);
}

function toPaise(amount) {
  const match = String(amount).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new ProviderError('The payment amount is invalid.', { status: 400 });
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProviderError('The payment amount is outside the supported range.', { status: 400 });
  }
  return Number(paise);
}

export async function createFullRefund({ paymentId, amount, env = process.env, fetchImpl = fetch }) {
  if (!isRazorpayTestConfigured(env)) {
    throw new ProviderError('Razorpay refunds are disabled. Configure test credentials and enable test mode.', { status: 503 });
  }

  const amountInPaise = toPaise(amount);
  let response;
  try {
    response = await fetchImpl(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: amountInPaise, speed: 'normal' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Razorpay did not confirm the refund request; reconcile it in the test dashboard before retrying.', { outcomeUncertain: true });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('Razorpay returned an unreadable response; reconcile the request in the test dashboard.', { outcomeUncertain: true });
  }
  if (!response.ok) {
    throw new ProviderError('Razorpay rejected the refund request.', { outcomeUncertain: response.status >= 500 });
  }
  if (!payload?.id || !['pending', 'processed', 'failed'].includes(payload.status)) {
    throw new ProviderError('Razorpay returned an incomplete refund response; reconcile it in the test dashboard.', { outcomeUncertain: true });
  }
  return { id: String(payload.id), status: payload.status };
}

export async function getRefundStatus({ refundId, env = process.env, fetchImpl = fetch }) {
  if (!isRazorpayTestConfigured(env)) {
    throw new ProviderError('Razorpay test-mode status checks are disabled.', { status: 503 });
  }
  let response;
  try {
    response = await fetchImpl(`https://api.razorpay.com/v1/refunds/${encodeURIComponent(refundId)}`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProviderError('Razorpay refund status could not be retrieved.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('Razorpay returned an unreadable refund status.');
  }
  if (!response.ok || payload?.id == null || !['pending', 'processed', 'failed'].includes(payload.status)) {
    throw new ProviderError('Razorpay refund status could not be confirmed.');
  }
  return { id: String(payload.id), status: payload.status };
}
