---
package: "@flighthq/scene-formats"
updated: "2026-07-24"
by: builder
---

# scene-formats — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-24 — AWD → AWD2: API/file split, version guard, compressed-animation fix, real-corpus verify (builder, user-directed)

The AWD importer is now explicitly **AWD2** end-to-end, reserving the bare `Awd3` namespace for the
future AwayJS SceneGraph (version-3) parser.

**API split (user-ratified).** Renamed the public surface: `parseAwd`→`parseAwd2`,
`createSceneFromAwd`→`createSceneFromAwd2`, `parseAwdSkeletonAnimations`→`parseAwd2SkeletonAnimations`,
`registerAwdDecompressor`→`registerAwd2Decompressor`, `registerAwdDeflateDecompressor`→
`registerAwd2DeflateDecompressor`; internal `AWD_*` schema consts → `AWD2_*` (incl. `AWD2_TANGENT_HANDEDNESS`).
The `@flighthq/types` `AwdDecompressor` type stays version-neutral (a payload-in/bytes-out contract a future
AWD3 parser reuses). **Files renamed** (user request) `awdParse`→`awd2Parse`, `awdSchema`→`awd2Schema`,
`awdInflate`→`awd2Inflate` (+ tests). scene-resources `awdLoad.ts` filename left as-is (cross-package; the
symbol import was updated) — SUGGEST renaming to `awd2Load.ts` for consistency.

**Version guard.** `parseAwd2`/`parseAwd2SkeletonAnimations` now validate the header version-major byte
(offset 3) after the magic: accept 2, else warn + return empty, naming AWD3 explicitly as a recognized but
not-yet-implemented future format. Previously only the magic was checked, so a version-3 file (the whole
awayjs-examples AWD3 folder is v3) silently misparsed under the AWD2 block walk.

**Compressed-animation BUG FIXED (found via real corpus).** `buildAwdDocumentAnimations` was re-walking the
original `bytes` (still-deflated for a compressed file) instead of the rehydrated `source`, so **skeleton
animations were silently dropped for every deflate-compressed AWD** — Away3D's export default — while the
mesh/skin (walked from `source`) still imported. Now walks `source`. Confirmed on onkba.awd: 0 → 5 clips.
Regression-tested with a stub decompressor (no `node:zlib` at build time).

**Real-corpus verification bench (manual, not committed).** Ran the four review-named AWD2 assets end-to-end
(parse → SceneDocument → createSceneFromAwd2). All parse with **0 warnings**:
- PolarBear.awd — v2, uncompressed, skeletal: skin 31 joints, 3 clips (Breathe 62 channels).
- onkba.awd — v2, deflate, skeletal: skin 40 joints, 5 clips (post-fix).
- tictac.awd — v2, deflate: 13 textured materials.
- MonsterHead.awd — v2, deflate: 1 material (4.7 MB, texture-heavy; no morph blocks present).
Block types exercised: 1 geometry, 22 container, 23 mesh-instance, 81 material, 82 texture, 101 skeleton,
102 pose, 103 skeleton-animation, **255 (namespace/metadata — unknown to the parser, skipped gracefully,
no corruption)**. No other core-namespace block types appear in the corpus.

**numMethods empirics (reported to review).** EVERY material in the corpus has **numMethods == 0**
(tictac ×13, MonsterHead ×1; all matType=2 texture). ⇒ the Away3D demos store NO shading methods in-file;
their fog/fresnel/env effects were attached at AS3 runtime by the example, not by the importer. This tells
the *example* author what to wire, not the importer.

### AWD3 — deferred format (chartered, not implemented)

AWD3 is the AwayJS **SceneGraph** binary (version 3): a different block model from AWD2 (shapes, timelines,
textfields, scripts, sounds — a 2D display/timeline authoring format, not just a 3D mesh container). It is
**recognized-and-rejected** by the AWD2 version guard, not misparsed. Unnecessary for current demos; ranks
below other unbuilt 3D importers (e.g. FBX). Building it is a separate future charter that will own the bare
`Awd3`/`createSceneFromAwd3` namespace the AWD2 rename freed. Sample corpus: awayjs-examples `src/assets/AWD3/`.

