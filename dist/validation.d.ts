import type { AgentSetupBundle, DecryptedLocation, EncryptedEnvelope, LocationRequestStatus } from './types.js';
export declare function expectRecord(value: unknown, label: string): Record<string, unknown>;
export declare function expectString(record: Record<string, unknown>, key: string): string;
export declare function expectBoolean(record: Record<string, unknown>, key: string): boolean;
export declare function expectNumber(record: Record<string, unknown>, key: string): number;
export declare function expectNullableNumber(record: Record<string, unknown>, key: string): number | null;
export declare function decodeCanonicalBase64Url(value: string, byteLength: number, label: string): Buffer;
export declare function validateAccountId(value: string): string;
export declare function validateRequestId(value: string): string;
export declare function parseSetupBundle(value: unknown): AgentSetupBundle;
export declare function parseSetupBundleJson(json: string): AgentSetupBundle;
export declare function parseLocationStatus(value: unknown): LocationRequestStatus;
export declare function parseEnvelope(value: unknown): EncryptedEnvelope;
export declare function parseDecryptedLocation(value: unknown): DecryptedLocation;
//# sourceMappingURL=validation.d.ts.map