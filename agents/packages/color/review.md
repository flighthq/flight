---
package: '@flighthq/color'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# color — Review

## Verdict

**Solid — 80/100.** The bedrock extraction is complete and well-shaped: nine source files, 31
exported functions, nine colocated test files, one dependency (`@flighthq/types`), and 20 consumer
packages importing it. Several issues flagged in the prior review (OkLab clamping, types homing,
`create*` naming conflict) have been resolved. What remains is the domain surface beyond sRGB
(wide-gamut, CIE XYZ, perceptual gamut mapping, HDR transfers) and two pockets of unextracted
duplication in `particles` and `effects`.

## Present capabilities

Nine source files in `packages/color/src/`, each with a colocated `*.test.ts`. Total: ~550 lines
of implementation and ~580 lines of tests.

**Pack/unpack (`packColor.ts`, 11 exports):** `packColor`, `packLinearToColor`, `packOpaqueColor`,
`unpackColorRgba`, `unpackColorToLinear` — the canonical sRGB pack/unpack seam. `getColorAlpha`,
`getColorRgb`, `setColorAlpha` — channel access on the packed integer. `computeRgbHexString`,
`computeRgbaCssString` — serialization to CSS/hex strings. `allocateLinearColor` — zero-allocator
for the `[r, g, b, a]` out parameter.

**sRGB transfer (`srgbTransfer.ts`, 2 exports):** `srgbChannelToLinear`, `linearChannelToSrgb` —
the IEC 61966-2-1 OETF pair, unclamped. This is the single decode/encode seam the rest of the SDK
builds on.

**HSL (`hslColor.ts`, 3 exports):** `rgbToHsl` (packed int to `HslColor` out), `hslToRgb`
(H/S/L floats to sRGB out), `allocateHslColor`. Operates in sRGB (non-linear) space, matching
artist-facing color pickers.

**HSV (`hsvColor.ts`, 3 exports):** `rgbToHsv`, `hsvToRgb`, `allocateHsvColor`. Same sRGB-space
convention as HSL. All six HSV sectors covered in the switch statement; tests exercise each.

**OkLab (`oklab.ts`, 3 exports):** `linearRgbToOklab`, `oklabToLinearRgb` — Ottosson 2020 matrices,
operating on linear-sRGB inputs. `oklabToLinearRgb` preserves out-of-gamut channels (no implicit
clamping), with a test asserting negative and >1 values round-trip. `clampLinearRgb` — explicit
channel clamp, composed separately.

**Interpolation (`lerpColor.ts`, 2 exports):** `lerpColor` (packed sRGB, interpolated in linear
space then repacked), `lerpLinearColor` (in-place `LinearColor` lerp, alias-safe, returns `out`).

**Luminance/contrast (`luminance.ts`, 4 exports):** `getColorLuminance` (Rec. 709), `getColorContrastRatio`
(WCAG 2.x, symmetric), `getRec709LuminanceWeights`, `getRec2020LuminanceWeights` — weight accessors via
out-parameter.

**Premultiply (`premultiplyColorAlpha.ts`, 2 exports):** `premultiplyColorAlpha`,
`unpremultiplyColorAlpha` — 8-bit sRGB-space, with division-by-zero guard.

**Kelvin (`colorFromKelvin.ts`, 1 export):** `colorFromKelvin` — Tanner Helland piecewise
approximation, clamps to 1000--40000 K, returns packed sRGB with opaque alpha.

## Changes since prior review (2026-07-21)

The following issues raised in the 2026-07-21 review have been resolved:

- **OkLab clamping separated.** `oklabToLinearRgb` no longer clamps; `clampLinearRgb` is an
  explicit composition target (commit `2d23a3936`). Tests verify negative/super-one channels
  survive the round-trip.
- **Types moved to `@flighthq/types`.** `HslColor`, `HsvColor`, `LinearColor` now live in
  `packages/types/src/` and are exported through both `.` and `./contract` lanes. `color` imports
  them via `@flighthq/types/contract`.
- **`create*` naming conflict resolved.** `createHslColor`/`createHsvColor`/`createLinearColor`
  renamed to `allocateHslColor`/`allocateHsvColor`/`allocateLinearColor`; `createColorFromKelvin`
  renamed to `colorFromKelvin` (commit `26f8f8081`). Matches the charter Decision #3.
- **Additional test coverage** for HSL/HSV conversion branches — sector sweeps, blue-dominant
  hues, high-lightness saturation formula (commits `5026a3f2c`, `a373136b5`, `0b6b8bec4`).
- **Contract lane routing** — both `.` and `./contract` lanes are in place and in sync (commit
  `2ce03de30`).

The Kelvin comment inaccuracy (old review: "says returns white") is no longer present; the current
comment accurately says "clamp to the nearest supported endpoint."

## Gaps

### Unfinished consumer re-point (charter v1 scope items 2-3)

- **`particles` carries its own HSV conversions.** `packages/particles/src/curve.ts` defines
  private `hsvToRgb`/`rgbToHsv` functions (lines 117, 186) operating on float channels with
  fresh-array returns — a different interface than color's packed-int with out-parameter convention.
  `particles` has no `@flighthq/color` dependency. Folding these would be a rewrite of the particle
  color interpolation path, not a mechanical de-dup (confirmed in `status.md`).
- **`effects` Kelvin duplication persists.** `packages/effects/src/colorTemperatureMath.ts` carries
  `computeColorTemperatureRgb` using the same piecewise coefficients as `colorFromKelvin` but
  writing normalized linear-sRGB multipliers into an out-parameter (green pinned to 1.0). `effects`
  has no `@flighthq/color` dependency.
