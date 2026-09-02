---
package: '@flighthq/materials'
status: solid
score: 83
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (20 implementation files)
  - tests (20 colocated test files, 163 cases)
  - package.json
  - types surface (Material, SurfaceMaterial, StandardPbrMaterial, PbrExtension, ColorScaleBias, and all material/extension type headers)
  - downstream consumers (scene3d-formats, render, node, sdk)
---

# Review: @flighthq/materials

Evidence: live worktree `packages/materials/src/` (20 source files + 20 colocated tests, 79 describe blocks, 163 `it(` cases, 79 exports). Prior review (2026-08-25, solid/87) was partly stale -- its "Present capabilities" section described a `color.ts` with 22 exports and a `colorTransform.ts` with 16 exports, neither of which exist in the current tree. This review re-grounds in the live source, verifying every claim against the actual files.

## Verdict

solid -- **83/100**. A focused two-slice descriptor library -- ColorScaleBias affine algebra and the complete 3D material catalog -- with strong hygiene and thorough tests. Since the prior review: the color-utility slice (`color.ts`, 22 exports) was fully extracted to `@flighthq/color`, the `ColorTransform` algebra was renamed to `ColorScaleBias`, and `HslColor`/`HsvColor` completed their migration to `@flighthq/types` (resolving one prior charter contradiction). The package is leaner and more focused than in the prior review. Held below 90: the `equalsMaterial`/`cloneMaterial` `standard` sub-block inconsistency persists (a functional correctness issue), `ColorScaleBias` remains in this package when the ratified architecture places it in `@flighthq/adjustments`, no diagnostics layer exists, `pbrMaterials.ts` duplicates sRGB conversion internals from `@flighthq/color`, and the charter contains multiple stale references to color-tier work that now belongs to `@flighthq/color`.

## Present capabilities

- **ColorScaleBias algebra (`colorScaleBias.ts`, 16 exports)** -- `createColorScaleBias(opts?: Readonly<Partial<ColorScaleBiasLike>>)`, `cloneColorScaleBias`, `copyColorScaleBias`, `setColorScaleBias` (all 8 fields), `setColorScaleBiasIdentity`, `concatColorScaleBias` (alias-safe -- verified: biases are written before scales, each field read only before its own write; tests cover both `out === source` and `out === other`), `invertColorScaleBias` (zero-scale guard uses 1), `equalsColorScaleBias` + `equalsColorScaleBiasBiases` / `equalsColorScaleBiasScales` (with `compareAlpha` parameter), `isIdentityColorScaleBias` (with `compareAlphaScale`), `getColorScaleBiasBiasRgb` / `getColorScaleBiasBiasRgba` (pack), `setColorScaleBiasBiasRgb` / `setColorScaleBiasBiasRgba` (unpack + zero scales), `copyColorScaleBiasToArrays` (GPU upload). Type `ColorScaleBias` and `ColorScaleBiasLike` are in `@flighthq/types`.
- **Material entity core (`material.ts`, 5 exports)** -- `createMaterial(kind)` (sets `name: null`), `cloneMaterial` (structural shallow clone via `copyMaterialFields`; `standard` sub-block shallow-copied into a fresh object, map handles shared), `copyMaterial` (alias-safe early return), `equalsMaterial` (generic scalar-by-value / object-by-reference loop; `standard` compared by reference per blessed Decision 2026-07-03), `getMaterialOfKind<T>` (type-safe kind narrowing, returns `T | null`). Types `Material`, `Kind` from `@flighthq/types`.
- **Surface material trailer (`surfaceMaterial.ts`, 5 exports)** -- `createSurfaceMaterial(kind, opts?)` (opaque, single-sided, `BlendMode.Normal`, 0.5 cutoff defaults), `getSurfaceMaterialAlphaMode`, `isSurfaceMaterialBlended` / `isSurfaceMaterialMasked` / `isSurfaceMaterialOpaque`. Types `SurfaceMaterial`, `SurfaceMaterialOptions`, `MaterialAlphaMode` from `@flighthq/types`.
- **Material catalog (16 material kinds)**:
  - Unlit/special/utility x8 (`unlitMaterials.ts`): Unlit, Emissive, Matcap, Toon, Wireframe, VertexColor, Depth, Normal -- each with `create*Material(opts?)`.
  - Classic x3 (`classicMaterials.ts`): Lambert, Phong, BlinnPhong -- each with `create*Material(opts?)`, forwarding the surface trailer.
  - PBR core x2 (`pbrMaterials.ts`): `createStandardPbrMaterial`, `createSpecularGlossinessPbrMaterial`, plus `createStandardPbrMaterialProperties` (the reusable property block for extension composition). Shared `assignStandardPbrMaterialProperties` helper.
  - Extended PBR x1 (`extendedPbrMaterial.ts`): `createExtendedPbrMaterial` -- composes a `standard` property block with an ordered `extensions: PbrExtension[]` list.
  - Custom x1 (`customShaderMaterial.ts`): `createCustomShaderMaterial` -- user-authored shader material with `shaderKey`, `uniforms`, `textures`.
  - 2D standard x1 (`standardMaterial.ts`): `createStandardMaterial` -- minimal entity for the default 2D pipeline.
