---
package: '@flighthq/platform'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/platform.md
  - source
  - changes.patch
  - structural-forks.md
  - register.md
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# platform — Review (merge gate: integration-b2824e3d8 → origin/main)

> This review judges the **delta only** — `incoming/integration-b2824e3d8/head/packages/platform/` vs the approved base `…/base/packages/platform/` (= `origin/main` `eb73c3d74`) — as a gate into the blessed baseline. The base is not under review. A prior `solid — 80` survey of this work exists, but it was written against the worker's own SHA `67dc46d64`, where the types-layer change was present. **In the integration head being merged here, that change is missing**, which changes the verdict materially.

## Verdict

**partial — 45/100. Reject as-is: the delta does not compile.** The seam design the worker shipped is genuinely good — a thin, fully-named, side-effect-free command capability with version-compare helpers, runtime/engine/endianness fields, and one-test-per-export coverage. But the integration branch carries the **consumer** of an expanded `PlatformInfo` without the **type definition** of it. `b2824e3d8:packages/types/src/Platform.ts` is byte-identical to base (29 lines, the old six-field surface, no `PlatformRuntime`/`PlatformEngine`/`PlatformEndianness` unions), yet `b2824e3d8:packages/platform/src/platform.ts` imports those unions and builds a thirteen-field `PlatformInfo`. This is a hard `tsc` failure across `platform`, `platform-formats`, and `types`. On top of that, the delta introduces `@flighthq/platform-formats`, which the SDK-wide register and structural fork E have already **rejected** (collapse into a shared `useragent` primitive). The seam is mergeable; the branch as assembled is not.

## What the delta changes (head vs base)

The base `platform` package is the six-field seam: `createPlatformInfo`/`createWebPlatformBackend`/ `getPlatformBackend`/`getPlatformInfo`/`getPlatformKind`/`getPlatformName`/`isPlatform{Desktop,Mobile,Touch,Web}`/ `setPlatformBackend`, with an inline `getWebPlatformInfo` + `detectWebPlatformName` UA matcher. It compiles against the base `types/Platform.ts`.

The head adds, in `b2824e3d8:packages/platform/src/platform.ts`:

- Five new exports — `comparePlatformVersions`, `getPlatformEngine`, `getPlatformRuntime`, `isPlatformNative`, `isPlatformVersionAtLeast`.
- A thirteen-field `createPlatformInfo` (`arch`, `distro`, `distroVersion`, `endianness`, `engine`, `engineVersion`, `isTouch`, `kind`, `locale`, `name`, `osBuild`, `pointerWidth`, `runtime`, `version`).
- A rewritten `getWebPlatformInfo` that delegates all parsing to the new `@flighthq/platform-formats` package (`parseUserAgent*` + `probeEndianness`).

It adds the dependency `@flighthq/platform-formats` to `b2824e3d8:packages/platform/package.json:30` and a `{ "path": "../platform-formats" }` reference to the tsconfig. It does **not** change `index.ts` (still the one-line barrel).

## Standard-by-standard (the seven axes, against the delta)

1. **Composition / bedrock — PASS (seam) / FAIL (neighbor).** Splitting the churny UA table out of the seam is, in isolation, a clean decomposition; the seam shrinks to ~20 lines of delegation. But the _cut_ is wrong: `platform-formats` is not bedrock, it is half of a single UA parser shared with `device`. Fork E and the register file both name it. See axis 5.

2. **Naming clarity — PASS.** Every new export carries the full `Platform` type word and the right verb: `comparePlatformVersions`, `getPlatformEngine`, `getPlatformRuntime`, `isPlatformNative`, `isPlatformVersionAtLeast`. The `platform-formats` parsers (`parseUserAgentArch`, `parseUserAgentEngineVersion`, …) are self-identifying and the ordering hazards are commented (arm64 before arm; Firefox before blink before webkit; Edg/OPR before Chrome). No abbreviations, no vague names.

3. **Tree-shaking / bundle invariant — PASS.** Both packages keep a single root `.` export, declare `"sideEffects": false`, and register nothing at import. `_backend`/`_scratch` module state is lazy and pre-existing in base (not a delta regression). No new hot-loop branch taxes the primitive.

4. **Registry vs closed union — N/A (no regression).** `platform` is an identification seam with no handler/kind family; the closed `switch (name)` / `switch (engine)` parsers in `platform-formats` are a tight closed system (a fixed token vocabulary), which the contract explicitly permits. No fork-B issue.

