# @flighthq/filters

Bitmap-filter descriptors as plain data, plus the shared cross-substrate blur math.

`filters` is the descriptor layer for the OpenFL filter set. A filter is not a runtime object that a display object "has" and the engine quietly applies on the next frame; it is a plain, immutable data descriptor with a string `kind`. The constructors here build those descriptors; the per-backend packages (`filters-canvas`, `filters-css`, `filters-gl`, `filters-wgpu`, `filters-surface`) consume them. This package allocates descriptors and runs the substrate-independent blur math; it does **no** rendering and imports no backend.

Every descriptor type and its `kind` string live in `@flighthq/types` (the header layer). The constructors default omitted fields and stamp the `kind`; the guards narrow by `kind`; the validators check structure without throwing.

## OpenFL filter class → Flight descriptor

OpenFL exposes each filter as a `BitmapFilter` subclass assigned to `displayObject.filters`. Flight replaces each class with a `kind`-tagged descriptor and a `create*` constructor. The mapping is 1:1 by name, with three additions OpenFL spells differently (`MedianFilter`, `PixelateFilter`, `SharpenFilter` are exposed in OpenFL via `ConvolutionFilter` presets; Flight gives each its own descriptor kind).

| OpenFL class                          | Flight `kind`           | Constructor                             |
| ------------------------------------- | ----------------------- | --------------------------------------- |
| `BevelFilter`                         | `BevelFilter`           | `createBevelFilter(options?)`           |
| `BlurFilter`                          | `BlurFilter`            | `createBlurFilter(options?)`            |
| `ColorMatrixFilter`                   | `ColorMatrixFilter`     | `createColorMatrixFilter(matrix)`       |
| `ConvolutionFilter`                   | `ConvolutionFilter`     | `createConvolutionFilter(options)`      |
| `DisplacementMapFilter`               | `DisplacementMapFilter` | `createDisplacementMapFilter(options?)` |
| `DropShadowFilter`                    | `DropShadowFilter`      | `createDropShadowFilter(options?)`      |
| `GradientBevelFilter`                 | `GradientBevelFilter`   | `createGradientBevelFilter(options)`    |
| `GradientGlowFilter`                  | `GradientGlowFilter`    | `createGradientGlowFilter(options)`     |
| `GlowFilter` (inner)                  | `InnerGlowFilter`       | `createInnerGlowFilter(options?)`       |
| `DropShadowFilter` (inner)            | `InnerShadowFilter`     | `createInnerShadowFilter(options?)`     |
| `ConvolutionFilter` (median preset)   | `MedianFilter`          | `createMedianFilter(options?)`          |
| `GlowFilter` (outer)                  | `OuterGlowFilter`       | `createOuterGlowFilter(options?)`       |
| `ConvolutionFilter` (pixelate preset) | `PixelateFilter`        | `createPixelateFilter(options?)`        |
| `ConvolutionFilter` (sharpen preset)  | `SharpenFilter`         | `createSharpenFilter(options?)`         |

OpenFL's single `GlowFilter` (with an `inner` boolean) and `DropShadowFilter` (with an `inner` boolean) split into explicit `InnerGlowFilter`/`OuterGlowFilter` and `InnerShadowFilter`/`DropShadowFilter` kinds, so the descriptor's intent is in its `kind`, not in a flag a backend has to branch on.

## Guards and validation

Each kind has a colocated narrowing guard, plus the umbrella `isBitmapFilter`.

| Function | Purpose |
| --- | --- |
| `isBitmapFilter(x)` | `true` when `x` is an object whose `kind` is a known filter kind. Discriminant only. |
| `is<Kind>Filter(filter)` | Narrow a `BitmapFilter` to one kind (e.g. `isBlurFilter`, `isColorMatrixFilter`). |
| `isValidBitmapFilter(filter)` | Structural validity: known kind, required fields present, array lengths and ranges sane. Unknown (custom) kinds → `false`. |
| `isValidBitmapFilterList(filters)` | `true` when `filters` is an array of valid filters. Non-array or any invalid element → `false`. |
| `clampFilterQuality(quality)` | Clamp to Flash's quality range (1–15), rounded. |
| `clampFilterStrength(strength)` | Clamp to Flash's strength range (0–255). |

Guards and validators are sentinel-style — they return `false` for unknown or malformed input and never throw. Custom (vendor-prefixed) filter kinds pass `isBitmapFilter` only if registered upstream; they are not recognized by the built-in specific guards.

## Color matrix

A `ColorMatrixFilter` carries a flat `matrix` of `COLOR_MATRIX_LENGTH` (20) numbers — a 4×5 affine (`[r g b a offset]` per output channel) applied to each pixel. The 4×5 form covers the common recipes:

| Recipe     | Shape                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| Identity   | `1` on the channel diagonal, `0` offsets.                                            |
| Grayscale  | Each RGB output row = the luma weights (`0.2126 0.7152 0.0722`), alpha row identity. |
| Brightness | Identity with a constant added to the R/G/B offset columns.                          |
| Contrast   | Scale the RGB diagonal around mid-grey (`0.5`) via a matching negative offset.       |
| Saturation | Interpolate each RGB row between the luma weights (0) and identity (1).              |
| Hue rotate | Rotate the RGB block by the standard luma-preserving hue matrix.                     |
| Invert     | `-1` on the RGB diagonal with a `+255`-equivalent offset.                            |

`createColorMatrixFilter` stores the matrix verbatim — it does not normalize or validate length; `isValidBitmapFilter` is the structural check (length must equal `COLOR_MATRIX_LENGTH`, all numeric). Recipes that cannot be expressed as a single 4×5 affine (per-channel curves, levels, color balance) are out of scope for the descriptor and belong to a LUT/surface path.

## Blur math

Backends share one Gaussian-as-repeated-box-blur model so a blur looks the same everywhere.

| Function | Purpose |
| --- | --- |
| `getBlurPassCountForQuality(quality)` | Map Flash quality (1–15) to box-blur pass count (1, 2, or 3). |
| `computeBoxBlurRadius(sigma, passes)` | One uniform box radius whose `passes`-fold variance matches a Gaussian of standard deviation `sigma`. For backends that apply one radius per pass. |
| `computeBoxBlurPassRadius(sigma, passes, pass)` | Per-pass radius (two adjacent odd box widths) that tracks `sigma` more closely. For backends that vary the radius per pass (e.g. the GL separable passes). |

All three return `0` for `sigma <= 0`, so a zero blur is a clean no-op.

## Usage

```ts
import { createBlurFilter, createColorMatrixFilter, isBlurFilter, isValidBitmapFilter } from '@flighthq/filters';

const blur = createBlurFilter({ blurX: 4, blurY: 4, quality: 2 });
isBlurFilter(blur); // true

const grayscale = createColorMatrixFilter([
  0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0,
]);
isValidBitmapFilter(grayscale); // true
```
