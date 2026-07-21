---
package: '@flighthq/color'
updated: 2026-07-21
basedOn: ./review.md
---

# color — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Enforce create-to-Entity naming and shape.** The four current value/scalar create functions cannot
   remain exceptions. Entity-back the returned SDK objects where identity is intended and rename pure
   value allocation/calculation where it is not.

## Recommended

1. **Split unclamped OkLab inversion from gamut handling.** Make the inverse preserve negative/out-of-
   gamut linear channels; provide explicit clamp or gamut-map composition and round-trip tests.
2. **Move exported HslColor and HsvColor types to the header layer.**
3. **Correct the Kelvin out-of-range documentation to match endpoint clamping.**

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
