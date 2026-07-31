---
package: '@flighthq/shape-formats'
updated: 2026-07-30
---

## 2026-07-30 — the parser now rejects what it used to silently corrupt (builder)

`parseShapeJson` documented that it returns `null` for "a malformed argument", but it only ever validated that an entry *looked* like a command and then spread whatever it found into the appender. Probed before fixing; every one of these built a `Shape` rather than returning the sentinel:

- `{"key":"moveTo","args":[]}` — required parameters left undefined, written straight into the command buffer.
- `{"key":"moveTo","args":["x","y"]}` — strings in numeric slots.
- `{"key":"moveTo","args":[1,2,3,4]}` — extra arguments dropped without complaint.
- A `NaN` coordinate — JSON has no NaN literal, so it serializes as `null`, and `null` was accepted as an argument. The shape came back with a null coordinate where a number belonged.
- `1e999` — parses back as `Infinity`, accepted into the buffer.

Fixed with a table-driven spec mirroring the `appendShape*` signatures one-for-one, taken from `npm run api` rather than inferred. Arity is a range: `required` counts the leading parameters with no default, so a hand-written document may omit trailing optional args and let the appenders' own defaults apply, while the serializer's full-arity output uses the upper bound.

The two tables are self-checking rather than checked by a bespoke test. `isValidShapeCommandArgs` treats a missing spec as invalid, so a key that gained an appender without a spec makes its own command unparseable — and the full-vocabulary round-trip test fails immediately. Verified by mutation: deleting the `drawCircle` spec fails the round-trip and the consistency test, and nothing else.

**The non-finite asymmetry is deliberate.** `formatShapeJson` still writes `null` for a non-finite coordinate — `JSON.stringify` gives no other option — so a shape containing `NaN` now produces a document that will not parse back. That is the honest failure: the alternative is restoring a shape whose geometry silently differs from the one serialized. The `formatShapeJson` comment claimed the round-trip was lossless; it now states the exception.

Round-trip coverage extended to the full non-texture vocabulary (`drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, both `drawTriangles` forms, `lineGradientStyle`), which is what makes the consistency property above hold for every command rather than the nine it used to cover. Texture commands still *drop* rather than reject on an unresolved reference — a missing asset is not a malformed document, and that distinction predates this work.

14 → 28 tests. Three mutations, each confirmed applied: removing the validation call fails 9 tests, removing one spec entry fails 2, allowing non-finite numbers fails 1 (the `Infinity` case — the NaN-as-`null` case is caught by the type check instead, which is the correct split). One test I wrote was replaced before landing: it claimed to check that both tables share a key set, but would have passed for a key with no spec at all.

# shape-formats — Status

Direction session held and package built on 2026-07-09 (see charter Decisions). First implementation shipped: native command-stream JSON.

## Shape

Package `@flighthq/shape-formats` depends on `@flighthq/shape` + `@flighthq/types` (+ `@flighthq/geometry` for `createMatrix` when rehydrating fill matrices — `geometry` is already in any shape consumer's tree via `@flighthq/shape`, so no extra bundle weight).

Two exported functions in `shapeJson.ts`:

- `formatShapeJson(shape: Readonly<Shape>, options?: { space? }): string` — iterates the public `shape.data.commands` flat buffer (`[key, argCount, ...args]` triples; there is no dedicated public command iterator, so the buffer layout is read directly, mirroring `getShapeCommandCount`/`computeShapeLocalBoundsRectangle` in `@flighthq/shape`) and emits `{ shapeFormat: 1, commands: [{ key, args }] }`. Args serialize by JS type: numbers/strings/booleans/numeric arrays and `null` verbatim; `Matrix` → `{a,b,c,d,tx,ty}`; a live `ImageResource` → an ordinal `{ bitmap: { index } }` reference. `options.space` pretty-prints.
- `parseShapeJson(text: string, options?: { resolveTexture? }): Shape | null` — rebuilds a fresh `Shape` by replaying each entry through a `key → appendShape*` table. Reconstructs each arg structurally (matrix object → `createMatrix`, texture ref → `resolveTexture`). Sentinel `null` on malformed JSON, missing/mismatched `shapeFormat`, non-array `commands`, malformed entry/arg, or unknown command key.

Exported types: `ShapeTextureReference` (`{ index }`), `ShapeJsonFormatOptions`, `ShapeJsonParseOptions`.

**Texture reference:** a `Texture` has no stable serializable id, so the reference is the zero-based ordinal of the texture-bearing command within the shape, assigned in command order during format. The caller maps ordinal → texture via `resolveTexture`. Without a resolver (or when it returns `null`), the `beginTextureFill`/`lineTextureStyle` command is dropped and the rest parses intact — the one documented place the "lossless" claim needs a caller-supplied seam.

**Matrix vs bitmap discrimination on serialize:** the only two object-typed args across the entire `ShapeCommandRegistry` are `Matrix | null` and `ImageResource`, so a non-null object is a matrix iff it has numeric `a,b,c,d,tx,ty` fields; otherwise it is the bitmap. Documented inline.

2 source files (`shapeJson.ts` + colocated test, 14 tests). `packages:check` (103 packages), `typecheck`, `exports:check` (100%), `order:check`, `api:check`, and the package tests all green.

## Next

Deferred per charter Open directions:

- **SVG export** — `formatShapeSvg`/SVG import: Shape → `<path>`/`<g>` with fills/strokes/gradient defs; a standard, viewable, lossy interchange, meatier than the native form.
- **Path-formats interplay** — an SVG export could emit path geometry via `@flighthq/path-formats` (`d` strings); native JSON keeps numeric path arrays directly and needs no bridge.
