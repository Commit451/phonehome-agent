# phone-home-cli agent guide

- Keep stdout machine-readable JSON for every successful non-help command; send diagnostics to stderr.
- Never print or log `apiKey`, `encryptionPhrase`, Authorization headers, or complete setup bundles.
- Preserve compatibility with PhoneHome API v1 and setup-bundle version 2.
- PhoneHome uses canonical unpadded base64url, SHA-256 key checks over `phonehome/key-check/v1\0 || key`, and AES-256-GCM with `phonehome/location/v1\n{accountId}\n{requestId}` as AAD.
- Run `npm run check` and `npm pack --dry-run` before committing changes.
- Add or update tests whenever commands, API parsing, configuration, or cryptography change.
