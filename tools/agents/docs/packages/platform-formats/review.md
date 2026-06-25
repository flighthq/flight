---
package: '@flighthq/platform-formats'
status: stub
score: 18
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/platform-formats/ (whole package — new)
  - changes.patch (platform-formats slice)
  - charter.md
  - register.md
  - structural-forks.md
---

# platform-formats — Review

Merge-gate review of the **incoming delta** for `@flighthq/platform-formats`: `incoming/integration-b2824e3d8/head/packages/platform-formats/` vs the approved baseline `origin/main` (`eb73c3d74`), where the baseline is **empty** — this is a brand-new package, so the entire package is the delta. Findings cite `b2824e3d8:<path>` with quoted snippets. Judged against the 7 merge standards; the charter is a `TODO` stub, so the codebase-map AAA standard and the blessed `register.md` / `structural-forks.md` rulings are the rubric.

## Verdict

`stub — 18/100`. **REJECT for merge.** Two independent fatal defects, each sufficient on its own:

1. **The package does not compile.** `b2824e3d8:src/userAgent.ts:1` imports three types from `@flighthq/types` that are defined nowhere in the tree.
2. **The package was already rejected by a blessed structural ruling.** `register.md` records `platform-formats` → **rejected**, "collapse into `useragent`"; the delta ships it as a standalone package anyway, with no `useragent` crate present.

The function-level code is competent — clean free functions, honest sentinels, alphabetized 1:1 tests — but it is competent code in a package the project already decided should not exist, depending on types the integration dropped. The 18 reflects "good leaf logic, fatal envelope."

## Fatal #1 — broken compile: three undefined `@flighthq/types` imports

`b2824e3d8:src/userAgent.ts:1`:

```ts
import type { PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime } from '@flighthq/types';
```

Only `PlatformName` and `PlatformKind` exist in `@flighthq/types`. `Platform.ts` (head) defines exactly:

```ts
export type PlatformName = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';
export type PlatformKind = 'desktop' | 'mobile' | 'web' | 'unknown';
```

A full-tree grep for `export type Platform{Endianness,Engine,Runtime}` / `export interface …` returns **nothing** — the three are defined nowhere in `head/`. They are used as load-bearing return types: `parseUserAgentEngine(ua): PlatformEngine` (`userAgent.ts:39`), `parseUserAgentRuntime(win): PlatformRuntime` (`userAgent.ts:108`), `probeEndianness(): PlatformEndianness` (`userAgent.ts:156`). `tsc -b` fails with "module '@flighthq/types' has no exported member 'PlatformEngine'" (×3). This is not a stub-vs-built nuance; it is a non-building package. It fails **standard 7 (compiles)** and **standard 6 (types-first)** outright.

Root cause is a **lost-hunk integration regression**, and it is self-documenting: a doc carried in this same patch claims the types _were_ added — `b2824e3d8:changes.patch:70250` (a review doc) asserts `Platform.ts` gained "new union types `PlatformRuntime`, `PlatformEngine`, `PlatformEndianness`". The patch never touches `packages/types/src/Platform.ts` (no diff hunk for it), and head's `Platform.ts` does not contain them. The doc describes a state the integration did not actually land. The same break also hits `@flighthq/platform` (`platform.ts`/`platform.test.ts` reference `PlatformEngine`/`PlatformRuntime`), so the missing-types regression is broader than this package — but this package is a victim of it and cannot merge while it stands.

## Fatal #2 — ships a package the register already rejected

`structural-forks.md` (the blessed fork doc) names this package by hand as the canonical failure of the plurality guard:

> "`device-formats`/`platform-formats` failed exactly this: they split a subject with no plurality."

`register.md › Built-unblessed — verdicts` records the verdict explicitly:

| Package            | Verdict                                             | Resolution                    |
| ------------------ | --------------------------------------------------- | ----------------------------- |
| `platform-formats` | **rejected** … the other half of the same UA parser | collapse into **`useragent`** |

