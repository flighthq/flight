---
package: '@flighthq/scene3d-formats'
updated: 2026-07-30
basedOn: ./review.md
---

# scene-formats — Assessment

The 2026-07-09 review is no longer an accurate inventory. The live package now parses glTF/GLB,
OBJ/MTL, AWD, 3DS, MD2, and MD5 into the shared `Scene3DDocument` decomposition. glTF already carries
multi-primitive geometry, strided/normalized/sparse accessors, metallic-roughness materials and image
references, sampler state and texture transforms, skins, morphs, and animation tracks. External geometry
bytes are caller-supplied while external images remain explicit unresolved references for
`scene-resources`; parsing does not hide network work. The remaining gaps are integration truth and open
extension depth, not the old "first primitive, no material" slice.

## Depth gaps

1. **Make the complete import result truthful.** Every current parser now records the image identities
   referenced by its material textures in `Scene3DDocument.resources`; independently sampled Texture
   entities share the reference while retaining their own sampling state. Placed glTF cameras and the
   opt-in punctual-light extension now fill the existing standalone document tables. Structured
   diagnostics must still accompany the document without hiding loading inside parsing.
2. **Carry every common vertex channel and topology.** The mesh/GL layout already has working `uv1`,
   `color0`, `joints0`, and `weights0` consumers, but glTF geometry construction still emits only
   `TEXCOORD_0` plus the first skin pair: a texture declaring UV set 1 therefore samples the generic
   zero attribute instead of authored `TEXCOORD_1`, and `COLOR_0` never reaches PBR. Import
   `TEXCOORD_1`, `COLOR_0`, secondary `JOINTS_1`/`WEIGHTS_1`, and their packed/normalized forms with
   material selection, skinning, and rendered proof. Preserve source encodings through the mesh
   package's byte-native record boundary instead of eagerly expanding them merely because
   `MeshGeometry.vertices` is currently a `Float32Array`; the mesh format vocabulary must first gain
   the missing two-component uint/unorm, unorm16, and quantized signed-normalized encodings rather than
   silently decoding every accessor to float. Primitive topology mapping is now complete; raster
   fixtures still need to prove each direct and converted mode.
3. **Replace the remaining inline extension knowledge with open handlers.** The parser now accepts
   individually supplied handlers and `KHR_lights_punctual` ships as one tree-shakable handler;
   `KHR_texture_transform` remains inline. Material and mesh-compression handlers should use the same
   seam; unsupported required extensions still need typed diagnostics/sentinels. Do not add a registerAll
   assembly.
4. **Prove real files end to end.** Canonical fixtures must cross parse → Scene3DDocument → scene assembly
   → resource realization → GL rendering for maps, UV sets, sparse/packed attributes, skin+morph,
   animation, multi-primitive materials, and each classic format. Parser-only unit tests do not establish
   visible import fidelity.

## Recommended

Both items previously listed here — fixture-backed glTF/GLB assertions, and reconciling the
`warnings: string[]` idiom with the inversion rule — are **done and retired**, verified against live
source 2026-07-30 rather than assumed. `gltfParse.test.ts` builds real `.glb` containers through a
`buildGlb` helper and asserts container magic, header version, and chunk validity alongside the
document walk (123 `it`s across 8 `describe`s); and no `warnings` identifier survives anywhere in
this package or the resource layer, every parser reporting through `reportImportDiagnostic` with
structured crumbs whose text lives in the separately-imported `explain*`/`format*` layer.

What remains is the four Depth gaps above. Three are blocked on a decision rather than on effort, and
each is stated with the ruling it needs so the next reader does not re-derive it:

1. **Rule on the mesh encoding vocabulary before importing higher vertex channels (Depth gap 2).**
   The gap's own text requires `@flighthq/mesh` to gain two-component uint/unorm, unorm16, and
   quantized signed-normalized encodings *first*, so `TEXCOORD_1`/`COLOR_0`/`JOINTS_1` can be carried
   without eagerly decoding every accessor to float. Cross-package and sequenced; not startable here.
   The *reporting* half was separable and shipped 2026-07-30 — a material declaring a `texCoord` set
   the parser cannot supply now emits `gltf.texcoord-set-unsupported` (Recover) instead of silently
   sampling set 0, which was the plausible-but-wrong-image failure this gap otherwise ships.
2. **Rule on the extension-handler seam shape before porting `KHR_texture_transform` (Depth gap 3).**
   `GltfExtensionHandler.apply(context)` runs once over the whole document, which is why
   `KHR_lights_punctual` ports cleanly — it walks nodes. `KHR_texture_transform` applies per
   *textureInfo*, inside material resolution, so moving it means giving the seam a per-texture-info
   hook. A seam change, not a mechanical port.
3. **Rule on a fixture policy before proving real files end to end (Depth gap 4).** Standing guidance
   on this arc is not to commit third-party assets, which is what "canonical fixtures" means here.
   Either an approved external asset set is fetched on demand, or this stays a capture/CI concern
   rather than a unit-test one.

## Backlog

- Draco/meshopt/KTX2 decoding composes through separately imported codec handlers; it does not belong in
  the core JSON walker.
- Camera and `KHR_lights_punctual` import target the existing standalone Scene3DDocument tables, not new
  CameraNode/LightNode graph subjects.
- Export/serialization naming, USD/USDZ scope, and progressive parsing remain charter direction work.
- Native binary scene serialization is a separate format over Scene3DDocument, not a reason to preserve
  glTF accessors in the runtime representation.

## Approved

- [2026-07-21 · completed] Required-extension diagnostics now recognize the core parser's consumed
  `KHR_texture_transform` support while retaining a warning for genuinely unsupported requirements.
  Supported/unsupported tests prevent schema presence from being confused with implementation.
- [2026-07-21 · present] All supported importers stop at the format-neutral Scene3DDocument and share the
  scene assembler; the live Scene convenience functions are thin compositions over that boundary.
- [2026-07-21 · present] glTF/GLB core materials, textures/samplers, external buffer input, sparse and
  strided accessors, skins, morphs, and animations are implemented. OBJ/MTL, AWD, 3DS, MD2, and MD5 make
  the package a genuine format family rather than a one-format stub.
- [2026-07-22 · completed] All seven glTF primitive modes now map truthfully: points, lines, line strips,
  triangles, and triangle strips retain their direct Flight topology; line loops and triangle fans
  expand to explicit list indices; unknown modes emit no elements with a diagnostic instead of drawing
  the same bytes as triangles. The GL forward/shadow path consumes the resulting topology.
- [2026-07-22 · completed] glTF image identity is normalized once per `images[]` entry in
  `Scene3DDocument.resources`. Multiple Texture entities may sample that resource with independent
  sampler/color-space/UV state, while scene-resources fetches/decodes the shared identity once.
- [2026-07-22 · completed] OBJ/MTL, AWD, 3DS, MD2, and MD5 now populate `Scene3DDocument.resources`
  instead of leaving material texture references invisible to the document resolver. Repeated external
  URIs or AWD texture-block identities share one reference while each material slot keeps a distinct
  Texture entity; embedded and external source forms are covered at the parser boundary.
- [2026-07-22 · completed] Core glTF camera definitions now become placed `Scene3DDocumentCamera`
  records with truthful perspective/orthographic projection and clip planes, including the optional
  infinite perspective far plane. `KHR_lights_punctual` is a separately imported open extension handler
  that emits Entity-backed directional, point, and spot descriptors into `Scene3DDocument.lights`; required
  extension diagnostics recognize exactly the handlers a caller supplied.
