---
package: '@flighthq/color'
updated: 2026-07-21
basedOn: ./review.md
---

# color — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **~~Enforce create-to-Entity naming and shape.~~** — retired 2026-08-05. The package no longer exports any `create*` value/scalar function: HSL/HSV scratch tuples use `allocate*`, Kelvin conversion is `colorFromKelvin`, and the remaining APIs are calculation/get/pack operations, so no structural product claims Entity-constructor semantics.

## Recommended

1. **~~Split unclamped OkLab inversion from gamut handling.~~** — retired 2026-08-05. `oklabToLinearRgb` now preserves negative and greater-than-one channels, `clampLinearRgb` is the explicit displayable-sRGB composition, and tests cover out-of-gamut output plus unclamped round trips.
2. **~~Move exported HslColor and HsvColor types to the header layer.~~** — retired 2026-08-05. `HslColor.ts` and `HsvColor.ts` now live in `@flighthq/types`, are exported from both header lanes, and color imports them through the contract lane.
3. **~~Correct the Kelvin out-of-range documentation to match endpoint clamping.~~** — retired 2026-08-05. `colorFromKelvin` documents that values outside 1000–40000 K clamp to the nearest endpoint, and tests pin both low and high clamps.

## Depth gaps

1. **Add explicit colorimetry primitives.** Linear-sRGB, Display-P3, Rec.2020, and XYZ conversion
   matrices; named white points; chromatic adaptation; and gamut containment/mapping.
2. **Add perceptual authoring spaces deliberately.** Lab/LCH and OkLCH are useful once white-point and
   gamut behavior are explicit; avoid a generic convertColor switch that pulls every space into users.
3. **Provide the CPU reference for display transforms.** HDR transfer curves and output-gamut math
   should be small leaf functions mirrored by GL shaders; tone-map/exposure sequencing stays in effects
   and presentation assemblies.

## Backlog

- Spectral color and ICC profile parsing are separate domains and not prerequisites for the GL contract.
- Rust parity follows once the colorimetry surface settles.

## Approved

None.
