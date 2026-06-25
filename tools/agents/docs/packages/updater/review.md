---
package: '@flighthq/updater'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/updater.md
  - source
  - changes.patch
  - charter.md
---

# updater — Review

Merge-gate review of the `@flighthq/updater` **delta** in integration bundle `b2824e3d8`, judged against the approved baseline `base = origin/main (eb73c3d74)`. The baseline is the blessed floor and is not under review. Evidence is the head-vs-base delta under `incoming/integration-b2824e3d8/` plus the `packages/updater/` (and adjacent) hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings reference `b2824e3d8:<path>`.

This is a **re-baseline**. The prior live `review.md`/`assessment.md` were written against an earlier, _complete_ bundle (`67dc46d64`) in which the matching `@flighthq/types/src/Updater.ts` rewrite landed alongside the package source — that bundle scored `solid — 86`. **The `b2824e3d8` integration delta is a different, broken artifact:** it carries the updater source rewrite but **not** the type changes the rewrite depends on. The design it implements is good; the bundle as assembled does not compile.

## Verdict

`partial — 38/100` as a **merge candidate**. **REJECT for merge as-is.** The score is not a judgement of the design (the design, if its types landed, is the `solid — 86` shape the prior review described). It is a judgement of _this bundle's mergeability_: the delta references a cross-package type contract that is absent from the same tree, so `@flighthq/updater` cannot typecheck or build. A merge gate rejects code that does not compile, regardless of intent.

## The blocking finding: the type contract did not land

The head source rewrite imports a new, richer type surface from `@flighthq/types`, but `@flighthq/types/src/Updater.ts` was **not** changed in this bundle and still carries the base (6-signal, no-config) shape.

- **`b2824e3d8:packages/updater/src/updater.ts:2-9`** imports `UpdateInfo, UpdaterBackend, UpdaterConfig, UpdaterSignatureConfig, UpdaterState` from `@flighthq/types`.
- **`b2824e3d8:packages/updater/src/updater.test.ts:2`** imports `UpdateInfo, UpdateProgress, UpdaterBackend, UpdaterError` from `@flighthq/types`.
- But `head/packages/types/src/Updater.ts` is **byte-identical to base** (verified by `diff base head` → IDENTICAL). It defines only `UpdateInfo { version; notes; releaseDate }`, a 6-signal `AppUpdater`, and a 10-method `UpdaterBackend`. It does **not** define `UpdaterConfig`, `UpdaterState`, `UpdaterSignatureConfig`, `UpdaterError`, `UpdateProgress`, any `*Phase`/`*Kind`, or `UpdateInfo.stagedRolloutPercent`.
- The `changes.patch` file list confirms the omission: under `packages/`, only `updater/src/updater.ts`, `updater/src/updater.test.ts`, and `host-electron/src/electronNotification.{ts,test.ts}` are touched. **`packages/types/src/Updater.ts` is not in the patch**, and neither is `host-electron/src/electronUpdater.ts` (which the prior review claimed was rewritten to the 22-method backend).

Consequences in the delta, all grounded:

1. **Missing-symbol compile errors.** Every import on `updater.ts:2-9` and `updater.test.ts:2` of `UpdaterConfig`/`UpdaterState`/`UpdaterSignatureConfig`/`UpdaterError`/`UpdateProgress` resolves to nothing — `tsc -b` fails before any logic is reached.
2. **`UpdateInfo.stagedRolloutPercent` does not exist.** `b2824e3d8:packages/updater/src/updater.ts:231-232` (`isAppUpdateEligible`) reads `info.stagedRolloutPercent`, and `updater.test.ts:38,558,563,569,574` construct `UpdateInfo` literals with `stagedRolloutPercent`/`downloadSizeBytes`/`sha512`/etc. The head `UpdateInfo` has only `version`/`notes`/`releaseDate`, so these are property errors on a type the same tree still defines narrowly.
3. **`AppUpdater` entity shape mismatch.** `b2824e3d8:packages/updater/src/updater.ts:88-103` (`createAppUpdater`) returns an object with **ten** signals (`onUpdateCancelled`, `onUpdateStaging`, `onUpdateVerified`, `onUpdateRolledBack` in addition to the six), annotated `: AppUpdater`. The head `AppUpdater` (`head/packages/types/src/Updater.ts:10-17`) declares only six — the extra four are excess properties against the declared type.
4. **`onError` payload mismatch.** `b2824e3d8:packages/updater/src/updater.ts:39-41` does `emitSignal(updater.onError, error)` with a structured `error`, but head `AppUpdater.onError` is `Signal<(message: string) => void>` — an object payload is not assignable to `string`.
5. **`UpdaterBackend` method mismatch.** The source calls `getUpdaterBackend().cancelDownload()`, `.rollback()`, `.getChannel()`/`.setChannel()`, `.getConfig()`/`.setConfig()`, `.setSignatureConfig()`, and subscribes to `subscribeUpdateCancelled/Staging/Verified/RolledBack` (`updater.ts:43-57, 66-67, 99, 134-149, 218-272`). The head `UpdaterBackend` (`head/packages/types/src/Updater.ts:22-33`) has none of these ten methods. `createWebUpdaterBackend` (`updater.ts:127-181`) returns an object implementing all of them, annotated `: UpdaterBackend` — every added method is excess against the declared interface, and the source's `.cancelDownload()` etc. calls are "property does not exist" errors.

