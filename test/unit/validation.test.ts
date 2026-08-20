import assert from 'node:assert/strict';
import test from 'node:test';
import { PhoneHomeError } from '../../src/errors.js';
import { parseSetupBundle, validateRequestId } from '../../src/validation.js';

const VALID_BUNDLE = {
  apiKey: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
  encryptionPhrase: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

test('validates only the two setup secrets and discards metadata', () => {
  assert.deepEqual(
    parseSetupBundle({
      version: 2,
      type: 'phonehome-agent-setup',
      apiBaseUrl: 'https://untrusted.example',
      accountId: 'untrusted-account',
      purpose: 'Agent-facing context',
      ...VALID_BUNDLE,
    }),
    VALID_BUNDLE,
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