### NEXT CHUNK — AWD2 materials as ShadedMaterial (user-directed, review-bed46182; NOT yet done)

Rule (final, overrides an earlier numMethods-conditional draft): import AWD2 materials as **ShadedMaterial
uniformly** — honest to the material *model* (AWD material == AwayJS MethodMaterial == BlinnPhong base + method
stack; ShadedMaterial is the Flight type whose range matches, BlinnPhong is a lossy projection). A method-less
material → ShadedMaterial with an empty modifier stack (same base program/pixels). TODO:
1. Read the FULL base PropertyList onto the ShadedMaterial base: diffuse, specular color, gloss→shininess,
   ambient, + diffuse/normal/specular maps (parser currently reads only diffuse color + diffuse/normal tex).
2. Read `numMethods` and walk the method blocks (tail currently unread); map known methods to modifiers
   (Fog→FogModifier, EnvMap→EnvReflect, fresnel-specular→fresnel [may need a new modifier — flag],
   soft-shadow→pcf/shadow config); WARN via the diagnostics seam on any unmapped method, never silent-drop.
3. Wiring cost (accepted, eyes-open): AWD meshes then render through the shaded assembly, so an AWD-loading
   example must `registerBuiltInModifiers` + the shaded mesh renderer, not just the classic BlinnPhong
   renderer. Note this in the importer doc comment + here. Method-less consumers can down-convert themselves.
4. DOC THE RATIONALE in the importer doc comment (durable architectural note, review-7062769f) — the WHY,
   not just the how, as the guard against a future agent seeing all-zero numMethods and reverting to a
   conditional BlinnPhong: "AWD materials import as ShadedMaterial UNIFORMLY — including numMethods=0 (empty
   modifiers[]). AWD's material model is a MethodMaterial = BlinnPhong base + a METHODS ARRAY; ShadedMaterial
   (base + ordered modifiers[]) is its structural image. An empty stack honestly encodes a method-less
   material and compiles to the same base program as BlinnPhong (zero pixel cost), while (a) preserving
   losslessness if any file/exporter DOES carry methods, and (b) letting a demo author reproduce the original
   Away3D look by APPENDING a fresnel/fog modifier — no material-kind conversion. Do NOT collapse method-less
   materials to BlinnPhong: that discards the format's array-shaped intent to save a type."

## 2026-07-24 — md2/md5/awd/3ds parser-maturity pass (builder, per-chunk attested + reviewed)

Correctness + major features + breadth landed this session (each its own commit, attested):

- **MD2**: restored the canonical 162-entry Anorms table (the committed table had **129 scrambled tail
  entries** + 2 missing → corrupt normals; now byte-exact vs `anorms.h`, warns on out-of-range indices).
  Frame-name **animation segmentation** — contiguous same-prefix frame runs become N named morph clips.
- **MD5**: bind position now baked from the **same top-4 renormalized** influence set the skin stores
  (was all-influences → disagreed with joints0/weights0 for >4-influence verts); warns on truncation.
  Added **`importMd5Mesh(meshSource, animSource?)`** one-call composer over parseMd5Mesh + parseMd5Anim.
- **AWD**: tangent.W bitangent handedness now written (was 0 → broke normal mapping); sign derived
  analytically as `-1` — **needs a builder2 shambler render-proof to confirm chirality** (flip the one
  `AWD_TANGENT_HANDEDNESS` constant if bumps invert). **Compression support**: swappable
  `registerAwdDecompressor` seam + vendored dependency-free sync DEFLATE/zlib inflater
  (`registerAwdDeflateDecompressor`), tree-shakable — closes the "compressed AWD imports as nothing" gap.
- **3DS**: per-face **material subsets** (MSH_MAT_GROUP face-index list → one MeshSubset per material) +
  **smoothing-group normals** (SMOOTH_GROUP, vertex-split at hard edges). Material breadth: shininess
  (0xA040 → specular exponent), bump (0xA230 → normalMap), transparency (0xA050 → alpha + blend).

