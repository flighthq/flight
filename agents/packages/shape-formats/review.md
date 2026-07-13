---
package: '@flighthq/shape-formats'
status: partial
score: 62
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# shape-formats — Review

**Verdict:** partial — 62/100. The blessed first-build (native command-stream JSON) is delivered cleanly and matches the charter's 2026-07-09 Decisions almost exactly, but the parse contract's "sentinel `null` on malformed input" is only partially realized (no arity/positional-type validation), there is no diagnostics layer, and the package is one format of a charter vision that itself names SVG as the next module.

## Present capabilities

- **`formatShapeJson(shape, options?)`** (`packages/shape-formats/src/shapeJson.ts`) — walks the public `shape.data.commands` flat buffer (`[key, argCount, ...args]`) directly and emits `{ shapeFormat: 1, commands: [{ key, args }] }`. Args serialize by JS type: numbers/strings/booleans/numeric arrays/`null` verbatim; `Matrix` → `{a,b,c,d,tx,ty}` (`isMatrixValue`); a live `ImageResource` → an ordinal `{ bitmap: { index } }` (`ShapeBitmapReference`). `options.space` passes through to `JSON.stringify` for pretty-printing. Output is deterministic.
- **`parseShapeJson(text, options?)`** — rebuilds a fresh `Shape` via `createShape()` and replays each entry through `SHAPE_COMMAND_APPENDERS`, a `key → appendShape*` table. Returns sentinel `null` (never throws; `JSON.parse` is try/caught) for malformed JSON, missing/mismatched `shapeFormat`, non-array `commands`, malformed entry, unknown key, or an unrecognized object arg (`MALFORMED_ARG` symbol sentinel).
- **Full command-vocabulary coverage — verified.** The appender table's 17 keys exactly match the 17-key `ShapeCommandRegistry` in `packages/types/src/ShapeCommand.ts` (`beginBitmapFill` … `moveTo`). The composite builders `appendShapeArc`/`appendShapeArcTo`/`appendShapePolygon`/`appendShapePolyline`/`appendShapeRoundRectangleVarying` decompose into primitive keys (`moveTo`/`lineTo`/`curveTo`/`cubicCurveTo`) in `packages/shape/src/shapeCommands.ts`, so every buffer a shape can contain round-trips.
- **Versioning** — a `shapeFormat: 1` top-level tag (`SHAPE_JSON_FORMAT`), checked with strict equality; mismatch → `null`. Tested for missing and mismatched tags.
- **Bitmap-fill seam per the charter Decision** — `beginBitmapFill`/`lineBitmapStyle` resources serialize as the zero-based ordinal of the bitmap-bearing command; `ShapeJsonParseOptions.resolveBitmap` rehydrates, and no resolver / a `null` return drops that one command (`DROP_COMMAND` sentinel) while the rest parses intact. Tested in all three modes (resolver, no resolver, resolver→null).
- **Losslessness** — the round-trip test asserts `formatShapeJson(restored) === json` byte-for-byte for a 9-command shape (`shapeJson.test.ts`, `createEveryNonBitmapCommandShape`).
- Types `ShapeBitmapReference` / `ShapeJsonFormatOptions` / `ShapeJsonParseOptions` exported; durable comments cover the ordinal rationale and the matrix-vs-bitmap object discrimination. 14 tests, colocated, `describe` blocks alphabetized and mirroring exports.

## Gaps

Vs a textbook native-command-stream codec (charter-deferred items excluded — see Backlog routing):

