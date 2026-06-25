---
package: '@flighthq/resources'
updated: 2026-06-25
basedOn: ./review.md
---

# resources — Assessment (merge gate: integration-b2824e3d8)

> Recommendation layer over `review.md`. Reasoned over the **delta** (head vs the approved `origin/main` base `eb73c3d74`). Sorts the merge-gate findings into sweep-safe `Recommended` (within `@flighthq/resources` only) and parked `Backlog`. `Approved` is the user's verbal gate — left empty. Design/cross-package forks route to the charter's Open directions, not into Recommended. See ../CONTRACT.md.
>
> Governing context: the merge is **blocked** by one defect — the resources implementation references `TextureAtlasRegion`/`Tileset` fields that the head bundle never added to `@flighthq/types`, so the delta does not typecheck. The fix is small but **crosses into `@flighthq/types`**, so it is not a within-`resources` sweep; it is a merge directive carried in `outgoing/integration/resources.md` and tracked in Backlog here.

## Recommended (sweep-safe, within-package, non-design)

Deliberately narrow. The blocker's fix lives in `@flighthq/types` (cross-package), so it is **not** listed here — only items that are correct and self-contained within `@flighthq/resources` under any resolution of the type gap:

- **None that are independently mergeable.** Every within-`resources` change in this delta (atlas-region helpers, tileset `margin`/`spacing`, the byte-size accessors) is downstream of the missing `@flighthq/types` fields and cannot compile until those land. There is no `resources`-only edit that is safe to sweep ahead of the type fix.

## Backlog (parked, with blocking reason)

- **Land the `TextureAtlasRegion` / `Tileset` type fields in `@flighthq/types` (BLOCKER).** Add `name: string | null`, `originalWidth: number | null`, `originalHeight: number | null`, `rotated: boolean`, `sourceX: number`, `sourceY: number`, `trimmed: boolean` to `TextureAtlasRegion` (and its `*Like`), and `margin: number`, `spacing: number` to `Tileset`. _Why parked here:_ the edit is in a different package (`@flighthq/types`), so it is a cross-package merge directive (see `outgoing/integration/resources.md`), not a `resources` sweep. Until it lands the whole delta is uncompilable.
- **Rust conformance mirror.** `flighthq-types` `TextureAtlasRegion`/`Tileset` structs (and the `flighthq-resources` region helpers) must gain the same fields/functions to keep the conformance map honest. _Why parked:_ owned by the Rust worktree, cross-package, and gated on the TS types landing first.
- **`status.md` honesty correction.** The pass-1 claim "fields added to `@flighthq/types`" is false against the head tree. _Why parked:_ a continuity-log correction the integration worker should make when (or instead of) landing the types — administrative, not a code change in `resources`.

## Approved

_None. Approval is the user's verbal gate; this stage never fills it._

## Notes for the charter's Open directions

- **Direction 4 (animation-metadata home) is now partially exercised in code.** `getTextureAtlasRegionSequence` (name-prefix collection) and the `name` field are the name-prefix-convention answer — the delta picks that lane implicitly. The charter should rule whether this convention is the durable home or whether a first-class `animations[]` on `TextureAtlas` supersedes it, since the delta has now committed code to the convention.
- **Direction 5 (per-tile metadata) and the region trim/rotation fields** (`trimmed`, `rotated`, `source*`, `original*`) are the atlas-side analogue of per-tile metadata. They belong in `@flighthq/types` regardless of the eventual subject home — but _which_ subject crate owns them depends on Direction 1 (dissolution into per-subject triads). Settle Direction 1 before treating these fields as permanently homed in `resources`.
- **Direction 1 (dissolution) is unaffected by this delta** but the delta adds more `TextureAtlas` / `Tileset` surface to `resources`, increasing the mis-homed mass the dissolution would have to relocate. No new fork; a data point for the cost of deferring Direction 1.