- **`bitmap` is a no-op** — its premultiply operates on RGBA byte buffers, a different abstraction
  tier. Confirmed, not deferred work.

### Domain surface beyond sRGB

A mature color library provides the following, none of which is present:

- **CIE XYZ / Lab / LCH** — no XYZ conversion, no D50/D65 white-point model, no chromatic
  adaptation (Bradford/CAT), no CIE Lab or LCH. These are the standard colorimetric primitives
  underlying ICC profile math, Display-P3, and print workflows.
- **OkLCH** — the polar form of OkLab (hue + chroma), absent despite OkLab being present. OkLCH
  is the more practical artist-facing form for hue-preserving manipulations (saturate, rotate,
  harmonies).
- **Wide-gamut conversion** — no Display-P3, Rec. 2020, or ProPhoto RGB primary matrices. The
  package can name Rec. 2020 luminance weights but cannot convert a color to that space.
- **HDR transfer functions** — no PQ (SMPTE ST 2084) or HLG (BT.2100). Without these, an HDR
  display pipeline has no canonical CPU-side transfer math.
- **Perceptual gamut mapping** — `clampLinearRgb` is a naive per-channel clamp, not a
  chroma-reducing or lightness-preserving gamut map. A proper gamut map would walk inward in OkLCH
  (or similar) until all channels are in-gamut.
- **Hex/CSS parsing** — `computeRgbHexString` and `computeRgbaCssString` serialize outward, but
  nothing parses `#RGB`, `#RRGGBB`, or `#RRGGBBAA` strings back to a packed integer.

### Minor implementation notes

- **`lerpColor` allocates per call** (`packColor.ts:24` creates a transient `[r, g, b, a]` array
  every invocation). In a hot-loop color tween this is avoidable with a module-level scratch or
  by inlining the pack. Not a correctness issue; an allocation-discipline note.

## Charter contradictions

None. The implementation faithfully implements every charter principle:

- Bedrock leaf with value/space math only — no material, BRDF, or light-model knowledge.
- Packed RGBA `0xRRGGBBAA` and `LinearColor` as the shared vocabulary.
- `LinearColor`, `HslColor`, `HsvColor` in `@flighthq/types` (header layer).
- Single dependency on `@flighthq/types`; `sideEffects: false`.
- Allocation discipline with `allocate*` for scratch, out-parameters for conversions.
- Effect/adjustment-domain color stays in `effects`.

All three charter Decisions are reflected in the code.

## Contract and docs fit

### Package conformance to the contract

- **Two blessed export lanes** — `.` via `index.ts` (named re-exports) and `./contract` via
  `contract.ts` (barrel `export *`). In sync: every name in `contract.ts` appears in `index.ts`.
- **Types in `@flighthq/types`** — all three color types (`HslColor`, `HsvColor`, `LinearColor`)
  live there. `color` has no `export type` of its own.
- **`sideEffects: false`** — declared in `package.json`. No top-level registration, no mutable
  module state.
- **Full unabbreviated names** — `getColorLuminance`, `premultiplyColorAlpha`,
  `computeRgbHexString`, `unpackColorToLinear`, etc. No abbreviations in exported function names.
- **Out-parameter discipline** — `rgbToHsl`, `rgbToHsv`, `unpackColorRgba`, `unpackColorToLinear`,
  `lerpLinearColor`, weight accessors all write to `out`. `lerpLinearColor` is documented and
  tested as alias-safe.
- **`Readonly<>`** — applied on `packLinearToColor` (`Readonly<LinearColor>`) and
  `lerpLinearColor` inputs (`Readonly<LinearColor>`). Packed-integer inputs are primitives and do
  not require it.
- **Sentinels, not throws** — no `throw` anywhere in the package. Out-of-range values clamp
  silently (Kelvin, `packColor`); `unpremultiplyColorAlpha` returns input unchanged for alpha=0.
- **Alphabetized exports** — `index.ts` lists all 31 names in strict alphabetical order.
- **One test file per source file** — 9/9. `describe` blocks mirror exported names and are
  alphabetized.
- **`allocate*` for non-Entity allocation** — correctly uses `allocate*` rather than `create*` for
  bare-array zero-initializers.

### Candidate contract/docs revisions

- The **Package Map** in `AGENTS.md` lists `color` under "Core" — correct placement.
- No stale Package Map entries found for this package.

## Candidate open directions

Questions the charter does not answer that this review had to assume:

1. **Wide-gamut and XYZ scope** — should color own CIE XYZ, Display-P3, Rec. 2020, and chromatic
   adaptation as pure value math? The charter says "value + space math only" and "leaf deps only,"
   which would encompass these, but the charter does not name them. This determines whether the
   package grows from sRGB-only to a complete colorimetric leaf.
2. **OkLCH** — should the polar form of OkLab live here? It is the natural next step from OkLab
   and is the practical form for hue-preserving operations.
3. **Hex/CSS string parsing** — should color provide the inverse of `computeRgbHexString` (parse
   `#RRGGBB` to packed int)? A packed-integer SDK that can write hex but not read it is
   asymmetric.
4. **HDR transfer functions** — should PQ/HLG transfer math live here as the channel-level
   companion to the sRGB OETF pair, or in a render/effects package?
5. **`lerpColor` allocation** — should the per-call array allocation be eliminated (module-level
   scratch or inline pack), or is it acceptable for the expected call frequency?
