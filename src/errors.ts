export class PhoneHomeError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      exitCode?: number;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PhoneHomeError';
    this.code = code;
    this.exitCode = options.exitCode ?? 2;
    this.details = options.details;
  }
}

export class UsageError extends PhoneHomeError {
  constructor(message: string) {
    super('usage_error', message, { exitCode: 1 });
    this.name = 'UsageError';
  }
}

export class ApiError extends PhoneHomeError {
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(code, message, { details: { status } });
    this.name = 'ApiError';
    this.status = status;
  }
}