5. **Subject triad + plurality guard — FAIL.** `b2824e3d8:packages/platform/package.json:30` adds `"@flighthq/platform-formats": "*"`. The register (`tools/agents/docs/packages/register.md:31`) records `platform-formats` as **rejected — "the other half of the same UA parser"**, to collapse into a new `useragent` primitive, and structural-forks.md:22 names it directly: _"`device-formats`/`platform-formats` failed exactly this: they split a subject with no plurality."_ A UA string is one parsed string, not ≥2 serialized container formats with codecs — `-formats` is dishonest here, and `parseUserAgentArch` is the literal duplicate the register cites as exported from both this package and `device-formats`. Merging the delta as-is re-introduces a package the SDK has already voted to remove.

6. **Contract hygiene — FAIL (types-first violated by the delta).** The contract's load-bearing rule — "define its types in `@flighthq/types` first, then implement against them" — is broken by the branch: `b2824e3d8:packages/types/src/Platform.ts` still declares only

   ```ts
   export interface PlatformInfo {
     name;
     kind;
     version;
     arch;
     locale;
     isTouch;
   }
   ```

   with **no** `PlatformRuntime`/`PlatformEngine`/`PlatformEndianness` and **none** of the eight new fields, while `b2824e3d8:packages/platform/src/platform.ts:12-19` does

   ```ts
   import type {
     PlatformBackend,
     PlatformEngine,
     PlatformInfo,
     PlatformKind,
     PlatformName,
     PlatformRuntime,
   } from '@flighthq/types';
   ```

   and `createPlatformInfo()` returns `{ arch, distro, distroVersion, endianness, engine, engineVersion, isTouch, kind, locale, name, osBuild, pointerWidth, runtime, version }`. `userAgent.ts:1` imports `PlatformEndianness` too. The header was never updated in this branch; the implementation references a type surface that does not exist. This is not a style nit — it is a compile failure and the exact inversion the types-first rule exists to prevent. (`out`-param + sentinel + `Readonly` discipline are otherwise correct; `comparePlatformVersions` reads both inputs before returning and is alias-irrelevant.)

7. **Tests & honesty — FAIL (does not compile) + dishonest status.** The colocated tests are well-shaped: `platform.test.ts` is alphabetized, mirrors every export, and adds UA-detection + canonical-token normalization suites; `platform-formats/src/userAgent.test.ts` covers all nine parsers. But `tsc -b` typechecks `src/*.test.ts`, and the tests assert a fourteen-field `createPlatformInfo()` (`platform.test.ts:70-88`) against a six-field `PlatformInfo` — so the test files themselves will not compile against the head types. Separately, the status doc and the prior review both _claim_ the types carry "all 14 fields … new union types `PlatformRuntime`, `PlatformEngine`, `PlatformEndianness`" (status.md, and the prior review.md:34) — a claim that is **false for this integration head**. The claim-vs-code mismatch is itself the finding: the types commit was dropped somewhere between `67dc46d64` and `b2824e3d8`.

## Gaps carried from the prior survey (still true, not merge-blockers)

These are real but secondary to the compile failure; they are parked, not gates:

- **No async high-entropy resolve path.** `version`/`arch`/`engineVersion`/`pointerWidth` are UA-string best-effort; the accurate `navigator.userAgentData.getHighEntropyValues(...)` source is Promise-based and there is no `getInfoAsync` seam. Correctly deferred pending a suite-wide async-shape decision shared with `@flighthq/device`.
- **`osBuild`/`distro`/`distroVersion` are web stubs with no native filler.** Honest `''` reserved for a native backend that does not exist in this codebase yet.
- **Rust mirror drift.** Even setting the missing TS-types aside, `flighthq-types::PlatformInfo` carries only the old six-field surface; the eight new fields and five new functions are unmirrored. Conformance should record this as drift. (Largely a base/cross-tree fact, surfaced as an open question, not a gate.)

## Contract & docs fit

Mechanically the seam still lives up to the contract on naming, single-root export, `sideEffects: false`, sentinels-not-throws, and `out`-params — none of those regressed. The two delta-introduced fit failures are both structural: the missing types header (axis 6) and the rejected `platform-formats` neighbor (axis 5). The codebase-map Package Map one-liner ("OS name, desktop/mobile/web kind, arch, locale, touch") still omits `platform-formats` entirely, which is consistent with that package's rejection — leave it narrow until the `useragent` collapse resolves the extra fields.

## Why the score moved (80 → 45)

The prior `80` was earned by a tree that _did_ include the types change. This merge gate scores the tree that will actually land. A consumer that references undeclared types fails to build, which is the floor every other quality is conditioned on — hence `partial`, not `solid`. The instant the types delta is restored (and `platform-formats` is resolved per fork E), the seam returns to its earned 80.
