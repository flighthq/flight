# @flighthq/spritesheet-formats — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost `src/` for this package by merging gitignored `dist/*.js` (implementation + verbatim `//` comments) with `dist/*.d.ts` (types), validated against `dist/*.test.js`. The integration curation had pruned several modules out of `src/` while `dist/` proved they once compiled.

### Recovered

- **`xmlParse.ts`** + **`xmlParse.test.ts`** — thin re-export of `parseXmlAttributes`, `parseXmlDocument`, and the `XmlElement` type from `@flighthq/resource-formats` (the canonical XML parser owner). Dep already present in `package.json`. 16 tests.
- **`cocosPlistSerialize.ts`** + **`cocosPlistSerialize.test.ts`** — `serializeCocosPlistSpritesheet(data, existing?)`: serialises a `SpritesheetData` to a Cocos Creator / Cocos2d-x plist XML atlas string, preserving format/metadata from an optional `existing` document. Types `SpritesheetData` (from `@flighthq/spritesheet`) and `CocosPlistDocument`/`CocosPlistFrame` (local schema) both present. 3 tests, round-trips through the existing `parseCocosPlistSpritesheet`.
- **`libgdxAtlasSchema.ts`** — type-only module (`LibgdxAtlasDocument`, `LibgdxAtlasPage`, `LibgdxAtlasRegion`). No test (pure types, mirrors the existing test-free `cocosPlistSchema.ts` / `starlingSchema.ts`). The dist `libgdxAtlasParse.d.ts` references these types, confirming the schema is genuine shared work.

All added to `src/index.ts` alphabetically. Package tests: **149 passed (11 files)**. Single-package `tsc --noEmit`: clean.

### Skipped fossils

None. No recovery candidate was tied to a deliberately-dropped concept.

### Parked

- **`gridSlice.ts`** (`parseGridSpritesheet`) — its only signature type, `GridSliceOptions`, is imported from `@flighthq/types` and exists only in `packages/types/dist/` (also pruned from that package's `src/`). Recovering it would require adding the type to `@flighthq/types`, which is outside this task's hard boundary. PARKED — needs type `GridSliceOptions` in `@flighthq/types`.
- **`spritesheetDiagnostics.ts`** (`parseSpritesheetWithDiagnostics`, `SpritesheetParseResult`) — depends on `SpritesheetParseDiagnostic` from `@flighthq/types`, which exists only in `packages/types/dist/` (pruned from that package's `src/`). Outside the hard boundary. PARKED — needs type `SpritesheetParseDiagnostic` in `@flighthq/types`. (`SpritesheetFormatKind` and the local `SpritesheetParseOptions` it also uses are both present; the single blocker is `SpritesheetParseDiagnostic`.)
- **`libgdxAtlasSerialize.ts`** (`serializeLibgdxAtlasSpritesheet`) — recovered cleanly and typechecked, but its round-trip tests fail because the live `src/libgdxAtlasParse.ts` is a _different, separately-pruned_ implementation than the `dist/libgdxAtlasParse.js` the serializer was authored against. The dist parser is schema-based (`parseLibgdxAtlasText` → `LibgdxAtlasDocument`, with proper page-header detection and `parseLibgdxAtlasSpritesheetDocument`
  - `LibgdxAtlasParsed`); the live src parser is a hand-rolled `LibgdxPage`/`LibgdxRegion` rewrite that lacks `parseLibgdxAtlasSpritesheetDocument` and parses the serializer's page-header lines (`size:`, `format:`, …) as extra regions (9 frames vs 5 expected). Reconciling them is a judgment call (replace the live parser with the dist one, or rework the serializer) that crosses into rewriting an existing, passing module. Reverted and PARKED — needs reconciliation of the divergent `libgdxAtlasParse` implementations (live src vs dist).

### Test result

`npm run test --workspace=packages/spritesheet-formats` → **149 passed, 0 failed (11 files)**.
