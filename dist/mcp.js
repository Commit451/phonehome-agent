#!/usr/bin/env node
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PhoneHomeError, UsageError } from './errors.js';
import { createPhoneHomeMcpServer } from './mcp-server.js';
const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');
async function main() {
    const options = parseOptions(process.argv.slice(2));
    if (options.version) {
        process.stdout.write(`${packageMetadata.version}\n`);
        return;
    }
    if (options.help) {
        process.stdout.write(HELP);
        return;
    }
    const server = createPhoneHomeMcpServer({
        version: packageMetadata.version,
        ...(options.configPath === undefined ? {} : { configPath: options.configPath }),
    });
    await server.connect(new StdioServerTransport());
}
function parseOptions(arguments_) {
    let configPath;
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
        else if (argument === '--help' || argument === '-h') {
            help = true;
        }
        else if (argument === '--version' || argument === '-v') {
            version = true;
        }
        else {
            throw new UsageError(`Unknown MCP server option: ${String(argument)}`);
        }
    }
    return { configPath, help, version };
}
function printStartupError(error) {
    const payload = error instanceof PhoneHomeError
        ? {
            error: {
                code: error.code,
                message: error.message,
                ...(error.details === undefined ? {} : { details: error.details }),
            },
        }
        : {
            error: {
                code: 'internal_error',
                message: 'Unexpected PhoneHome MCP startup failure.',
            },
        };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = error instanceof PhoneHomeError ? error.exitCode : 2;
}
const HELP = `phone-home-mcp ${packageMetadata.version}

Run PhoneHome as a local Model Context Protocol server over stdio.

Usage:
  phone-home-mcp [--config path]

Options:
  --config <path>   Use a specific PhoneHome setup file
  -h, --help        Show help
  -v, --version     Show version

Configure credentials first with "phone-home setup" or provide the same
PHONE_HOME_* environment variables supported by the CLI. The MCP server never
accepts setup bundles through a tool and never writes logs to stdout.
`;
main().catch(printStartupError);
//# sourceMappingURL=mcp.js.map