# Filename Alignment: @flighthq/surface

**Verdict:** Single-implementation domain package (NOT a backend-variant package) — files correctly take plain `surface<Domain>` names with no backend prefix; naming is strong and consistent overall, with one preposition-named file (`surfaceFrom.ts`) to fix and two borderline single-function files to consider.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `surfaceFrom.ts` | Named after a preposition fragment (`From`), not a domain or object. Holds the conversion constructors `createSurfaceFromCanvas`, `createSurfaceFromImageResource`, `createSurfaceFromImageSource`, `createImageResourceFromSurface`. The bare filename does not say what domain it covers. | `surfaceConversion.ts` (the surface↔resource/canvas/source conversion domain) |
| `surfaceQuery.ts` | Generic domain word (`Query`) and currently a one-function file (`getSurfaceColorBoundsRectangle`). "Query" carries no specific domain — it is the kind of catch-all name the convention warns against. | `surfaceColorBounds.ts` (names the actual subject — color-bounds analysis), leaving room to grow that analysis domain |
| `surfaceDraw.ts` | One-function file (`drawSurface` → blits a surface region onto an `HTMLCanvasElement`). Borderline: `Draw` reads as a verb-domain like `Copy`/`Fill`, so acceptable, but the subject is really "draw to canvas". Low priority. | Acceptable as-is; if renamed, `surfaceCanvasDraw.ts` to signal the canvas-blit target |

## Clean

All remaining files name a legitimate surface operation domain or object and pass the folder-removal test:

- `surface.ts` — core entity (`createSurface`, `cloneSurface`)
- `surfaceBevel.ts`, `surfaceBlur.ts`, `surfaceColorMatrix.ts`, `surfaceConvolution.ts`, `surfaceDisplacement.ts`, `surfaceDissolve.ts`, `surfaceGradient.ts`, `surfaceMedian.ts`, `surfaceMorphological.ts`, `surfaceNoise.ts`, `surfacePaletteMap.ts`, `surfacePixelate.ts`, `surfaceShadow.ts`, `surfaceSharpen.ts` — each a recognized image-processing operation domain
- `surfaceColorMatrix.ts`, `surfaceComposite.ts`, `surfaceCopy.ts`, `surfaceFill.ts`, `surfaceFlip.ts`, `surfaceResize.ts`, `surfaceRotate.ts`, `surfaceTransform.ts` — pixel transform/composite domains
- `surfaceCompare.ts`, `surfaceCoverage.ts`, `surfaceFingerprint.ts`, `surfaceHistogram.ts` — analysis domains
- `surfaceEncode.ts` — encode domain (`encodeSurface`)
- `surfaceFormat.ts` — pixel-format conversion domain (premultiply / channel-order)
- `surfacePixel.ts` — per-pixel get/set object domain
- `surfaceRegion.ts` — `SurfaceRegion` object domain
- `surfaceImageChannel.ts` — re-export of the `ImageChannel` type; self-describing
- All `*.test.ts` are colocated and mirror their source filenames exactly
