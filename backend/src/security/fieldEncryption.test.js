import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptField, encryptField } from './fieldEncryption.js';

test('encrypted values can be decrypted without exposing plaintext', () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const plaintext = 'totp-secret-for-a-test-user';
  const encrypted = encryptField(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptField(encrypted), plaintext);
});

test('tampered encrypted values are rejected', () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const encrypted = encryptField('sensitive value');
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptField(parts.join('.')));
});

test('field encryption requires a 32-byte key', () => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
  assert.throws(() => encryptField('secret'), /32-byte key/);
});
