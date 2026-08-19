# @commit451/phonehome agent guide

- Keep stdout machine-readable JSON for every successful non-help command; send diagnostics to stderr.
- Keep `phone-home-mcp` stdout exclusively for MCP stdio JSON-RPC; never log to it.
- Never print or log `apiKey`, `encryptionPhrase`, Authorization headers, or complete setup bundles.
- Configure secrets through the CLI, a protected file, or environment variables; never add an MCP setup tool.
- Keep the GitHub source repository and `@commit451/phonehome` public; releases use npm trusted publishing with provenance.
- Releases use npm trusted publishing from `.github/workflows/publish.yml`; version tags must exactly match `package.json`.
- Preserve compatibility with PhoneHome API v1 and setup-bundle version 2.
- PhoneHome uses canonical unpadded base64url, SHA-256 key checks over `phonehome/key-check/v1\0 || key`, and AES-256-GCM with `phonehome/location/v1\n{accountId}\n{requestId}` as AAD.
- Run `npm run check` and `npm pack --dry-run` before committing changes.
- Add or update tests whenever commands, API parsing, configuration, or cryptography change.
