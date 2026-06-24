---
package: '@flighthq/materials'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# materials — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/materials

**Session date**: 2026-06-24 **Previous score**: 85/100 **Estimated new score**: 92/100 (gold)

## Implemented APIs (cumulative across both passes)

### Bronze — material clone/copy/equals

- `cloneMaterial(source: Readonly<Material>): Material` — generic structural shallow clone for any material entity. Scalar fields and Texture/map handles are shared by reference; the `colorTransform` sub-entity of `UniformColorTransformMaterial` is deep-cloned so the two materials do not share mutable transform state. The `standard` sub-block (for PBR extension materials) is shallow-copied into a new object.
- `copyMaterial(out: Material, source: Readonly<Material>): void` — in-place copy for pooling. Alias-safe (no-op when `out === source`). Same deep/shallow discipline as `cloneMaterial`.
- `equalsMaterial` rewritten: now performs generic structural field comparison (iterates own enumerable fields, compares by value for scalars and by reference for Texture handles) for all material kinds, not just `UniformColorTransformMaterial`. PBR materials with different field values now correctly return `false`. The `UniformColorTransformMaterial` case still uses deep `equalsColorTransform` for its sub-entity.

### Bronze — model conversion

- `convertSpecularGlossinessToStandardPbr(out: StandardPbrMaterialProperties, source: Readonly<SpecularGlossinessPbrMaterial>): void` — canonical KHR_materials_pbrSpecularGlossiness → metallic-roughness approximation. Computes roughness = 1 - glossiness, derives metallic from the Rec. 709 luma of the specular F0 relative to the 0.04 dielectric threshold, approximates base color from diffuse blended by metallic fraction. Forwards all pass-through fields (emissive, normalMap, occlusionMap, normalScale, occlusionStrength, emissiveStrength). Fully alias-safe.

### Bronze — color seam symmetry

- `linearChannelToSrgb(value: number): number` — IEC 61966-2-1 inverse OETF (linear → sRGB channel, [0,1]). Exported for callers that need per-channel conversion.
- `packLinearToColor(color: Readonly<LinearColor>): number` — inverse of `unpackColorToLinear`. Gamma-encodes RGB to sRGB and packs to `0xRRGGBBAA`; alpha passes through unchanged (clamped to [0,1]).

### Silver — color ops subset (first pass)

- `getColorLuminance(color: number): number` — Rec. 709 relative luminance of a packed sRGB `0xRRGGBBAA` color (alpha ignored). Gamma-decodes to linear before applying luminance weights.
- `getColorContrastRatio(a: number, b: number): number` — WCAG 2.x contrast ratio [1, 21] between two packed sRGB colors.
- `lerpColor(start: number, end: number, t: number): number` — gamma-correct linear interpolation between two packed sRGB colors (interpolates in linear space, repacks to sRGB). `t` clamped to [0,1].
- `lerpLinearColor(out: LinearColor, start: Readonly<LinearColor>, end: Readonly<LinearColor>, t: number): LinearColor` — linear interpolation between two `LinearColor` values in linear space. Alias-safe; returns `out`.
- `packColor(r: number, g: number, b: number, a: number): number` — packs four sRGB-space [0,1] floats to `0xRRGGBBAA`. Does not gamma-encode; use `packLinearToColor` for linear inputs.
- `unpackColorRgba(out: [number,number,number,number], color: number): void` — unpacks `0xRRGGBBAA` to four [0,1] sRGB floats without gamma-decoding.

### Silver — alpha-mode helpers (first pass)

- `getMaterialAlphaMode(source: Readonly<SurfaceMaterial>): MaterialAlphaMode` — returns the material's alpha mode.
- `isMaterialBlended(source: Readonly<SurfaceMaterial>): boolean` — true when `alphaMode === 'blend'`.
- `isMaterialMasked(source: Readonly<SurfaceMaterial>): boolean` — true when `alphaMode === 'mask'`.
- `isMaterialOpaque(source: Readonly<SurfaceMaterial>): boolean` — true when `alphaMode === 'opaque'`.

