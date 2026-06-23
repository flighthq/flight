# Filename Alignment: @flighthq/textshaper

**Verdict:** Clean. This is a single-implementation seam package, **not** a backend-variant package (the concrete backend lives in the separate `@flighthq/textshaper-canvas`), so files take a plain domain/object name with no backend prefix — and they do: `textShaper.ts` names the shaper seam (its object) and houses all three exports, not one function.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/index.ts` — barrel re-export (`export * from './textShaper'`); conventional package entry, not a content file.
- `src/textShaper.ts` — names the **object/domain** (the text-shaper seam). Self-describing with the folder removed: a reader sees the shaper. Correctly holds the whole seam (`getTextShaperBackend`, `setTextShaperBackend`, `shapeText`) rather than being named after any single function. No backend prefix, which is correct for this single-implementation seam package.
- `src/textShaper.test.ts` — colocated test mirroring `textShaper.ts` exactly.