- **PBR extensions x7** -- each an Entity with `create*PbrExtension(opts?)` and `isValid*PbrExtension(value)`:
  - `AnisotropyPbrExtension` -- strength [0,1], rotation, map + UV set.
  - `ClearcoatPbrExtension` -- clearcoat [0,1], roughness [0,1], normal map + scale, three independent UV sets.
  - `IridescencePbrExtension` -- iridescence [0,1], IOR (1.3 default), thickness min/max (100/400 nm), two UV sets, min<=max validation.
  - `SheenPbrExtension` -- color, roughness [0,1], two UV sets.
  - `SpecularPbrExtension` -- specular (default 1), color, two UV sets.
  - `TransmissionVolumePbrExtension` -- transmission [0,1], IOR (1.5 default), thickness >=0, attenuation distance (Infinity default, >0 or Infinity), color, two UV sets.
  - `WrappedDiffusePbrExtension` -- strength [0,1], thickness >=0, color, two UV sets. Honestly named (no longer `SubsurfacePbrExtension`).
- **Conversions (`pbrMaterials.ts`, `phongToPbr.ts`, 5 exports)** -- `convertSpecularGlossinessToStandardPbr` (alias-safe, reads all inputs to locals first; roughness = 1 - glossiness; metallic from Rec. 709 F0 luma vs 0.04 threshold; forwards compatible maps, clears `metallicRoughnessMap` to null), `convertPhongToStandardPbrMaterial` (reference mapping, opts-overridable), `getPbrMetallicFromPhongSpecular` (conservative: metal only when specular > 0.5 luma and diffuse < 0.04), `getPbrRoughnessFromPhongShininess` (sqrt(2 / (shininess + 2)), clamped [0,1]), `getPhongToPbrLightExposure` (returns log2(pi)).
- **Validation (`materialValidation.ts`, 5 exports)** -- `clampStandardPbrMaterialProperties` (in-place, returns for chaining), `isValidMaterialClearcoat` [0,1], `isValidMaterialIor` [1,5], `isValidMaterialIridescenceThickness` >=0 finite, `isValidMaterialWeight` [0,1]. Plus `isValidPbrUvSet` from `pbrExtension.ts` (UV 0 or 1 only). Zero throws in the package.
- **Presets (`materialPresets.ts`, 11 exports)** -- aluminum, carbon, glass, gold, iron, marble, plastic, rubber, silver, skin, wood. Each individually tree-shakable. Glass correctly uses `createExtendedPbrMaterial` with `createTransmissionVolumePbrExtension` (IOR 1.5, transmission 1) and a `standard` property block (not a nested entity). All accept overrides via `opts`.
- **Hygiene** -- deps `@flighthq/color` + `@flighthq/entity` + `@flighthq/types` only, `sideEffects: false`, two-lane exports (`.` and `./contract`), no `@flighthq/sdk` import, no top-level side effects. `index.ts` selectively re-exports 79 names from `contract.ts`; `contract.ts` does 20 barrel re-exports. All intra-SDK imports use the `contract` lane. Module-scope variables (`_identity`, scratch arrays) are at file bottom per convention.

