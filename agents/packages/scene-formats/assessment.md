---
package: '@flighthq/scene-formats'
updated: 2026-07-22
basedOn: ./review.md
---

# scene-formats — Assessment

The 2026-07-09 review is no longer an accurate inventory. The live package now parses glTF/GLB,
OBJ/MTL, AWD, 3DS, MD2, and MD5 into the shared `SceneDocument` decomposition. glTF already carries
multi-primitive geometry, strided/normalized/sparse accessors, metallic-roughness materials and image
references, sampler state and texture transforms, skins, morphs, and animation tracks. External geometry
bytes are caller-supplied while external images remain explicit unresolved references for
`scene-resources`; parsing does not hide network work. The remaining gaps are integration truth and open
extension depth, not the old "first primitive, no material" slice.

## Depth gaps

1. **Make the complete import result truthful.** `SceneDocument.resources` is documented as the image
   reference table but every parser currently returns it empty while material-owned textures carry the
   real references. Populate/deduplicate that table or remove the false parallel truth. glTF cameras and
   punctual lights must fill their existing standalone document tables, and structured diagnostics must
   accompany the document without hiding loading inside parsing.
   In glTF specifically, resolve image identity once per `images[]` entry and let each independently
   sampled Texture point at that shared reference: the same source may legitimately need separate
   Texture entities for different sampler, color-space, UV-set, or texture-transform state. The current
   material walk constructs a fresh Texture and reference for every slot, so a repeated image is fetched
   and decoded repeatedly and cannot make `resources` truthful by simple post-hoc value deduplication.
2. **Carry every common vertex channel and topology.** `TEXCOORD_1`, `COLOR_0`, secondary
   `JOINTS_1`/`WEIGHTS_1`, and their packed/normalized forms need canonical mesh-layout consumers,
   material selection, skinning, and rendered proof. Non-triangle primitive modes need an honest
   topology mapping rather than warning/dropping visible data.
3. **Replace inline extension knowledge with open handlers.** `KHR_texture_transform` is implemented
   inline, yet `extensionsRequired` currently labels every named extension unsupported—including one the
   parser can consume. Material, punctual-light, mesh-compression, and future vendor handlers should
   register individually; unsupported required extensions return typed diagnostics/sentinels. Do not add
   a registerAll assembly.
4. **Prove real files end to end.** Canonical fixtures must cross parse → SceneDocument → scene assembly
   → resource realization → GL rendering for maps, UV sets, sparse/packed attributes, skin+morph,
   animation, multi-primitive materials, and each classic format. Parser-only unit tests do not establish
   visible import fidelity.

## Recommended

1. Reconcile `SceneDocument.resources` with the texture references already emitted inside materials;
   cover shared-image deduplication and embedded/external references.
2. Add fixture-backed assertions for the already-supported glTF/GLB core before expanding the schema
   again, so regressions are caught above synthetic accessor tests.

## Backlog

- Draco/meshopt/KTX2 decoding composes through separately imported codec handlers; it does not belong in
  the core JSON walker.
- Camera and `KHR_lights_punctual` import target the existing standalone SceneDocument tables, not new
  CameraNode/LightNode graph subjects.
- Export/serialization naming, USD/USDZ scope, and progressive parsing remain charter direction work.
- Native binary scene serialization is a separate format over SceneDocument, not a reason to preserve
  glTF accessors in the runtime representation.

## Approved

- [2026-07-21 · completed] Required-extension diagnostics now recognize the core parser's consumed
  `KHR_texture_transform` support while retaining a warning for genuinely unsupported requirements.
  Supported/unsupported tests prevent schema presence from being confused with implementation.
- [2026-07-21 · present] All supported importers stop at the format-neutral SceneDocument and share the
  scene assembler; the live Scene convenience functions are thin compositions over that boundary.
- [2026-07-21 · present] glTF/GLB core materials, textures/samplers, external buffer input, sparse and
  strided accessors, skins, morphs, and animations are implemented. OBJ/MTL, AWD, 3DS, MD2, and MD5 make
  the package a genuine format family rather than a one-format stub.
