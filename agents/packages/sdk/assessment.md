---
package: '@flighthq/sdk'
updated: 2026-07-02
basedOn: ./review.md
---

# sdk — Assessment

Verified against the live tree (1 source file, 1 test file, 22 tests, 96 re-exports) and the direction session (2026-07-02). Three charter decisions blessed. Depth review: 95/100. Package is effectively complete.

## Recommended

1. **Add completeness check to `packages:check`.** Per charter Decision #2. Ensure every eligible package is re-exported from the sdk barrel. Read inclusion policy from `scripts/sdk-policy.ts`.

## Backlog

None — sdk is a barrel with no own code.

## Approved

- [2026-07-02 · picked] Sweep item 1: completeness check in packages:check
