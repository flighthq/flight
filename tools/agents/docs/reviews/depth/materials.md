# Depth Review: @flighthq/materials

**Domain**: Surface/material descriptors for a graphics SDK — the data-side material system spanning 2D color transforms (Flash/OpenFL-style tinting) and a 3D material library (unlit, classic lighting, glTF metallic-roughness PBR + KHR extensions), plus the sRGB→linear color seam.

**Verdict**: solid — **74/100**

The package's one-line manifest description ("Color transform and material utilities") badly undersells it. In practice this is two libraries fused into one: a complete OpenFL `ColorTransform` algebra and a surprisingly broad, glTF-aligned 3D material constructor set. Both halves are coherent and well-documented. It falls short of "authoritative" because it is deliberately a _descriptor_ layer — it constructs and compares material data but contains essentially no material _math_ (BRDF evaluation, IBL, conversions between models, parameter validation), and the color-utility surface is thin relative to a standalone color library.

## Present capabilities

**Color transform (OpenFL parity, and then some)** — the strongest, most authoritative part:

- Constructors / lifecycle: `createColorTransform`, `cloneColorTransform`, `copyColorTransform`, `setColorTransform`, `setColorTransformIdentity`.
- Algebra: `concatColorTransform` (correct multiplier×offset composition order), `invertColorTransform`, with proper alias-safe out-parameter discipline.
- Comparison: `equalsColorTransform`, `equalsColorTransformMultipliers`, `equalsColorTransformOffsets` (with `compareAlpha` flags), `isIdentityColorTransform`.
- Packing helpers: `getColorTransformOffsetRgb/Rgba`, `setColorTransformOffsetRgb/Rgba`, `copyColorTransformToArrays` (GPU upload path).
- This is a complete, value-typed, hot-loop-friendly ColorTransform — genuinely authoritative for the OpenFL color-transform concept.

**Color seam**: `unpackColorToLinear` (the single SDK sRGB→linear decode, IEC 61966-2-1 EOTF, alpha pass-through), `createLinearColor`, `computeRgbHexString`. Small but correct and well-commented.

**Material entity core**: `createMaterial`, `equalsMaterial`, `createSurfaceMaterial` (shared alpha/blend/double-sided trailer).

**Color-transform materials** (2D tint as a material): `createColorTransformMaterial` (per-instance, batch-friendly), `createUniformColorTransformMaterial` (per-batch uniform).

**3D material library** — broad and glTF-aligned:

- Unlit / debug / pass set: `createUnlitMaterial`, `createVertexColorMaterial`, `createWireframeMaterial`, `createNormalMaterial`, `createDepthMaterial`, `createMatcapMaterial`, `createEmissiveMaterial`, `createToonMaterial`.
- Classic lighting: `createLambertMaterial`, `createPhongMaterial`, `createBlinnPhongMaterial`.
- PBR core: `createStandardPbrMaterial` (metallic-roughness), `createStandardPbrMaterialProperties` (reusable block), `createSpecularGlossinessPbrMaterial` (legacy model).
- PBR extensions (KHR-named, correct defaults/IOR/nm ranges): anisotropy, clearcoat, iridescence, sheen, specular, transmission+volume, plus a Flight subsurface extension.

That is a notably complete _catalog_ of the material models a mature 3D engine offers, with sensible, well-commented defaults.

## Gaps vs an authoritative materials library

These are mostly **missing-by-design / out-of-scope** (Flight pushes evaluation into renderer backends and shading math elsewhere), but they are what separates this from authoritative:

