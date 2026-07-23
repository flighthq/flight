---
package: '@flighthq/assets'
crate: flighthq-assets
draft: false
lastDirection: 2026-07-22
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# assets — Charter

## What it is

`@flighthq/assets` is the **id-keyed asset library** that sits above `@flighthq/loader` (the scheduler) and the per-resource decoders (`image`/`font`/`audio`/`video`/`textureatlas`/`tileset`/`spritesheet`). It is the layer a game or app talks to: "give me the asset `hero.png`," declared once in a manifest, loaded once no matter how many callers ask, reference-counted so it frees when nobody holds it, and preloadable by named group.

It is **type-agnostic** like the loader beneath it: it owns keying, dedup, reference counting, manifests, and group preload, but knows how to load nothing on its own — callers register a loader (and disposer) per asset **type** through an open registry, so `assets` pulls in no resource package and each app pays only for the types it uses.

## North star

The AAA asset pipeline: declare assets in a plain-data manifest (id → url/type/groups), preload a group with aggregate progress, `acquireAsset`/`releaseAsset` with deterministic reference-counted freeing, synchronous `getAsset` for resident assets, and dedup so concurrent and repeat loads share one underlying decode — everything a Unity/PIXI-class asset manager offers, composed from Flight's scheduler + decoders rather than reimplementing them, with explicit ownership rather than hidden GC.

## Boundaries

- **Composes over `@flighthq/loader`** for scheduling (bounded concurrency, priority, pause/resume, cancellation, aggregate progress). Assets does not re-implement the scheduler; a group preload is a loader batch of the group's not-yet-resident items.
- **Type-agnostic via an open registry.** `registerAssetLoader(type, { load, dispose })` binds an asset type to a factory that produces the loader's `() => Promise<T>` and a disposer that frees the resource on refcount-zero. Assets depends on **`loader` + `signals` + `types`** only — never on `image`/`font`/etc. Thin per-resource adapters (registering the obvious loader for an `ImageResource`, etc.) may live as separately-importable opt-ins, not as core deps.
- **Owns keys, refcounts, manifests, groups — not bytes or nodes.** It decodes nothing (that is the resource packages) and holds no display object. Disposal delegates to the registered type's disposer (`dispose*` for GC-managed, `destroy*` for GPU/native — the disposer chooses).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Reference-counted ownership, deterministic free (first build).** `acquireAsset(id): Promise<T>` increments a refcount and resolves the loaded value (loading + decoding on first acquire, sharing the in-flight promise on concurrent acquires — dedup); `releaseAsset(id)` decrements and, **when the count reaches zero, immediately disposes** the resource via its registered disposer and drops it. `getAsset(id): T | null` returns the resident value synchronously or a `null` sentinel. Chosen over an LRU-budget cache for the first build: explicit, deterministic, and matching the SDK's "explicit ownership over GC-reliant patterns" rule. User-directed 2026-07-10.
  **Why:** a shared asset with N holders must not be freed by one holder's release; refcount makes shared ownership correct and the free-point deterministic, without a cache heuristic.
- **[2026-07-10] Open per-type loader registry, type-agnostic core.** `registerAssetLoader(type, adapter)` — last-write-wins, vendor-prefixed custom types — so users add asset types (and unused ones tree-shake) and `assets` never depends on a concrete resource package. Mirrors `loader`'s type-agnostic factory seam.
- **[2026-07-10] Manifest is plain data.** `AssetManifest` is an array of descriptors; no manifest file format is imposed here (JSON/other parsing is a `-formats` neighbor if ever needed).
- **[2026-07-22] Loading vocabulary and catalog registration.** `load*` means asynchronous work and `get*` is synchronous without initiating work. In-hand `AssetDescriptor { id; url; type; groups? }` data is installed through the bedrock `registerAssetDescriptor` and batch `registerAssetManifest`; one asset may tag several groups, replacement fully reconciles membership, and a live descriptor cannot change beneath its holders. A failed acquire drops its cache entry so a later acquire retries. `loadAssetGroup` rejects after the whole batch settles when any member fails, while successful members remain held for `releaseAssetGroup`. Actual manifest I/O, if added, is separately named `loadAssetManifestFromUrl` and lives above a format parser. User-directed 2026-07-22.

## Open directions

1. **LRU size-budget cache (the deferred alternative).** Optionally keep refcount-zero assets in a byte-budgeted LRU pool instead of freeing immediately, so churny load/unload stays fast under bounded memory (`setAssetBudget`). The refcount core is unchanged; this only changes what "free" does at count zero. Phased follow-on.
2. **Asset dependency graph.** An asset that pulls in others (a spritesheet needing its atlas image) — declare and refcount transitive dependencies.
3. **Hot reload.** Re-acquire-on-change during development, emitting a change signal to holders.
