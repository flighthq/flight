# @flighthq/surface — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging `dist/*.js` (impl + comments) with `dist/*.d.ts` (types), reconstructing tests from `dist/*.test.js`. The integration curation had pruned several modules whose build output proved they once compiled.

### Recovered

- **surfaceAlpha** (new module): `copySurfaceAlpha`, `multiplySurfaceAlpha`, `setSurfaceAlpha` — alpha-channel ops over `SurfaceRegion`. Added `src/surfaceAlpha.ts` + `src/surfaceAlpha.test.ts`, `export * from './surfaceAlpha'` in `index.ts`.
- **surfaceChannel** (new module): `mergeSurfaceChannels`, `splitSurfaceChannels` — RGBA channel split/merge (split→merge round-trips). Added `src/surfaceChannel.ts` + `src/surfaceChannel.test.ts`, `export * from './surfaceChannel'`.
- **surfaceTone** (new module): `applySurfaceCurve`, `applySurfaceLevels` — per-channel LUT curve + levels/gamma adjustment. Added `src/surfaceTone.ts` + `src/surfaceTone.test.ts`, `export * from './surfaceTone'`.
- **surface.convertSurfaceAlphaType** (function added to existing `src/surface.ts`): in-place straight↔premultiplied alpha conversion. Tests added to `src/surface.test.ts`.

### Mechanical drift fixed

- `dist` predates a package rename: it imports `invalidateImageResource` from `@flighthq/resources`. The live package depends on `@flighthq/image` (per `package.json` and all curated src files). All four recovered/edited files were rewritten to import from `@flighthq/image`.
- The dist tests called `createSurface(w, h, color, alphaType)` (a 4-arg form). The live `createSurface` no longer accepts an `alphaType` parameter (curation simplified it to 3 args). The `convertSurfaceAlphaType` tests were adapted to set `img.alphaType` directly after construction instead, preserving the assertions.

### Parked

- **surfaceAffine** (`transformSurface`): imports type `SurfaceEdgeMode`, which is absent from `packages/types/src/` (no `SurfaceEdgeMode.ts`, no export). Recovering it requires adding the type to `@flighthq/types`, which is outside this task's hard boundary. Parked: needs type `SurfaceEdgeMode` in `@flighthq/types`.
- **surfaceCrop** (`cropSurface`, `extendSurface`, `trimSurface`): also imports `SurfaceEdgeMode`. Parked: needs type `SurfaceEdgeMode` in `@flighthq/types`.
- **surfaceWarp** (`warpSurface`, `warpSurfaceQuad`): also imports `SurfaceEdgeMode`. Parked: needs type `SurfaceEdgeMode` in `@flighthq/types`.
- **surfaceGradientFill** (`fillSurfaceLinearGradient`, `fillSurfaceRadialGradient`): imports type `GradientSpread`, which is absent from `packages/types/src/`. Parked: needs type `GradientSpread` in `@flighthq/types`.

### Fossils skipped

None. No recovery candidate implemented a deliberately-dropped concept (cacheAsBitmap, scrollRect, Loader, Stage setters, Bitmap pixelSnapping/sourceRectangle, Video smoothing/source).

### Test result

`npm run test --workspace=packages/surface` → 37 files passed, 302 tests passed.