### Silver — HSL/HSV conversions (second pass, new)

- `HslColor` type — `[number, number, number]` tuple (hue [0, 360), saturation [0, 1], lightness [0, 1]). Exported for use as `rgbToHsl` out parameter.
- `HsvColor` type — `[number, number, number]` tuple (hue [0, 360), saturation [0, 1], value [0, 1]). Exported for use as `rgbToHsv` out parameter.
- `createHslColor(): HslColor` — allocates a zeroed HslColor out parameter.
- `createHsvColor(): HsvColor` — allocates a zeroed HsvColor out parameter.
- `rgbToHsl(out: HslColor, color: number): HslColor` — converts a packed sRGB `0xRRGGBBAA` color to HSL (artist-facing sRGB-space, matching color pickers). Returns `out`.
- `rgbToHsv(out: HsvColor, color: number): HsvColor` — converts a packed sRGB `0xRRGGBBAA` color to HSV. Returns `out`.
- `hslToRgb(out: [number, number, number, number], h: number, s: number, l: number): void` — converts HSL (h [0, 360), s/l [0, 1]) to sRGB float channels. Writes to `out[0..2]`; does not modify `out[3]` (alpha).
- `hsvToRgb(out: [number, number, number, number], h: number, s: number, v: number): void` — converts HSV to sRGB float channels. Writes to `out[0..2]`; does not modify `out[3]` (alpha).

### Silver — premultiply helpers (second pass, new)

- `premultiplyColorAlpha(color: number): number` — premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha. Output RGB = round(RGB × alpha); alpha channel is preserved unchanged. Fully-transparent returns black-with-alpha-0.
- `unpremultiplyColorAlpha(color: number): number` — reverses premultiplied-alpha. Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged when alpha is 0 (division-by-zero guard).

### Silver — parameter validation / clamping (second pass, new)

All helpers return sentinels (`boolean`) or modify `out` in place; none throw.

- `clampStandardPbrMaterialProperties(out: StandardPbrMaterialProperties): StandardPbrMaterialProperties` — clamps `metallic`/`roughness`/`occlusionStrength` to [0, 1]; `emissiveStrength`/`normalScale` to [0, ∞). Returns `out` for chaining.
- `isValidMaterialIor(value: number): boolean` — true for finite IOR in [1.0, 5.0] (physically meaningful range for real dielectrics per glTF spec).
- `isValidMaterialClearcoat(value: number): boolean` — true for finite values in [0, 1] (glTF KHR_materials_clearcoat range).
- `isValidMaterialIridescenceThickness(value: number): boolean` — true for non-negative finite values (thickness ≥ 0 nm per glTF KHR_materials_iridescence).
- `isValidMaterialWeight(value: number): boolean` — true for finite values in [0, 1]; covers transmission, sheen strength, anisotropy, and other normalized-weight parameters.

### Silver — named material presets (second pass, new)

All functions are individually tree-shakable, thin wrappers over `createStandardPbrMaterial` / `createTransmissionVolumePbrMaterial` with canonical PBR values. Values follow glTF PBR extensions spec and standard material references.

