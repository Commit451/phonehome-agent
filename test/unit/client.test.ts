import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { PHONE_HOME_API_BASE_URL, PhoneHomeClient } from '../../src/client.js';
import { locationAdditionalAuthenticatedData } from '../../src/crypto.js';
import { ApiError, PairingRequiredError } from '../../src/errors.js';
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

function envelope(requestId: string): EncryptedEnvelope {
  const key = Buffer.from(ENCRYPTION_PHRASE, 'base64url');
  const nonce = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(locationAdditionalAuthenticatedData(requestId));
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
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    version: 1,
    algorithm: 'A256GCM',
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function setup(): AgentSetupBundle {
  return {
    apiKey: API_KEY,
    encryptionPhrase: ENCRYPTION_PHRASE,
  };
}

function clientFor(baseUrl: string): PhoneHomeClient {
  const redirectedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const requested = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    assert.equal(requested.origin, PHONE_HOME_API_BASE_URL);
    return fetch(`${baseUrl}${requested.pathname}${requested.search}`, init);
  }) as typeof fetch;
  return new PhoneHomeClient(setup(), { fetch: redirectedFetch });
}

test('requests, polls, authenticates, and decrypts a location', async (context) => {
  let polls = 0;
  const requestedPaths: string[] = [];
  const server = await startServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
    requestedPaths.push(request.url ?? '');
    if (request.method === 'POST' && request.url?.endsWith('/check')) {
      json(response, 200, { matches: true });
      return;
    }
    if (request.method === 'POST' && request.url?.endsWith('/location-requests')) {
      json(response, 202, {
        requestId: REQUEST_ID,
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
        status: complete ? 'completed' : 'push_sent',
        receivedAtEpochMs: complete ? 1_700_000_000_100 : null,
        encryptedLocation: complete ? envelope(REQUEST_ID) : null,
      });
      return;
    }
    json(response, 404, { code: 'not_found', message: 'Not found.' });
  });
  context.after(server.close);

  const location = await clientFor(server.baseUrl).locate({
    requestId: REQUEST_ID,
    timeoutMs: 2_000,
    pollIntervalMs: 5,
  });
  assert.deepEqual(location, {
    requestId: REQUEST_ID,
    latitude: 41.5868,
    longitude: -93.625,
    accuracyMeters: 12.5,
    capturedAtEpochMs: 1_700_000_000_000,
    capturedAt: '2023-11-14T22:13:20.000Z',
    receivedAtEpochMs: 1_700_000_000_100,
  });
  assert.deepEqual(requestedPaths, [
    '/v1/account/check',
    '/v1/account/location-requests',
    `/v1/account/location-requests/${REQUEST_ID}`,
    `/v1/account/location-requests/${REQUEST_ID}`,
  ]);
});

test('parses status and encryption-check responses', async (context) => {
  const server = await startServer((request, response) => {
    if (request.method === 'GET') {
      json(response, 200, { deviceRegistered: true });
    } else {
      json(response, 200, { matches: true });
    }
  });
  context.after(server.close);
  const client = clientFor(server.baseUrl);
  assert.deepEqual(await client.status(), {
    deviceRegistered: true,
  });
  assert.deepEqual(await client.checkEncryption(), {
    matches: true,
  });
  assert.deepEqual(await client.verifyPairing(), {
    matches: true,
  });
});

test('stops before requesting location when the encryption pairing is stale', async (context) => {
  let requestedLocation = false;
  const server = await startServer((request, response) => {
    if (request.url?.endsWith('/check')) {
      json(response, 200, { matches: false });
      return;
    }
    requestedLocation = true;
    json(response, 500, { code: 'unexpected_request', message: 'Unexpected request.' });
  });
  context.after(server.close);

  await assert.rejects(
    clientFor(server.baseUrl).createLocationRequest(REQUEST_ID),
    (error: unknown) =>
      error instanceof PairingRequiredError &&
      error.code === 'pairing_required' &&
      error.details?.action === 'request_new_pairing_code',
  );
  assert.equal(requestedLocation, false);
});

test('turns server pairing_required responses into actionable agent errors', async (context) => {
  const server = await startServer((_request, response) => {
    json(response, 409, {
      code: 'pairing_required',
      message: 'Pairing changed.',
    });
  });
  context.after(server.close);

  await assert.rejects(
    clientFor(server.baseUrl).status(),
    (error: unknown) =>
      error instanceof PairingRequiredError &&
      error.code === 'pairing_required' &&
      error.details?.status === 409 &&
      error.details?.action === 'request_new_pairing_code' &&
      error.message.includes('Tell the user') &&
      !error.message.includes(API_KEY),
  );
});

test('surfaces structured API errors without credentials', async (context) => {
  const server = await startServer((_request, response) => {
    json(response, 403, { code: 'forbidden', message: 'Credential rejected.' });
  });
  context.after(server.close);
  const client = clientFor(server.baseUrl);

  await assert.rejects(
    client.status(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      error.code === 'forbidden' &&
      !error.message.includes(API_KEY),
  );
});
