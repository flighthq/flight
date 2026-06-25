# @flighthq/displayobject-canvas — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging gitignored `dist/*.js` (impl + comments) with `dist/*.d.ts` (types) against the pruned `src/`. Edited only files under `packages/displayobject-canvas/`.

### Recovered

- **`canvasRegistration`** (whole module, had no `src/` counterpart) — `src/canvasRegistration.ts`
  - `src/canvasRegistration.test.ts`, plus the `export * from './canvasRegistration'` line in `src/index.ts` (alphabetized). Exports:
  * `canvasDisplayObjectRendererEntries` — ordered `[Kind, Renderer]` data array for all 11 Canvas 2D display-object kinds (Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video).
  * `registerCanvasDisplayObjectRenderers(state)` — registers every default Canvas renderer in one call. All referenced default renderers and `*Kind` constants and the `Kind`/`Renderer` types already exist in their packages; no type was missing.
- **`destroyCanvasRenderCacheTarget`** (single lost function added to existing `src/canvasCache.ts` + test) — `destroy*` verb: collapses the offscreen canvas backing a render cache to zero size so the browser reclaims compositor/GPU memory immediately, then drops the slot. Distinct from `releaseCanvasRenderCache` (slot-release only).
- **`destroyCanvasRenderTarget`** (single lost function added to existing `src/canvasRenderTarget.ts` + test) — collapses a `CanvasRenderTarget`'s canvas to zero size to reclaim its backing store now.

### Skipped (fossil) — none

No recovery candidate implemented a deliberately-dropped concept.

### Parked — none

All recovered modules' types are present in `@flighthq/types`; nothing required parking.

### Notes on renames (not recovered, by design)

The curation **renamed** two existing functions rather than dropping them; both live functions are present, so no work was lost and renaming live source back is a design decision outside recovery scope:

- `enableCanvasRenderCacheSupport` (dist/original name) → `enableCanvasRenderCache` (live `src/`).
- `enableCanvasTextInputSupport` (dist/original name) → `enableCanvasTextInput` (live `src/`).

These surfaced as "src-missing exported functions" only because the diff is by name; the underlying implementation is unchanged and present. Left as the live `src/` has them. (The `*Support` suffix is the codebase's convention for opt-in `enable*` functions, so a future deliberate rename back to `enableCanvasRenderCacheSupport` / `enableCanvasTextInputSupport` may be warranted — flagged here, not acted on.)

Separately, `src/canvasFillPattern.ts` exists but is absent from `src/index.ts` — pre-existing barrel drift unrelated to dist-vs-src lost work; left untouched (outside recovery scope).

### Test result

`npm run test --workspace=packages/displayobject-canvas`: 29 files, 216 tests, all passing.
