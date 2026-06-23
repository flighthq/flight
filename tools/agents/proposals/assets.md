---
id: assets
title: '@flighthq/assets'
type: new-package
target: assets
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/assets.md
  - tools/agents/docs/reviews/breadth/asset-pipeline.md
  - tools/agents/docs/reviews/breadth/openfl-lime-parity.md
depends_on: []
updated: 2026-06-23
---

## Summary

An id-keyed, content-addressed asset library above `resources`+`loader` — the Lime/OpenFL `Assets`/`AssetLibrary` analogue: load-once dedup by key, reference counting, eviction, multiple libraries, preload-by-group, `getAssetBitmap`/`getAssetSound`/`getAssetText`, and a manifest/bundle loader.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable keystone: one default library, load-once dedup by key, typed getters, async ensure-loaded, and synchronous get-after-load. This is the 20% that closes "two `loadImageResourceFromUrl` calls for the same URL fetch twice" and gives OpenFL apps `Assets.getBitmapData(id)`.

**Types (`@flighthq/types` first):**

- `AssetLibrary.ts` (entity quartet): `AssetLibraryData`, `AssetLibraryRuntime` (the `Map<AssetId, AssetEntry>` registry, in-flight promise map), `AssetLibrary`, `AssetLibraryKind = 'AssetLibrary'`.
- `AssetId.ts`: `type AssetId = string` (the content key — canonically the manifest id, falling back to the URL). `type AssetLibraryId = string`.
- `AssetType.ts`: `AssetTypeKind` open string-kind family — built-ins `'Image'`, `'Sound'`, `'Text'`, `'Bytes'`, `'Font'` (PascalCase values: `AssetImageKind`, etc.), so custom asset types are addable by vendor-prefixed kind without editing a closed union.
- `AssetEntry.ts`: plain descriptor — `{ id: AssetId; type: AssetTypeKind; path: string; referenceCount: number; resource: unknown | null }` (the loaded value is the matching `resources` entity).

**Functions (free, full names, alphabetized):**

- `createAssetLibrary(id?): AssetLibrary` — allocates a library; allocation is explicit. A module-level lazy default library is reachable via `getDefaultAssetLibrary()` (created on first use, not at import — no top-level side effect).
- `registerAssetEntry(library, entry): void` — declare an asset (id, type, path) without loading. Last-write-wins (matches kind-registration philosophy).
- `loadAssetLibrary(library): Promise<void>` — preload every registered entry; dedups in-flight by id.
- `getAssetImageResource(library, id): ImageResource | null` — synchronous get after load; **sentinel `null`** when missing/not-yet-loaded (expected failure, not a throw). Bronze ships the three the reviews named plus bytes: `getAssetImageResource`, `getAssetSoundResource` (→ `AudioResource`), `getAssetText` (→ `string`), `getAssetBytes` (→ `ArrayBuffer`).
- `ensureAssetImageResource(library, id): Promise<ImageResource | null>` — async load-or-return-cached; the load-once dedup point (concurrent callers share one in-flight promise). Siblings: `ensureAssetSoundResource`, `ensureAssetText`, `ensureAssetBytes`.
- `hasAsset(library, id): boolean`, `isAssetLoaded(library, id): boolean`.
- `disposeAssetLibrary(library): void` — detach/release entries to GC (the resources own GPU teardown via their own `destroy*`/render caches; the library only holds references).

**Capabilities:** load-once dedup by id; one default library + explicitly-created extra libraries; typed getters with sentinel returns; declare-then-preload.

---

### Silver

Competitive/solid: reference counting with release, eviction, group preloading with progress signals, the manifest loader, and the backend seam. This is the "daily-driver" Lime `Assets` surface plus the production memory-management edges.

**Types added to `@flighthq/types`:**

- `AssetManifest.ts`: `AssetManifest` (plain data — `{ version: number; entries: readonly AssetManifestEntry[] }`), `AssetManifestEntry` (`{ id; type; path; group?; size?; preload?: boolean }`). Consumed by the core; produced by `assets-formats`.
- `AssetSource.ts` (capability home): `AssetSourceBackend` seam (`resolveAssetUrl(path): string | null`, `loadAssetBytes(path): Promise<ArrayBuffer | null>`), plus `createWebAssetSourceBackend()`.
- `AssetSignals.ts`: `AssetSignals` entity (progress/complete/error) for the opt-in group.
- `AssetEvictionPolicy.ts`: closed finite vocabulary `'Manual' | 'LeastRecentlyUsed' | 'ReferenceCounted'` plus `AssetBudget` (`{ maxBytes?: number; maxCount?: number }`).

