---
package: '@flighthq/materials'
status: solid
score: 87
updated: 2026-07-13
ingested:
  - status.md
  - source
  - tests
---

# Review: @flighthq/materials

Evidence: live worktree `packages/materials/src/` (11 source files + 11 colocated tests, 194 `it(` cases, ~85 exports). Prior review (2026-06-24, solid/86) was over the `builder-67dc46d64` bundle; this one re-grounds in the live tree, which has since absorbed the fork-H filters dissolution and the 2026-07-03 direction session.

## Verdict

solid — **87/100**. A coherent three-slice descriptor library — ColorTransform algebra, a broad color-utility tier around the single sRGB↔linear seam, and the complete 20-material 3D catalog — with clean hygiene and strong tests. Since the prior review: fork H landed cleanly (the `ColorTransformMaterial`/`UniformColorTransformMaterial` kinds are gone from the whole tree; the algebra stays here per the 2026-07-03 Decision, realized as `ColorTransformAdjustment` in `@flighthq/adjustments`), `LinearColor` moved to `@flighthq/types`, `createColorTransform` now takes `opts?: Readonly<Partial<…>>`, and the `KHR_texture_transform` + per-texture `colorSpace` gap closed on `Texture` in types. Held below 90: two blessed Decisions are only partially executed (Hsl/Hsv types not moved; OKLab/OKLCH in scope but unbuilt), a known stale doc comment survived two passes, the manifest description is stale, and the conversion matrix is still one-directional.

## Present capabilities

- **ColorTransform algebra (`colorTransform.ts`, 16 exports)** — `createColorTransform` (now `opts`-shaped), `clone/copy/set/setColorTransformIdentity`, alias-safe `concatColorTransform`, `invertColorTransform` (zero-multiplier guard), `equalsColorTransform` + `…Multipliers`/`…Offsets` with `compareAlpha`, `isIdentityColorTransform`, RGB/RGBA offset packers both directions, `copyColorTransformToArrays` (GPU upload). The material *kinds* that consumed it migrated to `adjustments` (fork H); the value algebra is the retained bedrock.
- **Color utilities (`color.ts`, 22 exports)** — the bidirectional seam `unpackColorToLinear` (consumed across `render`, `scene-gl`, `scene-wgpu` — the seam is real, not aspirational) / `packLinearToColor` / `linearChannelToSrgb`; gamma-free `packColor`/`unpackColorRgba`; HSL/HSV both directions (sRGB-space, artist-facing, hue [0,360)); gamma-correct `lerpColor` + alias-safe `lerpLinearColor`; `getColorLuminance` (Rec. 709, linear) + `getColorContrastRatio` (WCAG [1,21]); `premultiplyColorAlpha`/`unpremultiplyColorAlpha` (zero-alpha guard); `computeRgbHexString`; `create{Hsl,Hsv,Linear}Color` scratch allocators. `LinearColor` is imported from `@flighthq/types` ✓; `HslColor`/`HsvColor` remain file-local tuples ✗.
- **Material entity core (`material.ts`)** — `createMaterial`, `cloneMaterial`/`copyMaterial` (generic field copy; the `standard` sub-block shallow-copied into a fresh object, map handles shared), `equalsMaterial` (generic scalar-by-value / object-by-reference loop; `standard` compares by reference per the blessed 2026-07-03 Decision).
- **Surface trailer (`surfaceMaterial.ts`)** — `createSurfaceMaterial` (opaque / straight-alpha / `BlendMode.Normal` / 0.5 cutoff / single-sided defaults) + `getMaterialAlphaMode`, `isMaterialBlended/Masked/Opaque`. Trailer matches the architecture: `alphaMode`/`alphaCutoff`/`alphaType`/`blendMode`/`doubleSided`, reusing the 2D `BlendMode` enum (§0.6).
- **The 20-material taxonomy — complete against the §2 table** in `3d-materials-architecture.md`: unlit/special/utility ×8 (`Unlit`, `Emissive`, `Matcap`, `Toon`, `Wireframe`, `VertexColor`, `Depth`, `Normal`), classic ×3 (`Lambert`, `Phong`, `BlinnPhong`), PBR core ×2 (`StandardPbr` + `createStandardPbrMaterialProperties`, `SpecularGlossinessPbr`), KHR extensions ×7 (`Anisotropy`, `Clearcoat`, `Iridescence`, `Sheen`, `Specular`, `Subsurface`, `TransmissionVolume`) — every extension composes a `standard` block (D4), defaults match glTF (iridescence IOR 1.3 / 100–400 nm, transmission IOR 1.5, `attenuationDistance` Infinity). Maps are `Texture | null`, and `Texture` (in types) now carries `colorSpace` + the KHR_texture_transform `uvOffset`/`uvScale`/`uvRotation` — the prior review's two header gaps are closed.
- **Conversion (`pbrMaterials.ts`)** — `convertSpecularGlossinessToStandardPbr`: canonical spec-gloss → metallic-roughness (roughness = 1−glossiness, metallic from Rec. 709 F0 luma vs 0.04 dielectric threshold), alias-safe, forwards all pass-through fields.
- **Validation (`materialValidation.ts`)** — `clampStandardPbrMaterialProperties` (chains), `isValidMaterialIor` [1,5] / `Clearcoat` / `IridescenceThickness` / `Weight`. Sentinels only; zero `throw` in src.
- **Presets (`materialPresets.ts`)** — 11 tree-shakable named PBR presets, each an `opts`-overridable thin wrapper; glass correctly uses transmission-volume.
- **Hygiene** — deps `entity`+`types` only, `sideEffects: false`, single `.` export, no `@flighthq/sdk` import, colocated tests throughout.

