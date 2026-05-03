# Security Audit Notes

Operator/maintainer reference for the noisy `pnpm audit` output. If you're looking at the GitHub Security tab or running `pnpm audit` and trying to figure out which warnings are actionable, start here.

## Current state (as of 2026-05-03)

- **0 open Dependabot alerts** on the repo.
- **78 historical alerts have been fixed**, 1 dismissed.
- `pnpm audit --audit-level=high` reports **1 high** finding for `ip@2.0.1` — see below for why this is intentionally not chased.
- All actionable transitive vulnerabilities are pinned to patched versions via `pnpm.overrides` in the root `package.json`.

## `pnpm.overrides` — what's pinned and why

The block under `pnpm.overrides` in the root `package.json` exists solely to force-resolve transitive dependencies onto a patched version when the parent dependency hasn't released a fix yet.

| Override                | Reason                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `postcss: 8.5.10`       | CVE-2023-44270 line-return parsing                                      |
| `tmp: 0.2.4`            | CVE-2025-54798 symlink write via `dir` parameter                        |
| `tar: 7.5.11`           | Multiple CVEs in older tar 6.x line                                     |
| `@tootallnate/once: 3.0.1` | ReDoS in 1.x                                                         |
| `send: 0.19.0`          | Express XSS in static file serving                                      |
| `semver: 7.7.3`         | Several ReDoS CVEs in 7.5.x                                             |
| `fast-xml-parser: 5.7.0` | XML external entity / prototype pollution                              |
| `@xmldom/xmldom: 0.8.13` | Critical XXE in pre-0.8.13 line                                        |
| `uuid: 14.0.0`          | Timing-attack hardening in v9 line                                      |
| `ip: 2.0.1`             | Best-available for the deprecated `ip` package — see "ip residual" below |

If you find a new transitive in CVE state, add a line here, run `pnpm install`, and verify `pnpm audit --audit-level=high` shrinks.

## Residual: `ip@2.0.1` — high, unfixable, not exploitable in our context

`pnpm audit --audit-level=high` reports `ip@2.0.1` against [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) (SSRF improper categorization in `isPublic`). Three things to know:

1. **The advisory has no patched version.** The range is `<= 2.0.1` and `2.0.1` is the latest published. The `ip` maintainer deprecated the package without shipping a fix. The override to `2.0.1` does pull in a partial fix from the prior CVE-2024-29415 line, so it's strictly better than `1.1.9`, but the advisory will keep flagging.

2. **It's reachable only through React Native dev tooling.** `pnpm -r why ip` shows every path goes through `@react-native-community/cli@12.3.2 → cli-doctor → ip` (and `cli-hermes → ip`). These are build-time / `npx react-native doctor` paths — never bundled into the mobile app shipped to a phone.

3. **The vulnerable function (`isPublic` / `isLoopback`) is not called with untrusted input.** RN's CLI uses these helpers to discover the local Metro dev-server address, not to validate any user-supplied hostname. A successful exploit would require an attacker to control the developer's local network discovery, which is well past the threat boundary for dev tooling.

The only path to clearing this advisory is upgrading React Native to 0.74+, which dropped the `ip` dependency entirely. That's a major upgrade with peer-dep cascades and is **not** justified by the reachability above.

**Decision:** GitHub Dependabot has already dismissed this alert. The `pnpm.overrides` entry stays as defense-in-depth. `pnpm audit --audit-level=high` will keep returning a non-zero exit; CI gates on tests, not on `pnpm audit`, so this doesn't block.

## When to revisit

- Any time React Native is upgraded — drop the `ip` override and re-audit.
- Any time `pnpm audit --audit-level=high` shows **more than 1** finding — investigate the new entry, treat the `ip` line as known-residual.
- Any time a real CVE lands on `@react-native-community/cli` itself — that surface IS used by developers and would warrant a forced upgrade.

## Adding a new override

```jsonc
// package.json
"pnpm": {
  "overrides": {
    // ... existing ...
    "<package>": "<patched-version>"
  }
}
```

Then:

```bash
pnpm install
pnpm audit --audit-level=high   # confirm the count dropped
git add package.json pnpm-lock.yaml docs/SECURITY.md
git commit
```

Add a row to the table above with the CVE / GHSA reference so the next person doesn't have to dig.