The standing direction is unambiguous: "**`useragent`** _(new primitive)_ — pure UA-string → identity-tokens value-leaf … used by the _web backends_ of `device` and `platform`." The delta does the opposite: it ships `platform-formats` (and `device-formats`) as standalone packages, and `useragent` **does not exist** in head (`ls packages/ | grep useragent` → nothing). This fails **standard 5 (subject triad + plurality guard)** against a ruling that is already blessed, not merely proposed.

## Standard 5, second face — dishonest `-formats` naming

The bedrock test's third gate is "honest naming — a UA string is not a `-format`." `package.json` describes the package as `"UA-string parsers for platform identity fields"`. A `-formats` cell is a **codec** (file ↔ value, registry-dispatched) per the subject triad; UA parsing is identity extraction, not a codec, and `structural-forks.md` states the oracle directly: "No library for 'UA-parsing split by consumer' → not a subject." The `-formats` suffix is the wrong convention for what this is — the very mis-naming `register.md` flagged.

## Standard 5, third face — cross-package coupling the collapse was meant to remove

`b2824e3d8:packages/device/src/device.ts:2`:

```ts
import { parseUserAgentArch } from '@flighthq/platform-formats';
```

`device` reaching across into `platform-formats` for one function is exactly the seam the `useragent` collapse exists to dissolve (one shared UA-leaf consumed by both `device` and `platform` web backends). The split forces a peer-to-peer `-formats → -formats`-adjacent import instead of both depending on a single `useragent` leaf. (Note: the register's earlier "duplicate `parseUserAgentArch` export" complaint is **resolved** in this integration — `device-formats` no longer re-exports it; `arch` is homed solely here. So that specific sub-claim is dropped. The cross-package import remains.)

## What passes (do not re-litigate)

The leaf logic is the package's one strength and is genuinely fine:

- **Standard 2 (naming).** Full unabbreviated `parseUserAgent*` names; engine/name/version/kind/arch/pointer-width all spelled out; `probeEndianness` is honest about being a runtime probe, not a stored getter.
- **Standard 3 (tree-shaking).** `sideEffects: false`, single `.` export (`package.json:7-12`), thin barrel re-export (`index.ts`), no top-level side effects.
- **Standard 4 (registry vs union).** The `switch` in `parseUserAgentEngineVersion`/`parseUserAgentVersion` is over a small, closed, non-growing set (a handful of browser engines / OS names) — a defensible "tight loop in a closed system," not a growing family. Not flagged.
- **Standard 7 (tests, modulo the compile break).** `userAgent.test.ts` is colocated, `describe` blocks alphabetized and mirror exports 1:1, sentinels (`''`/`-1`/`'unknown'`) and alias/priority cases (electron-over-tauri) covered. No dead or unexported surface. It would be solid coverage if the file compiled.

## Minor (not merge-blocking, parked)

- **`parseUserAgentArch` returns `string`, not a canonical union.** The canonical tokens (`'x64'|'arm64'|…`) live only in a comment (`userAgent.ts:4`). This mirrors `PlatformInfo.arch: string` in types, so it is _consistent_ — but a `PlatformArch` union would make the canonical set type-enforced. Backlog, not a defect.
- **`probeEndianness` is mis-filed.** It is a DataView byte-order probe with nothing to do with user agents, yet lives in `userAgent.ts`. If the leaf survives at all (as `useragent`), endianness is a separate concern from UA parsing.

## Bottom line for the merge gate

Reject. Fatal #1 (undefined types → no compile) must be fixed before any further consideration, and it is a symptom of a lost `types/Platform.ts` hunk that also breaks `@flighthq/platform`. Fatal #2 (rejected package) means the correct fix is not "patch the types here" but "execute the blessed `useragent` collapse." Merging this package as-is would (a) break the build and (b) re-introduce a decomposition the register already retired.
