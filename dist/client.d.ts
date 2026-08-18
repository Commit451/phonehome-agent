import type { AgentAccountStatusResponse, AgentLocation, AgentSetupBundle, CreateLocationResponse, EncryptionCheckResponse, EncryptedEnvelope, LocateOptions, LocationResultResponse } from './types.js';
export interface PhoneHomeClientOptions {
    fetch?: typeof fetch;
    requestTimeoutMs?: number;
}
export declare class PhoneHomeClient {
    #private;
    constructor(setup: AgentSetupBundle, options?: PhoneHomeClientOptions);
    status(): Promise<AgentAccountStatusResponse>;
    checkEncryption(): Promise<EncryptionCheckResponse>;
    createLocationRequest(requestId?: string): Promise<CreateLocationResponse>;
    getLocationResult(requestId: string): Promise<LocationResultResponse>;
    decryptResult(result: LocationResultResponse): AgentLocation;
    locate(options?: LocateOptions): Promise<AgentLocation>;
}
export type { EncryptedEnvelope };
//# sourceMappingURL=client.d.ts.map