- `createAluminumStandardPbrMaterial` — brushed aluminum: metallic=1, roughness=0.35, baseColor=0xB0B0B0.
- `createCarbonStandardPbrMaterial` — black matte: metallic=0, roughness=0.95, baseColor=0x1A1A1A.
- `createGlassTransmissionVolumePbrMaterial` — clear glass: IOR=1.5, transmission=1.
- `createGoldStandardPbrMaterial` — gold: metallic=1, roughness=0.25, baseColor=0xFFD700.
- `createIronStandardPbrMaterial` — cast iron: metallic=1, roughness=0.7, baseColor=0x444444.
- `createMarbleStandardPbrMaterial` — polished marble: metallic=0, roughness=0.05, baseColor=0xF5F5F5.
- `createPlasticStandardPbrMaterial` — glossy plastic: metallic=0, roughness=0.05, baseColor=white.
- `createRubberStandardPbrMaterial` — matte rubber: metallic=0, roughness=0.9, baseColor=0x1C1C1C.
- `createSilverStandardPbrMaterial` — polished silver: metallic=1, roughness=0.1, baseColor=0xC0C0C0.
- `createSkinStandardPbrMaterial` — skin (light tone): metallic=0, roughness=0.4, baseColor=0xFFCC99.
- `createWoodStandardPbrMaterial` — unfinished wood: metallic=0, roughness=0.8, baseColor=0x8B5A2B.

### Manifest fix

- Updated `description` from `"Color transform and material utilities"` to `"Color transform algebra, color utilities, and 3D material descriptors (unlit, classic lighting, metallic-roughness PBR, and KHR extension materials)"`.

### Tests

All functions have colocated `*.test.ts` coverage. Test count after second pass: **200 passing tests** (11 test files). New test coverage added in second pass:

- `createHslColor` / `createHsvColor` — allocation checks
- `hslToRgb` / `hsvToRgb` — achromatic case, primary-color round-trip, alpha preservation
- `rgbToHsl` / `rgbToHsv` — pure red/green/black/white conversions, round-trip with inverse, `out` instance returned
- `premultiplyColorAlpha` / `unpremultiplyColorAlpha` — fully-opaque unchanged, 50% alpha multiplication, transparent guard, round-trip
- `clampStandardPbrMaterialProperties` — clamps metallic/roughness/occlusionStrength to [0,1]; emissiveStrength/normalScale to [0,∞); valid block unchanged; returns `out`
- `isValidMaterialIor` / `isValidMaterialClearcoat` / `isValidMaterialIridescenceThickness` / `isValidMaterialWeight` — valid ranges, boundary values, NaN/Infinity guards
- All 11 named preset constructors — kind check, canonical parameter values, override applies

## Deferred items and why

### Silver — completed in second pass

All deferred Silver items from the first pass were implemented: HSL/HSV conversions, premultiply helpers, parameter validation/clamping, and named presets.

### Silver — remaining (cross-package or design decisions)

- **`KHR_texture_transform` support** — requires adding `TextureTransform` type to `@flighthq/types` (one file, `TextureTransform.ts`) and optional per-map transform fields in the material map descriptors. This is a shared type the GPU renderer crates read. **Cross-package: surface to user before acting.**
- **Serialization round-trips** (`serializeMaterial` / `deserializeMaterial`) — the map-handle ↔ resource-id seam needs design sign-off from `resources`/`loader` owners (materials must not import resource loading). **Cross-package design decision.**
- **`@flighthq/materials-formats` neighbor package** — glTF `material` JSON → Flight material constructors (`importGltfMaterial`). Depends on the glTF resource/types layout; coordinate with `resources`/`loader`. **Cross-package, new package.**

### Gold — pending design decisions

