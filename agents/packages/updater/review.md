---
package: '@flighthq/updater'
status: strong
score: 85
updated: 2026-09-02
ingested:
  - packages/updater/src/updater.ts
  - packages/updater/src/updater.test.ts
  - packages/updater/src/index.ts
  - packages/updater/src/contract.ts
  - packages/updater/package.json
  - packages/types/src/Updater.ts
  - packages/types/src/Host.ts (updater sections)
  - packages/host-electron/src/electronUpdater.ts
  - packages/host-electron/src/electronUpdater.test.ts
  - host-web, host-tauri, host-capacitor updater grep
  - charter.md
  - assessment.md
  - status.md
  - prior review (2026-06-25)
---

# updater -- Review

Full re-review of the live `packages/updater/` source and its type contract in `@flighthq/types/src/Updater.ts`, read from the current worktree on 2026-09-02. Supersedes the 2026-06-25 review (`partial -- 38`), which rejected a bundle where the type contract had not landed alongside the source rewrite. The type contract is now present and the package compiles.

## Verdict

`strong -- 85/100`. The 2026-08-30 rewrite reduced the package to one explicit Squirrel transaction -- three exported functions, zero signals, zero configuration surface. `checkForAppUpdate` is an awaited check that returns a discriminated outcome; `installDownloadedUpdate` is a provider-pinned install that rejects handles not originating from a completed check; `destroyUpdater` tears down the provider synchronously. The type contract in `Updater.ts` is tight: `UpdaterCommandBackend` is an Entity with three methods (`check`, `destroy`, `install`), `DownloadedUpdate` is an Entity carrying frozen metadata with null for every unknown field, and `AppUpdateCheckOutcome` / `AppUpdateInstallOutcome` are closed discriminated unions. The module-level `_downloadOwners` WeakMap is the sole mutable state and serves a legitimate origin-pinning purpose. What keeps it from the 90s: the WeakMap is module-scoped mutable state (not passed as an argument), the `assertSyncVoid` type-level guard is unexported but clever enough to warrant a comment, and the guard/explain diagnostic layer is absent.

## Present capabilities

