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

## Verified against the reference corpus

Where a claim below says "no fixture", it means the file was checked, not assumed. The corpus is
`.cache/flight-reference/content/assets/public/openfl/awayjs/assets/` — `soldier_ant.3ds`,
`shambler.awd`, `suzanne.awd`, `sponza.awd`, `MonsterHead.awd`. It is thin, and several gaps below stay
open *because* nothing in it exercises the feature.

## glTF / GLB — the deepest importer

Core glTF 2.0 is covered: nodes, hierarchy, meshes and primitives, all seven primitive modes (line-loop
and triangle-fan convert to canonical lists), sparse accessors, skins, morph targets and weights
animation, cameras (perspective and orthographic), multi-scene, materials with the full metallic-roughness
block, alpha mode/cutoff, double-sidedness, and `KHR_texture_transform`.

Extensions are **individually importable handlers**, never a global registry — accepting one must not
bundle the family. Available: `KHR_lights_punctual`, `KHR_materials_emissive_strength`, `_clearcoat`,
`_sheen`, `_transmission`, `_volume`, `_ior`, `_iridescence`, `_anisotropy`, `_specular`.

**Not covered:**

`KHR_materials_pbrSpecularGlossiness` is also available and is the one handler that REPLACES the material
rather than attaching to it, since specular-glossiness is a different shading model. It imports as a
`SpecularGlossinessPbrMaterial` — the model the file authored — under the standing rule that **a parser
represents what is there honestly**. Flight's `convertSpecularGlossinessToStandardPbr` stays an explicit,
caller-invoked step; that the extension is deprecated is not licence for the importer to silently remap it.

**Not covered:** `KHR_draco_mesh_compression`, `KHR_mesh_quantization`, `KHR_materials_unlit`,
`KHR_texture_basisu`.

## OBJ / MTL

Covered: `v`, `vn`, `vt`, `f` (triangles, quads, N-gons fan-triangulated, independent and negative
indices), `g`/`o` grouping with one `MeshSubset` per `usemtl`, and normal generation when the file
declares no `vn`. MTL reads both the classic Blinn-Phong block and the metallic-roughness PBR extension,
choosing the material model from which directives the file actually states.

**Not covered:**

- **Smoothing groups (`s`).** Generated normals are smooth across every shared vertex, so an authored hard
  edge is lost. 3DS honours its equivalent, so the machinery exists — this is the gap most likely to be
  visible in a render.
- **Line and point primitives (`l`, `p`)** — despite `PrimitiveTopology` carrying `line-list` and
  `point-list`, and glTF importing both.
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
the mesh, skeleton, skinning, and animation, with each section's `shader` becoming a material.

MD5's `bounds { }` block is skipped deliberately — it is derived data recomputable from the geometry.
