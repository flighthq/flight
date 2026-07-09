---
package: '@flighthq/shape-formats'
updated: 2026-07-09
---

# shape-formats — Status

Direction session held and package built on 2026-07-09 (see charter Decisions). First implementation shipped: native command-stream JSON.

## Shape

Package `@flighthq/shape-formats` depends on `@flighthq/shape` + `@flighthq/types` (+ `@flighthq/geometry` for `createMatrix` when rehydrating fill matrices — `geometry` is already in any shape consumer's tree via `@flighthq/shape`, so no extra bundle weight).

Two exported functions in `shapeJson.ts`:

- `formatShapeJson(shape: Readonly<Shape>, options?: { space? }): string` — iterates the public `shape.data.commands` flat buffer (`[key, argCount, ...args]` triples; there is no dedicated public command iterator, so the buffer layout is read directly, mirroring `getShapeCommandCount`/`computeShapeLocalBoundsRectangle` in `@flighthq/shape`) and emits `{ shapeFormat: 1, commands: [{ key, args }] }`. Args serialize by JS type: numbers/strings/booleans/numeric arrays and `null` verbatim; `Matrix` → `{a,b,c,d,tx,ty}`; a live `ImageResource` → an ordinal `{ bitmap: { index } }` reference. `options.space` pretty-prints.
- `parseShapeJson(text: string, options?: { resolveBitmap? }): Shape | null` — rebuilds a fresh `Shape` by replaying each entry through a `key → appendShape*` table. Reconstructs each arg structurally (matrix object → `createMatrix`, bitmap ref → `resolveBitmap`). Sentinel `null` on malformed JSON, missing/mismatched `shapeFormat`, non-array `commands`, malformed entry/arg, or unknown command key.

Exported types: `ShapeBitmapReference` (`{ index }`), `ShapeJsonFormatOptions`, `ShapeJsonParseOptions`.

**Bitmap reference:** an `ImageResource` (extends `Entity`) has no stable serializable id, so the reference is the zero-based ordinal of the bitmap-bearing command within the shape, assigned in command order during format. The caller maps ordinal → resource via `resolveBitmap`. Without a resolver (or when it returns `null`), the `beginBitmapFill`/`lineBitmapStyle` command is dropped and the rest parses intact — the one documented place the "lossless" claim needs a caller-supplied seam.

**Matrix vs bitmap discrimination on serialize:** the only two object-typed args across the entire `ShapeCommandRegistry` are `Matrix | null` and `ImageResource`, so a non-null object is a matrix iff it has numeric `a,b,c,d,tx,ty` fields; otherwise it is the bitmap. Documented inline.

2 source files (`shapeJson.ts` + colocated test, 14 tests). `packages:check` (103 packages), `typecheck`, `exports:check` (100%), `order:check`, `api:check`, and the package tests all green.

## Next

Deferred per charter Open directions:

- **SVG export** — `formatShapeSvg`/SVG import: Shape → `<path>`/`<g>` with fills/strokes/gradient defs; a standard, viewable, lossy interchange, meatier than the native form.
- **Path-formats interplay** — an SVG export could emit path geometry via `@flighthq/path-formats` (`d` strings); native JSON keeps numeric path arrays directly and needs no bridge.
