import { randomUUID } from 'node:crypto';
import { ApiError, PairingRequiredError, PhoneHomeError } from './errors.js';
import { decryptLocation, deriveEncryptionKeyCheck } from './crypto.js';
import { expectBoolean, expectNumber, expectRecord, expectString, parseEnvelope, parseLocationStatus, validateRequestId, } from './validation.js';
export class PhoneHomeClient {
    #setup;
    #fetch;
    #requestTimeoutMs;
    constructor(setup, options = {}) {
        this.#setup = setup;
        this.#fetch = options.fetch ?? globalThis.fetch;
        this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    }
    async status() {
        const response = expectRecord(await this.#request(`/v1/accounts/${encodeURIComponent(this.#setup.accountId)}`), 'Account status');
        const accountId = this.#matchingAccountId(response);
        return { accountId, deviceRegistered: expectBoolean(response, 'deviceRegistered') };
    }
    async checkEncryption() {
        const response = expectRecord(await this.#request(`/v1/accounts/${encodeURIComponent(this.#setup.accountId)}/check`, {
            method: 'POST',
            body: JSON.stringify({
                encryptionKeyCheck: deriveEncryptionKeyCheck(this.#setup.encryptionPhrase),
            }),
        }), 'Encryption check');
        return {
            accountId: this.#matchingAccountId(response),
            matches: expectBoolean(response, 'matches'),
        };
    }
    async verifyPairing() {
        const response = await this.checkEncryption();
        if (!response.matches)
            throw new PairingRequiredError();
        return response;
    }
    async createLocationRequest(requestId = randomUUID()) {
        const normalizedRequestId = validateRequestId(requestId);
        await this.verifyPairing();
        const response = expectRecord(await this.#request(`/v1/accounts/${encodeURIComponent(this.#setup.accountId)}/location-requests`, {
            method: 'POST',
            body: JSON.stringify({ requestId: normalizedRequestId }),
        }), 'Location request');
        const returnedRequestId = validateRequestId(expectString(response, 'requestId'));
        if (returnedRequestId !== normalizedRequestId) {
            throw new PhoneHomeError('invalid_response', 'Server returned a different requestId.');
        }
        return {
            requestId: returnedRequestId,
            accountId: this.#matchingAccountId(response),
            status: parseLocationStatus(response.status),
            expiresAtEpochMs: expectEpochMs(response, 'expiresAtEpochMs'),
        };
    }
    async getLocationResult(requestId) {
        const normalizedRequestId = validateRequestId(requestId);
        const response = expectRecord(await this.#request(`/v1/accounts/${encodeURIComponent(this.#setup.accountId)}/location-requests/${encodeURIComponent(normalizedRequestId)}`), 'Location result');
        const returnedRequestId = validateRequestId(expectString(response, 'requestId'));
        if (returnedRequestId !== normalizedRequestId) {
            throw new PhoneHomeError('invalid_response', 'Server returned a different requestId.');
        }
        const encryptedLocation = response.encryptedLocation === null || response.encryptedLocation === undefined
            ? null
            : parseEnvelope(response.encryptedLocation);
        return {
            requestId: returnedRequestId,
            accountId: this.#matchingAccountId(response),
            status: parseLocationStatus(response.status),
            createdAtEpochMs: expectEpochMs(response, 'createdAtEpochMs'),
            expiresAtEpochMs: expectEpochMs(response, 'expiresAtEpochMs'),
            receivedAtEpochMs: expectNullableEpochMs(response, 'receivedAtEpochMs'),
            encryptedLocation,
        };
    }
    decryptResult(result) {
        if (result.status !== 'completed' || result.encryptedLocation === null) {
            throw new PhoneHomeError('location_not_ready', 'Location request is not completed.', {
                exitCode: 3,
                details: { requestId: result.requestId, status: result.status },
            });
        }
        const location = decryptLocation(this.#setup.encryptionPhrase, result.accountId, result.requestId, result.encryptedLocation);
        return {
            accountId: result.accountId,
            requestId: result.requestId,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracyMeters,
            capturedAtEpochMs: location.capturedAtEpochMs,
            capturedAt: new Date(location.capturedAtEpochMs).toISOString(),
            source: location.source,
            receivedAtEpochMs: result.receivedAtEpochMs,
        };
    }
    async locate(options = {}) {
        const timeoutMs = options.timeoutMs ?? 60_000;
        const pollIntervalMs = options.pollIntervalMs ?? 1_000;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new PhoneHomeError('invalid_request', 'timeoutMs must be greater than zero.');
        }
        if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
            throw new PhoneHomeError('invalid_request', 'pollIntervalMs must be greater than zero.');
        }
        const created = await this.createLocationRequest(options.requestId);
        const localDeadline = Date.now() + timeoutMs;
        const deadline = Math.min(localDeadline, created.expiresAtEpochMs);
        while (true) {
            const result = await this.getLocationResult(created.requestId);
            if (result.status === 'completed')
                return this.decryptResult(result);
            if (result.status === 'push_failed') {
                throw new PhoneHomeError('push_failed', 'The phone push notification could not be sent.', {
                    details: { requestId: result.requestId },
                });
            }
            if (result.status === 'expired') {
                throw new PhoneHomeError('location_expired', 'The phone did not respond before expiry.', {
                    exitCode: 3,
                    details: { requestId: result.requestId },
                });
            }
            const remainingMs = deadline - Date.now();
            if (remainingMs <= 0) {
                const expired = Date.now() >= created.expiresAtEpochMs;
                throw new PhoneHomeError(expired ? 'location_expired' : 'location_timeout', expired
                    ? 'The phone did not respond before expiry.'
                    : 'Timed out while waiting for the phone location.', {
                    exitCode: 3,
                    details: { requestId: result.requestId, status: result.status },
                });
            }
            await delay(Math.min(pollIntervalMs, remainingMs));
        }
    }
    #matchingAccountId(response) {
        const accountId = expectString(response, 'accountId');
        if (accountId !== this.#setup.accountId) {
            throw new PhoneHomeError('invalid_response', 'Server returned a different accountId.');
        }
        return accountId;
    }
    async #request(path, init = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
        timer.unref?.();
        let response;
        try {
            response = await this.#fetch(`${this.#setup.apiBaseUrl}${path}`, {
                ...init,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.#setup.apiKey}`,
                    ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
                    ...init.headers,
                },
                signal: controller.signal,
            });
        }
        catch (error) {
            const timedOut = controller.signal.aborted;
            throw new PhoneHomeError(timedOut ? 'api_timeout' : 'api_unreachable', timedOut ? 'PhoneHome API request timed out.' : 'Could not reach the PhoneHome API.', { cause: error });
        }
        finally {
            clearTimeout(timer);
        }
        const text = await response.text();
        let payload = null;
        if (text.length > 0) {
            try {
                payload = JSON.parse(text);
            }
            catch (error) {
                throw new PhoneHomeError('invalid_response', 'PhoneHome API returned invalid JSON.', {
                    cause: error,
                    details: { status: response.status },
                });
            }
        }
        if (!response.ok) {
            const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
                ? payload
                : {};
            const code = typeof record.code === 'string' ? record.code : 'api_error';
            const message = typeof record.message === 'string'
                ? record.message
                : `PhoneHome API request failed with HTTP ${String(response.status)}.`;
            if (code === 'pairing_required')
                throw new PairingRequiredError(response.status);
            throw new ApiError(response.status, code, message);
        }
        return payload;
    }
}
function expectEpochMs(record, key) {
    const value = expectNumber(record, key);
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new PhoneHomeError('invalid_response', `${key} must be a non-negative epoch value.`);
    }
    return value;
}
function expectNullableEpochMs(record, key) {
    const value = record[key];
    if (value === null || value === undefined)
        return null;
    return expectEpochMs(record, key);
}
function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
//# sourceMappingURL=client.js.map