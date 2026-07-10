---
package: '@flighthq/assets'
updated: 2026-07-10
---

# assets — Status Log

> Append-only continuity log, newest on top.

## 2026-07-10 — first build

Built the first-build scope per charter: `AssetLibrary` entity (no module globals), refcount `acquireAsset`/`releaseAsset` with deterministic free at count zero, in-flight dedup, `getAsset`/`getAssetRefCount`, open `registerAssetLoader` registry (type-agnostic — deps `loader`+`signals`+`types` only, no resource package), plain-data `loadAssetManifest`, and `loadAssetGroup`/`releaseAssetGroup` batched through `@flighthq/loader` with progress. 16 tests. Open directions deferred: LRU size-budget cache at refcount-zero, asset dependency graph, hot reload, per-resource adapter opt-in packages, and moving inline misuse-error guidance into an `enable*Guards` module.
