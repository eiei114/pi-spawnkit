# Release

`pi-spawnkit` publishes to npm using Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for **`pi-spawnkit`**:

- Publisher: GitHub Actions
- Repository: `eiei114/pi-spawnkit`
- Workflow filename: `publish.yml`
- Environment: none unless intentionally added later

## Publish

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` checks the root `package.json` version. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

The `v*.*.*` tag also triggers `.github/workflows/publish.yml`, which runs CI and publishes `pi-spawnkit@<version>` to npm when tags are pushed manually.

## GitHub Actions requirements

- `publish.yml` has `permissions: id-token: write`.
- `auto-release.yml` has `permissions: actions: write` and explicitly calls `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`.
- GitHub-hosted runner.
- Node.js 24.
- No `NPM_TOKEN`.

## First release checklist

- [ ] `package.json` version is final.
- [ ] `CHANGELOG.md` has the release entry.
- [ ] `npm run ci` passes.
- [ ] `npm pack --dry-run` contains only expected package files.
- [ ] npm Trusted Publisher targets `pi-spawnkit` + `publish.yml`.
