# Homebrew distribution

Homebrew formula for the `infernet` CLI. The formula itself lives in [`infernet.rb`](./infernet.rb); the update script pins it to a specific npm release.

## Release flow

1. Publish `@infernet/cli` to npm from the monorepo.
   ```bash
   pnpm --filter @infernet/cli publish --access public
   ```
2. Run the updater with the version you just published:
   ```bash
   node tooling/dist/homebrew/update-formula.mjs 1.2.3
   ```
   This downloads the tarball, computes its sha256, and rewrites `url`, `sha256`, and `version` in `infernet.rb`.
3. Copy the updated `infernet.rb` into the Infernet Homebrew tap repository and push:
   ```bash
   cp tooling/dist/homebrew/infernet.rb <homebrew-infernet-tap>/Formula/
   cd <homebrew-infernet-tap>
   git commit -am "infernet 1.2.3"
   git push
   ```

Users install via:

```bash
brew tap profullstack/infernet
brew install infernet
```

## Why npm tarballs instead of a GitHub release

The CLI is a Node.js package; publishing to npm is the canonical distribution channel. Homebrew simply downloads the resolved npm tarball and runs `npm install` via `Language::Node.std_npm_install_args`, which gives us free dependency resolution and postinstall support. This avoids the need to maintain a separate bundled release artifact.
