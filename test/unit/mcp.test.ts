import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PhoneHomeError } from '../../src/errors.js';
import { createPhoneHomeMcpServer, type PhoneHomeMcpClient } from '../../src/mcp-server.js';
import type { AgentLocation, LocationResultResponse } from '../../src/types.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REQUEST_ID = '181cf811-13b2-402c-a863-32a2bd6e636a';
const LOCATION: AgentLocation = {
  requestId: REQUEST_ID,
  latitude: 41.5868,
  longitude: -93.625,
  accuracyMeters: 12.5,
  capturedAtEpochMs: 1_700_000_000_000,
  capturedAt: '2023-11-14T22:13:20.000Z',
  receivedAtEpochMs: 1_700_000_000_100,
};

function fakeClient(overrides: Partial<PhoneHomeMcpClient> = {}): PhoneHomeMcpClient {
  return {
    status: async () => ({ deviceRegistered: true }),
    verifyPairing: async () => ({ matches: true }),
    createLocationRequest: async (requestId = REQUEST_ID) => ({
      requestId,
      status: 'push_sent',
      expiresAtEpochMs: 1_700_000_060_000,
    }),
    getLocationResult: async (requestId) => ({
      requestId,
      status: 'push_sent',
      receivedAtEpochMs: null,
      encryptedLocation: null,
    }),
    decryptResult: () => LOCATION,
    locate: async () => LOCATION,
    ...overrides,
  };
}

async function connectInMemory(clientFactory: () => Promise<PhoneHomeMcpClient>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPhoneHomeMcpServer({ version: '0.0.3', clientFactory });
  const client = new Client({ name: 'phone-home-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function closeInMemory(connection: Awaited<ReturnType<typeof connectInMemory>>) {
  await Promise.allSettled([connection.client.close(), connection.server.close()]);
}

test('advertises the complete safe PhoneHome MCP tool set', async (context) => {
  const connection = await connectInMemory(async () => fakeClient());
  context.after(() => closeInMemory(connection));

  const tools = await connection.client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    'phone_home_check_pairing',
    'phone_home_get_location',
    'phone_home_get_location_result',
    'phone_home_request_location',
    'phone_home_status',
  ]);
  assert.ok(!tools.tools.some((tool) => tool.name.includes('setup')));
});

test('returns structured location output and forwards MCP timing options', async (context) => {
  let receivedOptions: Parameters<PhoneHomeMcpClient['locate']>[0];
  const connection = await connectInMemory(async () =>
    fakeClient({
      locate: async (options) => {
        receivedOptions = options;
        return LOCATION;
      },
    }),
  );
  context.after(() => closeInMemory(connection));

  const result = await connection.client.callTool({
    name: 'phone_home_get_location',
    arguments: {
      timeoutSeconds: 2.5,
      pollIntervalMs: 25,
      requestId: REQUEST_ID,
    },
  });

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, LOCATION);
  assert.deepEqual(receivedOptions, {
    timeoutMs: 2_500,
    pollIntervalMs: 25,
    requestId: REQUEST_ID,
  });
  assert.ok(Array.isArray(result.content));
  const firstContent = result.content[0] as { type: string; text: string } | undefined;
  assert.equal(firstContent?.type, 'text');
  assert.deepEqual(JSON.parse(firstContent?.text ?? ''), LOCATION);
});

test('split result tool reports pending state without exposing encrypted payloads', async (context) => {
  const pending: LocationResultResponse = {
    requestId: REQUEST_ID,
    status: 'push_sent',
    receivedAtEpochMs: null,
    encryptedLocation: null,
  };
  const connection = await connectInMemory(async () =>
    fakeClient({ getLocationResult: async () => pending }),
  );
  context.after(() => closeInMemory(connection));

  const result = await connection.client.callTool({
    name: 'phone_home_get_location_result',
    arguments: { requestId: REQUEST_ID },
  });

  assert.deepEqual(result.structuredContent, {
    requestId: REQUEST_ID,
    status: 'push_sent',
    receivedAtEpochMs: null,
    location: null,
  });
  assert.ok(!JSON.stringify(result).includes('encryptedLocation'));
});

test('returns actionable PhoneHome errors without leaking credentials', async (context) => {
  const secret = 'do-not-leak-this-api-key';
  const connection = await connectInMemory(async () =>
    fakeClient({
      locate: async () => {
        throw new PhoneHomeError(
          'pairing_required',
          'The agent pairing is stale. Request a new pairing code.',
          { details: { action: 'request_new_pairing_code' }, cause: new Error(secret) },
        );
      },
    }),
  );
  context.after(() => closeInMemory(connection));

  const result = await connection.client.callTool({
    name: 'phone_home_get_location',
    arguments: {},
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.isError, true);
  assert.match(serialized, /pairing_required/);
  assert.match(serialized, /request_new_pairing_code/);
  assert.ok(!serialized.includes(secret));
});

test('the executable speaks MCP over a real stdio child process', { timeout: 10_000 }, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp.ts'],
    cwd: PROJECT_ROOT,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const client = new Client({ name: 'phone-home-stdio-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 5);
    assert.equal(client.getServerVersion()?.name, 'phone-home');
  } finally {
    await client.close();
  }
  assert.equal(stderr, '');
});

test('the MCP executable exposes help and version without starting stdio', () => {
  const version = spawnSync(process.execPath, ['--import', 'tsx', 'src/mcp.ts', '--version'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.0.3');

  const help = spawnSync(process.execPath, ['--import', 'tsx', 'src/mcp.ts', '--help'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Model Context Protocol server over stdio/);
  assert.equal(help.stderr, '');
});
