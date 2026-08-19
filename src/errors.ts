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

export class PairingRequiredError extends PhoneHomeError {
  constructor(status?: number) {
    super(
      'pairing_required',
      'This agent no longer matches the active PhoneHome device. Tell the user to open ' +
        'PhoneHome > Setup, copy the new pairing code, and update this agent with `phone-home setup`.',
      {
        details: {
          action: 'request_new_pairing_code',
          userMessage:
            'Open PhoneHome > Setup on the active phone and copy the new agent pairing code.',
          setupCommand: 'phone-home setup',
          ...(status === undefined ? {} : { status }),
        },
      },
    );
    this.name = 'PairingRequiredError';
  }
}
