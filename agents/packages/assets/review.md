---
package: '@flighthq/assets'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# assets -- Review

**Verdict:** solid -- 78/100. The first-build core (refcount ownership, dedup, group preload) is clean and well-tested, and every gap the 2026-07-22 review flagged under "diagnostics inversion" and "leak/teardown introspection" has landed. The score moves from 72 because the package now has the full diagnostics layer (`enableAssetGuards`, `explainAssetLoad`, `setAssetAcquireGuard` as the core seam) and residency introspection (`getAssetIds`, `getAssetGroupIds`). What keeps it from the charter's "AAA asset pipeline" north star is the deferred tier (LRU budget, dependency graph, hot reload), the absence of cancellation/priority pass-through on group loads, and the lack of any thin per-resource adapter packages anywhere in the repo.

## Present capabilities

Four source files (325 lines in `assetLibrary.ts`, 36 in `enableAssetGuards.ts`, 29 in `explainAssetLoad.ts`, plus `contract.ts` and `index.ts` barrels) with 32 test cases across three colocated test files. Types header-first in `packages/types/src/Assets.ts` (101 lines, 10 exported types/interfaces).

### Core library (`assetLibrary.ts`)

- **`createAssetLibrary()`** -- returns an `AssetLibrary` whose state lives on an opaque `AssetLibraryRuntime` (adapters, descriptors, entries, groups maps, plus `freedIds` set and nullable `acquireGuard`). No module globals, no singletons.
- **Refcounted ownership with deterministic free** -- `acquireAsset(library, id)` increments refcount and resolves the loaded value; `releaseAsset(library, id)` decrements and immediately disposes at count zero via the registered adapter's `dispose`. Release of an unheld id is a no-op (entry deleted at zero).
- **In-flight dedup, retry-after-failure, mid-flight-release race** -- concurrent acquires share one `loadPromise`; a rejected load drops its cache entry so a later acquire retries; an entry released before its load settles has its value disposed by the load continuation.
- **Open per-type adapter registry** -- `registerAssetLoader(library, type, adapter)`, last-write-wins. `AssetType` is an open `(string & {})` union with seeded vocabulary (`image`, `font`, `audio`, `video`, `textureAtlas`, `tileset`, `spritesheet`). Dependencies are `loader` + `signals` + `log` + `types` only.
- **Plain-data catalog** -- `registerAssetDescriptor` is the atomic catalog mutation; `registerAssetManifest` composes it over in-hand data, preflighting acquired-replacement violations before mutating. Descriptors are copied on registration (caller mutation cannot corrupt the catalog). Group tags are reconciled on replacement.
- **Group preload** -- `loadAssetGroup(library, name, options?)` schedules non-resident members through a fresh `@flighthq/loader` instance (bounded concurrency, default 6), acquires each member (resident ones directly without a redundant load), forwards aggregate progress to an optional `AssetGroupLoadOptions.progress` signal using item counts from `getResourceLoadCounts`, and disposes the loader on completion. Rejects after full settlement when any member fails; successful members remain held for `releaseAssetGroup`. Empty/unknown groups resolve immediately.
- **Residency introspection** -- `getAsset(library, id)` returns the resident value synchronously or `null`; `getAssetRefCount(library, id)` returns the live holder count; `getAssetIds(library)` returns a detached snapshot of held (loading + resident) ids; `getAssetGroupIds(library, name)` returns a detached snapshot of catalog group membership.
- **`disposeAssetLibrary`** -- disposes every resident asset through its adapter, then clears all maps, the freed-id set, and the acquire guard. Leaves the library reusable but empty.

### Diagnostics layer

- **`setAssetAcquireGuard(library, guard)`** (contract-only, not on public lane) -- core seam for the optional acquire-failure hook, keeping the core logger-free.
- **`enableAssetGuards(library)` / `disableAssetGuards(library)` / `areAssetGuardsEnabled(library)`** (`enableAssetGuards.ts`) -- opt-in caller-misuse warnings for `acquireAsset`. Guards emit once-only guidance through `@flighthq/log` for `missing-descriptor` and `missing-loader` failures, naming the fixing call (`registerAssetDescriptor` or `registerAssetLoader`). Per-library isolation: enabling one library does not affect another.
- **`explainAssetLoad(library, id)`** (`explainAssetLoad.ts`) -- plain-data pull diagnostic returning `AssetLoadExplanation` with `status` as `missing-descriptor | missing-loader | never-acquired | loading | resident | freed`, plus `refCount` and `type`. This is the `explain*` query for `getAsset`'s null sentinel and `getAssetRefCount`'s zero sentinel.

### Export lanes

Public lane (`index.ts`): 17 named exports -- all functions from `assetLibrary.ts` except `setAssetAcquireGuard`, plus the three guard functions and `explainAssetLoad`. Contract lane (`contract.ts`): re-exports everything including `setAssetAcquireGuard`. The seam is correctly contract-only so that users go through `enableAssetGuards` while intra-SDK packages can wire the hook directly.

### Tests (32 `it` blocks)

- `assetLibrary.test.ts` (26 tests): `acquireAsset` (4: resolve, dedup, missing-descriptor reject, missing-loader reject), `createAssetLibrary` (1), `disposeAssetLibrary` (1), `getAsset` (1), `getAssetGroupIds` (1), `getAssetIds` (1), `getAssetRefCount` (1), `loadAssetGroup` (3: group progress/concurrency, failure with partial hold, empty group), `registerAssetDescriptor` (3: group copy, replacement reconciliation, acquired replacement rejection + equivalent no-op), `registerAssetLoader` (1: last-write-wins), `registerAssetManifest` (1), `releaseAsset` (4: dispose-at-zero, mid-flight orphan, below-zero no-op, partial release), `releaseAssetGroup` (2: full group release, unknown group no-op), `setAssetAcquireGuard` (1).
- `enableAssetGuards.test.ts` (4 tests): `areAssetGuardsEnabled`, `disableAssetGuards`, `enableAssetGuards` missing-descriptor with log-once, missing-loader with fixing-call message.
- `explainAssetLoad.test.ts` (2 tests): full state-machine walk (missing-descriptor -> missing-loader -> never-acquired -> loading -> resident -> freed), replacement-resets-to-never-acquired.

