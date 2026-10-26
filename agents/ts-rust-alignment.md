# TS–Rust Alignment Work

Status: **ACTIVE.** Tracks every TS change needed to align with approved Rust crate updates. Items are grouped into tiers by effort and dependency; work proceeds top-down.

Source: `agents/rust/design-decisions.md` (rulings), `agents/rust/api-drift.md` (drift inventory and `[ts-pending]` items).

## Tier 1 — Surgical bug fixes

Localized defects found and fixed in the Rust port. Each has a known location and the Rust tests define the expected behavior.

- [x] **T1-01** scale9 sprite instance cursor — `glScale9Sprite.ts` (`drawGlScale9Sprite`) and `wgpuScale9Sprite.ts:74`: seed float write cursor with `instanceIndex * INSTANCE_FLOATS`, not bare `instanceIndex`.
- [x] **T1-02** WgpuShapeMesh.ts:4 comment — says 24-bit `0xRRGGBB`, should say RGBA `0xRRGGBBAA`. Comment-only fix.
- [x] **T1-03** scene3d-gl particle VAO leak — `destroyGlParticleEmitter3DShader`: delete the particle VAO with the shader.
- [x] **T1-04** physics3d-abi joint flag word — `Physics3DAbiJointFlag` should be `{ CollideConnected: 1 << 0, Broken: 1 << 1 }`. Update `encodeJointFlags`, reference decode/readback in `physics3DAbiLayout.ts`, `referencePhysics3DAbi.ts`, `physics3DAbiCommand.ts`.
- [x] **T1-05** effects-wgpu convolution kernel WGSL — already uses `array<vec4f, 13>` with `matrix[i / 4][i % 4]` access.
- [x] **T1-06** scene3d-gl PBR skin declarations — `ensureGlPbrProgram`: include registered skin vertex declarations so HAS_SKIN variant can call `skinMatrix()`.
- [x] **T1-07** scene3d-wgpu PBR color-adjustment anchor — `wgpuPbrPrelude`: add color-adjustment splice anchor to Draw struct so promoted variants can reference `draw.flightColor*` fields.
- [x] **T1-08** scene3d-wgpu PBR skinning anchor — `wgpuPbrPrelude` `vs_main`: add skinning splice anchor to locals so skinned PBR pipelines apply `skinMatrix`.
- [x] **T1-09** render-wgpu fullscreen pipeline depth — already has `depthStencil` and `emptyUniformBindGroup` for null setUniforms.
- [x] **T1-10** updateMeshDeformation re-entry — already uses `lastSkinVersion` tracking to skip refresh when morph didn't write.

## Tier 2 — Targeted, low-churn API changes

Small scope, independently shippable, no structural dependency.

- [ ] **T2-01** `getEasingDerivative` default epsilon — change from `1e-6` to `1e-3` (f32-tuned; D14).
- [ ] **T2-02** Add `MATRIX_IDENTITY` export — new singleton (D14).
- [ ] **T2-03** `registerWgpuCompressedTextureUpload` — change `(state, uploader?: null)` to `(state, enabled: boolean)` (D9).
- [ ] **T2-04** bitmapfont `pages` type — `readonly TextureAtlas[]` → `readonly (TextureAtlas | undefined)[]`.
- [ ] **T2-05** scene-document key sort — replace `localeCompare` with UTF-16 code-unit comparison.

## Tier 3 — Structural rename

Pure rename, no logic change. Easier before other churn.

- [ ] **T3-01** `*Traits` → `*Fields` rename — `NodeTraits` → `NodeFields`, `Node2DTraits` → `Node2DFields`, `Node3DTraits` → `Node3DFields` across ~45 files (D16).

## Tier 4 — Types dissolution

The foundational structural change: dissolve `@flighthq/types` so every type lives in its owning package, matching Rust (D8). The sub-items (textformat, meshgeometry, resource, ByteReader, host) fold into this.

- [ ] **T4-01** Plan dissolution using `agents/rust/research/dissolve-types.md` — map every type file to its owning package.
- [ ] **T4-02** Create `textformat` package — move `TextFormat`, `TextFormatAlign`, `TextFormatListMarker`, `TextFormatRange`, `FontVariation` and functions out of textlayout/text (D8).
- [ ] **T4-03** Rename `mesh` → `meshgeometry` — move `Mesh` node and `updateMeshMorph` to scene3d (D8).
- [ ] **T4-04** Create `resource` package — move `ResourceResolutionState` (D8).
- [ ] **T4-05** Move `ByteReader` — from texture-formats to a new package mirroring flight-buffer (D8).
- [ ] **T4-06** Execute the remaining ~1,073 type relocations and update all imports.
- [ ] **T4-07** Dissolve aggregate Host — fold hostcapability into host at the bottom; redistribute explain/guard code to feature crates; remove aggregate Host entity, its queries, and createHost (D26).

## Tier 5 — Systematic API shape changes

Mechanical but broad. Each package can be batched independently. Depends on tier 4 being settled so files aren't moved twice.

- [ ] **T5-01** D9b: identity returns → void — ~34 functions that return an argument only for chaining. Drop the return and associated tests.
- [ ] **T5-02** D24: make `out` required — ~15 functions (`copyPath`, path-boolean ops, `multiplyColorMatrix`, `computeEffectPadding`). `createEasingSamples` → `writeEasingSamples`.
- [ ] **T5-03** D23: Matrix3/Matrix4 zero-argument constructors — drop optional component parameters; return identity.
- [ ] **T5-04** D23: drop `createX(obj?: Partial<...>)` constructor blobs — ~12 entity types (Sprite, Shape, Tilemap, QuadBatch, MovieClip, etc.). Create, then assign fields.
- [ ] **T5-05** `Uint8ClampedArray` → `Uint8Array` — Bitmap.data, DecodedImage.data, GlyphSource.pixels, bitmap filter outputs (~25 params; D0 exception).
- [ ] **T5-06** Color matrices → `Float32Array` — ~21 functions in adjustments (D0 exception).
- [ ] **T5-07** Remaining array type negotiations — ~133 params across packages. Each needs a per-function decision: TS matches Rust, or Rust gets `allow(conform-array)`. See api-drift.md "Array negotiation items".
- [ ] **T5-08** D5: registries as explicit arguments — collision `registerCollisionSupport2D`, log serializers, etc. Cross-cutting signature changes.
- [ ] **T5-09** Survey and convert remaining non-out chaining returns (~15 cases beyond D9b).
