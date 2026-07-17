---
package: '@flighthq/color'
crate: flighthq-color
draft: false
lastDirection: 2026-07-17
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# color — Charter

## What it is

`@flighthq/color` is the SDK's **bedrock color primitive** — the one home for the packed-RGBA
convention and all color-space / color-value math: pack/unpack, sRGB↔linear transfer, HSL, HSV,
OkLab, luminance/contrast, premultiply, lerp, and hex. It is a value-typed leaf: pure free functions
over plain numbers and the `LinearColor` type (which stays in `@flighthq/types`, the header layer),
depending on nothing but `@flighthq/types` (and possibly `@flighthq/math`). Both the 2D and 3D halves
of the SDK use color, so it must be importable **without** pulling in a shading, effects, or material
package.

## Why it exists now — the extraction

The color primitive already exists, but it is **mis-homed and duplicated**, which is exactly why it
reads as missing:

- `@flighthq/materials/src/color.ts` is a full ~25-export color kernel (`unpackColorToLinear`,
  `packLinearToColor`, `packColor`, `unpackColorRgba`, `srgb↔linear` channel math, `rgbToHsv`/`hsvToRgb`,
  `rgbToHsl`/`hslToRgb`, `lerpColor`/`lerpLinearColor`, `premultiplyColorAlpha`, `getColorLuminance`,
  `getColorContrastRatio`, `computeRgbHexString`, `HslColor`/`HsvColor` types) — living inside the 3D
  shading package, where no one authoring colors would look for it.
- `@flighthq/effects/src/colorScienceMath.ts` **re-implements** a chunk of it: a second
  `computeSrgbToLinear`/`computeLinearToSrgb`, a second HSL pair, plus OkLab and Rec709/Rec2020
  luminance weights.
- More color scatter: `lighting` (`colorFromKelvin`), `particles` (HSV interpolation in `curve.ts`),
  `surface` (pixel ops).

That is the textbook decomposition smell from AGENTS.md (*Composition and Complexity*): a bedrock
primitive bundled inside a larger unit and re-implemented elsewhere. Extracting `@flighthq/color`
collapses the duplication and lets a 2D app convert a hex color without importing `materials`.

**The motivating case:** migrating **Phong materials → PBR materials** and getting the intensity right
needs reliable sRGB↔linear + value scaling — and that primitive currently lives where you would never
find it. Fixing the home is the first half of that problem (the second half is a materials-domain
migration helper — see the boundary below).

## v1 scope

1. **Move `materials/color.ts` here** as the implementation; keep `LinearColor` in `@flighthq/types`.
   Canonical surface (fill out to AAA): packed-RGBA pack/unpack, sRGB↔linear (channel + color), HSL,
   HSV, OkLab, luminance + contrast, premultiply/unpremultiply, `lerpColor`/`lerpLinearColor`, hex.
2. **Absorb the `effects` duplication:** fold `colorScienceMath.ts`'s space/luminance math
   (`computeSrgbToLinear`/`computeLinearToSrgb`, HSL, OkLab, Rec709/Rec2020 weights) into `color`;
   `effects` consumes it. (Effect-domain math — `toneMapMath`, `colorTemperatureMath` as an *effect* —
   stays in `effects`; `color` provides the primitives they compose.)
3. **Re-point consumers** to import from `@flighthq/color`: `scene-gl`, `materials`, `effects`,
   `lighting`, `particles`, `surface`. Pre-release, no back-compat obligations → clean import cut, no
   long-lived re-export shim unless a transition step is genuinely easier.
4. Allocation discipline (`create*` allocates; conversions write to `out`), `Readonly<>` inputs,
   alphabetized exports, one colocated test per source file. Run `packages:check` / `exports:check`.

## The boundary the motivating case draws (blessed)

"Setting the intensity when migrating Phong → PBR" is **not** a color primitive. It knows the Phong vs
metallic-roughness **descriptor shapes** and the BRDF normalization (energy conservation, the Lambert
`/π`, dielectric F0) — that is materials-domain knowledge. So the work splits:

- **`@flighthq/color`** provides the sRGB↔linear + value-scaling primitives (this charter).
- **`@flighthq/materials`** gets an appearance-matching migration helper (working name
  `convertPhongToStandardPbrMaterial`) built **on** `color` and on the `@flighthq/lighting`
  intensity conversion (issue #7 — same "porting from an sRGB/LDR engine" theme). It maps Phong
  diffuse/specular/shininess to baseColor/metallic/roughness and applies the intensity scale so the
  surface reads equivalently.

Keeping color a pure value leaf and putting model-migration where the models live is the split. These
are a **paired deliverable**: color first, then the materials migration helper consumes it.

## Boundaries

- **Value + space math only.** No material knowledge, no BRDF, no light-model migration (those are
  `materials` / `lighting`).
- **Packed RGBA `0xrrggbbaa` and `LinearColor` are the shared vocabulary;** the `LinearColor` type
  stays in `@flighthq/types`. One convention across the SDK, no color wrapper objects.
- **Leaf deps only** (`@flighthq/types`, possibly `@flighthq/math`). Must tree-shake — a 2D app pays
  only for the functions it imports.
- **Effect/adjustment-domain color stays put** (tone mapping, LUTs, color-temperature *as an effect*).
  `color` supplies the primitives; it does not own passes or data-fold ops.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-17] Charter `@flighthq/color` as a bedrock leaf package.** Extract `materials/color.ts`,
  de-duplicate `effects/colorScienceMath.ts`, re-point consumers; `LinearColor` stays in
  `@flighthq/types`. Chosen a dedicated package over folding into `@flighthq/math` because color is a
  distinct domain (packed-RGBA convention + multiple color spaces) with 2D+3D reach and enough surface
  to be its own cell.
- **[2026-07-17] Phong→PBR intensity/appearance migration is a `@flighthq/materials` helper built ON
  `color` (+ `lighting` intensity), not a color primitive.** Paired follow-on deliverable; color lands
  first. This is the user's actual driver and defines the color↔materials boundary.

## Open directions

1. **Kelvin / blackbody ownership** — move the pure blackbody→chromaticity math into `color` (a color
   primitive), leaving `colorFromKelvin`'s light-flavored wrapper in `lighting`? Lean: yes, split the
   spectral→RGB math down to `color`.
2. **Migration helper specifics** — the exact signature/home of `convertPhongToStandardPbrMaterial` in
   `materials`, and how it couples to the #7 `@flighthq/lighting` intensity helper (build them together).
3. **Rust candidacy** — the transfer/space math is a strong `rust:` backend candidate once stable.
4. **Name** — confirm `@flighthq/color`.
5. **`particles`/`surface` color reuse** — fold their HSV/pixel color math onto `color` too, or leave
   as domain-local until it demonstrably duplicates. Decide during the consumer re-point.