1. **No arity or positional-type validation on parse.** `parseShapeJson` validates arg *structure* but never arg *count* or per-position type against the command's `ShapeCommandRegistry` tuple. `{key:'moveTo', args:[]}` parses "successfully" and spreads `undefined` into `appendShapeMoveTo`, writing `undefined` into the command buffer — a corrupt shape that a later `formatShapeJson` would misclassify as a bitmap ref (the `else` branch). `{key:'beginFill', args:['red', true]}` likewise parses into a garbage buffer. This under-delivers the charter Decision's own contract ("sentinel `null` on malformed … input").
2. **Round-trip test coverage overclaims.** `createEveryNonBitmapCommandShape` covers 9 of the 15 non-bitmap keys — `drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, `drawTriangles`, and `lineGradientStyle` never appear in any round-trip test, despite the test name "round-trips every non-bitmap command losslessly".
3. **No malformed-input diagnostics.** Every failure collapses to one silent `null`; there is no shakeable `explain*` query (per the diagnostics inversion rule, every silent sentinel gets one) reporting *why* — reason code, offending command index/key. Dropped bitmap commands are likewise invisible to the caller (no count, no report).
4. **Non-finite numbers silently corrupt.** `JSON.stringify(NaN/Infinity)` emits `null`, and parse accepts `null` in any arg slot, so `lineTo(NaN, 5)` round-trips to `lineTo(null, 5)` — neither preserved nor rejected.
5. **Format-side object discrimination is fall-through.** Any non-matrix, non-scalar object arg is assumed to be the bitmap (`shapeJson.ts` `else` branch). Correct for today's closed registry (documented inline), but a declaration-merged custom command with an object arg would silently serialize as a bogus bitmap ordinal.
6. **No codec extensibility.** `ShapeCommandRegistry` is explicitly open ("May be extended via declaration merging") but `SHAPE_COMMAND_APPENDERS` is a closed `Record` — a user's vendor command key hard-fails the whole parse. No skip-unknown forward-compat mode either (strict-`null` is the blessed Decision; the extensibility seam is not addressed by it).
7. **Single format.** SVG export/import, the meatier standard interchange, is charter-deferred (Open direction 1), and there is no binary/compact form or streaming — the charter is silent on those two.

## Charter contradictions

No design contradictions — the implementation matches all three 2026-07-09 Decisions (native JSON shape, `format*`/`parse*` naming, ordinal bitmap reference with resolver seam). One **implementation shortfall of a Decision**: the "sentinel `null` on malformed input" ruling is incompletely realized (gap 1 — wrong-arity/wrong-type entries parse into corrupt shapes instead of returning `null`).

## Contract & docs fit

Package → contract: strong.

- Names full and format-keyed (`formatShapeJson`/`parseShapeJson`), matching `path-formats`/`formatSurfaceFingerprint` precedent.
- Sentinels-not-throws throughout; `Readonly<>` on inputs; single root `.` export (`index.ts` is one re-export line); `"sideEffects": false`; module-private sentinels/table at the bottom of the file after exports.
- Deps `geometry` + `shape` + `types` only; no DOM, no renderer. Package-local option/reference types are codec-private, not cross-package, so keeping them out of `@flighthq/types` is acceptable under the header-layer rule.
- Reading `shape.data.commands` directly (no public iterator exists in `@flighthq/shape` — verified: `shape.ts` exports `getShapeCommandCount` but no `forEachShapeCommand`) is documented and mirrors `@flighthq/shape`'s own internal readers.

Candidate doc revisions:

- **Charter Boundaries dep list is stale**: says "Depends on `@flighthq/shape` + `@flighthq/types`" but `package.json` also carries `@flighthq/geometry` (for `createMatrix` on parse — justified in status.md). One-line charter touch-up at the next direction session.
- Package Map line in `agents/index.md` is accurate as written.

## Candidate open directions

Silences I had to assume past; feed to the charter:

1. **Stable bitmap references.** The ordinal reference is blessed, but it is positional — editing a shape between format and parse shifts ordinals. A format-side hook (e.g. `referenceBitmap?: (bitmap) => string` emitting caller asset ids) would make references edit-stable. Extension of, not contradiction to, the 2026-07-09 Decision.
2. **Custom-command codec seam (fork B).** `ShapeCommandRegistry` is open by declaration merging; should the codec grow a matching registry (`registerShapeJsonCommand`-style arg codec per key) so vendor commands round-trip and tree-shake?
3. **Strict vs lenient parse.** Skip-unknown-commands forward compat vs today's blessed hard-`null` — a real design fork once format v2 or vendor keys exist; also the version-migration policy when `shapeFormat: 2` arrives.
4. **Binary/compact form.** Charter is silent on a non-JSON compact encoding (the buffer is already flat and binary-friendly).
5. **A public command iterator in `@flighthq/shape`** (`forEachShapeCommand`) would remove this codec's coupling to the raw buffer layout — cross-package, shape's call.
