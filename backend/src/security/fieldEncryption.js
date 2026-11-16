import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKey() {
  const encoded = process.env.FIELD_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error('FIELD_ENCRYPTION_KEY must be configured before storing encrypted fields.');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

export function encryptField(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptField(value) {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) {
    throw new Error('Encrypted field has an invalid format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
