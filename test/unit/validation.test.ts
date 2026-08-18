import assert from 'node:assert/strict';
import test from 'node:test';
import { PhoneHomeError } from '../../src/errors.js';
import { parseSetupBundle, validateRequestId } from '../../src/validation.js';

const VALID_BUNDLE = {
  version: 2,
  apiBaseUrl: 'https://phonehome.example/',
  accountId: 'firebase-user-one',
  apiKey: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
  encryptionPhrase: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

test('normalizes and validates a setup bundle', () => {
  assert.deepEqual(parseSetupBundle(VALID_BUNDLE), {
    ...VALID_BUNDLE,
    apiBaseUrl: 'https://phonehome.example',
  });
});

test('allows loopback HTTP for local protocol testing', () => {
  assert.equal(
    parseSetupBundle({ ...VALID_BUNDLE, apiBaseUrl: 'http://127.0.0.1:18080' }).apiBaseUrl,
    'http://127.0.0.1:18080',
  );
});

test('rejects plaintext credentials sent to a remote HTTP endpoint', () => {
  assert.throws(
    () => parseSetupBundle({ ...VALID_BUNDLE, apiBaseUrl: 'http://phonehome.example' }),
    (error: unknown) => error instanceof PhoneHomeError && error.code === 'invalid_config',
  );
});

test('rejects padded or incorrectly sized secrets', () => {
  assert.throws(
    () => parseSetupBundle({ ...VALID_BUNDLE, apiKey: `${VALID_BUNDLE.apiKey}=` }),
    (error: unknown) => error instanceof PhoneHomeError && error.code === 'invalid_config',
  );
  assert.throws(
    () => parseSetupBundle({ ...VALID_BUNDLE, encryptionPhrase: 'AA' }),
    (error: unknown) => error instanceof PhoneHomeError && error.code === 'invalid_config',
  );
});

test('requires canonical UUID request identifiers', () => {
  const value = '181CF811-13B2-402C-A863-32A2BD6E636A';
  assert.equal(validateRequestId(value), value.toLowerCase());
  assert.throws(() => validateRequestId('not-a-uuid'));
});
