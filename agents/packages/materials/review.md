---
package: '@flighthq/materials'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/materials.md
  - reviews/alignment/api/materials.md
  - reviews/alignment/ts-rust/materials.md
  - source
  - incoming/builder-67dc46d64 (changes.patch + head)
---

# Review: @flighthq/materials

## Verdict

solid — **86/100**. This package is now two coherent libraries fused into one: a complete `ColorTransform` algebra and a broad, glTF-aligned 3D material descriptor catalog — and as of this bundle it has grown a real color-utility tier (HSL/HSV, premultiply, luminance/contrast, lerp, pack/unpack, the inverse sRGB seam), a validation/clamping tier, a generic material clone/copy/equals suite, a spec→metallic-roughness conversion, and 11 named PBR presets. The depth review's two highest-value gaps (no clone/copy/equals across the 3D family; a one-directional color seam) are both closed. It falls short of authoritative on the deliberate descriptor-vs-math line (no BRDF/Fresnel/GGX), a stale Rust crate (~60% conformance), and a handful of contract-fit drifts (cross-package scratch types defined file-local, a stale doc comment on `hslToRgb`, an `equals` that shallow-compares the PBR `standard` sub-block).

The status report claims **92/100 (gold)** and a 143→200 test count. The test count verifies exactly (200 `it(`s, 84 exported functions, 84 `describe` blocks, 1:1 colocated). The capability claims all verify against `head/`. The score is marked down from the worker's self-estimate for the contract-fit and conformance items below — those are observation deltas, not capability disputes.

## Present capabilities

Grounded in `incoming/builder-67dc46d64/head/packages/materials/src/`.

**Color transform** — unchanged this pass, still the most authoritative slice: `createColorTransform`, `clone/copy/set/setIdentity`, `concatColorTransform` (alias-safe), `invertColorTransform`, the `equals*` family with `compareAlpha`, `isIdentityColorTransform`, the RGB/RGBA offset packers, and `copyColorTransformToArrays` (GPU upload path).

**Color utilities (`color.ts`)** — substantially expanded this pass:

- Seam, now bidirectional: `unpackColorToLinear` (IEC 61966-2-1 EOTF, the single SDK sRGB→linear decode), and its inverse `packLinearToColor` + per-channel `linearChannelToSrgb`. `createLinearColor`.
- Pack/unpack without gamma: `packColor`, `unpackColorRgba`.
- HSL/HSV (sRGB-space, artist-facing): `rgbToHsl`/`rgbToHsv` (out-param, returns `out`), `hslToRgb`/`hsvToRgb` (write `out[0..2]`, leave alpha), `createHslColor`/`createHsvColor`, with `HslColor`/`HsvColor` tuple types.
- Mixing/measurement: `lerpColor` (gamma-correct, mixes in linear), `lerpLinearColor` (alias-safe), `getColorLuminance` (Rec. 709), `getColorContrastRatio` (WCAG 2.x [1,21]).
- Premultiply: `premultiplyColorAlpha`, `unpremultiplyColorAlpha` (zero-alpha division guard). `computeRgbHexString`.

**Material entity core (`material.ts`)** — the depth review's #1 gap, now closed: `cloneMaterial` (generic structural shallow clone; map handles shared, `colorTransform` sub-entity deep-cloned, `standard` block shallow-copied), `copyMaterial` (in-place for pooling, alias-safe no-op when `out === source`), and a rewritten `equalsMaterial` that now does generic structural field comparison for every kind (scalars by value, handles by reference) — fixing the prior "two distinct PBR materials compare equal" sharp edge. UCTM still routes to deep `equalsColorTransform`.

**Surface trailer + alpha mode (`surfaceMaterial.ts`)**: `createSurfaceMaterial` plus `getMaterialAlphaMode`, `isMaterialBlended/Masked/Opaque`.

**3D material catalog**: unlit/debug set (8), classic lighting (Lambert/Phong/BlinnPhong), PBR core (`createStandardPbrMaterial`, `…Properties`, `createSpecularGlossinessPbrMaterial`), and the KHR-named extensions (anisotropy, clearcoat, iridescence, sheen, specular, transmission+volume, Flight subsurface).

