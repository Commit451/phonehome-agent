import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { PhoneHomeClient } from './client.js';
import { loadConfig } from './config.js';
import { PhoneHomeError } from './errors.js';
const requestIdSchema = z.uuid();
const accountIdSchema = z.string().min(1);
const epochSchema = z.number().int().nonnegative();
const locationStatusSchema = z.enum(['queued', 'push_sent', 'completed', 'push_failed', 'expired']);
const locationOutputSchema = {
    accountId: accountIdSchema,
    requestId: requestIdSchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().nullable(),
    capturedAtEpochMs: epochSchema,
    capturedAt: z.iso.datetime(),
    source: z.enum(['fresh', 'last_known']),
    receivedAtEpochMs: epochSchema.nullable(),
};
export function createPhoneHomeMcpServer(options) {
    const server = new McpServer({ name: 'phone-home', version: options.version }, {
        instructions: 'Use phone_home_get_location for a normal current-location request. Use the split request/result tools when the MCP client has a short tool timeout. PhoneHome coordinates are sensitive; disclose them only when needed for the user request.',
    });
    const createClient = options.clientFactory ??
        (async () => {
            const loaded = await loadConfig(options.configPath);
            return new PhoneHomeClient(loaded.bundle);
        });
    server.registerTool('phone_home_status', {
        title: 'PhoneHome status',
        description: 'Check whether the paired phone is registered with PhoneHome.',
        outputSchema: {
            accountId: accountIdSchema,
            deviceRegistered: z.boolean(),
        },
        annotations: readOnlyAnnotations,
    }, () => runTool(async () => (await createClient()).status()));
    server.registerTool('phone_home_check_pairing', {
        title: 'Check PhoneHome pairing',
        description: 'Verify that this agent and the active phone share the same location-encryption key.',
        outputSchema: {
            accountId: accountIdSchema,
            matches: z.literal(true),
        },
        annotations: readOnlyAnnotations,
    }, () => runTool(async () => (await createClient()).verifyPairing()));
    server.registerTool('phone_home_get_location', {
        title: 'Get current phone location',
        description: 'Request a fresh phone location, wait for the response, decrypt it locally, and return validated coordinates.',
        inputSchema: {
            timeoutSeconds: z
                .number()
                .positive()
                .optional()
                .describe('Local wait limit in seconds; defaults to 60.'),
            pollIntervalMs: z
                .number()
                .positive()
                .optional()
                .describe('Polling interval in milliseconds; defaults to 1000.'),
            requestId: requestIdSchema
                .optional()
                .describe('Optional caller-selected UUID used as an idempotency key.'),
        },
        outputSchema: locationOutputSchema,
        annotations: locationRequestAnnotations,
    }, ({ timeoutSeconds, pollIntervalMs, requestId }) => runTool(async () => {
        const locateOptions = {
            ...(timeoutSeconds === undefined ? {} : { timeoutMs: timeoutSeconds * 1_000 }),
            ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
            ...(requestId === undefined ? {} : { requestId }),
        };
        return (await createClient()).locate(locateOptions);
    }));
    server.registerTool('phone_home_request_location', {
        title: 'Start a phone location request',
        description: 'Start a fresh location request without waiting. Poll it with phone_home_get_location_result.',
        inputSchema: {
            requestId: requestIdSchema
                .optional()
                .describe('Optional caller-selected UUID used as an idempotency key.'),
        },
        outputSchema: {
            requestId: requestIdSchema,
            accountId: accountIdSchema,
            status: locationStatusSchema,
            expiresAtEpochMs: epochSchema,
        },
        annotations: locationRequestAnnotations,
    }, ({ requestId }) => runTool(async () => (await createClient()).createLocationRequest(requestId)));
    server.registerTool('phone_home_get_location_result', {
        title: 'Read a phone location result',
        description: 'Read a location request. Completed coordinates are decrypted locally; pending and terminal states return location: null.',
        inputSchema: {
            requestId: requestIdSchema.describe('The UUID returned by phone_home_request_location.'),
        },
        outputSchema: {
            requestId: requestIdSchema,
            accountId: accountIdSchema,
            status: locationStatusSchema,
            createdAtEpochMs: epochSchema,
            expiresAtEpochMs: epochSchema,
            receivedAtEpochMs: epochSchema.nullable(),
            location: z.object(locationOutputSchema).nullable(),
        },
        annotations: readOnlyAnnotations,
    }, ({ requestId }) => runTool(async () => {
        const client = await createClient();
        await client.verifyPairing();
        const result = await client.getLocationResult(requestId);
        return {
            requestId: result.requestId,
            accountId: result.accountId,
            status: result.status,
            createdAtEpochMs: result.createdAtEpochMs,
            expiresAtEpochMs: result.expiresAtEpochMs,
            receivedAtEpochMs: result.receivedAtEpochMs,
            location: result.status === 'completed' ? client.decryptResult(result) : null,
        };
    }));
    return server;
}
const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
const locationRequestAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
async function runTool(action) {
    try {
        const output = await action();
        const structuredContent = output;
        return {
            content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
            structuredContent,
        };
    }
    catch (error) {
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
                    message: 'Unexpected PhoneHome MCP failure.',
                },
            };
        return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            isError: true,
        };
    }
}
//# sourceMappingURL=mcp-server.js.map