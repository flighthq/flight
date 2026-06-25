# @flighthq/displayobject-gl — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered one whole lost module by merging `dist/*.js` (implementation + verbatim comments) with `dist/*.d.ts` (types), per the validated camera pattern.

### Recovered

- **`glDisplayObjectRegistration.ts`** — `registerGlDisplayObjectRenderers(state: GlRenderState): void`. The one-call convenience path that registers all twelve built-in GL display-object renderers (Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RenderCache, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video) against their kinds. The lost module had no `src/` counterpart; all twelve referenced `default*Renderer` descriptors and the `GlRenderState` type were already present, so the merge was clean.
  - Restored `src/glDisplayObjectRegistration.ts` (impl + JSDoc kept verbatim, `GlRenderState` type restored, `import type` on its own line).
  - Restored `src/glDisplayObjectRegistration.test.ts` from `dist/glDisplayObjectRegistration.test.js` (13 cases; vitest globals, no vitest import).
  - Added `export * from './glDisplayObjectRegistration';` to `src/index.ts`, kept alphabetized (after `glDisplayObject`).

### Fossils skipped

- None. The single lost module is genuine functionality and implements no dropped concept.

### Parked

- None. No recovered module required a type absent from `@flighthq/types`.

### Other findings

- No existing `src/` file was missing exported functions relative to its `dist/*.d.ts`; the curation lost exactly one whole module.

### Test result

`npm run test --workspace=packages/displayobject-gl` — 26 test files passed, 190 tests passed (was 25 files / 177 before recovery).
