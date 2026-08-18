import { createDecipheriv, createHash } from 'node:crypto';
import { PhoneHomeError } from './errors.js';
import { decodeCanonicalBase64Url, parseDecryptedLocation, parseEnvelope } from './validation.js';
const KEY_CHECK_CONTEXT = Buffer.from('phonehome/key-check/v1\0', 'utf8');
const LOCATION_AAD_PREFIX = 'phonehome/location/v1';
export function deriveEncryptionKeyCheck(encryptionPhrase) {
    const key = decodeCanonicalBase64Url(encryptionPhrase, 32, 'encryptionPhrase');
    try {
        return createHash('sha256').update(KEY_CHECK_CONTEXT).update(key).digest('base64url');
    }
    finally {
        key.fill(0);
    }
}
export function locationAdditionalAuthenticatedData(accountId, requestId) {
    return Buffer.from(`${LOCATION_AAD_PREFIX}\n${accountId}\n${requestId}`, 'utf8');
}
export function decryptLocation(encryptionPhrase, accountId, requestId, rawEnvelope) {
    const envelope = parseEnvelope(rawEnvelope);
    const key = decodeCanonicalBase64Url(encryptionPhrase, 32, 'encryptionPhrase');
    const nonce = Buffer.from(envelope.nonce, 'base64url');
    const combined = Buffer.from(envelope.ciphertext, 'base64url');
    const authenticationTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(0, combined.length - 16);
    const aad = locationAdditionalAuthenticatedData(accountId, requestId);
    let plaintext;
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(aad);
        decipher.setAuthTag(authenticationTag);
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        let parsed;
        try {
            parsed = JSON.parse(plaintext.toString('utf8'));
        }
        catch (error) {
            throw new PhoneHomeError('invalid_response', 'Decrypted location is not valid JSON.', {
                cause: error,
            });
        }
        return parseDecryptedLocation(parsed);
    }
    catch (error) {
        if (error instanceof PhoneHomeError)
            throw error;
        throw new PhoneHomeError('decryption_failed', 'Location could not be authenticated and decrypted. Check the setup bundle.', { cause: error });
    }
    finally {
        key.fill(0);
        nonce.fill(0);
        combined.fill(0);
        aad.fill(0);
        plaintext?.fill(0);
    }
}
//# sourceMappingURL=crypto.js.map