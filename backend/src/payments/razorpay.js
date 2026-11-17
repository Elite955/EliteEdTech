import { createHmac } from 'node:crypto';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function razorpayConfigured() {
  return credentials() !== null;
}

export function publicKeyId() {
  return credentials()?.keyId ?? null;
}

export async function createOrder({ amountInRupees, receipt, notes }) {
  const creds = credentials();
  if (!creds) throw new Error('Razorpay is not configured.');
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(Number(amountInRupees) * 100), currency: 'INR', receipt, notes }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const creds = credentials();
  if (!creds) return false;
  const expected = createHmac('sha256', creds.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

export function verifyWebhookSignature({ rawBody, signature }) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
}