**Functions added:**

- `acquireAsset(library, id) / releaseAsset(library, id)` — reference-count bracket (paired like pool `acquire`/`release`); `releaseAsset` drops the count and makes the entry eligible for eviction at zero.
- `loadAssetManifest(library, manifest): Promise<void>` — register all entries from a parsed `AssetManifest`, then preload those marked `preload`.
- `loadAssetGroup(library, group): Promise<void>` and `unloadAssetGroup(library, group): void` — preload-by-group (the Lime "preload set" workflow); `getAssetGroupProgress(library, group): number` for a `0..1` snapshot.
- `setAssetSourceBackend(backend) / getAssetSourceBackend()` — backend seam install.
- `enableAssetSignals(library): AssetSignals` — opt-in signal group (owned here, per the `enable*` rule); fires `onAssetProgress`/`onAssetLoaded`/`onAssetError` and group-complete. Cost assumed only when enabled.
- `evictAsset(library, id): boolean` and `setAssetBudget(library, budget): void` / `enforceAssetBudget(library): void` — manual + budget-driven eviction; `evictAsset` returns `false` (sentinel) when the entry is still referenced.
- `unloadAsset(library, id): void` — drop the loaded resource but keep the registration (re-loadable).
- `getAssetEntry(library, id): Readonly<AssetEntry> | null`, `getAssetLibraryByteSize(library): number`.

**Capabilities:** reference counting + release; LRU/ref-counted/manual eviction under a byte/count budget; group preload/unload with progress; manifest-driven registration; progress/error signals; pluggable source backend (web default, native fill); per-library byte accounting.

---

### Gold

Authoritative/AAA/production: exhaustive type coverage, retry/cancellation propagation, multi-library resolution and overlays, bundle loading, documentation, full test coverage, and Rust-port parity.

**Types:**

- `AssetBundle.ts`: `AssetBundle` (a manifest + a single packed payload — multiple assets in one fetch, the production "bundle" download), with `AssetBundleEntry` carrying byte offset/length into the payload.
- `AssetLoadOptions.ts`: `{ signal?: AbortSignal; retry?: AssetRetryPolicy; priority?: number; concurrency?: number }` threaded into every `ensure*`/`load*` (cancellation + retry/backoff propagated through to the underlying `loader`).
- `AssetResolution.ts`: how multiple libraries resolve an id — overlay/fallback order, so a patch library shadows a base library (`AssetLibraryRegistry` of mounted libraries with priority).

**Functions:**

- Complete typed getter/ensure ladder for every `AssetTypeKind`: `getAssetFontResource`/`ensureAssetFontResource`, `getAssetJson`/`ensureAssetJson<T>` (parsed, typed), `getAssetTextureAtlas`/`getAssetTileset` (bridging to the `resources` atlas/tileset constructors), and the custom-kind escape: `getAssetResource(library, id): unknown | null`.
- `mountAssetLibrary(libraryId, library, priority?) / unmountAssetLibrary(libraryId)` and `resolveAsset(id): AssetEntry | null` — multi-library resolution across the mounted set with overlay precedence (the Lime multi-`AssetLibrary` model).
- `loadAssetBundle(library, bundle): Promise<void>` — single-fetch bundle ingestion, slicing the payload per `AssetBundleEntry` and decoding each via `resources`.
- `getAssetLoadProgress(library): number`, `getAssetGroupNames(library): readonly string[]`, `listLoadedAssets(library): readonly AssetId[]` — full introspection surface.
- `cancelAssetLoad(library, id): boolean` — cancellation via the threaded `AbortSignal`; sentinel `false` when nothing in-flight.
- `cloneAssetLibrary(library): AssetLibrary` — explicit allocation; shares loaded resources by reference (ref-counts bumped).

**Production qualities:**

