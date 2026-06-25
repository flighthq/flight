---
package: '@flighthq/sdk'
status: solid
score: 90
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
base: origin/main (eb73c3d74)
evidence: integration-b2824e3d8 delta
---

# sdk — Review (merge gate: integration-b2824e3d8 vs approved origin/main eb73c3d74)

> Harsh merge-review of the **delta only**. Baseline (approved, not critiqued) is `incoming/integration-b2824e3d8/base/packages/sdk/` = `origin/main` (eb73c3d74). Candidate is `incoming/integration-b2824e3d8/head/packages/sdk/`. Findings are grounded in `b2824e3d8:<path>` hunks and the `packages/sdk/` slice of `changes.patch`. This supersedes the prior survey, which reviewed a different bundle (`builder-67dc46d64`); where that survey's findings reappear in this delta they are re-cited against this candidate.

## What the delta is

The base `@flighthq/sdk` was a thin barrel (`index.ts`, 84 lines, alphabetized) plus a one-line smoke test. The integration delta does four things, all within the barrel's scope:

1. **Closes real barrel drift** — adds `device-formats`, `platform-formats`, `resource-formats` to `index.ts`, `package.json` deps, and `tsconfig.json` references. The base barrel was missing these three app-facing packages; the candidate is complete.
2. **Expands the reachability test** — `index.test.ts` goes from a single `expect(engine).toBeDefined()` to 22 `it`s across 11 domain `describe` blocks, asserting representative `create*` exports are functions and canonical `*Kind` strings carry expected values.
3. **Adds a collision gate** — new `src/collision.test.ts` (126 lines): a namespace-size lower bound (`>= 4000` keys) plus 46 unique sentinel-name presence checks.
4. Backs the completeness enforcement with a repo-level gate (`checkSdkBarrelSync` in `scripts/packages.ts`) over a centralized predicate (`scripts/sdk-policy.ts`).

Net: the candidate is a **strict correctness improvement** over the approved base — the barrel is now complete and faithful where the base silently omitted three packages.

## Verdict

**solid — 90/100.** The functional change is sound and is the right shape for a convenience barrel: new entries are correctly alphabetized in `index.ts`, the deps/tsconfig mirror them, and every sentinel resolves to a real non-test export (spot-verified: `setTextShaperBackend`, `createCamera`, `createParticleEmitter`, `createSceneNode`, `drawGlScene`, `drawWgpuScene`, `createMesh`, `createColorTransform` all exist in source). The barrel stays `"sideEffects": false`, single `.` export, no subpaths. The one real blemish is an **honesty gap**: the package's own status/review and a source comment in the new `scripts/sdk-policy.ts` claim a `packages/sdk/src/completeness.test.ts` guard that **does not exist** in this head tree. Score sits below the prior survey's 96 specifically for that dead reference / over-claim, not for any regression in the barrel itself.

## Standards scorecard (delta only)

1. **Composition / bedrock — PASS.** The barrel adds no logic; it re-exports three more leaf packages. No feature is fused in, no config-gated branch is introduced. The three `-formats` packages are their own cells; the barrel is a simple composition of them.
   - `b2824e3d8:packages/sdk/src/index.ts` lines 7, 50, 56: `export * from '@flighthq/device-formats';` … `'@flighthq/platform-formats';` … `'@flighthq/resource-formats';`

2. **Naming clarity — PASS.** No names are coined by this delta; it re-exports. The new sentinel list in `collision.test.ts` names real, fully-spelled exports (`createApplicationWindow`, `setTextShaperBackend`, `createParticleEmitterConfig`, etc.). No abbreviations introduced.

3. **Tree-shaking / bundle invariant — PASS.** All three additions are `export *` from `"sideEffects": false` packages; no eager registration, no top-level side effect, no new hot-loop branch or shared switch. The barrel manifest envelope is unchanged (`b2824e3d8:packages/sdk/package.json` line 121 `"sideEffects": false`; lines 7-12 single `.` export). Adding members to the barrel taxes no primitive — barrel users already opt into the whole shakeable set.

4. **Registry vs closed union — N/A (PASS).** No `kind`/handler family is introduced or switched on here. The delta is pure re-export.

