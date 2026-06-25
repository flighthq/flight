# filters-surface — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `src/` down to the 14 per-filter adapter modules (`surfaceBevelFilter` … `surfaceSharpenFilter`), but the gitignored `dist/` proved four more modules compiled and shipped. All four are genuine, named modules of filter-surface plumbing (bounds sizing, mask compositing, list dispatch, scratch pooling) — recovered by merging `dist/<m>.js` (impl + verbatim `//` comments) with `dist/<m>.d.ts` (types).

### Recovered modules

- **`surfaceFilterScratch`** — scratch `Uint8ClampedArray` pool: `acquireFilterSurfaceScratch`, `createFilterSurfaceScratch`, `getFilterSurfaceScratchByteLength`, `releaseFilterSurfaceScratch`. Module-level `_pool` moved to bottom after exports per source-style rule.
- **`surfaceFilterBounds`** — `getFilterSurfaceBounds(filter, sourceBounds, out)`: per-kind expanded-bounds computation, alias-safe (reads inputs to locals first).
- **`surfaceFilterComposite`** — `compositeDropShadowFilterResultToSurface`, `compositeFilterResultToSurface`, `computeFilterSurfaceOffset`, `getFilterCompositeRole` (+ exported `FilterCompositeRole` type).
- **`surfaceFilterList`** — `applyFilterListToSurface(out, scratch, source, filters)`: ping-pong dispatch over the per-filter adapters; DisplacementMapFilter passed through. Internal `applyOneFilter` / `copySurfaceToBuffer` kept private.

All four added to `src/index.ts` (named exports, kept alphabetized by export name; `FilterCompositeRole` exported as a type).

### Deviation from dist note

`dist/surfaceFilterList.js` imported named kind constants (`BlurFilterKind`, `BevelFilterKind`, …) from `@flighthq/types`. Those constants do not exist in the current `@flighthq/types` (filter kinds are string literals on the interfaces, e.g. `kind: 'BlurFilter'`). Rather than park the module or edit `@flighthq/types` (outside the hard boundary), the recovered source switches on the string-literal kinds directly — identical behavior, and consistent with the sibling recovered modules `surfaceFilterBounds` and `surfaceFilterComposite`, which already switch on string literals (`case 'BlurFilter':`). No `@flighthq/types` edit was needed; all referenced types (`BitmapFilter`, the concrete `*Filter` interfaces, `SurfaceRegion`, `Surface`) already exist there.

### Fossils skipped

None. No dropped/deprecated concept (cacheAsBitmap, scrollRect, Loader, Stage setters, etc.) appears in this package.

### Parked

None.

### Test result

`npm run test --workspace=packages/filters-surface` → 18 files / 57 tests passed.
