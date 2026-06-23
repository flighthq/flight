# Filename Alignment: @flighthq/clip

**Verdict:** Clean. Single-implementation domain package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so files take a plain domain/object name with no backend prefix — `clipRegion.ts` correctly names the `ClipRegion` object it builds, and its test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/clipRegion.ts` — Names the `ClipRegion` object, not a single function. All three exports (`createClipRegionFromPath`, `createClipRegionFromRectangle`, `invalidateClipRegion`) operate over `ClipRegion`, so the file groups by object as required. No backend prefix is correct here: clip is a single-implementation value/data domain (the per-backend realization lives in `displayobject-canvas/dom/gl/wgpu`, not in this package).
- `src/clipRegion.test.ts` — Colocated test mirroring the source filename.
- `src/index.ts` — Thin barrel (`export * from './clipRegion'`); a pure re-export, not a dumping ground. Correct.
