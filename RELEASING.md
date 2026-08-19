# Releasing @commit451/phonehome

Releases publish from `.github/workflows/publish.yml` on a `v*` tag. The workflow uses npm trusted publishing with GitHub Actions OIDC, so it does not require a long-lived npm token.

The GitHub source repository and npm package are public. Trusted GitHub Actions publishes generate npm provenance linking each package version to its source and workflow.

## One-time npm bootstrap

The npm package does not exist yet, and npm only exposes trusted-publisher settings after the first package version exists. An npm maintainer for the `commit451` organization must bootstrap it once:

```bash
npm login
npm whoami
npm run check
npm pack --dry-run
npm publish --access public --provenance=false
```

This publishes the current package version as a public scoped package. The one-time local bootstrap disables provenance because provenance is generated only in supported cloud CI; subsequent GitHub Actions releases use provenance. The matching version tag can be pushed after bootstrap—the workflow detects the existing immutable npm version, skips republishing it, and still creates the GitHub release.

Then open the package settings for `@commit451/phonehome` on npmjs.com and configure its trusted publisher with these exact, case-sensitive values:

| Setting              | Value             |
| -------------------- | ----------------- |
| Provider             | GitHub Actions    |
| Organization or user | `Commit451`       |
| Repository           | `phonehome-agent` |
| Workflow filename    | `publish.yml`     |
| Environment          | Leave blank       |
| Allowed action       | `npm publish`     |

After a trusted publish succeeds, set **Publishing access** to **Require two-factor authentication and disallow tokens** and remove any temporary automation token that was created during bootstrap.

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
