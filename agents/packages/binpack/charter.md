---
package: '@flighthq/binpack'
crate: flighthq-binpack
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# binpack — Charter

## What it is

`@flighthq/binpack` is the **2D rectangle bin-packing cell** — given a set of sized rectangles, it places them without overlap into a bin and reports each placement, the bin extent used, and anything that didn't fit. It is the general geometry primitive underneath texture-atlas building, sprite-sheet layout, tileset assembly, and UI/grid packing — decoupled from all of them (deps `geometry` + `types` only), so each composes over the same packer instead of reimplementing it.

It was the register's `atlas-packer`, renamed and generalized (2026-07-10): the algorithm is bin packing, not atlases; a `@flighthq/textureatlas-packer` neighbor composes this + `@flighthq/textureatlas` for the atlas-specific layer.

## North star

The complete rectangle-packing toolkit: a strong heuristic packer (MaxRects family — best-area / best-short-side-fit) with padding/border, optional power-of-two and square constraints, optional 90° rotation, and either a fixed bin (overflow reported as unpacked) or a growable bin that expands to fit — all as small `out`-friendly functions on plain-data rectangles, allocation-conscious for packing hundreds of rects.

## Boundaries

- **Depends on `@flighthq/geometry` (Rectangle) + `@flighthq/types`.** No image pixels, no atlas, no display. It computes *where* rectangles go; it does not read or composite any bitmap — the caller (or a `textureatlas-packer` neighbor) blits sub-images into the packed layout via `@flighthq/surface`.
- **Layout, not compositing or resources.** Input is `{ id, width, height }`; output is placements `{ id, x, y, width, height, rotated }` + the used bin size + `unpacked` ids. Turning that into a `TextureAtlas`/`Tileset` or drawing the pixels is the consumer's job.
- **Offline/build-time packing.** It's a one-shot layout solver, not an incremental runtime allocator (a dynamic add/remove atlas allocator is a separate future concern).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] General bin-packer, `binpack` (no dash), decoupled.** User-directed 2026-07-10: the register's `atlas-packer` is renamed `@flighthq/binpack` and scoped to the general algorithm, not textures. The atlas-specific layer is a separate `@flighthq/textureatlas-packer` neighbor over the top (its dash is correct — it *is* a `textureatlas` subpackage). Follows the no-dash-first-level rule; `binpack` is the standard algorithm term.
- **[2026-07-10] MaxRects-family heuristic, one-shot `packRectangles`.** `packRectangles(rects, options?): PackResult` where `PackResult = { placements: PackedRectangle[]; width; height; unpacked: RectangleId[] }`. Options: `maxWidth`/`maxHeight` (bin cap), `padding` (between rects) + `border` (bin edge), `powerOfTwo`, `square`, `allowRotation` (90°), `growable` (grow the bin up to the cap to fit everything; when not growable, overflow → `unpacked`). Deterministic for a given input+options (stable sort of inputs by area/height before placing).
- **[2026-07-10] Plain-data rectangles + ids in `@flighthq/types`.** `PackableRectangle` (`{ id; width; height }`), `PackedRectangle` (`{ id; x; y; width; height; rotated }`), `PackResult`, and `BinPackOptions` in the header; functions carry the `Rectangles`/`Bin` names.

## Open directions

1. **`@flighthq/textureatlas-packer` neighbor.** The atlas-specific layer: take image sources, pack via `binpack`, composite into an atlas bitmap (`@flighthq/surface`), and emit a `TextureAtlas` with named regions/UVs. The register's original "atlas-packer" intent, built as a composition over this bedrock.
2. **Alternate heuristics + skyline/guillotine backends.** A pluggable placement strategy (skyline, guillotine) selectable by workload, behind the same `packRectangles` vocabulary.
3. **Incremental/online allocator.** A runtime atlas allocator supporting add/free of rectangles over time (dynamic glyph/texture atlases), distinct from this one-shot solver.
