# Scene3D Format Coverage — What Each Importer Reads, and What It Does Not

Read this before assuming a `@flighthq/scene3d-formats` importer carries a feature, before scoping work
on one, and before adding a diagnostic that would announce a gap listed here.

This is the durable answer to "does Flight import AWD cameras?" — a question a reader should not have to
reconstruct from a changelog. The per-package `status.md` records *when and why* coverage changed; this
records *what is true now*. When they disagree, this file is wrong and should be corrected from source.

**A gap here is a project fact, not an asset fact.** That distinction is the rule in
[diagnostics](conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts): a crumb tells
a consumer what happened to *their file*; a gap in our coverage that would fire on every well-formed file
of the format belongs in this document instead, where it costs a shipped app nothing.

## Verified against the fixture corpus

Where a claim below says "no fixture", it means the file was checked, not assumed. The corpus is
the locally acquired `flight-fixtures` set — `soldier_ant.3ds`,
`shambler.awd`, `suzanne.awd`, `sponza.awd`, `MonsterHead.awd`. It is thin, and several gaps below stay
open *because* nothing in it exercises the feature.

## glTF / GLB — the deepest importer

Core glTF 2.0 is covered: nodes, hierarchy, meshes and primitives, all seven primitive modes (line-loop
and triangle-fan convert to canonical lists), sparse accessors, skins, morph targets and weights
animation, cameras (perspective and orthographic), multi-scene, materials with the full metallic-roughness
block, alpha mode/cutoff, double-sidedness, and `KHR_texture_transform`.

Extensions are **individually importable handlers**, never a global registry — accepting one must not
bundle the family. Available: `KHR_lights_punctual`, `KHR_materials_emissive_strength`, `_clearcoat`,
`_sheen`, `_transmission`, `_volume`, `_ior`, `_iridescence`, `_anisotropy`, `_specular`, `_unlit`.

Two need no handler because the core already satisfies them, and are named in `CORE_GLTF_EXTENSIONS` so a
file *requiring* one is not reported unsupported: `KHR_texture_transform`, and `KHR_mesh_quantization` —
the latter only widens which component types an accessor may use, and the reader already reads every
integer width and applies the spec normalization exactly when `normalized` is set.

`KHR_texture_basisu` is **partly** covered, and the parser's share of it is done: a basisu texture is
resolved to its KTX2 image source, which matters because that extension makes the plain `source` an
optional fallback most files omit — reading only `source` dropped the map entirely. The KTX2/Basis
*transcode* is a resource-layer concern (see [basis transcode](basis-transcode.md)), so the extension
stays out of `CORE_GLTF_EXTENSIONS`: without a transcoder registered downstream the image still will not
decode, and the required-extension crumb saying so is accurate at the pipeline level.

**Not covered:**

`KHR_materials_pbrSpecularGlossiness` and `KHR_materials_unlit` are the two handlers that REPLACE the
material rather than attaching to it, because each states a different shading model rather than a
contribution to the metallic-roughness one. Spec-gloss imports as a `SpecularGlossinessPbrMaterial` — the
model the file authored — under the standing rule that **a parser represents what is there honestly**.
Flight's `convertSpecularGlossinessToStandardPbr` stays an explicit, caller-invoked step; that the
extension is deprecated is not licence for the importer to silently remap it.

**`KHR_draco_mesh_compression` is covered by a SEAM, not an implementation.** Flight ships no Draco
decoder and no third-party code: `registerGltfDracoDecoder` lets a consumer plug in its own, and the
registry starts empty so a build that never registers pulls in nothing. That split is deliberate — Draco
is an export-time encoding choice, so a decoder is worth nothing to a consumer whose assets do not use it
and would put a dependency into every build to serve only those who do.

Two consequences worth knowing:

- **The decoder contract is SYNCHRONOUS**, because `parseGltf` is. A real decoder that needs to initialise
  a WebAssembly module does that once at startup and registers only when ready; registration is what
  declares readiness, and the importer never awaits.
- **Draco is the one extension whose support is a RUNTIME fact.** `isSupportedGltfExtension` answers from
  the registry, so a file requiring it is honestly unsupported until a decoder is plugged in and honestly
  supported afterwards.

A compressed primitive with no decoder registered reports `gltf.draco-decoder-missing`. That crumb exists
because the alternative was actively misleading: under this extension a primitive's accessors carry no
bufferView, so the read used to fail as `gltf.accessor-bufferview-not-found` — true, and it sent the
reader hunting for a malformed file instead of a missing decoder. A decoder that throws or declines is
contained to a dropped primitive (`gltf.draco-decode-failed`) rather than taking the import down, since a
decoder is third-party code by design.

## OBJ / MTL

Covered: `v`, `vn`, `vt`, `f` (triangles, quads, N-gons fan-triangulated, independent and negative
indices), `g`/`o` grouping with one `MeshSubset` per `usemtl`, `s` smoothing groups, `l` polylines and `p`
points, and normal generation when the file declares no `vn`. MTL reads both the classic Blinn-Phong block
and the metallic-roughness PBR extension, choosing the material model from which directives the file
actually states.

**Smoothing groups work through the dedup key, not a second normal pass.** A corner whose normal will be
generated is keyed by its smoothing group, so two faces in different groups cannot share a vertex — and
`computeMeshGeometryNormals`, which averages across shared vertices, therefore cannot average across the
boundary. `s off`/`s 0` gives every face a group of its own, which is flat shading. A corner carrying an
authored `vn` is keyed without the group, since its normal is already authoritative and splitting it
would only duplicate vertices that should have merged.