## Gaps

- **No shading math** (BRDF/Fresnel/GGX/IBL) — still the descriptor-vs-shading line; the math lives in the `scene-gl`/`scene-wgpu` preludes (`glPbrPrelude`, `wgpuPbrPrelude`) and IBL baking in `glEnvironmentIblBake`. Charter Open direction #1 remains the gating fork; the package correctly does not act on it.
- **OKLab/OKLCH tier blessed but absent.** Decision 2026-07-03 puts the perceptual tier in scope; there is no `rgbToOklab`/`oklabToRgb`/`rgbToOklch`/`oklchToRgb`/perceptual mix in `color.ts`. This is now blessed missing work, not an open question.
- **`HslColor`/`HsvColor` not yet in `@flighthq/types`** — the 2026-07-03 Decision names all three types; only `LinearColor` moved.
- **Stale `hslToRgb` doc comment persists** (`color.ts:56-59`): the block above `hslToRgb` is `rgbToHsl`'s ("Converts a packed sRGB `0xRRGGBBAA` color to HSL … Returns `out`") — the function converts HSL→RGB and returns `void`. Flagged 2026-06-24, listed in the assessment, still unfixed.
- **Conversion matrix one-directional** — no metallic→spec-gloss back-conversion, no phong↔PBR / shininess↔roughness helpers (charter Open direction #7).
- **`equalsMaterial` purpose-comment vs blessed contract tension.** The Decision blesses reference comparison of `standard` (batching signal), but the function's own comment claims it serves "dedup, pooling, and serialization round-trips — NOT the batch flush path". Under that stated purpose, reference-comparing `standard` fails: `equalsMaterial(cloneMaterial(m), m)` is `false` for every extension material (clone allocates a fresh `standard`), and a parsed material would never compare equal. The code is blessed; the comment's stated purpose is not achievable by it — one of the two should change.
- **`copyMaterial` sharp edges** — the copy loop iterates `source` keys only, so copying onto an `out` with extra fields leaves residue, and it rewrites `out.kind` to `source.kind` (a cross-kind copy silently mutates identity). Same-kind precondition is implied, not stated.
- **Minor internal duplication** — `pbrMaterials.ts` re-implements private `linearChannelToSrgb8`/`packLinear` beside the exported `linearChannelToSrgb`/`packLinearToColor`; `lerpColor` allocates a fresh 4-array per call.
- **Manifest `description` is stale**: `"Color transform and material utilities"` — the bundle-era fix ("…3D material descriptors…") never landed in this tree.

## Charter contradictions

Two, both partial-execution of blessed Decisions rather than code defying direction:

1. **Decision 2026-07-03 "`LinearColor`/`HslColor`/`HsvColor` move to `@flighthq/types`"** — only `LinearColor` moved; `HslColor`/`HsvColor` are still `color.ts`-local exports.
2. **Decision 2026-07-03 "OKLab/OKLCH perceptual color tier in scope"** — nothing built.

Everything else conforms: ColorTransform stays (✓, and the fork-H kind migration confirms the algebra/kind split), `equalsMaterial` reference-compare on `standard` (✓ blessed — modulo the comment tension above), TS-leads/Rust-later (✓, no `rust/` in this worktree).

## Contract & docs fit

**Contract**: clean — naming (full type names, `create*`/`clone*`/`copy*`/`equals*`/`is*`/`get*` verbs), out-param alias-safety (tested), `Readonly<>` on inputs, sentinels-not-throws, single root export, `sideEffects: false`, alphabetized exports, types-first for every cross-package type except the two tuple stragglers above.

**Candidate doc revisions (user-gated):**

- **Package Map line** (`agents/index.md`): "`@flighthq/materials` (PBR material taxonomy — unlit, Blinn-Phong, metallic-roughness, depth)" — undersells badly: omits the ColorTransform algebra, the whole color tier and the SDK's single sRGB↔linear seam (which `render-architecture.md` explicitly locates here), the full 20-kind catalog, validation, and presets. Candidate: rewrite from the charter's "What it is".
- **Charter Open direction #8 is itself stale** — it quotes a map line ("color transform and shader-related utilities … 3D material support is planned") that no longer exists; the current line is different but still wrong. Worth refreshing when the map line is rewritten.
- `render-architecture.md`'s materials data-atom line ("20-material taxonomy constructors + the single `unpackColorToLinear` seam; maps are `Texture | null`; extensions compose `standard`") — verified accurate against source. No change.

## Candidate open directions

1. **Material-math boundary** (carried; the gating fork) — descriptor-only vs shading source of truth. Unchanged, still open, still the ceiling between solid and authoritative.
2. **Conversion-matrix completeness** (carried, Open direction #7) — canonical one path only, or the full graph.
3. **`materials-formats` / serialization seam** (carried) — plurality guard still says wait.
4. **Where does the color tier ultimately live** — with OKLab/OKLCH blessed in-package, `color.ts` will be ~30 exports; the `@flighthq/color` neighbor question (Open direction #2's second half) gets more live with each addition. No new evidence forces it; noting the trend.
