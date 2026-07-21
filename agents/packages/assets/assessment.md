---
package: '@flighthq/assets'
updated: 2026-07-21
basedOn: ./review.md
---

# assets — Assessment

## Depth gaps

1. **Add caller-owned residency budgets and eviction.** Reference-count-at-zero disposal is a sound primitive, but a mature asset system also needs byte accounting, LRU/priority eviction, pinned assets, and an explicit trim operation. Avoid a process-global cache.
2. **Add dependency and progressive-load coordination.** Asset graphs should represent scene→mesh→texture dependencies, deduplicate them, cancel orphaned in-flight work, and surface partial residency/progress without making the base `AssetLibrary` eagerly import every resource adapter.
3. **Define the visibility-streaming seam.** A caller supplies demand/priority (visible mesh, desired mip, distance); the library/scheduler resolves and retires work. Texture owns resident levels, while assets owns policy and lifecycle.

## Recommended

Sweep-safe, within `@flighthq/assets`, no design fork:

1. **`explainAssetLoad(library, id)` diagnostic query** — a shakeable plain-data query returning why an id is not resident (no descriptor / no adapter for its type / load in flight / never acquired / freed at zero), per the diagnostics inversion rule; every silent sentinel (`getAsset` null, refcount 0) gets an `explain*`. — review.md gap 3.
2. **`enableAssetGuards` module** — move the inline misuse-guidance strings in `acquireAsset`'s rejections into a separately-importable guard layer emitting through `@flighthq/log` (the status log already flags this deferral); the core keeps terse rejects. — review.md gap 3.
3. **Residency introspection** — `getAssetIds(library)` (or equivalent) enumerating resident/held entries, and a group-membership read (`getAssetGroupIds(library, name)`), so shutdown and debug passes can audit what is still held. Additive queries, no behavior change. — review.md gap 4.
4. **Group-failure test coverage** — add tests pinning the current behavior when a group member's load rejects (group resolves; member absent), so the future failure-contract decision starts from documented behavior. — review.md gap 1 (the *contract change* itself is an Open direction; pinning today's semantics is sweep-safe).

## Backlog

- **Group load failure contract** (`{ loaded, failed }` result vs reject vs signal) — parked: an API-shape decision; surfaced as candidate Open direction 1. — review.md gap 1.
- **Priority/cancellation pass-through on `loadAssetGroup`** — parked on the same fork (how much of the loader surface groups re-expose); candidate Open direction 2. — review.md gap 2.
- **Failed-load retry semantics** — parked: needs a ruling on whether a shared rejected `loadPromise` is retried on later acquire; candidate Open direction 3. — review.md gap 6.
- **LRU size-budget cache at refcount zero** — parked: charter Open direction 1 (phased follow-on by design).
- **Asset dependency graph** — parked: charter Open direction 2; likely touches descriptor shape in `@flighthq/types`.
- **Hot reload** — parked: charter Open direction 3; needs a change-signal design.
- **Per-resource adapter opt-in packages** (image/audio/… adapters) — parked: cross-package; new cells per the triad rules, not in-package work.

## Approved

_Empty — awaiting the user's verbal gate._
