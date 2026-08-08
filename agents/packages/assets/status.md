---
package: '@flighthq/assets'
updated: 2026-08-08
by: principal
---

# assets — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/assets/src/` and `packages/types/src/Assets.ts` on 2026-08-08. The
package is four source files and every first-build deferral that was actionable has landed, so what
remains is chartered scope with no source behind it.

- **No LRU size-budget cache.** `releaseAsset` disposes and drops at count zero
  (`assetLibrary.ts:254`); there is no `setAssetBudget`, no eviction, and no byte accounting anywhere
  in the package. Charter Open direction 1 — it changes what "free" means at count zero, not the
  refcount core.
- **No asset dependency graph.** `AssetDescriptor` is `{ id; url; type; groups? }`
  (`packages/types/src/Assets.ts:28-33`) with no dependency field, so a spritesheet that needs its
  atlas image cannot declare it and transitive refcounting does not exist. Charter Open direction 2.
- **No hot reload.** Nothing watches, re-acquires, or emits a change signal to holders; the only
  signal wiring in the package is `loadAssetGroup`'s progress/completion relay from
  `@flighthq/loader` (`assetLibrary.ts:157-180`). Charter Open direction 3.
- **The loader registry ships empty and nothing in the repo fills it.** By design the library depends
  on `loader` + `signals` + `types` only and supplies no loaders (`packages/types/src/Assets.ts:42`),
  but the "thin per-resource adapters as separately-importable opt-ins" the charter Boundaries allow
  do not exist either — no `assets-*` package, and no `registerAssetLoader` call outside this
  package's own tests. Every consumer must hand-write an adapter for `image`/`font`/`audio`.
- **Manifest I/O is still absent by name.** The 2026-07-22 decision reserves
  `loadAssetManifestFromUrl` above a format parser; no such export exists. In-hand data goes through
  `registerAssetDescriptor` / `registerAssetManifest` (`assetLibrary.ts:193`, `:234`).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. One carried deferral checked out
  **false** and was deleted: "moving inline misuse-error guidance into an `enable*Guards` module" is
  done — `enableAssetGuards.ts:17` installs a per-library hook through the
  `setAssetAcquireGuard` seam (`assetLibrary.ts:274`), with `explainAssetLoad.ts:5` as the plain-data
  query, and both are in `contract.ts`. The remaining three deferrals (LRU budget, dependency graph,
  hot reload) were re-verified as genuinely unbuilt and restated above against the charter.
- **2026-07-22** — Explicit catalog registration replaced the synchronous `loadAssetManifest`
  misnomer with `registerAssetDescriptor` + `registerAssetManifest`; descriptors carry multiple group
  tags, replacement reconciles stale membership, live descriptor mutation is rejected, and a failed
  acquire drops its cache entry so a later acquire retries. `loadAssetGroup` attaches handlers before
  dispatch, settles the whole batch, then rejects on member failure without releasing the members
  that succeeded.
- **2026-07-10** — First build: the `AssetLibrary` entity with no module globals, refcount
  `acquireAsset`/`releaseAsset` with deterministic free at zero, in-flight dedup, synchronous
  `getAsset`/`getAssetRefCount`, the open `registerAssetLoader` registry, and
  `loadAssetGroup`/`releaseAssetGroup` batched through `@flighthq/loader` with aggregate progress.
