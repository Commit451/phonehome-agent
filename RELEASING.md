# Releasing @commit451/phonehome

Releases publish from `.github/workflows/publish.yml` on a `v*` tag. The workflow uses npm trusted publishing with GitHub Actions OIDC, so it does not require a long-lived npm token.

The GitHub source repository and npm package are public. Trusted GitHub Actions publishes generate npm provenance linking each package version to its source and workflow.

## Trusted publisher

The npm package is configured to trust this exact GitHub Actions identity:

| Setting              | Value             |
| -------------------- | ----------------- |
| Provider             | GitHub Actions    |
| Organization or user | `Commit451`       |
| Repository           | `phonehome-agent` |
| Workflow filename    | `publish.yml`     |
| Environment          | None              |
| Allowed action       | `npm publish`     |

The workflow has `id-token: write`, runs on a GitHub-hosted runner, and intentionally does not receive `NODE_AUTH_TOKEN`. Keep npm **Publishing access** set to **Require two-factor authentication and disallow tokens**.

## Publish a release

1. Choose a version that has never been published to npm.
2. Update `package.json` and `package-lock.json` together:

   ```bash
   npm version 0.0.2 --no-git-tag-version
   ```

3. Verify and commit the release candidate:

   ```bash
   npm run check
   npm pack --dry-run
   git add package.json package-lock.json dist
   git commit -m "release: v0.0.2"
   git push origin main
   ```

4. Tag that exact commit and push the tag:

   ```bash
   git tag v0.0.2
   git push origin v0.0.2
   ```

The publish workflow checks that the tag exactly matches `package.json`, installs a trusted-publishing-capable npm CLI, runs the complete project checks, verifies committed `dist/`, inspects the package contents, publishes an absent `@commit451/phonehome` version publicly with provenance, and creates the matching GitHub release. Rerunning a completed version is safe because npm versions are immutable and the workflow skips versions already present in the registry.