## Gaps

1. **`equalsMaterial` / `cloneMaterial` `standard` sub-block disagreement** (`material.ts:25-42` vs `material.ts:56-71`). `equalsMaterial` compares all fields with `!==`, so `standard` (an object) is reference-compared. `copyMaterialFields` (used by `cloneMaterial`) spreads `standard` into a fresh object. Therefore `equalsMaterial(cloneMaterial(m), m)` returns `false` for every `ExtendedPbrMaterial`. The Decision 2026-07-03 blesses reference comparison for batching, but the `equalsMaterial` comment at line 25 claims its purpose is "dedup, pooling, and serialization round-trips" -- purposes that require structural equality of the sub-block. One of the two (the comparison or the stated purpose) must change.
2. **`copyMaterial` cross-kind sharp edge** (`material.ts:56-71`). The copy loop iterates `source` keys only and overwrites `out.kind` with `source.kind`. Copying a `StandardPbrMaterial` onto an `ExtendedPbrMaterial` silently mutates identity and leaves residual fields. The same-kind precondition is implied but not enforced or documented.
3. **`ColorScaleBias` residue**. Status.md identifies this as a pointwise-Adjustment payload that belongs in `@flighthq/adjustments`. `@flighthq/node` (`nodeColorAdjustment.ts:7`) and `@flighthq/render` (`enableColorAdjustments.ts:2`) import from `@flighthq/materials/contract` solely for `ColorScaleBias`, while `@flighthq/adjustments` itself depends only on `@flighthq/types`. This is a dependency inversion: two packages pull in `materials` just for a color-adjustment primitive.
4. **No diagnostics layer**. Zero `explain*`, `enable*Guards`, or `@flighthq/log` usage anywhere in the package. `convertSpecularGlossinessToStandardPbr` silently clears `metallicRoughnessMap` to null when the source carries a `specularGlossinessMap` -- a materially different result with no runtime signal. `convertPhongToStandardPbrMaterial` has the same silent-drop pattern for unmapped fields. Assessment #4 (parked) identifies this correctly.
5. **Internal duplication in `pbrMaterials.ts`**. Private `linearChannelToSrgb8` (line 147) and `packLinear` (line 153) duplicate logic from `@flighthq/color`'s exported `linearChannelToSrgb` and `packLinearToColor`. The package already depends on `@flighthq/color` (for `unpackColorToLinear` and `getColorLuminance`), so these could be replaced with the shared implementations.
6. **Conversion matrix is one-directional**. `convertSpecularGlossinessToStandardPbr` and `convertPhongToStandardPbrMaterial` both produce metallic-roughness output. No back-conversions exist (`convertStandardPbrToSpecularGlossiness`, `convertStandardPbrToPhong`, `shininess<->roughness`). Charter Open direction #7.
7. **No shading math** (BRDF/Fresnel/GGX/IBL). The package is deliberately descriptor-only; shading math lives in renderer backends. Charter Open direction #1 remains the gating fork for whether this changes. The package correctly does not act on it.
8. **Manifest description stale**: `"Color transform and material utilities"` -- predates both the ColorTransform-to-ColorScaleBias rename and the color-utility extraction to `@flighthq/color`.

## Charter contradictions

The charter contains stale content that no longer describes this package:

