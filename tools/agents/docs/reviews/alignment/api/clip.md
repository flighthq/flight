# API Alignment: @flighthq/clip

**Verdict:** Clean — the three-function `ClipRegion` surface follows the conventions well; the only notes are minor (a mutable return type the caller is meant to own, and an inline `tolerance` magic default).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `createClipRegionFromPath`, `createClipRegionFromRectangle` (return type) | Both return a fully-mutable `ClipRegion` (every field on the `interface ClipRegion` is mutable). The map says default to `Readonly<>` on return types and stored references. Here mutation is partly intended (`invalidateClipRegion` bumps `version`), so a blanket `Readonly` return would be wrong — but `rect`/`contours`/`winding` are not meant to be reassigned by callers. | Acceptable as-is given the "plain data — caller owns it" contract documented on the type. If tightened later, the right move is at the `@flighthq/types` level (e.g. `readonly` on `rect`/`contours`/`winding`, leaving `version` mutable), not at the function signature. Note only. |
| Low | `createClipRegionFromPath` | `tolerance = 0.25` is an inline magic default. Source Style prefers a named loose constant at file bottom so the flattening tolerance is documented and greppable. | Hoist to a named const (e.g. `DEFAULT_CLIP_FLATTEN_TOLERANCE = 0.25`) at the bottom of the file and reference it in the default. Cosmetic. |
| Low | `setRectangleToContoursBounds` (internal helper, not exported) | Out-param helper uses the `out` convention correctly, but the param name `out` for a `Rectangle` is consistent with the codebase; no action. Listed only to confirm it was reviewed (alias-safe: `out` and `contours` are distinct types, inputs read before writes). | None. |

## Clean

- **Full, unabbreviated type word.** All three exports spell out `ClipRegion` in full — `createClipRegionFromPath`, `createClipRegionFromRectangle`, `invalidateClipRegion`. No abbreviation of the type word.
- **Globally unique names.** None of the three collide with any other package root in `npm run api` (the `Clip*` neighbors — `MovieClip`, `Clipboard`, `*ClipRectangle`/`*ClipContours` in the renderers — are distinct concepts and distinct names).
- **Allocation discipline by verb.** `create*` producers allocate (a new `ClipRegion`, with `cloneRectangle`/`flattenPath` doing the copy); `invalidateClipRegion` does not allocate (pure `version` bump). Verb matches behavior.
- **Verb consistency.** `createClipRegionFrom<Source>` is a symmetric producer pair keyed on the source shape; `invalidateClipRegion` deliberately mirrors `invalidateImageResource` (called out in the source comment) so the version-bump idiom is uniform across the SDK.
- **`Readonly<T>` where mutation is not intended.** Inputs `path: Readonly<Path>` and `rectangle: Readonly<Rectangle>` are read-only; `invalidateClipRegion(clip: ClipRegion)` is correctly _not_ `Readonly` because it mutates `version`. Copy-on-build (`cloneRectangle`) is documented so caller edits don't leak into the region.
- **Sentinels vs throw.** No thrown errors and no expected-failure path that needs a sentinel — there is nothing to mis-handle here.
- **Teardown verbs.** No `dispose*`/`destroy*`/`acquire*`/`release*` misuse; the region is plain GC-managed data with nothing to free, so the absence of teardown verbs is correct.
- **`import type` hygiene.** `import type { ClipRegion, Path, Rectangle } from '@flighthq/types'` is on its own dedicated `import type {}` line, separate from the value imports; all cross-package types come from `@flighthq/types`, none defined inline.
- **Parameter-order symmetry & alphabetization.** Both `create*` functions take the source geometry first; exports are alphabetized (`createClipRegionFromPath`, `createClipRegionFromRectangle`, `invalidateClipRegion`) and the test `describe` blocks mirror that order.
