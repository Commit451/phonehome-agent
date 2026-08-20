# phonehome

A CLI and MCP that allows an agent to get your realtime location on demand, end to end encrypted.

## Requirements

- Node.js 24 or newer
- Installation of the PhoneHome app for Android or iOS
- The paired phone must have location and notification permissions and an active network connection

## Install

Install the public package globally:

```bash
npm install -g @commit451/phonehome
```

## Configure

Your human has instructions on their PhoneHome app that they can paste to you the agent, which includes the needed API key, encryption phrase, etc. When it is pasted to you, you should keep these values secret and not expose them to anyone else.

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
  "requestId": "181cf811-13b2-402c-a863-32a2bd6e636a",
  "latitude": 41.5868,
  "longitude": -93.625,
  "accuracyMeters": 12.5,
  "capturedAtEpochMs": 1700000000000,
  "capturedAt": "2023-11-14T22:13:20.000Z",
  "receivedAtEpochMs": 1700000001000
}
```

An agent answering “What are some good Mexican restaurants near me right now?” can:

1. run `phone-home location`;
2. pass `latitude` and `longitude` to a local-search or maps tool/MCP;
3. use the current time and opening-hours data from that provider; and
4. present nearby open options without the user having to explain where they are

## MCP server

`phone-home-mcp` exposes PhoneHome directly to MCP clients over local stdio. It uses the same protected config file or `PHONE_HOME_*` environment variables as the CLI and never sends setup credentials through MCP. Configure the package once with `phone-home setup`, then add this server to the MCP client's configuration:

```json
{
  "mcpServers": {
    "phone-home": {
      "command": "phone-home-mcp"
    }
  }
}
```

To use a non-default config file, add `"args": ["--config", "/secure/path/config.json"]`.

The MCP server provides five tools:

| Tool                             | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `phone_home_get_location`        | Request, wait for, decrypt, and return a current location |
| `phone_home_request_location`    | Start a request without waiting                           |
| `phone_home_get_location_result` | Poll a split request and decrypt it when complete         |
| `phone_home_status`              | Check whether the paired phone is registered              |
| `phone_home_check_pairing`       | Verify that the agent and active phone share the same key |

Use `phone_home_get_location` for normal requests. MCP clients with short tool-call limits can use `phone_home_request_location`, save its `requestId`, and poll `phone_home_get_location_result`. The server deliberately does not expose setup as a tool, so pairing codes and credentials cannot be submitted through model tool arguments.

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
export PHONE_HOME_SETUP_BUNDLE='{"apiKey":"...","encryptionPhrase":"..."}'
```

or both credential fields:

```bash
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
import { PhoneHomeClient, parseSetupBundle } from '@commit451/phonehome';

const setup = parseSetupBundle(JSON.parse(process.env.PHONE_HOME_SETUP_BUNDLE!));
const phoneHome = new PhoneHomeClient(setup);
const location = await phoneHome.locate({ timeoutMs: 60_000 });
```

Code that embeds its own MCP transport can import the server factory from the dedicated subpath:

```ts
import { createPhoneHomeMcpServer } from '@commit451/phonehome/mcp';

const server = createPhoneHomeMcpServer({ version: '0.0.4' });
```

## Security model

- Treat the setup bundle and config file as secrets. They contain both the agent API key and the location encryption key.
- The CLI always sends API credentials to PhoneHome's compiled-in HTTPS API origin.
- Encryption synchronization uses `SHA-256("phonehome/key-check/v1\\0" || key)`; the raw encryption phrase is never sent to the server.
- Location payloads use AES-256-GCM with a 12-byte nonce and request-bound AAD: `phonehome/location/v1\n{requestId}`.
- Decrypted payloads are schema-checked, including coordinate ranges, before being returned.
- The API key, phrase, authorization header, and setup bundle are never logged.

## License

MIT
