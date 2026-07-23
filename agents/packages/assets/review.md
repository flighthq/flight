---
package: '@flighthq/assets'
status: solid
score: 72
updated: 2026-07-22
ingested:
  - status.md
  - source
---

# assets — Review

**Verdict:** solid — 72/100. The first-build scope plus the 2026-07-22 loading-vocabulary and failure contracts are delivered cleanly with real test depth; what separates it from the charter's "AAA asset pipeline" north star is the deferred tier (LRU, dependency graph, hot reload) plus cancellation/control and diagnostics depth.

## Present capabilities

All in `packages/assets/src/assetLibrary.ts` (one source file + `index.ts` barrel), types header-first in `packages/types/src/Assets.ts`:

- **Entity, no globals** — `createAssetLibrary()` returns an `AssetLibrary` whose state lives entirely on an opaque `AssetLibraryRuntime` (adapters/descriptors/entries/groups maps). `disposeAssetLibrary` disposes every resident asset through its adapter and empties all four maps.
- **Refcounted ownership with deterministic free** — `acquireAsset(library, id)` increments and resolves; `releaseAsset` decrements and disposes-immediately-at-zero via the registered adapter (`disposeAssetEntry`). Release of an unheld id is a no-op (entry deleted at zero, so no negative counts). `getAssetRefCount` reads the live count.
- **In-flight dedup, retry, and the mid-flight-release race** — concurrent acquires share one `loadPromise`; a load whose entry was released before settling disposes the orphaned value in its own continuation. A rejected attempt removes its entry so a later acquire retries instead of sharing a poisoned promise. Both races are explicitly tested.
- **Open per-type adapter registry** — `registerAssetLoader(library, type, adapter)`, last-write-wins, `AssetType` an open `(string & {})` union with seeded vocabulary; deps are `loader` + `signals` + `types` only, exactly per the charter Boundary.
- **Plain-data catalog** — `registerAssetDescriptor` records id→descriptor and reconciles its zero-or-more group tags; `registerAssetManifest` composes the atom over in-hand data without performing I/O. Re-recording an inactive id overwrites; changing an acquired/in-flight descriptor is rejected.
- **Group preload over the loader** — `loadAssetGroup` schedules non-resident members through a fresh `@flighthq/loader` instance (bounded concurrency), holds one group reference per member (resident members acquired directly without a redundant load), forwards aggregate progress to an optional `AssetGroupLoadOptions.progress` signal, and disposes the loader on completion. It observes item promises before dispatch, settles the full batch, and rejects on failure while retaining successful members. `releaseAssetGroup` mirrors the successful per-member acquires.
- **Misuse sentinels** — `acquireAsset` returns a rejected promise (async sentinel, not a throw) for a missing descriptor or unregistered adapter, with the exact fixing call named in the message.
- Tests: 22 `it` blocks in `assetLibrary.test.ts` covering every export, dedup/retry, the release-mid-flight race, group progress/failure, catalog replacement, and disposal.

## Gaps

Judged against the charter's north star and a Unity/PIXI-class asset manager:

1. **No cancellation or priority pass-through.** The loader beneath supports priority, pause/resume, and cancellation (the charter Boundary names them), but `AssetGroupLoadOptions` exposes only `progress`. An in-progress group preload cannot be aborted.
2. **Diagnostics inversion not yet applied.** The rejection messages in `acquireAsset` are inline caller-facing guidance; the status log itself flags the deferred `enable*Guards` move. There is also no `explain*` query for the silent sentinels (`getAsset` null, refcount 0) — e.g. an `explainAssetLoad(library, id)` returning descriptor/adapter/residency state as plain data.
3. **No leak/teardown introspection** — nothing enumerates resident assets or still-held ids (`getAssetIds`, group membership queries), which a shutdown or debug pass would want.
4. **The deferred charter tier** — LRU size-budget cache at refcount zero, asset dependency graph, hot reload, and the thin per-resource adapter opt-in packages (all already recorded as charter Open directions / status deferrals).

## Charter contradictions

None found. The three 2026-07-10 Decisions (refcount ownership, open registry, plain-data manifest) are implemented exactly as recorded; deps match the Boundary precisely.

## Contract & docs fit

- Names fully qualified (`acquireAsset`/`releaseAsset`/`getAssetRefCount`…), acquire/release bracket used per convention, sentinels not throws (async-reject documented as the async sentinel), `Readonly<>` on parameters, module state on the entity (no module globals), single root export, `sideEffects: false`, header types in `@flighthq/types` first. Every export has a colocated `describe`.
- Package Map line in `agents/index.md` matches the built surface. No stale docs found.
- `crate: flighthq-assets` reserved in the charter; no Rust source yet (expected).

## Candidate open directions

1. **Group load control** — expose the loader's priority/cancellation through `AssetGroupLoadOptions`, or keep groups deliberately minimal and tell power users to drive `@flighthq/loader` directly?
