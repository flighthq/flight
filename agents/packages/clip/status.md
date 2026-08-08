---
package: '@flighthq/clip'
updated: 2026-08-08
by: principal
---

# clip — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/clip/src/` and `packages/types/src/ClipRegion.ts`
on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Composition is bounds-arithmetic, not boolean algebra.** `intersectClipRegions` keeps whichever
  input has more sub-paths and intersects the two bounding rects (`clipRegion.ts:232-238`);
  `unionClipRegions` does the same over `mergeRectangle` (`:451-455`). No `subtractClipRegions` or
  `xorClipRegions` exists. **The kernel this was waiting on now exists** — `@flighthq/path-boolean`
  ships a Martinez implementation (`packages/path-boolean/src/martinezKernel.ts`,
  `booleanPaths.ts`) — and `clip` does not import it: `clipRegion.ts:12-18` reaches only for
  `@flighthq/path/contract`. Whether `clip` should depend on `path-boolean` is a boundary ruling,
  not effort.
- **Two of the three queries ignore `contours` entirely.** `clipRegionContainsRectangle`
  (`clipRegion.ts:58`) and `clipRegionIntersectsRectangle` (`:64`) answer from `clip.rect` alone, so
  a concave or holed region reports containment/overlap it does not have. Only
  `clipRegionContainsPoint` is contour-exact (`:52`, via the winding ray-cast at `:476`). The
  conservatism is a doc comment, not a queryable fact: there is no `explain*` and no
  `isClipRegionConservative`-style seam.
- **`normalizeClipRegion` recognizes exactly one shape.** A single contour of exactly 8 coordinates
  (`clipRegion.ts:283`). A 4-point quad split across two contours, or an axis-aligned octagon, stays
  on the stencil path even though a scissor would serve.
- **Contours are `number[][]`** (`packages/types/src/ClipRegion.ts:21`), so `transformClipRegion`
  allocates a fresh nested array per contour per call (`clipRegion.ts:408-419`) and every backend
  re-packs to upload. Moving to flat `Float32Array` is a breaking `types` change touching all four
  backends.
- **No winding ownership.** There is no `getClipRegionWinding`, no evenOdd↔nonZero conversion, and no
  winding-normalizing constructor; `contract.ts` covers `clipRegion.ts` + `enableClipGuards.ts` only.
  Correctness lives in each backend's stencil accumulation.
- **The public lane omits four exports that callers need.** `index.ts` lists 22 names and leaves out
  `invalidateClipRegion`, `enableClipGuards`, `disableClipGuards`, and `setClipRegionReleaseGuard` —
  yet `ClipRegion.ts:15` tells the reader to bump version "see `invalidateClipRegion`", and roughly
  twenty packages (`scene2d-canvas`, `scene2d-dom`, `interaction`, `textureatlas`, …) do export their
  `enable*Guards` from `.`. An app on the app boundary can build a region and mutate it but cannot
  invalidate it or turn on the double-release guard.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline deferral checked out
  **false**: "no boolean kernel exists anywhere" is dead — `@flighthq/path-boolean` ships
  `martinezKernel.ts` plus `booleanPaths`/`offsetPath`/`simplifyPath`, so the Gold algebra is a
  wiring-and-boundary question, not new geometry. Also dropped: "functional test deferred" (
  `functional/scenes/scene2d-clip-rect.ts` and `scene2d-clip-contour.ts` exist, plus two HDR
  variants), and the Rust-crate item (no `Cargo.toml` anywhere in this repo — not a `clip` gap).
  `enableClipGuards` and `setClipRegionReleaseGuard` landed since the last entry and are recorded
  above as a lane question rather than a missing guard.
- **2026-06-25** — `createClipRegionFromContours` deep-copies its input, matching the rest of the
  `create*` family; `package.json` description reframed from product to operations library.
- **2026-06-24** — Bronze/Silver/Gold surface built out in `clipRegion.ts`: composition, queries,
  transform, the `create*From{Path,Rectangle,RoundedRectangle,Ellipse,Circle,Contours}` set,
  `normalizeClipRegion`, and the `acquireClipRegion`/`releaseClipRegion` pool bracket.
