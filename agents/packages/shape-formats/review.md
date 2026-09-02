---
package: '@flighthq/shape-formats'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# shape-formats — Review

**Verdict:** solid -- 78/100. The native command-stream JSON codec is complete, table-driven, and thoroughly tested (44 tests, full vocabulary coverage). All three 2026-07-09 charter Decisions are faithfully implemented. The prior review's three critical gaps (arity/type validation, incomplete round-trip tests, non-finite numbers) have all landed. Remaining gaps are the diagnostics design question (open in the assessment, not a code defect), the charter-deferred SVG format, and minor charter staleness. The package is small and healthy.

## Present capabilities

### Native command-stream JSON codec

**`formatShapeJson(shape, options?): string`** (`packages/shape-formats/src/shapeJson.ts:37`) -- walks the `shape.data.commands` flat buffer directly and emits a `{ shapeFormat: 3, commands: [{ key, args }] }` document. Arg serialization is type-dispatched: `null` passes through (omitted fill/line matrix, absent triangle indices/uv); `Matrix` values serialize as `{a,b,c,d,tx,ty}` field objects; numbers, strings, booleans, and numeric arrays serialize verbatim via JSON; live `Texture` objects become ordinal `{ texture: { index } }` references (`ShapeTextureReference`). `options.space` passes through to `JSON.stringify` for pretty-printing. The writer validates every command against the shared schema before emitting: a `Shape` holding a non-finite coordinate throws `TypeError` rather than producing a document its own reader would reject (`:47-49`).

**`parseShapeJson(text, options?): Shape | null`** (`shapeJson.ts:81`) -- rebuilds a fresh `Shape` via `createShape()` and replays each entry through `SHAPE_COMMAND_APPENDERS` (a 17-key `key -> appendShape*` table, `:243-261`). Returns sentinel `null` (never throws; `JSON.parse` is try/caught) for: malformed JSON, missing/mismatched `shapeFormat` tag, non-array `commands`, malformed entry (non-object, missing `key`/`args`), unknown command key, unrecognized object arg shape (`MALFORMED_ARG` sentinel, `:236`), wrong arity (too few required or too many total), wrong positional type, or non-finite numbers. Texture-bearing commands whose reference cannot be resolved are dropped rather than rejected (`DROP_COMMAND` sentinel, `:239`), keeping the rest of the shape intact.

### Table-driven command schemas

**`defaultShapeCommandSchemas`** (`packages/shape-formats/src/shapeCommandSchemas.ts:113`) -- a `KeyedTable<ShapeCommandSchema>` populated via `@flighthq/registry`'s `createKeyedTable`/`withRegistryTableEntry`. Covers all 17 `ShapeCommandKey` entries with positional argument names, types (`'number' | 'numbers' | 'numbersOrNull' | 'string' | 'boolean' | 'matrixOrNull' | 'texture'`), and `requiredArgumentCount`. Shared reuse tables for gradient arguments (`:27-36`) and texture arguments (`:38-41`). Used by both `formatShapeJson` (writer-side validation) and `parseShapeJson` (reader-side validation) through the shared `isValidShapeCommandArgs` function (`:146-156`).

This schema table is also the runtime backing for `FlightDocumentSchemaRegistry.shapeCommandSchemas` (`packages/types/src/FlightDocumentSchemaRegistry.ts:15`), consumed by `interaction`, `scene-document`, and `gui` for shape-command resolution in document materialization. The `defaultShapeCommandSchemas` export therefore serves a cross-cutting role beyond just JSON serialization.

### Types

All types are in `@flighthq/types` as required: `ShapeTextureReference`, `ShapeJsonFormatOptions`, `ShapeJsonParseOptions` (`packages/types/src/ShapeJson.ts`), `ShapeCommandSchema`, `ShapeCommandSchemaArgument`, `ShapeCommandSchemaArgumentType` (`packages/types/src/ShapeCommandSchema.ts`). No inline type definitions in the package.

