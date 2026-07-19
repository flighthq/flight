---
package: "@flighthq/scene-formats"
updated: null
by: null
---

# scene-formats — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

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
