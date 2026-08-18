export class PhoneHomeError extends Error {
    code;
    exitCode;
    details;
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'PhoneHomeError';
        this.code = code;
        this.exitCode = options.exitCode ?? 2;
        this.details = options.details;
    }
}
export class UsageError extends PhoneHomeError {
    constructor(message) {
        super('usage_error', message, { exitCode: 1 });
        this.name = 'UsageError';
    }
}
export class ApiError extends PhoneHomeError {
    status;
    constructor(status, code, message) {
        super(code, message, { details: { status } });
        this.name = 'ApiError';
        this.status = status;
    }
}
//# sourceMappingURL=errors.js.map