- **Awaited Squirrel check transaction.** `checkForAppUpdate(host)` takes `HasUpdaterCommand` (the narrowed capability witness from `Host.ts`), delegates to `host.updater.command.check()`, and normalizes every outcome into frozen singleton sentinels (`CHECK_IN_PROGRESS`, `NOT_AVAILABLE`, `OPERATION_FAILED`) or a frozen `{ reason: 'downloaded', update }` object. Any exception from the backend resolves as `operation-failed`, never throws. A successful download pins the `DownloadedUpdate` handle to its originating provider in the module-level `_downloadOwners` WeakMap; a handle already owned by a different provider returns `operation-failed` rather than accepting a cross-provider install.
- **Provider-pinned install.** `installDownloadedUpdate(host, update)` retrieves the originating provider from `_downloadOwners`. If the current `host.updater.command` is the same as the origin, the call goes through the host path; if the provider was replaced, the call goes to the original provider directly. An unknown handle (one that never passed through `checkForAppUpdate`) throws `TypeError` -- the only throw in the package, and correct: this is a programmer error (API misuse), not an expected failure. On success the handle is deleted from the map, preventing reuse. Exceptions from the backend resolve as `operation-failed`.
- **Provider destroy.** `destroyUpdater(host)` calls `host.updater.command.destroy()` and wraps the return in `assertSyncVoid`, a compile-time guard that rejects `Promise<void>` (preventing an accidentally async destroy from silently dropping). The teardown verb is `destroy*`, correct: the Electron backend holds native listeners that must be freed immediately, not deferred to GC.
- **Frozen metadata with null unknowns.** `UpdateInfo` carries seven readonly nullable fields (`downloadSizeBytes`, `isMandatory`, `minimumOsVersion`, `notes`, `releaseDate`, `sha512`, `version`). The Electron adapter (`createElectronUpdaterBackend`) populates only the three fields Squirrel can prove (`notes`, `releaseDate`, `version`) via `knownString` and sets the rest to `null`. Both the `UpdateInfo` and the `DownloadedUpdate` are `Object.freeze`-d. The test (`electronUpdater.test.ts`) verifies freezing and null propagation for empty/undefined native arguments.
- **Electron adapter.** `createElectronUpdaterBackend(electron, feedUrl?)` in `host-electron` creates an Entity implementing `UpdaterCommandBackend`. Feed URL is immutable construction-time policy -- set once via `autoUpdater.setFeedURL`, never re-set or exposed. Each `check()` opens a `CheckTransaction` that attaches five native event listeners (`checking-for-update`, `update-available`, `update-not-available`, `update-downloaded`, `error`), all scoped to the transaction and cleaned up on settlement. Concurrent checks return `check-in-progress` without dispatching a second native operation. Partial attach failures roll back all listeners already attached. `destroy()` settles any in-flight transaction as `operation-failed`, removes all provider-scoped listeners, and throws cleanup errors to the caller rather than swallowing them. The adapter carries 7 test cases covering the full transaction lifecycle: feed policy, downloaded metadata extraction, not-available/error classification, concurrent-check deduplication, partial attach rollback, remove-failure retry, and in-flight destroy settlement.
- **Host integration.** `HasUpdaterCommand` in `Host.ts` narrows to `{ updater: { command: UpdaterCommandBackend } }`. `HostUpdaterCapabilities` declares `command` as optional. Electron fills it; web, Tauri, and Capacitor set `updater: {}` (empty capability group), each with an explanatory comment that their injected APIs provide no Squirrel-compatible transaction.
- **Package shape.** Two-lane exports: `index.ts` re-exports from `contract.ts`; `contract.ts` re-exports from `updater.ts`. Both lanes carry the same three functions -- no contract-only exports, correct for a leaf package with no intra-SDK-only API. `sideEffects: false`. Single dependency: `@flighthq/types` at `*`. No `@flighthq/entity` dependency (entity creation lives in `host-electron`, not here). No signals dependency. Exported in the `@flighthq/sdk` barrel at line 149.
- **Test coverage.** Three `describe` blocks in `updater.test.ts` mirror the three exports 1:1, alphabetized. Six `it()` cases: awaited check (1), error suppression (1), provider-only destroy (1), origin-pinning across Host replacement (1), unknown-handle rejection (1), export surface assertion (1). The export surface assertion explicitly verifies that both `index` and `contract` carry exactly `['checkForAppUpdate', 'destroyUpdater', 'installDownloadedUpdate']`. Tests construct `DownloadedUpdate` with `EntityRuntimeKey` and full `UpdateInfo` shapes, using `Object.freeze` to match production behavior. The `FakeBackend` records call counts for `check`, `destroy`, and `install` to assert delegation correctness.

## Gaps

1. **Module-scoped mutable state.** `_downloadOwners` is a `WeakMap` at module scope. The design constraints state "no module-scoped mutable state that functions reach for." The WeakMap serves a legitimate purpose (origin-pinning that must survive across separate `checkForAppUpdate` and `installDownloadedUpdate` calls without the caller holding a handle to it), but it is still a hidden dependency: two `checkForAppUpdate` calls from different parts of an app share the same map implicitly. An explicit `UpdaterSession` value or an out-parameter approach would align with the explicit-dependency model, though for a three-function package the practical cost is low.
2. **No guard/explain diagnostic layer.** `installDownloadedUpdate` throws `TypeError` for an unknown handle, and the check returns `operation-failed` for cross-provider and exception cases. There is no shakeable `explainAppUpdateCheckFailure` or `enableUpdaterGuards` companion. The diagnostics convention calls for every silent sentinel to have an `explain*` query returning plain data. The throw for unknown handles is correct (programmer error), but the silent `operation-failed` outcomes from cross-provider mismatch, backend exception, and unknown discriminant are indistinguishable to the caller without an explain layer.
3. **`assertSyncVoid` is unexported and uncommented.** The type-level guard at line 64-67 is a clever trick that rejects `any` and `Promise<void>` at compile time to prevent accidentally dropping a promise from `destroy()`. It has no JSDoc or comment explaining why it exists. It is also unique to this package -- if this pattern is reusable, it belongs in a shared utility; if not, the reasoning for its constraints should be documented inline.
4. **Default discriminant maps to `operation-failed`.** The `default` arm in `checkForAppUpdate` (line 33) maps any unrecognized `reason` to `operation-failed`. This is defensive against future outcome additions in the type contract, but it silently collapses new outcomes that might warrant distinct handling. An exhaustive check (`const _exhaustive: never = outcome`) would surface type-contract expansion at compile time.