- **Performance:** `AssetId`-keyed map dispatch; in-flight promise coalescing; LRU eviction is O(1) via an intrusive recency list on the runtime; byte accounting maintained incrementally, never recomputed. Bundle path makes preload one network round-trip.
- **Tested:** one colocated `*.test.ts` per source file; dedup proven (single fetch for N concurrent `ensure*`); ref-count → eviction lifecycle; budget enforcement; group progress arithmetic; backend-seam swap with a fake; alias-safe out-params where present; manifest/bundle ingestion.
- **Documented:** package added to the Package Map in `docs/index.md`; the manifest/bundle format and the `assets`↔`resources`↔`loader` boundary documented in the asset-pipeline review follow-up.
- **Rust parity:** `flighthq-assets` crate with the same function surface (`ensure_asset_image_resource`, `acquire_asset`/`release_asset`, `load_asset_manifest`, `set_asset_source_backend`), `AssetSourceBackend` trait with a `native` `std::fs` default, and conformance-checked against the TS library behavior (dedup, ref-count, eviction order). Recorded in the conformance crate-alignment map.

---

## Boundaries

- **Not a loader, not a decoder.** `assets` owns _policy_ — id-keying, dedup, ref-counting, eviction, groups, manifests. The _mechanism_ of fetching/concurrency stays in `@flighthq/loader`; the _decode_ of bytes into typed entities stays in `@flighthq/resources`. `assets` composes them; it does not duplicate them. If the loader needs retry/backoff/cancellation/progress (the asset-pipeline review's biggest gap), that is grown in `loader`, and `assets` threads `AssetLoadOptions` through — it does not grow its own queue.
- **Returns resources, not display objects.** `getAssetImageResource` returns an `ImageResource`. Composing a `Bitmap` display object is the application layer's job (and stays in `@flighthq/sdk`/examples). `assets` must never import `displayobject` or any renderer, or it stops tree-shaking for data-only consumers.
- **No format parsing in core.** Manifest/bundle _descriptor_ parsing lives in `@flighthq/assets-formats`. The core only consumes the plain `AssetManifest`/`AssetBundle` data types. This keeps the core parser-free.
- **Not the runtime atlas packer, texture-format decoder, image-codec seam, or font-atlas generator.** Those are separate packages the asset-pipeline review names (`atlas-packer`, `texture-formats`, `image-codec`, `font-atlas`); `assets` consumes whatever typed resource they produce but does not own packing, compressed-texture decode, or SDF generation.
- **Not `storage`/SharedObject.** `assets` is read-mostly content delivery (library → resource). Persistent per-app key/value is `@flighthq/storage`. They do not overlap.
- **GPU residency is not duplicated here.** Per-renderer image render caches (`imageRenderCache`, `glRenderCache`, …) already own texture residency. `assets` caches the _CPU-side resource_; eviction here releases the resource reference, and the renderer cache observes its own invalidation.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Default library as ambient singleton vs. always-explicit.** Lime's `Assets` is a global static; Flight forbids top-level mutable shared state. A lazily-created `getDefaultAssetLibrary()` keeps the convenient OpenFL-shaped call while staying import-side-effect-free — is that lazy default acceptable, or should every call site pass an `AssetLibrary` explicitly (more verbose, fully explicit, matching the "spell out allocation" preference)?
- **Key derivation: manifest id vs. content hash.** "Content-addressed" can mean keyed by _declared id_ (Lime style) or by a _hash of the bytes_ (true dedup across different ids pointing at identical content). Bronze uses declared id for simplicity; should Gold add an optional content-hash index so two ids with identical bytes share one resource?
- **Ref-count default for `ensure*`.** Does `ensureAssetImageResource` implicitly `acquire` (so the caller must `release`), or is ref-counting strictly opt-in via separate `acquireAsset`/`releaseAsset`? Implicit acquire matches RAII intuition but creates leak risk in GC-land; explicit brackets are clearer but easier to forget. Affects the Rust port's ownership story directly.
- **Where does `getAssetJson<T>` validation live?** Typed JSON assets are common; should `assets` stay schema-agnostic (parse only) and leave validation to the app, or expose an optional validator hook on the entry?
- **Group vs. tag.** Lime groups are single-membership (an asset belongs to one library/group). Do we want multi-tag membership (an asset in several preload sets) — richer but complicates eviction and progress arithmetic?
- **Bundle format ownership.** Is the packed-bundle binary layout a Flight-native format defined in `assets-formats`, or do we adopt an existing container? This decision gates the Rust bundle reader's conformance target.

## Agent brief

> Create `@flighthq/assets` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
