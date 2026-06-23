# Maturation Roadmap: @flighthq/materials

**Current verdict:** solid — 74/100. A complete OpenFL `ColorTransform` algebra fused with a broad, glTF-aligned 3D material _constructor_ catalog; falls short of authoritative because it is a descriptor layer with no material math, no model conversions, no clone/copy/equals for the 3D families, and a thin color seam.

The package is unusual: its ColorTransform half is already near-authoritative, while its 3D-material half is wide-but-shallow (constructors only). The roadmap therefore concentrates Bronze/Silver on closing the descriptor-layer asymmetries the depth review flagged, and reserves Gold for the genuine frontier — whether analytic material _math_ (BRDF/Fresnel/IBL) belongs in this package at all (a design decision to surface), plus full conversion/validation/preset coverage and Rust parity.

## Bronze

The 20% that removes the most glaring asymmetries. Pure descriptor-layer work — no renderer or math dependencies, no new `*Backend` seams. Shippable and basic.

- `cloneMaterial(source: Readonly<Material>): Material` — generic structural clone over the entity shape (shallow-copies scalar/kind/map-handle fields; map references are shared by design, document this). One function covers every 3D family, fixing the "only ColorTransform has clone" gap.
- `copyMaterial(out: Material, source: Readonly<Material>): void` — in-place variant for pooling, alias-safe.
- `equalsMaterial` rewrite: replace the "return `true` for any same-kind material" sharp edge with a generic structural field comparison (iterate own enumerable data fields, compare scalars and kind strings, compare map handles by reference). Keep the documented batch-vs-structural distinction in the comment, but make structural equality actually structural for PBR kinds.
- `cloneColorTransformMaterial` / `cloneUniformColorTransformMaterial` fall out of generic `cloneMaterial` (verify the `colorTransform` sub-entity is deep-cloned, not aliased).
- `convertSpecularGlossinessToStandardPbr(out: StandardPbrMaterialProperties, source: Readonly<SpecularGlossinessPbrMaterial>): void` — the canonical diffuse/specular/glossiness → base-color/metallic/roughness conversion the package already _claims_ happens "at bind." First-class export with an `out` block; the most-requested missing material utility.
- Color seam symmetry (the inverse of `unpackColorToLinear`):
  - `packLinearToColor(color: Readonly<LinearColor>): number` — linear→sRGB encode + pack to `0xRRGGBBAA` (alpha pass-through), the missing inverse direction.
  - `linearChannelToSrgb(value: number): number` exported counterpart, or keep private and only export the packed form — decide for surface minimalism.
- Manifest + Package Map fix: update `description` from "Color transform and material utilities" to reflect the shipped 3D material library; correct the Package Map line that still says "3D material support is planned."
- Colocated `*.test.ts` for every new function (alias cases for `copyMaterial`/conversion `out`), keep `npm run exports:check` / `order` / `api` green.

## Silver

Competitive and solid — matches a good engine material library. Adds the canonical color-ops set, per-family value discipline, parameter validation/clamping, and serialization round-trips. Still descriptor-layer; introduces the `-formats` neighbor for importers.

