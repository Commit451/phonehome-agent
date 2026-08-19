import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentAccountStatusResponse, AgentLocation, CreateLocationResponse, EncryptionCheckResponse, LocateOptions, LocationResultResponse } from './types.js';
export interface PhoneHomeMcpClient {
    status(): Promise<AgentAccountStatusResponse>;
    verifyPairing(): Promise<EncryptionCheckResponse>;
    createLocationRequest(requestId?: string): Promise<CreateLocationResponse>;
    getLocationResult(requestId: string): Promise<LocationResultResponse>;
    decryptResult(result: LocationResultResponse): AgentLocation;
    locate(options?: LocateOptions): Promise<AgentLocation>;
}
export interface PhoneHomeMcpServerOptions {
    version: string;
    configPath?: string;
    clientFactory?: () => Promise<PhoneHomeMcpClient>;
}
export declare function createPhoneHomeMcpServer(options: PhoneHomeMcpServerOptions): McpServer;
//# sourceMappingURL=mcp-server.d.ts.map