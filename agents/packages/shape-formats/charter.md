---
package: '@flighthq/shape-formats'
crate: flighthq-shape-formats
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shape-formats — Charter

## What it is

`@flighthq/shape-formats` is a **neighbor package** of `@flighthq/shape` for shape serialization/deserialization formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core shape package.

Blessed as a new package during the shape direction session (2026-07-02). Directed 2026-07-09 (first-build = native command-stream JSON).

## North star

The tree-shakable codec neighbor of `@flighthq/shape`: persist and restore a `Shape`'s full drawing-command stream (fills, gradients, line styles, path segments) without the core shape package carrying serialization weight. The native format is **lossless** — `Shape` → JSON → `Shape` reproduces the command stream exactly (bitmap-fill resources excepted; see Decisions). Standard/lossy interchange formats (SVG export) follow as separate modules.

## Boundaries

- **Codec only.** Turns a `Shape`'s command stream into a format string and back, using the `@flighthq/shape` command builders (`appendShape*`) and command iteration. It owns no drawing, tessellation, hit-testing, or rendering — that is `@flighthq/shape` and the renderers.
- **Depends on `@flighthq/shape` + `@flighthq/types`.** No DOM, no renderer.
- **Formats are independently tree-shakable** — each format's `format*`/`parse*` pair is its own module.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-09] First-build format = native command-stream JSON.** `formatShapeJson(shape, options?): string` and `parseShapeJson(text, options?): Shape | null`. Serializes the `ShapeCommandRegistry` command buffer as an array of `{ key, args }` entries; `Matrix` args serialize as their `{a,b,c,d,tx,ty}` fields; string-enum args (gradient type, spread/interpolation method, caps/joints/scale mode, winding) serialize verbatim; path commands (`appendShapePath`) serialize their numeric `commands`/`pathData` arrays directly. Round-trip is lossless for all non-bitmap commands.
  **Why:** a `Shape` is the Flash Graphics command model, which has no single canonical text format the way an SVG `d` string is canonical for a `Path`; the lossless native form is the honest, immediately-useful default (scene persistence, copy/paste). SVG export is a separate, lossy format that follows.
- **[2026-07-09] `format*`/`parse*` naming** (matching `formatSurfaceFingerprint`/`parseSurfaceFingerprint` and `path-formats`), keyed by the format (`*ShapeJson`). Parse returns a sentinel `null` on malformed/unknown-command input.
- **[2026-07-09] `beginBitmapFill` resources serialize as a reference, resolved on parse via an optional resolver.** The `ImageResource` in a `beginBitmapFill` command is a live runtime resource, not JSON data. It serializes as a stable reference field; `parseShapeJson(text, { resolveBitmap })` rehydrates it via the caller's resolver, and without a resolver the bitmap fill is dropped (documented). Everything else round-trips losslessly.
  **Why:** honestly names the one place the "lossless" claim needs a caller-supplied seam, rather than silently corrupting or embedding un-serializable resource state.

## Open directions (deferred)

1. **SVG export** — `formatShapeSvg` (Shape → `<path>`/`<g>` with fills/strokes/gradient defs) and SVG import; a standard, viewable, lossy interchange, meatier than the native form.
2. **Path-formats interplay.** A shape's path geometry could optionally emit via `@flighthq/path-formats` (SVG `d`) inside an SVG export; native JSON keeps the numeric path arrays directly and needs no such bridge.