5. **Subject triad + plurality guard — PASS for sdk; concern routed upward.** The barrel is correct to include `device-formats` / `platform-formats` / `resource-formats` as the `<subject>-formats` plurality pattern, since they are app-facing and exist. Whether those `-formats` packages themselves satisfy the ≥2-format plurality guard is **out of sdk's scope** — the barrel's job is to reflect the realized app-facing set, not to adjudicate splits. Surfaced to the charter's Open directions (it already carries this as #7).

6. **Contract hygiene — PASS.** Single root `.` export, `"sideEffects": false`, workspace-wildcard deps, full unabbreviated re-exported names (inherited), correct omission of `host-*` / `*-rs` / `sdk` itself. No `out`-param / sentinel / `dispose`-vs-`destroy` surface in a barrel. `index.test.ts` and `collision.test.ts` `describe` blocks are alphabetized.

7. **Tests & honesty — REVISE.** One structural-honesty issue and two cosmetic:
   - **Claimed-but-absent completeness guard.** The new file `b2824e3d8:scripts/sdk-policy.ts` comments: `//   - packages/sdk/src/completeness.test.ts (local completeness guard)`, and both `tools/agents/docs/packages/sdk/status.md` (its "Bronze: Local completeness guard (`src/completeness.test.ts`)" section, 9 `it`s) and the prior `review.md` describe this test in full as implemented. **No such file exists** in `head/packages/sdk/src/` (the directory holds only `collision.test.ts`, `index.test.ts`, `index.ts`), and `changes.patch` contains no `diff --git ... packages/sdk/src/completeness.test.ts` creating it. The _functional_ completeness enforcement survives via `checkSdkBarrelSync` in `packages.ts` (runs in `packages:check`), so the barrel is not unguarded — but the package-local test the docs and a source comment promise is missing. This is a dead reference plus an over-claiming status doc.
   - **Duplicate sentinels.** `b2824e3d8:packages/sdk/src/collision.test.ts` lists `DisplayObjectKind` and `BitmapKind` twice — once under `// display object` and again under the `// types (re-exported kind identifiers)` tail — registering two identical `it()`s each. Harmless but the "46/47 sentinel" intent is muddied (48 with dupes).
   - **Stale package-count comment.** Same file: `// Baseline as of 2026-06-24: 4196 runtime keys across all 83 packages.` — the barrel has 86 `export *` lines (and the status doc says "across 86 packages"). The "83" is internally inconsistent and stale.

## Status-doc verification (AS-CLAIMED → verified)

- **Three new packages added to fix drift** (`device-formats`, `platform-formats`, `resource-formats`) — VERIFIED present in `index.ts`, `package.json`, and `tsconfig.json`, all correctly alphabetized.
- **`index.ts` alphabetized** — VERIFIED.
- **Collision gate + expanded reachability test present** — VERIFIED (`collision.test.ts`, `index.test.ts`).
- **`scripts/sdk-policy.ts` single export; `checkSdkBarrelSync` integration** — VERIFIED in head (`sdk-policy.ts` exports `isSdkBarrelExcludedPackage`; `packages.ts` references `checkSdkBarrelSync`).
- **"Local completeness guard (`src/completeness.test.ts`), 9 `it`s"** — **FALSIFIED.** File absent from head; not created in `changes.patch`. See standard 7.
- **"4196 keys across 86 packages"** — key count is unverifiable from static source (needs a build); the package _count_ is 86, so the in-file "83 packages" comment is stale.

## Gaps (low ceiling for a barrel; all deferred Gold per status)

- **No tree-shake conformance proof** — nothing asserts barrel-import bytes == direct-import bytes. Deferred; needs a `size-runner.ts` barrel-vs-direct mode.
- **No boundary-level side-effect proof** — per-file `checkNoTopLevelSideEffects` runs, but nothing asserts importing the _whole_ barrel registers no renderers / patches no globals.
- **No full export-surface snapshot** — the 46 sentinels are a stand-in for a committed sorted namespace snapshot.

## Charter fit

No contradiction. The head charter explicitly scopes the barrel-boundary guard tests (completeness, collision/namespace-size, reachability spot-checks) as in-scope, so the new tests align with blessed direction. One tension worth the user's eye (not scored against the delta): the **codebase-map** testing section deprecates "barrel smoke tests" as "a strictly weaker version of work CI already does," yet the sdk charter blesses exactly these guards. The charter governs the package, so this is a doc-reconciliation question, not a merge defect — routed to Open directions.