**Parked gaps (review-ruled, not parser fixes):**
- **Opacity texture MAP** MAT_OPACMAP `0xA210` is left unread — BlinnPhongMaterial has no
  `opacityMap`/`alphaMap` field, and adding one is a cross-package feature (types + scene-gl/scene-wgpu
  alpha-map sampling + functional proof), not parser breadth. The same pending question applies to **AWD
  and glTF alpha maps**. Scalar transparency already covers the common case honestly.
- **Bump/height MAP** MAT_BUMPMAP `0xA230` is parsed into `ThreeDsMaterial.bumpFilename` as metadata but
  **not bound to a material** — it is a legacy grayscale HEIGHT field, not a tangent-space normal map, so
  binding it to `normalMap` (sampled as RGB*2-1) would render bogus vectors (three.js TDSLoader keeps
  bumpMap distinct from normalMap for the same reason). An honest bump→normal seam / a `bumpMap` material
  field is the same cross-package renderer feature as the alpha maps above.

Both await a user direction ruling before becoming a scoped dispatch (types → renderer → parsers). The
3DS FACE_MATERIAL subset-split gap below is now **done** (this pass).

## 2026-07-19 — AAA depth follow-ups recorded (doc-honesty stage)

Known parser depth gaps, parked here rather than as inline TODOs:

- **3DS FACE_MATERIAL per-face subset splitting.** `parseTriMesh` (threeDsParse.ts) reads FACE_MATERIAL
  sub-chunks but keeps only the material *names* — it discards the per-material face-index list each
  sub-chunk carries, so a mesh with multiple materials is imported as one undifferentiated geometry
  instead of split into per-material subsets (mirroring the OBJ `usemtl` subset path). AAA: split faces
  into subsets keyed by FACE_MATERIAL, one draw range per material.
- **glTF KHR_materials_emissive_strength.** `gltfParse.ts` never reads the extension; the scene-gl
  material renderers already honor an `emissiveStrength` uniform, so importing it would light emissive
  materials correctly (values > 1 drive bloom). Currently every imported material lands at strength 1.
- **glTF non-triangle primitive modes.** `primitiveToGeometry` warns and imports points/lines/
  strips/fans "as-is" (mode ≠ 4). AAA: convert triangle-strip/fan/line-strip/-loop into the canonical
  triangle-list layout so non-triangle primitives render, rather than passing indices through unchanged.

## 2026-07-17 — AWD skinning wired; shared skin-emit seam across all 3 skeletal formats (builder, reviewed)

`createSceneFromAwd` now emits `joints0`/`weights0` + parses the skeleton block + sets `mesh.skin`
(joints reachable as `mesh.skin.skeleton.joints`), reaching parity with MD5 and glTF. The "one emitter"
seam is now real: a shared **`packSkinInfluences`** primitive in `shared.ts` (top-4-by-weight +
renormalize; `SKINNED_FLOATS_PER_VERTEX`); **MD5 refactored onto it (dropped its duplicate)**, glTF
shares the constant. scene-formats 165 tests + `npm run check` green; verified against the real
`shambler.awd` end-to-end (structurally).

Decoded AWD skin streams empirically: stream type 6 = joint indices as **uint16 even though the stream's
declared type byte says float32** (read by byte length regardless — documented + fixture-asserted);
stream type 7 = float32 weights. shambler carries 8 influences/vertex (1104/3876 verts >4), so top-4
renorm is mandatory.

**BREAKING (intra-package):** `parseAwdSkeletonAnimation(bytes, joints, warnings) → AnimationClip` — now
MD5-symmetric, binds channels to the caller's joints so anim/skeleton/skin share ONE hierarchy (was
`{clip, skeleton}`; only its own tests called it). App flow: `scene = createSceneFromAwd(bytes)` →
find skinned mesh → `parseAwdSkeletonAnimation(bytes, mesh.skin.skeleton.joints)`. Flag for downstream
(flight-reference) AWD usage.

**Needs host visual gate (unverifiable in-sandbox):** the skinned *render* (shambler deforming), and
specifically **animated deformation correctness** — the AWD joint matrices are kept in the existing
local-transform interpretation; static bind pose renders correctly (bind skin = identity) but
local-vs-inverse-bind under animation can only be confirmed visually (fix localized if wrong). Also:
multi-skeleton AWD binds all skinned meshes to the first skeleton (warns); AWD anim drives translation
only (pre-existing).
