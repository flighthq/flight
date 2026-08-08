---
package: '@flighthq/shape-formats'
updated: 2026-08-08
by: principal
---

# shape-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/shape-formats/src/` on 2026-08-08. The package is small and healthy —
one codec, `shapeJson.ts`, with `formatShapeJson` / `parseShapeJson` and a table-driven arg spec —
so most of what follows is a boundary a reader would otherwise rediscover rather than a defect.

- **The round trip is not closed for non-finite coordinates.** `formatShapeJson` writes `null` for a
  non-finite number because JSON has no other spelling (`shapeJson.ts:42`), and `parseShapeJson`
  rejects a non-finite or null-in-a-numeric-slot value (`:161`). So a `Shape` holding `NaN`
  serializes to a document that will not parse back. This is the deliberate choice — the alternative
  restores geometry that silently differs — but it is an asymmetry, not an oversight.
- **Texture commands drop rather than reject.** An unresolved `{ texture: { index } }` reference
  yields `DROP_COMMAND` (`shapeJson.ts:119-120`) and the rest of the document parses intact. A
  missing asset is not a malformed document; that split is intentional and is the one place the
  lossless claim needs a caller-supplied `resolveTexture` seam.
- **`formatShapeJson` reads `shape.data.commands` directly** (`shapeJson.ts:31`), because
  `@flighthq/shape` still exports no public command iterator — only `getShapeCommandCount`
  (`packages/shape/src/shape.ts:316`). The flat `[key, argCount, ...args]` layout is therefore
  duplicated knowledge across two packages.
- **Object-arg discrimination rests on the registry having exactly two object types.**
  `Matrix | null` and `Texture` are the only object-typed args, so serialize treats a non-matrix
  object as the texture (`shapeJson.ts:52-54`). A third object-typed arg breaks this silently.
- **SVG interchange is unbuilt.** No `formatShapeSvg` / `parseShapeSvg` exists anywhere in
  `packages/`; the charter defers it, along with the `@flighthq/path-formats` `d`-string bridge an
  SVG export would want. Native JSON keeps numeric path arrays and needs no bridge.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The old "Shape" section described the
  serialized texture reference as `{ bitmap: { index } }` over a live `ImageResource`; the wire form
  is `{ texture: { index } }` over a `Texture` (`shapeJson.ts:54`, `:118`, and
  `packages/types/src/ShapeJson.ts:8`), so a reader following the doc would have written an
  unparseable document. Its "14 tests / 2 source files" inventory was likewise stale and is dropped —
  counts belong in the test run, not here.
- **2026-07-30** — `parseShapeJson` now rejects what it used to corrupt: empty/short arg lists,
  strings in numeric slots, extra args, `null` (the JSON spelling of `NaN`), and `1e999`. Enforced by
  a table-driven spec mirroring the `appendShape*` signatures, self-checking through the
  full-vocabulary round trip rather than a bespoke test.
- **2026-07-09** — Package created after a direction session (see charter Decisions); first
  implementation is the native command-stream JSON codec in `shapeJson.ts`.
