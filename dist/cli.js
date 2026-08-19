#!/usr/bin/env node
import { createRequire } from 'node:module';
import { PhoneHomeClient } from './client.js';
import { loadConfig, readSetupSource, saveConfig } from './config.js';
import { PhoneHomeError, UsageError } from './errors.js';
const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');
async function main() {
    const global = parseGlobalOptions(process.argv.slice(2));
    if (global.version) {
        process.stdout.write(`${packageMetadata.version}\n`);
        return;
    }
    if (global.help || global.remaining.length === 0 || global.remaining[0] === 'help') {
        process.stdout.write(HELP);
        return;
    }
    const command = global.remaining[0];
    if (command === undefined)
        throw new UsageError('A command is required.');
    const argumentsForCommand = global.remaining.slice(1);
    if (command === 'setup') {
        if (argumentsForCommand.length > 1) {
            throw new UsageError('setup accepts at most one JSON file path.');
        }
        const bundle = await readSetupSource(argumentsForCommand[0]);
        const configPath = await saveConfig(bundle, global.configPath);
        printJson({
            configured: true,
            configPath,
            apiBaseUrl: bundle.apiBaseUrl,
            accountId: bundle.accountId,
        }, global.compact);
        return;
    }
    const knownCommands = new Set([
        'config',
        'status',
        'check',
        'request',
        'result',
        'location',
        'locate',
        'get-location',
    ]);
    if (!knownCommands.has(command)) {
        throw new UsageError(`Unknown command: ${String(command)}`);
    }
    const loaded = await loadConfig(global.configPath);
    const client = new PhoneHomeClient(loaded.bundle);
    switch (command) {
        case 'config':
            requireNoArguments(command, argumentsForCommand);
            printJson({
                source: loaded.source,
                configPath: loaded.configPath,
                version: loaded.bundle.version,
                apiBaseUrl: loaded.bundle.apiBaseUrl,
                accountId: loaded.bundle.accountId,
            }, global.compact);
            return;
        case 'status':
            requireNoArguments(command, argumentsForCommand);
            printJson(await client.status(), global.compact);
            return;
        case 'check':
            requireNoArguments(command, argumentsForCommand);
            printJson(await client.verifyPairing(), global.compact);
            return;
        case 'request': {
            const options = parseRequestOptions(argumentsForCommand);
            printJson(await client.createLocationRequest(options.requestId), global.compact);
            return;
        }
        case 'result': {
            const requestId = argumentsForCommand[0];
            if (argumentsForCommand.length !== 1 || !requestId || requestId.startsWith('-')) {
                throw new UsageError('result requires exactly one requestId.');
            }
            await client.verifyPairing();
            const result = await client.getLocationResult(requestId);
            printJson(result.status === 'completed' ? client.decryptResult(result) : result, global.compact);
            return;
        }
        case 'location':
        case 'locate':
        case 'get-location': {
            const options = parseLocationOptions(argumentsForCommand);
            printJson(await client.locate(options), global.compact);
            return;
        }
        default:
            throw new UsageError(`Unknown command: ${String(command)}`);
    }
}
function parseGlobalOptions(arguments_) {
    const remaining = [];
    let configPath;
    let compact = false;
    let help = false;
    let version = false;
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--config') {
            const value = arguments_[index + 1];
            if (!value || value.startsWith('-'))
                throw new UsageError('--config requires a file path.');
            if (configPath !== undefined)
                throw new UsageError('--config can be specified only once.');
            configPath = value;
            index += 1;
        }
        else if (argument === '--compact') {
            compact = true;
        }
        else if (argument === '--help' || argument === '-h') {
            help = true;
        }
        else if (argument === '--version' || argument === '-v') {
            version = true;
        }
        else if (argument !== undefined) {
            remaining.push(argument);
        }
    }
    return { configPath, compact, help, version, remaining };
}
function parseRequestOptions(arguments_) {
    let requestId;
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument !== '--request-id')
            throw new UsageError(`Unknown request option: ${argument}`);
        const value = arguments_[index + 1];
        if (!value || value.startsWith('-'))
            throw new UsageError('--request-id requires a UUID.');
        if (requestId !== undefined)
            throw new UsageError('--request-id can be specified only once.');
        requestId = value;
        index += 1;
    }
    return requestId === undefined ? {} : { requestId };
}
function parseLocationOptions(arguments_) {
    const request = parseRequestOptions(arguments_.filter((argument, index) => {
        const previous = arguments_[index - 1];
        return argument === '--request-id' || previous === '--request-id';
    }));
    let timeoutMs;
    let pollIntervalMs;
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--request-id') {
            index += 1;
            continue;
        }
        const value = arguments_[index + 1];
        if (argument === '--timeout') {
            timeoutMs = parsePositiveNumber(value, '--timeout') * 1_000;
            index += 1;
        }
        else if (argument === '--poll-interval') {
            pollIntervalMs = parsePositiveNumber(value, '--poll-interval');
            index += 1;
        }
        else {
            throw new UsageError(`Unknown location option: ${String(argument)}`);
        }
    }
    return {
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...request,
    };
}
function parsePositiveNumber(value, option) {
    if (!value || value.startsWith('-'))
        throw new UsageError(`${option} requires a positive number.`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new UsageError(`${option} requires a positive number.`);
    }
    return parsed;
}
function requireNoArguments(command, arguments_) {
    if (arguments_.length > 0)
        throw new UsageError(`${command} does not accept arguments.`);
}
function printJson(value, compact) {
    process.stdout.write(`${JSON.stringify(value, null, compact ? undefined : 2)}\n`);
}
function printError(error, compact) {
    if (error instanceof PhoneHomeError) {
        process.stderr.write(`${JSON.stringify({
            error: {
                code: error.code,
                message: error.message,
                ...(error.details === undefined ? {} : { details: error.details }),
            },
        }, null, compact ? undefined : 2)}\n`);
        process.exitCode = error.exitCode;
        return;
    }
    process.stderr.write(`${JSON.stringify({ error: { code: 'internal_error', message: 'Unexpected PhoneHome CLI failure.' } }, null, compact ? undefined : 2)}\n`);
    process.exitCode = 2;
}
const HELP = `phone-home-cli ${packageMetadata.version}

Get the user's current phone location as machine-readable JSON.

Usage:
  phone-home setup [bundle.json|-] [--config path]
  phone-home config
  phone-home status
  phone-home check
  phone-home location [--timeout seconds] [--poll-interval ms] [--request-id uuid]
  phone-home request [--request-id uuid]
  phone-home result <request-id>

Aliases:
  location: locate, get-location

Global options:
  --config <path>   Use a specific setup file
  --compact         Print compact JSON
  -h, --help        Show help
  -v, --version     Show version

Configuration:
  Pipe the version 2 setup bundle copied from the PhoneHome app to "phone-home setup".
  Credentials can instead come from PHONE_HOME_SETUP_BUNDLE or all four of:
  PHONE_HOME_API_BASE_URL, PHONE_HOME_ACCOUNT_ID, PHONE_HOME_API_KEY, and
  PHONE_HOME_ENCRYPTION_PHRASE. PHONE_HOME_CONFIG changes the default file path.

Exit codes:
  0 success, 1 usage/configuration, 2 API/runtime failure, 3 location pending/timeout
`;
main().catch((error) => printError(error, process.argv.includes('--compact')));
//# sourceMappingURL=cli.js.map