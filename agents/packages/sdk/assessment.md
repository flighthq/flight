---
package: '@flighthq/sdk'
updated: 2026-07-31
basedOn: ./review.md
---

# sdk — Assessment

Verified against the live tree (1 source file, 1 test file, 22 tests, 96 re-exports) and the direction session (2026-07-02). Three charter decisions blessed. Depth review: 95/100. Package is effectively complete.

## Recommended

_None open._ Re-verified against live source on 2026-07-31 (15 source files, 1 test file, 20 tests; the
package is a barrel and exports no functions of its own).

## Landed

1. ~~**Add completeness check to `packages:check`.**~~ Landed. `scripts/packages.ts` imports
   `isSdkBarrelExcludedPackage` from `scripts/sdk-policy.ts` and requires every eligible package to appear
   both as an `export *` line in `packages/sdk/src/index.ts` and as a `"*"` dependency in
   `packages/sdk/package.json`, while excluded packages must appear in neither. It runs as part of
   `npm run packages:check`, so barrel drift is caught rather than reviewed for.

## Backlog

None — sdk is a barrel with no own code.

## Approved

- [2026-07-02 · picked] Sweep item 1: completeness check in packages:check
