import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PhoneHomeError } from './errors.js';
import { parseSetupBundle, parseSetupBundleJson } from './validation.js';
function expandPath(value) {
    if (value === '~')
        return homedir();
    if (value.startsWith('~/'))
        return join(homedir(), value.slice(2));
    return isAbsolute(value) ? value : resolve(value);
}
export function defaultConfigPath(environment = process.env) {
    if (environment.PHONE_HOME_CONFIG)
        return expandPath(environment.PHONE_HOME_CONFIG);
    if (process.platform === 'win32') {
        const root = environment.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
        return join(root, 'phone-home', 'config.json');
    }
    const root = environment.XDG_CONFIG_HOME
        ? expandPath(environment.XDG_CONFIG_HOME)
        : join(homedir(), '.config');
    return join(root, 'phone-home', 'config.json');
}
async function loadFile(path) {
    let metadata;
    try {
        metadata = await lstat(path);
    }
    catch (error) {
        throw new PhoneHomeError('config_not_found', `No PhoneHome setup was found at ${path}.`, {
            exitCode: 1,
            cause: error,
        });
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new PhoneHomeError('insecure_config', 'The PhoneHome config must be a regular file.');
    }
    if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
        throw new PhoneHomeError('insecure_config', `PhoneHome config permissions are too broad. Run: chmod 600 ${path}`);
    }
    return parseSetupBundleJson(await readFile(path, 'utf8'));
}
function loadEnvironment(environment) {
    const inline = environment.PHONE_HOME_SETUP_BUNDLE;
    if (inline)
        return parseSetupBundleJson(inline);
    const values = {
        apiBaseUrl: environment.PHONE_HOME_API_BASE_URL,
        accountId: environment.PHONE_HOME_ACCOUNT_ID,
        apiKey: environment.PHONE_HOME_API_KEY,
        encryptionPhrase: environment.PHONE_HOME_ENCRYPTION_PHRASE,
    };
    const present = Object.values(values).filter((value) => value !== undefined).length;
    if (present === 0)
        return null;
    if (present !== 4) {
        throw new PhoneHomeError('invalid_config', 'Set all four PHONE_HOME_API_BASE_URL, PHONE_HOME_ACCOUNT_ID, PHONE_HOME_API_KEY, and PHONE_HOME_ENCRYPTION_PHRASE variables.', { exitCode: 1 });
    }
    return parseSetupBundle({ version: 2, ...values });
}
export async function loadConfig(explicitPath, environment = process.env) {
    if (explicitPath === undefined) {
        const fromEnvironment = loadEnvironment(environment);
        if (fromEnvironment) {
            return { bundle: fromEnvironment, source: 'environment', configPath: null };
        }
    }
    const configPath = explicitPath ? expandPath(explicitPath) : defaultConfigPath(environment);
    return { bundle: await loadFile(configPath), source: 'file', configPath };
}
export async function saveConfig(bundle, explicitPath, environment = process.env) {
    const configPath = explicitPath ? expandPath(explicitPath) : defaultConfigPath(environment);
    const directory = dirname(configPath);
    try {
        const createdDirectory = await mkdir(directory, { recursive: true, mode: 0o700 });
        if (createdDirectory !== undefined && process.platform !== 'win32') {
            await chmod(directory, 0o700);
        }
    }
    catch (error) {
        throw new PhoneHomeError('config_write_failed', `Could not prepare ${directory}.`, {
            cause: error,
        });
    }
    const temporaryPath = join(directory, `.config-${randomUUID()}.tmp`);
    const serialized = `${JSON.stringify(parseSetupBundle(bundle), null, 2)}\n`;
    try {
        await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        if (process.platform !== 'win32')
            await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, configPath);
        if (process.platform !== 'win32')
            await chmod(configPath, 0o600);
    }
    catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw new PhoneHomeError('config_write_failed', `Could not securely write ${configPath}.`, {
            cause: error,
        });
    }
    return configPath;
}
async function readStandardInput() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
export async function readSetupSource(source) {
    let serialized;
    if (source === undefined || source === '-') {
        if (source === undefined && process.stdin.isTTY) {
            throw new PhoneHomeError('setup_required', 'Pipe the setup bundle to this command or provide a JSON file path.', { exitCode: 1 });
        }
        serialized = await readStandardInput();
    }
    else if (source.trimStart().startsWith('{')) {
        serialized = source;
    }
    else {
        const path = expandPath(source);
        try {
            await access(path, constants.R_OK);
            serialized = await readFile(path, 'utf8');
        }
        catch (error) {
            throw new PhoneHomeError('setup_read_failed', `Could not read setup bundle from ${path}.`, {
                exitCode: 1,
                cause: error,
            });
        }
    }
    return parseSetupBundleJson(serialized);
}
//# sourceMappingURL=config.js.map