# Releasing @commit451/phonehome

Releases publish from `.github/workflows/publish.yml` on a `v*` tag. The workflow uses npm trusted publishing with GitHub Actions OIDC, so it does not require a long-lived npm token.

The GitHub source repository is private. npm trusted publishing still works, but npm provenance cannot be generated from private repositories; `publishConfig.provenance` therefore remains `false`.

## One-time npm bootstrap

The npm package does not exist yet, and npm only exposes trusted-publisher settings after the first package version exists. An npm maintainer for the `commit451` organization must bootstrap it once:

```bash
npm login
npm whoami
npm run check
npm pack --dry-run
npm publish --access public
```

This publishes the current package version as a public scoped package. Do not create or push its matching version tag afterward, because the tag workflow would correctly reject publishing the same immutable npm version twice.

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
   npm version 0.2.1 --no-git-tag-version
   ```

3. Verify and commit the release candidate:

   ```bash
   npm run check
   npm pack --dry-run
   git add package.json package-lock.json dist
   git commit -m "release: v0.2.1"
   git push origin main
   ```

4. Tag that exact commit and push the tag:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

The publish workflow checks that the tag exactly matches `package.json`, installs a trusted-publishing-capable npm CLI, runs the complete project checks, verifies committed `dist/`, inspects the package contents, publishes `@commit451/phonehome` publicly, and creates the matching GitHub release.
