import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import test from 'node:test';
import {
  decryptLocation,
  deriveEncryptionKeyCheck,
  locationAdditionalAuthenticatedData,
} from '../../src/crypto.js';
import { PhoneHomeError } from '../../src/errors.js';
import type { EncryptedEnvelope } from '../../src/types.js';

const ACCOUNT_ID = 'firebase-user-one';
const REQUEST_ID = '181cf811-13b2-402c-a863-32a2bd6e636a';
const ENCRYPTION_PHRASE = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const EXPECTED_KEY_CHECK = 'ZIQrtCQB-qrS6JtlDz07vKUNUiCTJURlQTzfn-vmLTI';

function encryptLocation(): EncryptedEnvelope {
  const key = Buffer.from(ENCRYPTION_PHRASE, 'base64url');
  const nonce = Buffer.from('000102030405060708090a0b', 'hex');
  const plaintext = Buffer.from(
    JSON.stringify({
      version: 1,
      latitude: 41.5868,
      longitude: -93.625,
      accuracyMeters: 12.5,
      capturedAtEpochMs: 1_700_000_000_000,
      source: 'fresh',
    }),
  );
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(locationAdditionalAuthenticatedData(ACCOUNT_ID, REQUEST_ID));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    version: 1,
    algorithm: 'A256GCM',
    nonce: nonce.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
  };
}

test('derives the shared PhoneHome key-check vector', () => {
  assert.equal(deriveEncryptionKeyCheck(ENCRYPTION_PHRASE), EXPECTED_KEY_CHECK);
});

test('decrypts and validates a request-bound AES-256-GCM location', () => {
  assert.deepEqual(decryptLocation(ENCRYPTION_PHRASE, ACCOUNT_ID, REQUEST_ID, encryptLocation()), {
    version: 1,
    latitude: 41.5868,
    longitude: -93.625,
    accuracyMeters: 12.5,
    capturedAtEpochMs: 1_700_000_000_000,
    source: 'fresh',
  });
});

test('rejects an envelope replayed against a different request', () => {
  assert.throws(
    () =>
      decryptLocation(
        ENCRYPTION_PHRASE,
        ACCOUNT_ID,
        '181cf811-13b2-402c-a863-32a2bd6e636b',
        encryptLocation(),
      ),
    (error: unknown) => error instanceof PhoneHomeError && error.code === 'decryption_failed',
  );
});