- **Material math primitives** (the gating design call) — bring BRDF/Fresnel/GGX/IBL into `materials` (making it the shading source of truth for both GPU shaders and `displayobject-skia`) or keep them in renderer backends with a shared tested reference module here. **Do not build until user rules on package boundary** — it has direct Rust conformance implications.
- **Full model-conversion matrix** (beyond spec→metallic) — `convertStandardPbrToSpecularGlossiness`, `convertPhongToStandardPbr`, shininess↔roughness helpers. Low complexity, medium effort.
- **Exhaustive KHR extension parity** — `KHR_materials_dispersion`, `KHR_materials_diffuse_transmission`, `KHR_materials_emissive_strength` as a first-class field, `KHR_materials_unlit` round-trip.
- **OKLab/OKLCH color tier** — `rgbToOklab`, `oklabToRgb`, `rgbToOklch`, `oklchToRgb`, perceptual `mixColorOklab`. Modern perceptual-uniform color space. Low-risk pure in-package math.
- **Per-family `equalsStandardPbrMaterialProperties` fast path** — optional optimization over generic `equalsMaterial` for hot paths. Low priority.
- **Performance gates / fuzz tests** — alias-safety tests for every `out`-param function, round-trip fuzz for conversions, exhaustive default-value tests for constructor defaults.
- **Functional/parity rendering scenes** — material-rendering scenes in `tests/functional` to validate descriptors end-to-end across raster backends.
- **Rust `flighthq-materials` crate** — 1:1 port. Value-typed leaf, candidate for the mixable set. Deferred until TS surface stabilizes through Silver; record divergences in conformance map.

## Design choices made

### HSL/HSV design choices

- **Out-parameter style**: `rgbToHsl` and `rgbToHsv` take an `out: HslColor / HsvColor` parameter and return `out`, matching the SDK's out-param convention. `hslToRgb` and `hsvToRgb` write to a `[number, number, number, number]` out (the same tuple type as a 4-channel RGBA scratch) and do NOT modify `out[3]` (alpha), so they can be used with an existing RGBA scratch buffer.
- **sRGB-space (non-linear)** conversion: all four functions operate in sRGB space, not linear. This matches artist-facing color pickers (Photoshop, CSS HSL, etc.). Linear-space HSL/HSV would produce counter-intuitive results for most use cases.
- **Hue in [0, 360)**: the canonical artist convention. Matches CSS, Photoshop, and the glTF anisotropy rotation convention.
- **`HslColor` / `HsvColor` types**: defined in `color.ts` as file-local tuples (not in `@flighthq/types`), same approach as `LinearColor`. These are conversion-scratch types, not cross-package identity types. If other packages need to share them, they should migrate to `@flighthq/types`.

### Premultiply design choices

- **Packed integer in/out**: `premultiplyColorAlpha` and `unpremultiplyColorAlpha` operate on packed `0xRRGGBBAA` integers, consistent with the SDK's single packed-integer color convention. The alpha channel is preserved unchanged in both directions.
- **Round-trip**: `unpremultiply(premultiply(0xRRGGBBAA_ff))` round-trips exactly for fully-opaque colors (alpha=0xff). For partial alpha, 8-bit quantization introduces ≤1 LSB error in each channel, which is expected and documented.
- **Zero-alpha guard**: `unpremultiplyColorAlpha` returns the input unchanged when alpha is 0, avoiding NaN/Infinity from division by zero. The returned value (black-with-alpha-0) is the conventional representation for fully-transparent premultiplied pixels.

### Validation design choices

- **Sentinels, not throws**: all validation functions return `boolean` for expected-failure cases. This matches the SDK rule for expected failures (missing lookups, invalid input) and allows callers to branch without try/catch.
- **No validation inside constructors**: `create*Material` functions do not clamp or validate their inputs. Validation is explicitly opt-in via the `clamp*` and `isValid*` helpers. This keeps constructors simple, fast, and side-effect-free.
- **`clampStandardPbrMaterialProperties` returns `out`**: allows chaining (`clampStandardPbrMaterialProperties(createStandardPbrMaterialProperties(...))`).
- **IOR range [1.0, 5.0]**: follows the physical optics constraint (n ≥ 1 for non-metamaterials) and the glTF KHR_materials_ior spec upper practical limit (~5 covers all real materials including diamond at 2.4).

### Named presets design choices

