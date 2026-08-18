import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig, saveConfig } from '../../src/config.js';
import type { AgentSetupBundle } from '../../src/types.js';

const BUNDLE: AgentSetupBundle = {
  version: 2,
  apiBaseUrl: 'https://phonehome.example',
  accountId: 'firebase-user-one',
  apiKey: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
  encryptionPhrase: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

test('atomically saves and reloads a protected setup file', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'phone-home-cli-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, 'nested', 'config.json');

  assert.equal(await saveConfig(BUNDLE, path), path);
  assert.deepEqual(await loadConfig(path), { bundle: BUNDLE, source: 'file', configPath: path });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), BUNDLE);

  if (process.platform !== 'win32') {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, 'nested'))).mode & 0o777, 0o700);
  }
});

test('does not change permissions on an existing custom parent directory', async (context) => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(join(tmpdir(), 'phone-home-cli-parent-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o755);

  await saveConfig(BUNDLE, join(root, 'config.json'));

  assert.equal((await stat(root)).mode & 0o777, 0o755);
});

test('loads a complete setup bundle directly from the environment', async () => {
  const loaded = await loadConfig(undefined, {
    PHONE_HOME_SETUP_BUNDLE: JSON.stringify(BUNDLE),
  });
  assert.deepEqual(loaded, { bundle: BUNDLE, source: 'environment', configPath: null });
});

test('loads the four environment fields as an ephemeral bundle', async () => {
  const loaded = await loadConfig(undefined, {
    PHONE_HOME_API_BASE_URL: BUNDLE.apiBaseUrl,
    PHONE_HOME_ACCOUNT_ID: BUNDLE.accountId,
    PHONE_HOME_API_KEY: BUNDLE.apiKey,
    PHONE_HOME_ENCRYPTION_PHRASE: BUNDLE.encryptionPhrase,
  });
  assert.deepEqual(loaded.bundle, BUNDLE);
  assert.equal(loaded.source, 'environment');
});