The mock adapter is well-designed with deferred settling (`flush()`) so tests can observe in-flight state, dedup, and bounded concurrency.

## Gaps

Judged against the charter's "AAA asset pipeline" north star and a Unity/PIXI-class asset manager:

1. **No cancellation or priority pass-through.** The `@flighthq/loader` beneath supports priority, pause/resume, and cancellation (the charter Boundary names these as composed capabilities), but `AssetGroupLoadOptions` exposes only `progress`. An in-progress group preload cannot be aborted, paused, or reprioritized. The internal `ResourceLoader` instance is created and disposed within `loadAssetGroup` with no handle returned.
2. **No `unregisterAssetDescriptor` or `unregisterAssetLoader`.** The catalog is append-only (replacement is supported; removal is not). There is no way to remove a descriptor that is no longer needed or to unregister an adapter for a type. For a long-lived application that transitions between scenes with different asset vocabularies, this is a missing lifecycle verb.
3. **The deferred charter tier.** All three Open directions remain unbuilt:
   - LRU size-budget cache at refcount zero (Open direction 1) -- `releaseAsset` disposes immediately; no `setAssetBudget`, no eviction, no byte accounting.
   - Asset dependency graph (Open direction 2) -- `AssetDescriptor` has no dependency field; transitive refcounting does not exist.
   - Hot reload (Open direction 3) -- nothing watches, re-acquires, or emits a change signal.
4. **No thin per-resource adapter opt-in packages.** The charter Boundaries allow "separately-importable opt-ins" registering the obvious loader for `ImageResource`, etc. None exist anywhere in the repo: no `assets-image`, no `registerAssetImageLoader` convenience. Every consumer must hand-write an `AssetLoaderAdapter` for each resource type.
5. **No `loadAssetManifestFromUrl`.** The 2026-07-22 Decision reserves this name for manifest I/O above a format parser; the export does not exist. The in-hand path (`registerAssetDescriptor` / `registerAssetManifest`) is complete.
6. **`AssetLibrary` is not an Entity.** The codebase-map rule states "Entity is the base type for every SDK object -- `create*` always returns Entity." `AssetLibrary` is `{ runtime: AssetLibraryRuntime }` and does not extend `Entity`. `ResourceLoader` similarly does not extend Entity, so this may be a deliberate pattern for service/container types, but the rule as written makes no exception. Flagged for clarity.

## Charter contradictions

None found. The three 2026-07-10 Decisions (refcount ownership with deterministic free, open per-type loader registry, plain-data manifest) are implemented exactly as recorded. The 2026-07-22 Decision (loading vocabulary, catalog registration) is also implemented faithfully: `load*` is asynchronous, `get*` is synchronous; `registerAssetDescriptor` / `registerAssetManifest` are the catalog atoms; replacement reconciles group membership; a live descriptor cannot change beneath its holders; failed acquires drop their cache entries. Dependencies match the Boundary precisely (`loader` + `signals` + `types`, plus `log` only in the guard module).

## Contract & docs fit

**Adherence:**
- Fully qualified names throughout (`acquireAsset`, `releaseAsset`, `getAssetRefCount`, `registerAssetDescriptor`, etc.).
- Acquire/release bracket used per SDK convention.
- Sentinels not throws: `getAsset` returns `null`, `getAssetRefCount` returns `0`, `acquireAsset` rejects (documented as the async sentinel). `registerAssetDescriptor` and `registerAssetManifest` throw on acquired-descriptor replacement -- this is a programmer error (API misuse), consistent with the "throw only for precondition violations" rule.
- `Readonly<T>` on all parameters and in `explainAssetLoad` return fields.
- No module globals; all state on the library entity.
- Two export lanes (`.` and `./contract`), both correctly configured in `package.json`.
- `"sideEffects": false` declared.
- Types header-first in `@flighthq/types/contract`.
- Every exported function has a colocated `describe` block.
- `describe` blocks are alphabetized within each test file, mirroring exported names.
- Diagnostics follow the inversion rule: core exposes the `setAssetAcquireGuard` seam, `enableAssetGuards` supplies the messages through `@flighthq/log`, and `explainAssetLoad` provides the plain-data query for silent sentinels.

**Candidate revisions:**
- The Package Map in `AGENTS.md` lists `assets` under "Resources" -- accurate and current.
- `crate: flighthq-assets` reserved in the charter; no Rust source yet (expected at this stage).

## Candidate open directions

1. **Entity conformance for service types.** The codebase-map rule "Entity is the base type for every SDK object -- `create*` always returns Entity" applies broadly. Both `AssetLibrary` and `ResourceLoader` skip Entity. Should the rule be narrowed to scene-graph/display objects, or should service types adopt Entity for uid/binding consistency?
2. **Catalog removal verbs.** Should `unregisterAssetDescriptor(library, id)` and `unregisterAssetLoader(library, type)` exist, or is `disposeAssetLibrary` the only cleanup path?
3. **Group load control.** Should `loadAssetGroup` expose the loader's priority/pause/cancellation through `AssetGroupLoadOptions` (or return a handle), or should power users drive `@flighthq/loader` directly? This was also a candidate direction in the prior review and remains open.
