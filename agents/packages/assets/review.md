---
package: '@flighthq/assets'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# assets — Review

**Verdict:** solid — 68/100. The blessed 2026-07-10 first-build scope is fully delivered, cleanly and with real test depth; what separates it from the charter's "AAA asset pipeline" north star is the deferred tier (LRU, dependency graph, hot reload) plus a handful of within-package operational gaps around group loading and diagnostics.

## Present capabilities

All in `packages/assets/src/assetLibrary.ts` (one source file + `index.ts` barrel), types header-first in `packages/types/src/Assets.ts`:

- **Entity, no globals** — `createAssetLibrary()` returns an `AssetLibrary` whose state lives entirely on an opaque `AssetLibraryRuntime` (adapters/descriptors/entries/groups maps). `disposeAssetLibrary` disposes every resident asset through its adapter and empties all four maps.
- **Refcounted ownership with deterministic free** — `acquireAsset(library, id)` increments and resolves; `releaseAsset` decrements and disposes-immediately-at-zero via the registered adapter (`disposeAssetEntry`). Release of an unheld id is a no-op (entry deleted at zero, so no negative counts). `getAssetRefCount` reads the live count.
- **In-flight dedup and the mid-flight-release race** — concurrent acquires share one `loadPromise`; a load whose entry was released (or replaced) before settling disposes the orphaned value in its own continuation (`runtime.entries.get(id) !== entry || entry.refcount <= 0` check in `acquireAsset`). This race is explicitly tested.
- **Open per-type adapter registry** — `registerAssetLoader(library, type, adapter)`, last-write-wins, `AssetType` an open `(string & {})` union with seeded vocabulary; deps are `loader` + `signals` + `types` only, exactly per the charter Boundary.
- **Plain-data manifest** — `loadAssetManifest` records id→descriptor and group membership (dedup via `members.includes`); re-recording overwrites.
- **Group preload over the loader** — `loadAssetGroup` schedules non-resident members through a fresh `@flighthq/loader` instance (bounded concurrency), holds one group reference per member (resident members acquired directly without a redundant load), forwards aggregate progress to an optional `AssetGroupLoadOptions.progress` signal, and disposes the loader on completion. `releaseAssetGroup` mirrors the per-member acquire.
- **Misuse sentinels** — `acquireAsset` returns a rejected promise (async sentinel, not a throw) for a missing descriptor or unregistered adapter, with the exact fixing call named in the message.
- Tests: 16 `it` blocks in `assetLibrary.test.ts` covering every export, dedup, the release-mid-flight race, group progress, and disposal.

## Gaps

Judged against the charter's north star and a Unity/PIXI-class asset manager:

1. **Group load reports no failures.** `loadAssetGroup` resolves once the loader completes regardless of member outcomes; a member whose adapter load rejected (or whose type has no adapter) is silently absent afterwards. A mature preloader surfaces which ids failed (an aggregate result or error list).
2. **No cancellation or priority pass-through.** The loader beneath supports priority, pause/resume, and cancellation (the charter Boundary names them), but `AssetGroupLoadOptions` exposes only `progress`. An in-progress group preload cannot be aborted.
3. **Diagnostics inversion not yet applied.** The rejection messages in `acquireAsset` are inline caller-facing guidance; the status log itself flags the deferred `enable*Guards` move. There is also no `explain*` query for the silent sentinels (`getAsset` null, refcount 0) — e.g. an `explainAssetLoad(library, id)` returning descriptor/adapter/residency state as plain data.
4. **No leak/teardown introspection** — nothing enumerates resident assets or still-held ids (`getAssetIds`, group membership queries), which a shutdown or debug pass would want.
5. **The deferred charter tier** — LRU size-budget cache at refcount zero, asset dependency graph, hot reload, and the thin per-resource adapter opt-in packages (all already recorded as charter Open directions / status deferrals).
6. **Retry policy** — a transient network failure permanently poisons nothing (the entry's rejected `loadPromise` is shared by later acquires while the entry survives at refcount ≥ 1; a rejected load never sets `resident`, and the failed entry is only cleared when refcount hits zero). A re-acquire-after-failure story is undesigned.

## Charter contradictions

None found. The three 2026-07-10 Decisions (refcount ownership, open registry, plain-data manifest) are implemented exactly as recorded; deps match the Boundary precisely.

## Contract & docs fit

- Names fully qualified (`acquireAsset`/`releaseAsset`/`getAssetRefCount`…), acquire/release bracket used per convention, sentinels not throws (async-reject documented as the async sentinel), `Readonly<>` on parameters, module state on the entity (no module globals), single root export, `sideEffects: false`, header types in `@flighthq/types` first. Every export has a colocated `describe`.
- Package Map line in `agents/index.md` matches the built surface. No stale docs found.
- `crate: flighthq-assets` reserved in the charter; no Rust source yet (expected).

## Candidate open directions

1. **Group load failure contract** — should `loadAssetGroup` reject, resolve with a result summary (`{ loaded, failed: id[] }`), or emit a failure signal? Plain-data result seems most Flight-shaped; needs a call.
2. **Group load control** — expose the loader's priority/cancellation through `AssetGroupLoadOptions`, or keep groups deliberately minimal and tell power users to drive `@flighthq/loader` directly?
3. **Failed-load retry semantics** — is a rejected load permanently cached per entry lifetime, or should a later `acquireAsset` retry once the shared rejection has been observed?
