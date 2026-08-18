export interface AgentSetupBundle {
  version: 2;
  apiBaseUrl: string;
  accountId: string;
  apiKey: string;
  encryptionPhrase: string;
}

export interface AgentAccountStatusResponse {
  accountId: string;
  deviceRegistered: boolean;
}

export interface EncryptionCheckResponse {
  accountId: string;
  matches: boolean;
}

export type LocationRequestStatus =
  'queued' | 'push_sent' | 'completed' | 'push_failed' | 'expired';

export interface CreateLocationResponse {
  requestId: string;
  accountId: string;
  status: LocationRequestStatus;
  expiresAtEpochMs: number;
}

export interface EncryptedEnvelope {
  version: 1;
  algorithm: 'A256GCM';
  nonce: string;
  ciphertext: string;
}

export interface LocationResultResponse {
  requestId: string;
  accountId: string;
  status: LocationRequestStatus;
  createdAtEpochMs: number;
  expiresAtEpochMs: number;
  receivedAtEpochMs: number | null;
  encryptedLocation: EncryptedEnvelope | null;
}

export interface DecryptedLocation {
  version: 1;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAtEpochMs: number;
  source: 'fresh' | 'last_known';
}

export interface AgentLocation extends Omit<DecryptedLocation, 'version'> {
  accountId: string;
  requestId: string;
  capturedAt: string;
  receivedAtEpochMs: number | null;
}

export interface LocateOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestId?: string;
}