**Model conversion (`pbrMaterials.ts`)** — the depth review's #2 gap, now closed: `convertSpecularGlossinessToStandardPbr` — the canonical KHR_materials_pbrSpecularGlossiness → metallic-roughness approximation (roughness = 1 − glossiness; metallic from Rec. 709 F0 luma vs the 0.04 dielectric threshold; base color blended by metallic), alias-safe, forwarding all pass-through fields and remapping the diffuse/spec-gloss map slots.

**Validation/clamping (`materialValidation.ts`)**: `clampStandardPbrMaterialProperties` (metallic/roughness/occlusion → [0,1], emissive/normalScale → [0,∞), returns `out` for chaining), `isValidMaterialIor` ([1,5]), `isValidMaterialClearcoat`, `isValidMaterialIridescenceThickness`, `isValidMaterialWeight`. All sentinels, no throws — verified `grep` finds zero `throw` in src.

**Named presets (`materialPresets.ts`)**: 11 tree-shakable wrappers (aluminum, carbon, glass→transmission-volume, gold, iron, marble, plastic, rubber, silver, skin, wood), each over `create*PbrMaterial` with canonical values and a `Readonly<Partial<…>>` override. No registry — zero cost if unused.

**Hygiene verified**: no `@flighthq/sdk` import, `sideEffects: false`, single `.` export, 84 exports each with a colocated test and matching `describe`. The manifest `description` was updated to reflect the true 3D scope (depth review item #4, done).

## Gaps

- **No material math.** Still no BRDF/Fresnel-Schlick/GGX/IBL/normal-mapping primitives. This is the deliberate descriptor-vs-shading line, and it is the single largest distance from "authoritative material library" → "authoritative material-descriptor library." The status report names it as the gating Gold decision; it correctly does **not** act on it (it has Rust-conformance and package-boundary implications). Surfaced below as an Open direction.
- **`equalsMaterial` shallow-compares the `standard` sub-block.** The generic loop does `aFields[key] !== bFields[key]` for every non-`kind` field, so a PBR-extension material's nested `standard` object (and any other nested entity besides `colorTransform`) compares by reference. Two extension materials built with structurally-equal-but-distinct `standard` blocks return `false`. `cloneMaterial`/`copyMaterial` _do_ allocate a fresh `standard` object, so `equalsMaterial(clone(m), m)` is `false` for any extension material — a real round-trip inconsistency between the clone and equals halves. Not flagged in the status report.
- **Color tier still missing the perceptual layer.** No OKLab/OKLCH (the status report parks this as a scope choice — `@flighthq/materials` vs a dedicated `@flighthq/color`). No named-color or CSS-string parse/format beyond `computeRgbHexString`.
- **No serialization / `materials-formats` neighbor.** No `serializeMaterial`/`deserializeMaterial` and no glTF `material` JSON import — both correctly deferred as cross-package (the map-handle ↔ resource-id seam needs `resources`/`loader` sign-off). This is the triad's `-formats` layer for materials; it does not yet exist and may not need to until plurality appears.
- **No `KHR_texture_transform`** (per-map UV transform) — deferred as a `@flighthq/types` change the GPU renderers read.
- **Conversion matrix is one-directional.** Only spec-gloss→metallic; no `convertStandardPbrToSpecularGlossiness`, no phong↔PBR / shininess↔roughness helpers.
- **No functional/parity rendering scenes** exercising material descriptors end-to-end across backends — unit coverage only.
- **Rust crate is stale.** `flighthq-materials` exists but the ts-rust gate reports ~60% conformance (45 TS / 21 Rust / 24 missing): the entire 3D family, the new color helpers, and the new conversion/validation/preset surface are unported, and Rust has drifted names (`equals_material_by_kind`, a split `create_color_transform_from`) not recorded in the divergence map. The TS `equalsMaterial` rewrite this pass widens that gap — the Rust `_by_kind` name now describes behavior TS no longer has.

## Charter contradictions

None — the charter's North star, Boundaries, Decisions, and Open directions are all `TODO`/empty stubs (only "What it is" is seeded). There is nothing blessed to contradict. Per the rubric rule, judgment fell back to the codebase-map AAA standard; every assumption that filled a charter silence is surfaced as a candidate Open direction below. The thin charter is the dominant finding here: a package this broad, sitting on the 2D-tint / 3D-material / color-seam intersection and feeding both the GPU renderers and `displayobject-skia`, is carrying real design weight with no recorded direction.

## Contract & docs fit

**Package lives up to the contract — mostly:**

- Naming, allocation-by-verb, `out`-param alias-safety, `Readonly<>` on read-only params, sentinels-not-throws, single root export, `sideEffects: false`, 1:1 colocated tests — all clean (corroborated by the api-alignment review's "Clean" list).

**Where the contract is not met (candidate fixes, within-package):**

- **Cross-package scratch types defined file-local.** `LinearColor` is the return/out type of the SDK-wide sRGB decode seam — it crosses into `render-gl`/`scene-wgpu`/`displayobject-skia` — yet it is `export type` in `color.ts`, not in `@flighthq/types`. The api-alignment review flags this **High**. This pass _adds two more of the same shape_: `HslColor` and `HsvColor` are also file-local tuples. The status report acknowledges all three "should migrate to `@flighthq/types` if shared" — they are at minimum the return types of exported barrel functions, so they are already public surface. Candidate: move `LinearColor`/`HslColor`/`HsvColor` to `@flighthq/types`.
- **Stale doc comment on `hslToRgb` (`color.ts:57-60`).** The block comment above `hslToRgb` is a copy-paste of `rgbToHsl`'s — it claims the function "Converts a packed sRGB color to HSL", writes hue/sat/lightness to `out`, and "Returns `out`". The function actually does HSL→RGB and returns `void`. A documentation defect on a public function; the name is right, the comment lies.
- **`createColorTransform` constructor drift** (api-alignment Medium): param named `obj`, not `opts`, and not `Readonly<>` — diverges from every `create*Material`'s `opts?: Readonly<Partial<…>>`. Within-package consistency fix.
- **`compute*` vs `get*` verb split** (api-alignment Low): `computeRgbHexString` derives a value like the `getColorTransformOffsetRgb*` siblings but uses a different verb. Pick one for derived-color reads.

**Where the admin docs are stale (candidate revisions, user-gated):**

- **Package Map entry is badly out of date.** `agents/index.md` still reads "`@flighthq/materials`: color transform and shader-related utilities. A logical home for these concepts; 3D material support is planned as a future direction." The 3D material library is shipped and extensive, the color tier is broad, and there is no "shader" code at all. This is the depth review's item #4 applied to the map (the manifest `description` was fixed; the map line was not). Candidate: rewrite to match the charter's "What it is."
- **CONTRACT front-matter `crate` list.** `materials` has a real `flighthq-materials` crate (confirmed present), so it is correctly absent from the `crate: null` list — no change. Noted only to confirm.

## Candidate open directions

These are the charter silences the review had to assume past. Each is a question for the user to settle into the charter, not a recommendation:

1. **Material-math boundary (the gating fork).** Does `@flighthq/materials` become the shading source of truth (BRDF/Fresnel/GGX/IBL as tested reference math consumed by both the GPU shaders and `displayobject-skia`), or stay descriptor-only with the math living in renderer backends? This is the difference between authoritative material _library_ and authoritative material _descriptor_ library, and it has direct Rust-conformance weight. The status report flags it as the #1 design call. (structural-forks A: source-data vs participation; and the Wasm-mixable-leaf question in fork D — material/color math is named there as a mixable candidate.)
2. **Where do `LinearColor`/`HslColor`/`HsvColor` (and a future color tier) live?** In `@flighthq/types` as shared scratch types, and/or does the color half graduate to a dedicated `@flighthq/color` neighbor? The package is already half a color library; the boundary is undecided.
3. **OKLab/OKLCH tier** — in-package or in the `color` neighbor above. Pure math, no blocker but a scope choice.
4. **Materials serialization / a `materials-formats` triad cell** — the map-handle ↔ resource-id seam shape, and whether glTF `material` import is a `materials-formats` package (triad `-formats` layer) or belongs to `resources`. Cross-package; the plurality guard says don't pre-create the cell until ≥2 formats appear.
5. **`KHR_texture_transform` and the full extension-parity set** (dispersion, diffuse-transmission, emissive-strength as a first-class field, unlit round-trip) — which extensions are in scope, given each may touch `@flighthq/types`.
6. **Rust conformance posture** — when does `flighthq-materials` catch up, and are the existing Rust name drifts (`equals_material_by_kind`, `create_color_transform_from`) sanctioned (recorded in the divergence map) or bugs to rename? The TS `equalsMaterial` rewrite makes the `_by_kind` name actively misleading.