1. **Charter "What it is" section describes three slices; only two remain.** The second slice ("Color utilities -- packed-RGBA values and the conversions between color spaces: the bidirectional sRGB<->linear seam ...") was fully extracted to `@flighthq/color`. The charter describes a package that no longer exists.
2. **Decision 2026-07-03 "OKLab/OKLCH perceptual color tier in scope"** -- the status.md 2026-08-08 log explicitly notes this is no longer in this package; it lives in `@flighthq/color` (`oklab.ts`). The charter decision points at the wrong package.
3. **Decision 2026-07-03 "`LinearColor`/`HslColor`/`HsvColor` move to `@flighthq/types`"** -- fully completed. All three types exist in `packages/types/src/` (`LinearColor.ts`, `HslColor.ts`, `HsvColor.ts`). This decision can be marked done.
4. **Open direction #2 ("Where do `LinearColor`/`HslColor`/`HsvColor` live?")** -- resolved. The types are in `@flighthq/types`; the color functions are in `@flighthq/color`. The `@flighthq/color` neighbor question is answered: it exists.
5. **Open direction #3 ("OKLab/OKLCH tier")** -- resolved for this package; the scope choice landed in `@flighthq/color`.
6. **Open direction #4 ("Materials serialization")** -- status.md 2026-08-08 log notes glTF material import shipped in `scene3d-formats/src/gltf*.ts`. The question is answered.
7. **Open direction #8 ("Package Map line")** -- the quoted text is doubly stale (quotes a line that was already wrong, and the current package is different from what it was when the direction was written).

Code-vs-direction conformance is otherwise clean: `equalsMaterial` reference comparison on `standard` matches Decision 2026-07-03; ColorScaleBias stays in materials per the "materials identity is broader than 3D" decision (though status.md flags it as residue); TS-leads/Rust-later is honored (no `rust/` in this worktree).

## Contract & docs fit

**Contract alignment**: naming uses full unabbreviated type names in all 79 exports (`createBlinnPhongMaterial`, `equalsColorScaleBias`, `isValidMaterialIridescenceThickness`). Verb prefixes are correct: `create*`/`clone*`/`copy*`/`equals*`/`is*`/`get*`/`set*`. `Readonly<T>` is applied on all input parameters across every source file (verified). Out-parameter alias-safety is tested for `concatColorScaleBias` (both alias cases) and `copyMaterial`. All types are defined in `@flighthq/types`; the implementation package exports only functions. `sideEffects: false` declared. No throws -- sentinels only. Constants and scratch objects (`_identity`, `scratchLinear`, `DEFAULT_*`) are at file bottom. Intra-SDK imports use the `/contract` lane exclusively.

**Structural**: `index.ts` selectively curates from `contract.ts` (79 named exports vs 20 barrel re-exports). The two-lane structure is correct. No file-mirroring subpaths.

**Test alignment**: 20 test files, 1:1 with source files. 79 describe blocks, 163 test cases. Describe blocks are alphabetized and mirror exported function names. Tests use constructors (`createStandardPbrMaterial`, `createColorScaleBias`) rather than object literals. Extension tests verify Entity identity (`EntityRuntimeKey in value`). Material tests verify kind identity, default values, override application, alias safety, and type narrowing (`@ts-expect-error` for invalid narrowing). Validation tests cover boundaries, NaN, and Infinity.

**Candidate doc revisions (user-gated):**

- **Charter needs a structural rewrite.** The "What it is" section, Open directions #2-5 and #8, and the boundary descriptions reference a three-slice package that no longer exists. The color-utility slice and its decisions are now `@flighthq/color`'s charter content.
- **Manifest `description`** should change from `"Color transform and material utilities"` to something like `"Material descriptors, color scale-bias algebra, and PBR extensions"`.

## Candidate open directions

1. **Material-math boundary** (carried; the gating fork) -- descriptor-only vs shading source of truth. The ceiling between solid and authoritative. Charter Open direction #1.
2. **`ColorScaleBias` home** -- should it move to `@flighthq/adjustments` or a dedicated package? Status.md flags it as residue; `node` and `render` import `materials` solely for it.
3. **Conversion-matrix completeness** (carried) -- canonical one path or the full graph. Charter Open direction #7.
4. **`equalsMaterial` / `cloneMaterial` reconciliation** -- the comment or the comparison must change. If `equalsMaterial` is truly for dedup/pooling, it needs structural comparison of `standard`. If reference comparison is the design, the comment must be rewritten to match the batching purpose.
5. **Diagnostics layer** -- `convertSpecularGlossinessToStandardPbr` and `convertPhongToStandardPbrMaterial` both silently drop information. The package needs `explain*` queries or `enableMaterialConversionGuards` warnings per the diagnostics inversion rule. Assessment #4 (parked) tracks this.
