# TS↔Rust Alignment: @flighthq/materials

**Verdict:** Diverged — the 2D color-transform slice ports cleanly, but the entire 3D material family (PBR / classic-lit / unlit / surface, 24 functions) plus two `color` helpers are unported, and several Rust symbols are renamed or added with no entry in the divergence map; the gate reports materials at 60% conformance (45 TS / 21 Rust / 24 missing).

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `equalsMaterial` / `material.ts` | `equals_material_by_kind` / `material.rs` | Renamed without reason. The TS name is `equalsMaterial`; Rust must be `equals_material`. The `_by_kind` suffix is an implementation detail (kind-only structural equality), not a different operation, and breaks the 1:1 name rule. |
| `createColorTransform(obj?)` / `colorTransform.ts` | `create_color_transform()` **+** `create_color_transform_from(8 floats)` / `color_transform.rs` | One TS function split into two Rust functions. `create_color_transform_from` is an extra Rust-only export with no TS counterpart. Either match the TS single-entry shape or record the split (and the named `_from` constructor) in the divergence map with a rationale. |
| `createLinearColor` / `color.ts` | _(missing)_ | Not ported. `color.rs` contains only `compute_rgb_hex_string`; the `LinearColor` helpers were dropped. |
| `unpackColorToLinear` / `color.ts` | _(missing)_ | Not ported (same as above). Out-param signature `(out: LinearColor, color)` would map to `(&mut LinearColor, u32)`. |
| `createBlinnPhongMaterial`, `createLambertMaterial`, `createPhongMaterial` / `classicMaterials.ts` | _(missing)_ | Whole `classicMaterials` family unported. No `classic_materials.rs`. |
| `createStandardPbrMaterial`, `createStandardPbrMaterialProperties`, `createSpecularGlossinessPbrMaterial` / `pbrMaterials.ts` | _(missing)_ | Whole `pbrMaterials` family unported. No `pbr_materials.rs`. |
| `createAnisotropyPbrMaterial`, `createClearcoatPbrMaterial`, `createIridescencePbrMaterial`, `createSheenPbrMaterial`, `createSpecularPbrMaterial`, `createSubsurfacePbrMaterial`, `createTransmissionVolumePbrMaterial` / `pbrExtensionMaterials.ts` | _(missing)_ | Whole `pbrExtensionMaterials` family unported. No `pbr_extension_materials.rs`. |
| `createDepthMaterial`, `createEmissiveMaterial`, `createMatcapMaterial`, `createNormalMaterial`, `createToonMaterial`, `createUnlitMaterial`, `createVertexColorMaterial`, `createWireframeMaterial` / `unlitMaterials.ts` | _(missing)_ | Whole `unlitMaterials` family unported. No `unlit_materials.rs`. |
| `createSurfaceMaterial` / `surfaceMaterial.ts` | _(missing)_ | Unported. No `surface_material.rs`. |
| _(none)_ | `color_transform_material_kind`, `uniform_color_transform_material_kind` / `color_transform_material.rs` | Extra Rust-only exports. TS expresses kind via string constants (the `*Kind` identity model), not `get*Kind()` accessor functions. These `KindId::of`-backed functions are the legitimate Rust kind expression, but they have no TS counterpart and are not recorded — flag as undocumented additions, or note them as the sanctioned Rust kind form in the map. |
| _(none)_ | `equals_uniform_color_transform_material` / `material.rs` | Extra Rust-only export. TS folds uniform-material equality into `equalsMaterial` (the polymorphic equality dispatcher). Rust split it out; not recorded. |

## In sync

These TS functions port cleanly (camelCase→snake_case, full type word preserved, out-param→`&mut`, sentinels→`Option`/`bool`/`-1`):

- `cloneColorTransform` → `clone_color_transform`
- `computeRgbHexString` → `compute_rgb_hex_string`
- `concatColorTransform` → `concat_color_transform` (out-param `&mut`)
- `copyColorTransform` → `copy_color_transform`
- `copyColorTransformToArrays` → `copy_color_transform_to_arrays`
- `createColorTransformMaterial` → `create_color_transform_material`
- `createMaterial` → `create_material`
- `createUniformColorTransformMaterial` → `create_uniform_color_transform_material` (TS `colorTransform?` → Rust `Option<ColorTransform>`, the correct sentinel mapping)
- `equalsColorTransform` → `equals_color_transform`
- `equalsColorTransformMultipliers` → `equals_color_transform_multipliers`
- `equalsColorTransformOffsets` → `equals_color_transform_offsets`
- `getColorTransformOffsetRgb` → `get_color_transform_offset_rgb`
- `getColorTransformOffsetRgba` → `get_color_transform_offset_rgba`
- `invertColorTransform` → `invert_color_transform` (out-param `&mut`)
- `isIdentityColorTransform` → `is_identity_color_transform` (second `compareAlphaMultiplier` bool preserved)
- `setColorTransform` → `set_color_transform`
- `setColorTransformIdentity` → `set_color_transform_identity`
- `setColorTransformOffsetRgb` → `set_color_transform_offset_rgb`
- `setColorTransformOffsetRgba` → `set_color_transform_offset_rgba`

File-name tracking is correct for the ported slice: `colorTransform.ts`↔`color_transform.rs`, `colorTransformMaterial.ts`↔`color_transform_material.rs`, `material.ts`↔`material.rs`, `color.ts`↔`color.rs`.

## Divergence-map actions

Nothing for materials is recorded in `scripts/rust-conformance.ts` (`REVIEWED_DEP_EXCEPTIONS` is dependency-edges only) or `conformance.md`; the only materials line in either is the `render->materials` dep-edge note, which is unrelated to these function gaps. Add, with rationale:

- The 24 unported 3D material constructors (classic / PBR / PBR-extension / unlit / surface) and the two `color` helpers — either as a worklist commitment (port them) or, if 3D materials are intentionally deferred until `scene-gl`/`scene-wgpu` mature, an explicit "3D material constructors deferred" divergence entry. Note: `scene-gl`/`scene-wgpu` already `register*` all of these material kinds, so the Rust backends reference material kinds whose value-constructors don't exist in `flighthq-materials` — the gap is real, not cosmetic.
- The `equalsMaterial` → `equals_material_by_kind` rename (or fix the name).
- The `createColorTransform` → `create_color_transform` + `create_color_transform_from` split and the extra `*_kind()` / `equals_uniform_color_transform_material` accessors.

No map entries currently look stale, because none exist for this crate.