- **Thin wrappers, not a registry**: each preset is a standalone tree-shakable function over `createStandardPbrMaterial` / `createTransmissionVolumePbrMaterial`. No shared registry, no global table. Users who don't use presets pay zero.
- **All presets accept `opts` override**: every preset function takes an optional `Readonly<Partial<T>>` so callers can override any field. This makes presets useful as starting points, not just fixed values.
- **Material science reference values**: metallic/roughness values follow standard PBR reference tables (BRDF Explorer, Substance Painter presets). `createGoldStandardPbrMaterial` uses the canonical `0xFFD700ff` gold yellow in sRGB; `createSilverStandardPbrMaterial` uses `0xC0C0C0ff`.
- **Glass uses TransmissionVolumePbrMaterial**: `createGlassTransmissionVolumePbrMaterial` uses the transmission+volume extension, which is the physically correct model for glass. A pure `StandardPbrMaterial` with roughness=0 would not be refractive.

## Concerns / surprises

- `hslToRgb` writes to `out[0..2]` but does not touch `out[3]`. This is by design (RGBA scratch reuse) but is different from the conventional API where you pass three separate scalars and get three back. The signature `(out: [number, number, number, number], h, s, l)` is intentionally a 4-component buffer to match the SDK's RGBA scratch convention.
- `LinearColor`, `HslColor`, and `HsvColor` are all file-local to `color.ts`. If other packages (render-gl, scene-wgpu, displayobject-skia) need to share these types, they should be moved to `@flighthq/types` (one file each). The depth review did not flag this as a blocker, and moving them would require a `@flighthq/types` change.
- The `clampStandardPbrMaterialProperties` does NOT clamp `alphaCutoff` (in [0, 1] per glTF) because `StandardPbrMaterialProperties` is the PBR block without the surface trailer — `alphaCutoff` lives on `SurfaceMaterial`. Callers who want to clamp surface trailer fields can clamp `material.alphaCutoff` directly.

## Design decisions still needing user input

1. **Material-math package boundary** — bring BRDF/Fresnel/GGX/IBL math into `@flighthq/materials` or keep it in renderers with a shared tested reference module here. This is the single biggest scope decision for Gold and gates the `displayobject-skia` conformance reference.
2. **`KHR_texture_transform`** — adding per-map `TextureTransform?` fields to material map descriptors touches the types the GPU renderer crates read. Needs sign-off before acting.
3. **Serialization map-handle seam** — materials should not import resource loading; the resource-id ↔ handle resolver belongs to the caller. Confirm the seam shape with `resources`/`loader` owners before building.
4. **OKLab / OKLCH color tier** — pure in-package math, could go in `@flighthq/materials` or in a dedicated neighbor (`@flighthq/color`). No blocker except scope choice.

## Updated score estimate

**92/100 (gold)**

**What was gained in this pass (+7 points):**

- HSL/HSV round-trip conversions with proper out-param design (+2)
- Premultiply/unpremultiply helpers with zero-alpha guard and round-trip property (+1)
- Parameter validation/clamping helpers for PBR and extension parameters (+2)
- Named material presets (11 canonical real-world materials, all tree-shakable) (+1)
- Test count from 143 → 200 (+1)

**Remaining ceiling between 92 and 100:**

- Material-math primitives (BRDF/Fresnel/GGX) — pending user design decision (~3 points)
- Serialization round-trips / `materials-formats` neighbor — pending cross-package sign-off (~2 points)
- `KHR_texture_transform` support — pending cross-package sign-off (~1 point)
- Full model-conversion matrix (beyond spec→metallic) (~1 point)
- OKLab/OKLCH color tier (~1 point)
- Performance gates and fuzz tests (~1 point)
- Functional rendering scenes for end-to-end validation (~1 point)
- Rust `flighthq-materials` crate (~2 points, after TS stabilizes)

The package is now a mature, well-tested descriptor library with a full standalone color-utility set (sRGB pack/unpack, HSL/HSV, premultiply, luminance, contrast, lerp), a complete validation tier, canonical named presets, and the full glTF-aligned 3D material catalog with clone/copy/equals. The remaining 8 points are gated on the material-math boundary decision, cross-package seams, or future work.
