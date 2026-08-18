import type { DecryptedLocation, EncryptedEnvelope } from './types.js';
export declare function deriveEncryptionKeyCheck(encryptionPhrase: string): string;
export declare function locationAdditionalAuthenticatedData(accountId: string, requestId: string): Buffer;
export declare function decryptLocation(encryptionPhrase: string, accountId: string, requestId: string, rawEnvelope: EncryptedEnvelope): DecryptedLocation;
//# sourceMappingURL=crypto.d.ts.map