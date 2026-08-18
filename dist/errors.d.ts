export declare class PhoneHomeError extends Error {
    readonly code: string;
    readonly exitCode: number;
    readonly details: Record<string, unknown> | undefined;
    constructor(code: string, message: string, options?: {
        exitCode?: number;
        details?: Record<string, unknown>;
        cause?: unknown;
    });
}
export declare class UsageError extends PhoneHomeError {
    constructor(message: string);
}
export declare class ApiError extends PhoneHomeError {
    readonly status: number;
    constructor(status: number, code: string, message: string);
}
//# sourceMappingURL=errors.d.ts.map