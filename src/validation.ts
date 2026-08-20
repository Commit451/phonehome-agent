import { PhoneHomeError } from './errors.js';
import type {
  AgentSetupBundle,
  DecryptedLocation,
  EncryptedEnvelope,
  LocationRequestStatus,
} from './types.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LOCATION_STATUSES = new Set<LocationRequestStatus>([
  'queued',
  'push_sent',
  'completed',
  'push_failed',
  'expired',
]);

export function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PhoneHomeError('invalid_response', `${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function expectString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PhoneHomeError('invalid_response', `${key} must be a non-empty string.`);
  }
  return value;
}

export function expectBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new PhoneHomeError('invalid_response', `${key} must be a boolean.`);
  }
  return value;
}

export function expectNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PhoneHomeError('invalid_response', `${key} must be a finite number.`);
  }
  return value;
}

export function expectNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PhoneHomeError('invalid_response', `${key} must be a finite number or null.`);
  }
  return value;
}

export function decodeCanonicalBase64Url(value: string, byteLength: number, label: string): Buffer {
  if (
    value.includes('=') ||
    !BASE64URL_PATTERN.test(value) ||
    value.length === 0 ||
    value.length % 4 === 1
  ) {
    throw new PhoneHomeError('invalid_config', `${label} must use canonical unpadded base64url.`);
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== byteLength || decoded.toString('base64url') !== value) {
    decoded.fill(0);
    throw new PhoneHomeError(
      'invalid_config',
      `${label} must encode exactly ${String(byteLength)} bytes.`,
    );
  }
  return decoded;
}

export function validateRequestId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PhoneHomeError('invalid_request', 'requestId must be a canonical UUID.');
  }
  return normalized;
}

export function parseSetupBundle(value: unknown): AgentSetupBundle {
  const record = expectRecord(value, 'Agent setup');
  const apiKey = expectString(record, 'apiKey');
  const encryptionPhrase = expectString(record, 'encryptionPhrase');

  const apiKeyBytes = decodeCanonicalBase64Url(apiKey, 32, 'apiKey');
  const encryptionKeyBytes = decodeCanonicalBase64Url(encryptionPhrase, 32, 'encryptionPhrase');
  apiKeyBytes.fill(0);
  encryptionKeyBytes.fill(0);

  return { apiKey, encryptionPhrase };
}

export function parseSetupBundleJson(json: string): AgentSetupBundle {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new PhoneHomeError('invalid_config', 'Agent setup is not valid JSON.', { cause: error });
  }
  return parseSetupBundle(value);
}

export function parseLocationStatus(value: unknown): LocationRequestStatus {
  if (typeof value !== 'string' || !LOCATION_STATUSES.has(value as LocationRequestStatus)) {
    throw new PhoneHomeError('invalid_response', 'Server returned an unknown location status.');
  }
  return value as LocationRequestStatus;
}

export function parseEnvelope(value: unknown): EncryptedEnvelope {
  const record = expectRecord(value, 'encryptedLocation');
  if (record.version !== 1 || record.algorithm !== 'A256GCM') {
    throw new PhoneHomeError('unsupported_encryption', 'Unsupported location encryption suite.');
  }
  const nonce = expectString(record, 'nonce');
  const ciphertext = expectString(record, 'ciphertext');
  const nonceBytes = decodeCanonicalBase64Url(nonce, 12, 'encryptedLocation.nonce');
  nonceBytes.fill(0);
  if (!BASE64URL_PATTERN.test(ciphertext) || ciphertext.includes('=')) {
    throw new PhoneHomeError('invalid_response', 'encryptedLocation.ciphertext is malformed.');
  }
  const ciphertextBytes = Buffer.from(ciphertext, 'base64url');
  if (ciphertextBytes.length < 16 || ciphertextBytes.toString('base64url') !== ciphertext) {
    ciphertextBytes.fill(0);
    throw new PhoneHomeError('invalid_response', 'encryptedLocation.ciphertext is malformed.');
  }
  ciphertextBytes.fill(0);
  return { version: 1, algorithm: 'A256GCM', nonce, ciphertext };
}

export function parseDecryptedLocation(value: unknown): DecryptedLocation {
  const record = expectRecord(value, 'Decrypted location');
  if (record.version !== 1) {
    throw new PhoneHomeError('unsupported_payload', 'Unsupported decrypted location payload.');
  }
  const latitude = expectNumber(record, 'latitude');
  const longitude = expectNumber(record, 'longitude');
  const accuracyMeters = expectNullableNumber(record, 'accuracyMeters');
  const capturedAtEpochMs = expectNumber(record, 'capturedAtEpochMs');
  const source = record.source;

  if (latitude < -90 || latitude > 90) {
    throw new PhoneHomeError('invalid_response', 'Decrypted latitude is out of range.');
  }
  if (longitude < -180 || longitude > 180) {
    throw new PhoneHomeError('invalid_response', 'Decrypted longitude is out of range.');
  }
  if (accuracyMeters !== null && accuracyMeters < 0) {
    throw new PhoneHomeError('invalid_response', 'Decrypted accuracyMeters cannot be negative.');
  }
  if (!Number.isSafeInteger(capturedAtEpochMs) || capturedAtEpochMs < 0) {
    throw new PhoneHomeError('invalid_response', 'Decrypted capturedAtEpochMs is invalid.');
  }
  if (source !== 'fresh' && source !== 'last_known') {
    throw new PhoneHomeError('invalid_response', 'Decrypted location source is invalid.');
  }

  return {
    version: 1,
    latitude,
    longitude,
    accuracyMeters,
    capturedAtEpochMs,
    source,
  };
}
