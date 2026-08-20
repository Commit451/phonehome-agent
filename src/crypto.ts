import { createDecipheriv, createHash } from 'node:crypto';
import { PhoneHomeError } from './errors.js';
import type { DecryptedLocation, EncryptedEnvelope } from './types.js';
import { decodeCanonicalBase64Url, parseDecryptedLocation, parseEnvelope } from './validation.js';

const KEY_CHECK_CONTEXT = Buffer.from('phonehome/key-check/v1\0', 'utf8');
const LOCATION_AAD_PREFIX = 'phonehome/location/v1';

export function deriveEncryptionKeyCheck(encryptionPhrase: string): string {
  const key = decodeCanonicalBase64Url(encryptionPhrase, 32, 'encryptionPhrase');
  try {
    return createHash('sha256').update(KEY_CHECK_CONTEXT).update(key).digest('base64url');
  } finally {
    key.fill(0);
  }
}

export function locationAdditionalAuthenticatedData(requestId: string): Buffer {
  return Buffer.from(`${LOCATION_AAD_PREFIX}\n${requestId}`, 'utf8');
}

export function decryptLocation(
  encryptionPhrase: string,
  requestId: string,
  rawEnvelope: EncryptedEnvelope,
): DecryptedLocation {
  const envelope = parseEnvelope(rawEnvelope);
  const key = decodeCanonicalBase64Url(encryptionPhrase, 32, 'encryptionPhrase');
  const nonce = Buffer.from(envelope.nonce, 'base64url');
  const combined = Buffer.from(envelope.ciphertext, 'base64url');
  const authenticationTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const aad = locationAdditionalAuthenticatedData(requestId);

  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(authenticationTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext.toString('utf8')) as unknown;
    } catch (error) {
      throw new PhoneHomeError('invalid_response', 'Decrypted location is not valid JSON.', {
        cause: error,
      });
    }
    return parseDecryptedLocation(parsed);
  } catch (error) {
    if (error instanceof PhoneHomeError) throw error;
    throw new PhoneHomeError(
      'decryption_failed',
      'Location could not be authenticated and decrypted. Check the setup bundle.',
      { cause: error },
    );
  } finally {
    key.fill(0);
    nonce.fill(0);
    combined.fill(0);
    aad.fill(0);
    plaintext?.fill(0);
  }
}