## Charter contradictions

None. The charter specifies "one awaited Squirrel check transaction, provider-pinned installation, exact provider teardown, nullable frozen metadata, and empty W/T/C capability groups." All five are realized. The charter's single open direction (non-Squirrel providers requiring separately ruled transaction mappings) remains open and is not contradicted by the current implementation.

## Contract & docs fit

- **Two-lane export shape**: satisfied. `index.ts` re-exports from `contract.ts`; `contract.ts` re-exports `updater.ts`. Both lanes carry the same three functions.
- **Types-first**: satisfied. All types in `@flighthq/types/src/Updater.ts` and `Host.ts`. No exported type definitions in the updater package. `UpdateInfo`, `DownloadedUpdate`, `AppUpdateCheckOutcome`, `AppUpdateInstallOutcome`, `UpdaterCommandBackend`, and `HasUpdaterCommand` are all defined in `@flighthq/types` and imported via the `contract` lane.
- **`sideEffects: false`**: satisfied. No top-level side effects. The module-level `WeakMap` and frozen sentinels are allocation, not observable side effects.
- **Naming**: satisfied. All three exports carry the full unabbreviated object word (`AppUpdate`, `Updater`). `checkForAppUpdate` and `installDownloadedUpdate` are descriptive verbs; `destroyUpdater` uses the correct teardown verb (the Electron backend holds native listeners to free).
- **Readonly**: satisfied. `DownloadedUpdate.info` is `Readonly<UpdateInfo>`. `UpdateInfo` fields are all `readonly`. `AppUpdateCheckOutcome` and `AppUpdateInstallOutcome` branches are `Readonly<{...}>`. The `HasUpdaterCommand` parameter is structurally readonly.
- **Sentinels vs. throws**: satisfied. `checkForAppUpdate` returns `operation-failed` for all expected failure cases (backend exception, unknown discriminant, cross-provider). `installDownloadedUpdate` throws `TypeError` only for the programmer-error case of an unknown handle.
- **Entity**: satisfied. `UpdaterCommandBackend` extends `Entity`. `DownloadedUpdate` extends `Entity`. The Electron adapter uses `createEntity` from `@flighthq/entity/contract`.
- **`status.md` alignment**: the status document's description of "three transaction functions: awaited check, provider-pinned install, and provider destroy" matches the realized surface exactly. The claim that "no duplicate `AppUpdater` event/state/config model remains" is confirmed -- there is no `AppUpdater` type in the current tree, only `UpdaterCommandBackend`.

## Candidate open directions

1. **Explain layer for silent `operation-failed` outcomes.** An `explainAppUpdateCheckOutcome` or `enableUpdaterGuards` function that emits through `@flighthq/log` when a check collapses to `operation-failed` due to cross-provider mismatch, backend exception, or unknown discriminant.
2. **Exhaustive discriminant check.** Replace the `default: return OPERATION_FAILED` in `checkForAppUpdate` with a `never`-typed exhaustive assertion so that additions to `AppUpdateCheckOutcome` are surfaced at compile time.
3. **Promote `assertSyncVoid` or document it.** If the pattern is reusable across teardown verbs in other platform packages, extract it to a shared utility. Otherwise, add a comment explaining the `IsAny<T>` trick and why the `destroy()` return type needs compile-time enforcement.
