---
package: '@flighthq/platform-formats'
updated: 2026-06-25
basedOn: ./review.md
---

# platform-formats — Assessment

Sorting of `review.md`'s merge-gate findings into what a within-package sweep may safely do, what is parked, and what must route to the user. The dominant finding is structural: the package's existence is **rejected** by `register.md` (collapse into `useragent`). That makes most "improve the package" recommendations moot — you do not polish a package slated for removal. The assessment reflects that: almost everything routes to the charter's Open directions, because the live question is bless-or-remove, not in-package refinement.

## Recommended (sweep-safe, within-package, non-design-decision)

There is very little that is both safe and not pre-empted by the pending bless/remove decision. Spending effort inside a rejected package is mostly waste. The only item that is unambiguously correct regardless of the package's fate:

- **Nothing should be merged into this package as-is.** The one defect that is purely mechanical — the three undefined `@flighthq/types` imports — is **not** a within-package fix: the types belong in `@flighthq/types` (a cross-package edit, out of bounds for this cell), and even there the fix is contingent on the bless/remove decision (if the leaf collapses to `useragent`, the types move with it). So this slot is empty by design, not by omission.

_No within-package sweep is recommended while the package is under a standing rejection verdict._

## Backlog (parked, with reasons)

- **Type the canonical arch token set (`PlatformArch` union).** `parseUserAgentArch` returns `string`; the canonical tokens live only in a comment. _Parked:_ touches `@flighthq/types` (cross-package), mirrors the existing `PlatformInfo.arch: string` convention, and only matters if the leaf survives. Decide as part of the `useragent` collapse, not before.
- **Re-home `probeEndianness` out of `userAgent.ts`.** It is a byte-order probe, not UA parsing. _Parked:_ pointless to reorganize files in a package pending removal; if `useragent` is built, place endianness as its own concern there.
- **Honest naming.** The `-formats` suffix is wrong for a UA-string parser (codec convention on a non-codec). _Parked:_ subsumed by the `useragent` rename — fixing the name in place would only entrench the rejected package.

## Approved

_None. Approval is the user's verbal gate; nothing here is blessed until the user says so._

## Notes for the charter's Open directions

These are not in-package sweeps; they are the design decisions this package's existence forces. They belong in `charter.md › Open directions` for the user to settle, not in any worker's task list:

1. **Bless-or-remove (the controlling question).** `register.md` records `platform-formats` → **rejected**, "collapse into `useragent`," and `structural-forks.md` names it as the canonical plurality-guard failure. The charter is still a `TODO` stub that has not ratified or overturned that verdict. The user must either (a) execute the collapse — extract a single `useragent` value-leaf (`types`-only dep, consumed by the web backends of `device` and `platform`), absorbing both `platform-formats` and `device-formats` — or (b) bless an explicit, contrary ruling that `platform-formats` should exist after all (and then justify the `-formats` naming and the lack of plurality). Until then this package cannot be treated as blessed.
2. **The dropped `types/Platform.ts` hunk.** The integration lost the `PlatformEndianness`/`PlatformEngine`/`PlatformRuntime` additions that a carried review doc claims landed. This breaks `platform-formats` _and_ `platform`. Resolving it is a `@flighthq/types` + integration concern, and its shape depends on (1): the types live wherever the leaf lives (`platform-formats` today, `useragent` if collapsed). Surface to the user as an integration regression, not a within-package edit.
3. **Cross-package `device → platform-formats` import.** `device.ts` imports `parseUserAgentArch` from `platform-formats`. The `useragent` collapse is the blessed resolution; record whether the user is committing to it so this peer import is removed rather than normalized.