A file that **never mentions `s`** keeps its vertices merged. The spec's default is off, but reading
"unstated" as off would silently turn every existing plain OBJ flat; a file that never says `s` has not
opted into the smoothing model at all.

**Lines and points become sibling meshes**, because `PrimitiveTopology` is a property of the whole
`MeshGeometry` rather than of a subset — a group mixing faces with lines cannot be one mesh. They carry
positions only (neither topology shades or samples) and bind no material, since OBJ states none for them.

**Not covered:**

- **Free-form geometry** (`curv`, `surf`, `vp`, `deg`, `parm`) — no Flight equivalent, and none planned.
- **`Ni` (optical density)** is not parsed at all. It is core MTL, not a PBR extension.
- **Separate `map_Pr`/`map_Pm`** are parsed but unbound: MTL states two grayscale images where the
  standard block carries one packed G=roughness/B=metallic texture, and merging them is an image
  operation over decoded pixels a parser must not perform.
- **`Ps`/`Pc`/`Pcr`/`aniso`** are parsed but unbound — Flight models those as PBR extensions composed onto
  an `ExtendedPbrMaterial`, and the MTL path does not compose them yet. The glTF path does, so the
  descriptors and the promotion helper both already exist. This is recorded here rather than crumbed: the
  cause is our unwired path, not the caller's file.

## 3DS

Covered: named objects, trimeshes, per-face material subsets (`FACE_MATERIAL`), smoothing-group normals,
the `TRI_LOCAL` placement (geometry is localized by its inverse so the node carries a real transform),
materials including shininess/transparency/opacity map, point and spot lights, and cameras.

**Not covered:**

- **The keyframer (`0xB000`) — partially read.** Object-node **pivots** (`0xB013`) ARE imported: the pivot
  is subtracted from the model-space geometry and the opposite translation composed into the node
  placement, so a node rotates about its authored origin. That step is render-neutral by construction and
  mutation-tested against the same round-trip invariant as `TRI_LOCAL`.
  What stays unread is the **hierarchy** and the **animation tracks**, deliberately: the `NODE_HDR`
  trailing uint16 has two documented readings that disagree on edge cases and no corpus file carries a
  keyframer to disambiguate them; because `TRI_LOCAL` matrices are WORLD placements, parenting would
  double-transform unless each child were rebased by `inverse(parentWorld) * childWorld`; and rotation
  tracks are incremental axis-angle with variable-length per-key TCB parameters, so key stride is not
  constant. A wrong hierarchy would visibly misplace geometry that renders correctly today, which is why
  the ambiguous half is left alone rather than guessed.
- **`MAT_BUMPMAP` (0xA230)** is parsed into `ThreeDsMaterial.bumpFilename` but deliberately not bound: it
  is a grayscale HEIGHT field, and binding it to `normalMap` (sampled as RGB*2-1) renders bogus vectors.
  An honest bump→normal seam is a renderer feature, not parser breadth.
- **Ambient material color** — ambient is a scene light in Flight, not a material property.

## AWD2

Covered: triangle geometry, containers and mesh instances with hierarchy, skeletons, skeleton poses and
animations, skinning, materials (color, diffuse texture, normal texture, scalar alpha), textures, lights
(block 41) and light pickers (block 51), cameras (block 42), and compressed bodies via the swappable
decompressor seam.

The camera block states no clip planes and no aspect — in Away3D both belong to the runtime viewport
rather than the asset — so the import takes that ecosystem's own defaults (60° vertical FOV, 20..3000 clip
span, aspect 1) rather than inventing values. An off-center orthographic camera (projection type 5003)
keeps its extents; its origin offset has nowhere to go in Flight's centred volume and is crumbed, which is
an asset fact the author really stated. No corpus fixture carries a camera, so the block layout is
verified against the reference implementation's field order rather than against real bytes.

**Not covered:**

- **Vertex-pose animation (blocks 111/112).** No fixture carries either.
- **Block 113 is an animation SET, not vertex data** — a common misreading, including in an earlier
  Flight worklist. In `shambler.awd` it is named `animationset1` and its payload lists block ids
  52/94/176/…, which are exactly the SkeletonAnim (103) blocks the parser already imports by walking
  blocks directly. Adopting it would add a clip-grouping concept `Scene3DDocument` does not model (its
  `animations` table is flat) for zero new data.
- **Material properties 5, 6, 8, 11, 13, 21, 22 are read by nothing.** They are present in real files —
  key 8 on all 35 `sponza.awd` materials — and the parser walks past them by length. This is the archetype
  for why coverage lives here rather than in the diagnostics stream: a per-property tally would fire on
  every well-formed AWD file ever imported, telling a consumer nothing they can act on.
- **`AWD2_MATERIAL_PROP_ALPHA` (key 10) appears in NO corpus fixture**, which contradicts the "real AWD2
  files carry this on every material" comment in `awd2Schema.ts`. The parser reads it correctly when
  present; only the comment's claim about prevalence is unverified.
- **Method-bearing materials** (`numMethods > 0`) import their base block only. The whole reference corpus
  is `numMethods == 0`, so the method walk is deferred rather than written blind.

## MD2 / MD5

Both are essentially complete against what `Scene3DDocument` models. MD2 imports frame-based vertex
animation as a `MeshMorph` plus the weights clip that drives it, and its skins as materials. MD5 imports
the mesh, skeleton, skinning, and animation, with each section's `shader` becoming a material. Because
MD5 carries neither normals nor tangents, Flight derives both in bind pose; mirrored UV handedness
duplicates the complete skinned vertex record before bind-pose capture, preserving joint influences.

MD5's `bounds { }` block is skipped deliberately — it is derived data recomputable from the geometry.
