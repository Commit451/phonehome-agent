# phone-home-cli

A TypeScript CLI and library that lets a trusted agent ask the PhoneHome app for the user's current location. The phone encrypts coordinates before uploading them; the PhoneHome server sees only an opaque AES-256-GCM envelope, and this CLI decrypts it locally.

The CLI intentionally returns coordinates rather than choosing a maps, search, weather, restaurant, or travel provider. An agent can combine the JSON output with its preferred web tool or MCP server.

## Requirements

- Node.js 24 or newer
- A version 2 agent setup bundle copied from the PhoneHome Android or iOS app
- The paired phone must have location and notification permissions and an active network connection

## Install

The package is not published to npm yet. During development, add it to the agent's workspace from the private repository and invoke it through npm:

```bash
npm install github:VeldtJumper/phone-home-cli
npx phone-home --version
```

Once published, the intended global install will be:

```bash
npm install --global phone-home-cli
```

Both `phone-home` and `phone-home-cli` invoke the same executable. Commands below use `phone-home`; prefix them with `npx` when using the workspace installation.

## Configure

Copy the hidden setup bundle from the PhoneHome app, then pipe it to the CLI so the secrets do not appear in shell history:

```bash
pbpaste | phone-home setup
```

Linux users can use their clipboard tool or a protected file:

```bash
wl-paste | phone-home setup
phone-home setup /secure/path/phone-home-setup.json
```

The CLI validates the complete bundle and stores it at `~/.config/phone-home/config.json` with mode `0600`; its parent directory is mode `0700`. Override the location with `--config` or `PHONE_HOME_CONFIG`.

Confirm that the phone registration and encryption phrase are synchronized:

```bash
phone-home status
phone-home check
```

No command prints the API key or encryption phrase.

When the account is activated on a new phone, PhoneHome rotates the agent pairing. The
old configuration then returns a structured `pairing_required` error instructing the agent
to ask the user for the new pairing code. Copy the new agent setup from **PhoneHome >
Setup**, then run `phone-home setup` again to replace the local configuration.

## Get a location

```bash
phone-home location --timeout 60
```

Successful output is machine-readable JSON:

```json
{
  "accountId": "firebase-user-id",
  "requestId": "181cf811-13b2-402c-a863-32a2bd6e636a",
  "latitude": 41.5868,
  "longitude": -93.625,
  "accuracyMeters": 12.5,
  "capturedAtEpochMs": 1700000000000,
  "capturedAt": "2023-11-14T22:13:20.000Z",
  "source": "fresh",
  "receivedAtEpochMs": 1700000001000
}
```

Current PhoneHome clients return `source: "fresh"` and fail rather than falling back to an
OS last-known location. `last_known` remains accepted only for compatibility with older
clients. Use `--compact` when a single-line JSON document is preferable.

An agent answering “What are some good Mexican restaurants near me right now?” can:

1. run `phone-home location`;
2. pass `latitude` and `longitude` to a local-search or maps tool/MCP;
3. use the current time and opening-hours data from that provider; and
4. present nearby open options without exposing PhoneHome credentials to the search provider.

## Commands

| Command                      | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `phone-home setup [file\|-]` | Validate and securely save an app setup bundle                        |
| `phone-home config`          | Show non-secret active configuration metadata                         |
| `phone-home status`          | Check whether the paired phone is registered                          |
| `phone-home check`           | Verify the local encryption phrase against the server's one-way check |
| `phone-home location`        | Request, poll, decrypt, validate, and return a location               |
| `phone-home request`         | Start a request without waiting                                       |
| `phone-home result <id>`     | Read a request; decrypt it automatically when complete                |

`location`, `locate`, and `get-location` are aliases. Location options:

- `--timeout <seconds>`: local wait limit, default 60 seconds;
- `--poll-interval <milliseconds>`: polling interval, default 1000 ms; and
- `--request-id <uuid>`: optional client-selected idempotency key.

The standalone `request` and `result` commands support agents whose tool calls have short execution limits. Save the request ID from the first command, then call `result` until its status is terminal.

## Environment-only configuration

For ephemeral agent containers, avoid a config file by providing either the full bundle:

```bash
export PHONE_HOME_SETUP_BUNDLE='{"version":2,...}'
```

or all four fields:

```bash
export PHONE_HOME_API_BASE_URL='https://phonehome.example'
export PHONE_HOME_ACCOUNT_ID='firebase-user-id'
export PHONE_HOME_API_KEY='...'
export PHONE_HOME_ENCRYPTION_PHRASE='...'
```

An explicit `--config` path takes precedence over credential environment variables.

## Exit codes and errors

All successful non-help commands write one JSON document to stdout. Errors write one JSON document to stderr and never include credentials.

`pairing_required` includes `details.action: "request_new_pairing_code"` and a safe message
the agent can relay to the user. It means the active phone or encryption phrase no longer
matches this configuration; location requests are stopped before an undecryptable response
is created.

- `0`: success
- `1`: invalid command or missing/invalid configuration
- `2`: API, protocol, decryption, or runtime failure
- `3`: location is still pending, expired, or timed out

## Library usage

The npm package also exports the typed client:

```ts
import { PhoneHomeClient, parseSetupBundle } from 'phone-home-cli';

const setup = parseSetupBundle(JSON.parse(process.env.PHONE_HOME_SETUP_BUNDLE!));
const phoneHome = new PhoneHomeClient(setup);
const location = await phoneHome.locate({ timeoutMs: 60_000 });
```

## Security model

- Treat the setup bundle and config file as secrets. They contain both the agent API key and the location encryption key.
- API credentials are accepted only over HTTPS, except loopback HTTP for local protocol tests.
- Encryption synchronization uses `SHA-256("phonehome/key-check/v1\\0" || key)`; the raw encryption phrase is never sent to the server.
- Location payloads use AES-256-GCM with a 12-byte nonce and request-bound AAD: `phonehome/location/v1\n{accountId}\n{requestId}`.
- Decrypted payloads are schema-checked, including coordinate ranges, before being returned.
- The API key, phrase, authorization header, and setup bundle are never logged.

## Development

```bash
npm install
npm run check
npm pack --dry-run
```

`npm run check` runs formatting, strict TypeScript checks, unit/integration tests, a clean build, and CLI smoke tests.

## License

MIT
