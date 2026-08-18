import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { PhoneHomeClient } from '../../src/client.js';
import { locationAdditionalAuthenticatedData } from '../../src/crypto.js';
import { ApiError } from '../../src/errors.js';
import type { AgentSetupBundle, EncryptedEnvelope } from '../../src/types.js';

const REQUEST_ID = '181cf811-13b2-402c-a863-32a2bd6e636a';
const API_KEY = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8';
const ENCRYPTION_PHRASE = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing server address');
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function envelope(accountId: string, requestId: string): EncryptedEnvelope {
  const key = Buffer.from(ENCRYPTION_PHRASE, 'base64url');
  const nonce = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(locationAdditionalAuthenticatedData(accountId, requestId));
  const plaintext = Buffer.from(
    JSON.stringify({
      version: 1,
      latitude: 41.5868,
      longitude: -93.625,
      accuracyMeters: null,
      capturedAtEpochMs: 1_700_000_000_000,
      source: 'last_known',
    }),
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    version: 1,
    algorithm: 'A256GCM',
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function setup(baseUrl: string): AgentSetupBundle {
  return {
    version: 2,
    apiBaseUrl: baseUrl,
    accountId: 'firebase-user-one',
    apiKey: API_KEY,
    encryptionPhrase: ENCRYPTION_PHRASE,
  };
}

test('requests, polls, authenticates, and decrypts a location', async (context) => {
  let polls = 0;
  const server = await startServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
    if (request.method === 'POST' && request.url?.endsWith('/location-requests')) {
      json(response, 202, {
        requestId: REQUEST_ID,
        accountId: 'firebase-user-one',
        status: 'push_sent',
        expiresAtEpochMs: Date.now() + 10_000,
      });
      return;
    }
    if (request.method === 'GET' && request.url?.endsWith(`/location-requests/${REQUEST_ID}`)) {
      polls += 1;
      const complete = polls > 1;
      json(response, 200, {
        requestId: REQUEST_ID,
        accountId: 'firebase-user-one',
        status: complete ? 'completed' : 'push_sent',
        createdAtEpochMs: Date.now() - 100,
        expiresAtEpochMs: Date.now() + 10_000,
        receivedAtEpochMs: complete ? 1_700_000_000_100 : null,
        encryptedLocation: complete ? envelope('firebase-user-one', REQUEST_ID) : null,
      });
      return;
    }
    json(response, 404, { code: 'not_found', message: 'Not found.' });
  });
  context.after(server.close);

  const location = await new PhoneHomeClient(setup(server.baseUrl)).locate({
    requestId: REQUEST_ID,
    timeoutMs: 2_000,
    pollIntervalMs: 5,
  });
  assert.deepEqual(location, {
    accountId: 'firebase-user-one',
    requestId: REQUEST_ID,
    latitude: 41.5868,
    longitude: -93.625,
    accuracyMeters: null,
    capturedAtEpochMs: 1_700_000_000_000,
    capturedAt: '2023-11-14T22:13:20.000Z',
    source: 'last_known',
    receivedAtEpochMs: 1_700_000_000_100,
  });
});

test('parses status and encryption-check responses', async (context) => {
  const server = await startServer((request, response) => {
    if (request.method === 'GET') {
      json(response, 200, { accountId: 'firebase-user-one', deviceRegistered: true });
    } else {
      json(response, 200, { accountId: 'firebase-user-one', matches: true });
    }
  });
  context.after(server.close);
  const client = new PhoneHomeClient(setup(server.baseUrl));
  assert.deepEqual(await client.status(), {
    accountId: 'firebase-user-one',
    deviceRegistered: true,
  });
  assert.deepEqual(await client.checkEncryption(), {
    accountId: 'firebase-user-one',
    matches: true,
  });
});

test('surfaces structured API errors without credentials', async (context) => {
  const server = await startServer((_request, response) => {
    json(response, 403, { code: 'forbidden', message: 'Credential rejected.' });
  });
  context.after(server.close);
  const client = new PhoneHomeClient(setup(server.baseUrl));

  await assert.rejects(
    client.status(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      error.code === 'forbidden' &&
      !error.message.includes(API_KEY),
  );
});