This is the same _half-landed type change_ disease the sibling `host-electron` brief documents in this bundle (its `requestPermission` retype landed without the matching `@flighthq/types/Notification.ts` change). Here it is worse: essentially the **entire** new type surface the package depends on is missing, not one method.

## Honesty check: the in-tree review.md is stale and wrong for this bundle

`b2824e3d8:tools/agents/docs/packages/updater/review.md` (the doc the integration carries) claims the realized surface was "read from `dist/updater.d.ts`", that `types/src/Updater.ts` "grown from 33 to 116 lines", and that `host-electron`'s `createElectronUpdaterBackend` was rewritten — all describing bundle `67dc46d64`, not `b2824e3d8`. None of those artifacts exist in this bundle's `head`/`changes.patch`. A reviewer trusting that doc would wave through a non-compiling package. The doc must be re-baselined (this review supersedes it).

## What the design gets right (would hold once the types land)

These are not blockers and are recorded so the rebuild target is clear — they are the strengths the prior `86` review verified, and they survive in the source text here:

- **Naming.** The renames `checkForUpdates → checkForAppUpdate` and `downloadUpdate → downloadAppUpdate` (`updater.ts:72,82,200`) close the base's weakest names by adding the object word; every export carries the full unabbreviated `AppUpdate`/`Updater` word and is `get*`/`is*`/`set*`/`create*`-prefixed correctly.
- **Teardown verbs.** `disposeAppUpdater` delegates to `detachAppUpdater` (`updater.ts:194-196`) — correct: signals are GC memory, nothing to `destroy`.
- **Sentinels, not throws.** `getAppUpdaterState` returns a fresh `createUpdaterState()` for an unknown entity (`updater.ts:207-209`); the web backend no-ops and returns inert unsubscribes.
- **`_setState` alias-safety.** `updater.ts:280-284` reads `prev` from the map before writing `next` — correct out-style discipline for the state reducer.
- **Tree-shaking posture.** `package.json` keeps a single root `.` export, `"sideEffects": false`, a thin `export * from './updater'` barrel, deps limited to `@flighthq/signals` + `@flighthq/types`, and lazy web-backend creation (no module-top side effect). The delta adds no new dependency and no shared hot-loop branch.
- **Source order & tests.** Exports are alphabetized; loose module state (`_backend`, `_states`, `_subscriptions`, `_setState`) sits at the bottom; `updater.test.ts` describe blocks are alphabetized and mirror the exports.

## Standards scorecard (the DELTA, as it would build in this tree)

1. **Composition / bedrock** — PASS (design). A flat free-function command surface + an entity-of-signals event surface + a pure `isAppUpdateEligible` leaf; no config-gated mega-function, no fused subjects.
2. **Naming clarity** — PASS. Full object words, correct verb prefixes; the two renames are net improvements.
3. **Tree-shaking / bundle invariant** — PASS. Single `.` export, `sideEffects: false`, no eager registration, no new shared branch, no new dependency.
4. **Registry vs closed union** — N/A / PASS. No `kind` dispatch family here; the lifecycle is a fixed event seam, not a growing handler registry.
5. **Subject triad + plurality guard** — PASS for what is present; the `-formats` neighbor is correctly _absent_ and parked (an Open direction), not prematurely split.
6. **Contract hygiene** — **FAIL.** The "types-first in `@flighthq/types`" rule is violated in the worst direction: the implementation was merged _ahead of_ its header. The header is the design surface and it is missing the entire `UpdaterConfig`/`UpdaterState`/`UpdaterSignatureConfig`/`UpdaterError`/`UpdateProgress` contract and the enriched `UpdateInfo`. `Readonly<>`, `dispose*`, and sentinel usage are otherwise correct.
7. **Tests & honesty** — **FAIL.** The colocated test is well-structured and mirrors exports, but it imports `UpdateProgress`/`UpdaterError` that do not exist in the tree and constructs `UpdateInfo` with absent fields — it **does not compile**. The in-tree `review.md` describes a different bundle. Claims do not match the code as assembled.

## Net

The design is mergeable; **this bundle is not.** The block is mechanical and total: land the `@flighthq/types/src/Updater.ts` rewrite (and the `host-electron/electronUpdater.ts` backend the seam now requires) in the **same** merge, or the package fails `tsc`. Until then, REJECT.