- **No material math.** No BRDF evaluation, no Fresnel/Schlick, no GGX/distribution helpers, no diffuse/specular energy terms, no normal-mapping or tangent-space math, no IBL/irradiance helpers. An authoritative materials library typically ships at least the analytic shading primitives; here they live in shaders (`render-gl`/`scene-wgpu`). _Largely by design_ given the descriptor-only philosophy, but it means "materials" here means "material data," not "material shading."
- **No model conversions.** `SpecularGlossinessPbrMaterial` is described as "converted to metallic-roughness at bind," but no `convertSpecularGlossinessToStandardPbr` (or any inter-model conversion) is exported here. Diffuse/specular↔base-color/metallic conversion is a canonical materials-library utility. _Gap by omission._
- **No clone/copy/equals for the 3D materials.** ColorTransform gets a full clone/copy/equals suite; the entire 3D material family gets only constructors. No `cloneStandardPbrMaterial`, no `equalsSurfaceMaterial`, no `copyMaterial`. `equalsMaterial` only special-cases `UniformColorTransformMaterial` and returns `true` for every other kind with matching kind — so two distinct PBR materials compare equal. For a library used for dedup/pooling/serialization, this is a real depth gap. _Gap by omission._
- **Thin color utilities.** A standalone color library would offer HSL/HSV/OKLab conversions, mixing/lerp, luminance, contrast, packing/unpacking to/from named formats, gamma round-trip (`linearToSrgb` is absent — the seam is one-directional). Flight's packed-int convention narrows this, but only `unpackColorToLinear` + a hex helper is sparse. _Partly by design, partly omission._
- **No serialization/migration helpers** for materials beyond plain entity shape (kind strings are serializable, but no `serializeMaterial`/round-trip validators).
- **No texture-transform (KHR_texture_transform) or alpha-mode helpers** beyond the stored fields; no validation of cutoff/IOR/range parameters.
- **No procedural/standard material presets** (e.g. common named materials), which many engine material libraries provide as a convenience tier.

## Naming / API-shape notes

- Naming is consistent and self-identifying per the project rules: every function carries the full unabbreviated type word (`getColorTransformOffsetRgba`, `createStandardPbrMaterialProperties`). PBR extensions are named after their KHR origin, which is the correct industry vocabulary.
- Out-parameter discipline is correct and alias-safe in `concatColorTransform`/`invertColorTransform`.
- Asymmetry is the main API-shape smell: ColorTransform has clone/copy/set/equals/invert/concat, while every 3D material has only `create*`. An authoritative library would mirror at least `clone*` and `equals*`/`copy*` across the material families, or expose a generic `cloneMaterial`/`copyMaterial` over the entity shape.
- The package manifest `description` ("Color transform and material utilities") and the Package Map entry ("color transform and shader-related utilities; 3D material support is planned as a future direction") both understate reality — the 3D material constructor set is already extensive and shipped, not "planned." Worth updating so the package's true scope is discoverable.
- `equalsMaterial`'s documented "return true for same-kind custom materials" behavior is a defensible batching-vs-structural tradeoff, but it is a correctness sharp edge for any caller expecting structural equality across PBR kinds.

## Recommendation

Treat this as a **solid descriptor library that is one tier of utilities away from authoritative**. Highest-value additions, in order:

1. **Material clone/copy/equals coverage.** Add `cloneMaterial`/`copyMaterial` (generic over the entity shape) and per-family or generic structural `equals*` so dedup/pooling/serialization work for the 3D materials, not just ColorTransform. This is the clearest gap-by-omission.
2. **Model conversions**, at minimum `convertSpecularGlossinessToStandardPbr`, since the package already declares that conversion happens — make it a first-class exported utility.
3. **Round out the color seam**: add `linearToSrgb`/`packLinearToColor` (the inverse of `unpackColorToLinear`) and a small set of canonical color ops (lerp/mix, luminance) so the color half is symmetric.
4. **Fix the manifest/Package-Map description** to reflect the shipped 3D material library.

Whether to bring _material math_ (BRDF/Fresnel/GGX) into this package or keep it in the renderers is a design decision worth surfacing to the user — it is the difference between "authoritative material library" and "authoritative material-descriptor library," and the current architecture deliberately chose the latter.
