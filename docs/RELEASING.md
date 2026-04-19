# Releasing

The release pipeline is fully automated from a single tag push. Every tag of the form `v*.*.*` on `master` triggers `.github/workflows/release.yml` which:

1. **Publishes npm packages.** Every public `@infernetprotocol/*` workspace package is versioned to match the tag and published to [npmjs.org](https://www.npmjs.com) with provenance. Internal `workspace:*` dependencies are rewritten to the resolved version by `pnpm publish`.
2. **Builds + pushes the provider Docker image.** `ghcr.io/<org>/infernet-provider:<version>` and `:latest` — multi-arch (linux/amd64 + linux/arm64). The Dockerfile uses `INFERNET_CLI_VERSION=<version>` so the image bakes in the exact npm release.
3. **Generates the Homebrew formula.** `tooling/dist/homebrew/update-formula.mjs` downloads the new npm tarball, computes its sha256, and rewrites `url` / `sha256` / `version` in `infernet.rb`. The updated formula is attached to the GitHub Release as a downloadable asset.

`.github/workflows/docker-provider.yml` additionally rebuilds `ghcr.io/<org>/infernet-provider:edge` on every push to `master`, so the bleeding edge is always available for the one-click deploy flow.

## Secrets required

Configure these in **Repo → Settings → Secrets and variables → Actions**:

- `NPM_TOKEN` — an npm automation token with publish rights to the `@infernet` scope.

The release workflow uses `secrets.GITHUB_TOKEN` for ghcr.io and release asset uploads; no additional configuration required.

## Cutting a release

```bash
# 1. Pick a version (we use SemVer; start at 0.1.0)
VERSION="0.1.0"

# 2. Tag master at the commit you want to release
git tag "v$VERSION" master
git push origin "v$VERSION"
```

Watch the run under **Actions → Release**. On success:

- All `@infernetprotocol/*` packages are live on npm at the new version.
- `ghcr.io/<org>/infernet-provider:$VERSION` and `:latest` exist.
- A GitHub Release is published with `infernet.rb` attached.

## Post-release: Homebrew tap

The Homebrew tap repo (`profullstack/homebrew-infernet`) is a separate repository. Copy the formula from the release and push:

```bash
gh release download "v$VERSION" --pattern infernet.rb
git clone git@github.com:profullstack/homebrew-infernet.git
cp infernet.rb homebrew-infernet/Formula/
cd homebrew-infernet
git add Formula/infernet.rb
git commit -m "infernet $VERSION"
git push
```

Users then:

```bash
brew tap profullstack/infernet
brew install infernet
```

*Future work: automate the tap PR via a deploy key + `peter-evans/create-pull-request`.*

## Rolling back

If a release goes out broken:

- **npm**: `pnpm deprecate "@infernetprotocol/<pkg>@$VERSION" "broken release"` — you can't unpublish more than 72 hours after publish, but deprecation steers installers away.
- **Docker**: re-tag a known-good image to `:latest`: `docker pull ghcr.io/<org>/infernet-provider:<prev> && docker tag ... && docker push ...`.
- **Homebrew**: revert the commit in the tap repo and push — users get the prior formula on next `brew update`.

## Local dry run

Before tagging, you can simulate most of the pipeline:

```bash
# npm publish dry-run
pnpm -r --filter "@infernetprotocol/*" publish --access public --no-git-checks --dry-run

# Docker build (no push)
docker build -f tooling/docker/provider/Dockerfile tooling/docker/provider

# Homebrew formula generation (requires the version to already be on npm)
node tooling/dist/homebrew/update-formula.mjs "$VERSION"
```
