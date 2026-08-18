import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BUNDLE = {
  version: 2,
  apiBaseUrl: 'https://phonehome.example',
  accountId: 'firebase-user-one',
  apiKey: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
  encryptionPhrase: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};

function run(arguments_: string[], input?: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...arguments_], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      PHONE_HOME_SETUP_BUNDLE: '',
      PHONE_HOME_API_BASE_URL: '',
      PHONE_HOME_ACCOUNT_ID: '',
      PHONE_HOME_API_KEY: '',
      PHONE_HOME_ENCRYPTION_PHRASE: '',
    },
  });
}

test('prints version and command help', () => {
  const version = run(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), '0.1.0');

  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /phone-home location/);
  assert.equal(help.stderr, '');
});

test('setup reads stdin, protects secrets, and config output stays sanitized', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'phone-home-cli-command-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, 'config.json');

  const configured = run(['setup', '--config', configPath], JSON.stringify(BUNDLE));
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(JSON.parse(configured.stdout).configured, true);
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).apiKey, BUNDLE.apiKey);
  assert.ok(!configured.stdout.includes(BUNDLE.apiKey));
  assert.ok(!configured.stdout.includes(BUNDLE.encryptionPhrase));

  const shown = run(['config', '--config', configPath]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).accountId, BUNDLE.accountId);
  assert.ok(!shown.stdout.includes(BUNDLE.apiKey));
  assert.ok(!shown.stdout.includes(BUNDLE.encryptionPhrase));
});

test('usage errors are JSON on stderr with a nonzero exit', () => {
  const result = run(['unknown-command', '--compact']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'usage_error');
});
