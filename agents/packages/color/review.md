---
package: '@flighthq/color'
status: solid
score: 74
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# color — Review

## Verdict

**Solid — 74/100.** The extraction succeeded: packed RGBA, canonical sRGB transfer, linear unpack/pack,
HSL, HSV, OkLab, luminance/contrast, Kelvin, interpolation, and alpha operations now form a small
dependency leaf used without importing materials. The functions are direct and well tested.

For the current 3D pipeline this covers transfer functions but not full color management. There is no
explicit RGB-primary/white-point model, XYZ conversion, chromatic adaptation, wide-gamut conversion,
gamut mapping, or HDR transfer vocabulary. Those belong here as pure value math; exposure, tone-map
choice, and GPU output passes remain effects/render responsibilities.

## What is solid

- One packed 0xRRGGBBAA convention and one sRGB-to-linear seam are documented and reused.
- LinearColor remains in the header layer, and allocation-free conversions use caller outputs.
- HSL/HSV are correctly artist-facing encoded-space conversions while OkLab consumes linear RGB.
- Relative luminance, WCAG contrast, Rec.709/Rec.2020 weights, Kelvin approximation, and linear-space
  interpolation cover the common utility layer.
- The package is side-effect-free and depends only on types.

## Gaps and contract drift

- The package can name Rec.2020 luminance coefficients but cannot convert between linear sRGB,
  Display-P3, Rec.2020, or XYZ. A renderer therefore has no canonical CPU math matching a future output
  transform.
- There is no white-point/chromatic-adaptation primitive (D50/D65, Bradford/CAT), no Lab/LCH or OkLCH,
  and no explicit gamut test/mapping operation.
- **oklabToLinearRgb** clamps negative channels, so it is not a true inverse for out-of-gamut OkLab.
  Preserve an unclamped bedrock conversion and make clamp/gamut mapping an explicit composition.
- HslColor and HsvColor are exported API types but live in the implementation package rather than the
  types header.
- **createHslColor**, **createHsvColor**, **createLinearColor**, and **createColorFromKelvin** return
  tuples/scalars rather than Entities. This is a concrete naming/shape conflict with the repository-wide
  create invariant; value allocation/calculation needs a non-create vocabulary or Entity-backed types.
- The Kelvin comment says out-of-range input returns white, while the implementation clamps to the
  supported endpoint. The tests verify clamping.

## Boundary conclusion

Color should own colorimetry and gamut math, not presentation policy. A DisplayTransform descriptor may
live in render/effects/types, but its matrices, transfer curves, adaptation, and gamut operations should
compose these leaf functions rather than duplicate shader-only formulas.