- Canonical color operations (the standalone-color-library tier the review flagged as thin), all packed-int in/out, `out`-param where they allocate:
  - `lerpColor(start, end, t): number` and `lerpLinearColor(out, start, end, t)` (gamma-correct mix via the linear seam).
  - `getColorLuminance(color): number` (Rec. 709 / relative luminance) and `getColorContrastRatio(a, b): number`.
  - `packColor(r, g, b, a): number` / `unpackColorRgba(out: [number,number,number,number], color)` — the sRGB-space (non-linear) pack/unpack pair, distinct from the linear seam.
  - HSL/HSV conversions: `rgbToHsl`/`hslToRgb`, `rgbToHsv`/`hsvToRgb` (packed-int convention, `out` arrays).
  - `premultiplyColorAlpha` / `unpremultiplyColorAlpha` (matches the renderers' premultiplied-alpha target).
- Per-family `equals*` fast paths where structural compare is hot (`equalsStandardPbrMaterialProperties`, `equalsSurfaceMaterial` for the shared trailer) — optional optimizations over the generic `equalsMaterial`, mirrored in tests.
- Parameter validation / clamping helpers (expected-failure sentinels, not throws): `clampStandardPbrMaterialProperties(out)` (metallic/roughness/occlusionStrength to [0,1], alphaCutoff to [0,1]), `isValidMaterialIor(value): boolean`, range guards for iridescence thickness and clearcoat. Keep them opt-in functions; do not validate inside constructors.
- `KHR_texture_transform` support: define `TextureTransform` type in `@flighthq/types` (offset/rotation/scale, with `*Like`), add `createTextureTransform`/`copyTextureTransform`/`getTextureTransformMatrix(out: Matrix, …)`, and wire an optional per-map transform field into the material map descriptors. This is the one common glTF feature the catalog currently omits.
- Alpha-mode helpers beyond stored fields: `getMaterialAlphaMode`, `isMaterialOpaque`/`isMaterialBlended`/`isMaterialMasked` over `SurfaceMaterial`, so callers route blend state without re-deriving it.
- Serialization round-trips: `serializeMaterial(source): MaterialData` / `deserializeMaterial(data): Material` (plain-JSON-safe form; map handles serialized as resource ids by the caller's resolver — surface that seam, don't bake resource loading in here). Pairs with the kind-string serialization model in `types-layout`.
- Standard named presets tier (the convenience layer engine libraries ship): `createGoldStandardPbrMaterial`, `createPlasticStandardPbrMaterial`, `createGlassTransmissionVolumePbrMaterial`, `createRubberStandardPbrMaterial`, etc. — thin wrappers over the constructors with canonical metallic/roughness/IOR values. Keep them tree-shakable (separate file, no shared registry).
- `@flighthq/materials-formats` neighbor package (the `-formats` pattern): glTF `material` JSON → Flight material constructors (`importGltfMaterial`, mapping `pbrMetallicRoughness` + each `KHR_materials_*` extension to the matching `create*` call). Keeps the parser's glTF-schema weight off the core package.

## Gold

Authoritative / AAA. Two distinct frontiers: (1) the material-math question — whether analytic shading primitives live here; (2) exhaustive coverage, performance, and Rust parity. Item (1) is a design decision to surface before building.

- **Material math primitives** (the line between "authoritative material library" and "authoritative material-_descriptor_ library" — surface to the user first). If brought in-package, the canonical set, all free functions with `out` params and `Readonly` inputs, no allocation in hot paths:
  - Fresnel: `evaluateFresnelSchlick(out, f0, cosTheta)`, `getDielectricF0(ior): number`.
  - Microfacet distribution / geometry: `evaluateGgxDistribution(roughness, nDotH)`, `evaluateSmithGeometry(...)`, `evaluateGgxSpecular(out, …)`.
  - Diffuse terms: `evaluateLambertDiffuse`, `evaluateBurleyDiffuse`.
  - `evaluateStandardPbrBrdf(out, properties, lightDir, viewDir, normal)` — the composed metallic-roughness BRDF; the reference the GPU shaders and `displayobject-skia` validate against.
  - Tangent-space / normal-mapping math: `applyNormalMap(out, sampledNormal, tangentBasis, normalScale)`.
  - IBL helpers: `evaluateIrradianceSh9(out, shCoeffs, normal)`, `getSpecularIblLod(roughness, mipCount): number`, prefilter/BRDF-LUT sampling helpers.
  - Alternative: keep math in renderers but extract a single shared, tested TS reference module here that shaders are _conformance-checked_ against. Either way, the deliverable is one authoritative, tested implementation of each term.
- Full model-conversion matrix (beyond the Bronze spec→metallic one): `convertStandardPbrToSpecularGlossiness`, `convertPhongToStandardPbr` / `convertStandardPbrToBlinnPhong` (approximations, documented lossiness), and shininess↔roughness mapping helpers.
- Exhaustive KHR extension parity: any remaining ratified `KHR_materials_*` not yet catalogued (`KHR_materials_dispersion`, `KHR_materials_diffuse_transmission`, `KHR_materials_emissive_strength` as a first-class field, unlit `KHR_materials_unlit` round-trip), each with constructor + types + conversion where applicable.
- Color-grading / OKLab tier (rounds out the standalone-color half): `rgbToOklab`/`oklabToRgb`, `rgbToOklch`/`oklchToRgb`, perceptual `mixColorOklab`, and a small color-space matrix set — the modern perceptual-uniform space a top-tier color library now ships.
- Performance + correctness gates: micro-benchmarks for the hot color/BRDF paths; alias-safety tests for _every_ `out`-param function (distinct + aliased); fuzz/round-trip tests for serialize→deserialize and every conversion (convert + invert, assert bounded error); exhaustive default-value tests pinning each constructor's glTF-spec defaults.
- Functional/parity coverage: material-rendering scenes under `tests/functional` exercising each material kind across the raster backends, so the descriptors are validated end-to-end (parity) and against committed baselines (regression), not just unit-tested in isolation.
- **Rust port `flighthq-materials`**: 1:1 crate mirror. ColorTransform algebra, the full material constructor catalog, the color seam, conversions, and (if adopted) the math primitives — `unpack_color_to_linear`, `pack_linear_to_color`, `create_standard_pbr_material`, `evaluate_standard_pbr_brdf`, etc. The BRDF reference is the natural shared source of truth for `displayobject-skia` (the bit-deterministic conformance reference) and the wgpu shaders; record any intentional TS↔Rust divergence in the conformance map. As a value-typed leaf, `materials` is also a candidate for the _mixable_ set (a wasm `materials-rs` drop-in), so keep the package seam plain-data.

## Sequencing & effort

Recommended order, with dependencies and items needing a decision before work starts.

1. **Bronze, in order, all low-effort and self-contained** (no cross-package work): manifest/Package-Map fix → `cloneMaterial`/`copyMaterial` → `equalsMaterial` structural rewrite → `convertSpecularGlossinessToStandardPbr` → color-seam inverse (`packLinearToColor`). These resolve every depth-review "highest-value" item and have no upstream blockers. Largest single item is the `equalsMaterial` rewrite (must handle every catalogued kind's fields). ~1–2 sessions.
2. **Silver color ops + alpha/validation helpers** (low–medium, in-package): pure additive functions, easy to test. Do the color-ops set and clamping/validation before the heavier type-touching items.
3. **Silver type-touching items** (medium, **`@flighthq/types` first** per the header-layer rule): `TextureTransform` and the serialization `MaterialData` shape must be defined in `@flighthq/types` before implementing here. `KHR_texture_transform` also touches the map descriptors consumed by the renderer crates — **cross-package, surface as a suggestion** rather than acting autonomously (it changes a shared type the GPU backends read).
4. **`@flighthq/materials-formats` neighbor** (medium, new package): copy a nearby `-formats` package shape, run `npm run packages:check`. Depends on the glTF resource/types layout; coordinate with `resources`/loader for how map handles resolve. Presets tier can land alongside or before this.
5. **Gold material-math decision FIRST** (the gating design call): bring BRDF/Fresnel/GGX/IBL into `materials`, or keep them in renderers with a shared tested reference module here. This determines whether `materials` becomes the shading source of truth for both GPU shaders and `displayobject-skia`. **Do not build the math tier until the user rules on package boundary** — it is the difference between the two end-states the review names, and it has direct conformance implications for the Rust port.
6. **Gold coverage, conversions, perf gates, OKLab** (high effort, additive once boundaries are set).
7. **Rust `flighthq-materials`** (high effort, after the TS surface stabilizes through at least Silver): port is mechanical for the descriptor layer but the BRDF reference (if adopted) is the shared truth for skia + wgpu conformance, so port it deliberately and record divergences.

**Cross-package / design items to surface to the user:**

- Material-math package boundary (item 5) — the single biggest scope decision; gates a large chunk of Gold.
- `KHR_texture_transform` map-descriptor change — touches types the renderer crates read; needs sign-off.
- Serialization map-handle seam — materials should not import resource loading; the resource-id ↔ handle resolver belongs to the caller. Confirm the seam shape with `resources`/`loader` owners.
- Whether named presets and OKLab belong in `materials` or warrant their own neighbor (`materials-presets`, a color package) if they grow the surface materially.