### Full command vocabulary coverage -- verified

The 17-key `SHAPE_COMMAND_APPENDERS` table covers: `beginTextureFill`, `beginFill`, `beginGradientFill`, `cubicCurveTo`, `curveTo`, `drawCircle`, `drawEllipse`, `drawPath`, `drawRectangle`, `drawRoundRectangle`, `drawTriangles`, `endFill`, `lineTextureStyle`, `lineGradientStyle`, `lineStyle`, `lineTo`, `moveTo`. Each has a matching schema entry in `defaultShapeCommandSchemas`. The composite builders (`appendShapeArc`/`appendShapeArcTo`/`appendShapePolygon`/`appendShapePolyline`/`appendShapeRoundRectangleVarying`) decompose into primitive keys, so every buffer a shape can contain round-trips.

### Losslessness

The round-trip test (`shapeJson.test.ts:135-142`) uses `createEveryNonBitmapCommandShape` (`:27-66`), which exercises all 15 non-texture command keys including `drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, both `drawTriangles` forms (with and without indices/uv), and `lineGradientStyle`. It asserts byte-for-byte identity: `formatShapeJson(restored!) === json`. Texture commands are tested separately through three resolver paths (present resolver, absent resolver, null-returning resolver).

### Test suite

2 test files, 44 tests, all passing. `shapeJson.test.ts` (41 tests): versioned envelope, matrix serialization, matrix field round-trip + non-finite rejection (parameterized over all 6 fields), texture ordinal reference, pretty-printing, full-vocabulary round-trip, 9 malformed-input rejection cases, texture resolver in 3 modes, 13 argument-validation cases (wrong arity, wrong type, non-finite in various positions, null-in-numeric, infinity, matrix fields, optional args). `shapeCommandSchemas.test.ts` (3 tests): curve argument name pins, triangle schema structure pin.

### Export structure

- `index.ts`: re-exports all of `./contract`.
- `contract.ts`: `export * from './shapeJson'; export * from './shapeCommandSchemas';`
- Two-lane structure (`.` and `./contract`) correctly configured in `package.json` exports map.
- Re-exported through `@flighthq/sdk` barrel (`packages/sdk/src/formats.ts:11`, `packages/sdk/src/index.ts:107`).
- `"sideEffects": false` declared. No top-level side effects in source.

## Gaps

Against the charter, the codebase-map standard, and a mature codec package:

1. **No diagnostics layer.** Every parse failure collapses to one silent `null`; there is no `explain*` query or `ImportDiagnostic` crumb reporting why (reason code, offending command index/key). Dropped texture commands are also invisible. The assessment notes this is an open design question: does a `-formats` parser report through the `ImportDiagnostic` crumb system (adopted by `scene3d-formats`, `particles-formats`, `skeleton2d-formats`, `scene2d-formats`) or through a bespoke `explain*` query, or both? This needs a ruling before implementation.

2. **SVG export/import is unbuilt.** No `formatShapeSvg` / `parseShapeSvg` exists. Explicitly charter-deferred (Open direction 1), so this is scope awareness, not a defect.

3. **Format-side non-finite numbers throw rather than return a sentinel.** `formatShapeJson` throws `TypeError` on non-finite coordinates (`:48-49`), while `parseShapeJson` returns `null` on the same condition. The status documents this asymmetry as deliberate (a `Shape` holding `NaN` is a programmer error / precondition violation, so throwing is within the design constraints), and it aligns with the codebase-map rule (throw for programmer errors, sentinels for expected failures). The asymmetry is honest, but it means `formatShapeJson` is the only function in the package that can throw.

4. **No examples.** No entries in `examples/` demonstrate shape serialization. For a codec package whose consumer base is currently the SDK barrel and document-format infrastructure, this is low-priority but worth noting.

5. **`formatShapeJson` reads `shape.data.commands` directly.** `@flighthq/shape` exports `getShapeCommandCount` but no public command iterator. The flat `[key, argCount, ...args]` buffer layout is therefore duplicated knowledge across packages. The status documents this; it is a cross-package gap owned by `@flighthq/shape`.

6. **Object-arg discrimination is fall-through.** The serialize path treats any non-matrix, non-scalar, non-null object as a texture (`:63-65`). Correct for the current closed vocabulary (documented inline), but a declaration-merged custom command with an object arg would silently serialize as a bogus texture ordinal. The shared schema validates after serialization, so the writer throws on an unknown key, but the discrimination itself is fragile.

7. **Codec extensibility.** `ShapeCommandRegistry` supports declaration merging, but `SHAPE_COMMAND_APPENDERS` is a closed `Record` and `defaultShapeCommandSchemas` is built from a closed map. A vendor command key is not parseable or serializable through this codec.

## Charter contradictions

None. All three 2026-07-09 Decisions are faithfully implemented:

- **First-build format = native command-stream JSON** -- delivered as `formatShapeJson` / `parseShapeJson` with the exact signatures specified.
- **`format*`/`parse*` naming** -- matches `path-formats` and `formatBitmapFingerprint` precedent. Parse returns sentinel `null`.
- **`beginTextureFill` textures serialize as a reference, resolved on parse** -- ordinal `ShapeTextureReference`, `resolveTexture` option, unresolved = drop (not reject).

## Contract and docs fit

Package to contract: strong.

- Full unabbreviated names (`formatShapeJson`, `parseShapeJson`, `defaultShapeCommandSchemas`).
- Sentinels-not-throws on parse (the `formatShapeJson` throw is for a programmer-error precondition).
- `Readonly<T>` on input parameters (`Readonly<Shape>`, `Readonly<ShapeJsonFormatOptions>`, `Readonly<ShapeJsonParseOptions>`).
- Types in `@flighthq/types` (6 types across 2 files).
- `"sideEffects": false`, no top-level registration.
- Module-private sentinels, tables, and helpers at the bottom of each file after exports.
- Deps: `@flighthq/geometry` (for `createMatrix`), `@flighthq/registry` (for `KeyedTable`), `@flighthq/shape` (for `appendShape*` builders and `createShape`), `@flighthq/types`.

**Candidate doc revisions:**

- **Charter Boundaries dep list is stale.** States "Depends on `@flighthq/shape` + `@flighthq/types`" but `package.json` also carries `@flighthq/geometry` (for `createMatrix` on parse) and `@flighthq/registry` (for `KeyedTable<ShapeCommandSchema>`). Both are justified additions from the validation sweep (2026-07-30). One-line charter touch-up at the next direction session.

## Candidate open directions

Silences the charter does not address, surfaced for direction:

1. **Diagnostics channel: crumbs vs `explain*`.** The four `-formats` packages that adopted `ImportDiagnostic` crumbs (`scene3d-formats`, `particles-formats`, `skeleton2d-formats`, `scene2d-formats`) suggest crumbs as the convention for format parsers. But the codebase-map inversion rule says every silent sentinel gets a shakeable `explain*` query. Both plausibly claim this. A ruling would settle whether `shape-formats` reports through crumbs, through `explain*`, or both.

2. **Custom-command codec seam.** Should the codec support a `registerShapeJsonCommand`-style per-key arg codec matching declaration-merged `ShapeCommandRegistry` entries, so vendor commands round-trip and tree-shake? Currently the appender table and schema table are both closed.

3. **Stable texture references.** The ordinal reference is positional -- editing a shape between format and parse shifts ordinals. A format-side hook (`referenceBitmap?: (texture) => string`) emitting caller asset ids would make references edit-stable. Extension of, not contradiction to, the 2026-07-09 Decision.

4. **Strict vs lenient parse / forward-compat.** Skip-unknown-commands mode vs today's strict-`null`. A design fork once vendor keys or format v4 exist.

5. **Binary/compact form.** The buffer is already flat and binary-friendly; the charter is silent on a non-JSON encoding.
