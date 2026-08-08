---
package: "@flighthq/scene3d-formats"
updated: "2026-08-08"
by: foreman
---

# scene-formats — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-08 — MD5 corpus measured; conformance work held; a naming prohibition that outlives it (foreman, user-directed)

The `mesh-legacy-fixtures` pack carries **real MD5 material**, confirmed by content rather than by
extension: 13 canonical `MD5Version 10` headers — one mesh (`numJoints`/`numMeshes`/`joints`/`mesh`) and
twelve animations (`numFrames`/`numJoints`/`hierarchy`/`baseframe`/`frame`). The real parsers accept all
13. The mesh yields 4 document meshes, 110 joints and 1 skin, plus the existing
`md5mesh.vertex-over-influenced` recovery diagnostic; all twelve animations carry 110 joints, 15–120
frames and 220 channels, parse without diagnostics, and bind to that mesh through `importMd5Mesh`, with
paired imports inheriting the mesh recovery diagnostic.

⚠ **THIS IS ONE ASSET FAMILY. THE COUNT IS 13 AND THE POPULATION IS 1.** ⇒ **No breadth claim can be
made from it, and a name that implies breadth manufactures the claim the corpus cannot support — so an
MD5 smoke lane built on this material is a smoke lane and is never called a conformance scoreboard.**
This holds whoever builds it and whenever, independently of the scoping decision below. The 17 MD5
diagnostic sites (11 anim + 6 mesh) are an **inventory**, never a coverage numerator or denominator.

**Held, not rejected.** An MD5 smoke lane (~1–2 days) and a format-agnostic conformance core (~7–12
days) were both declined on price against a cheaper path: reproducing downstream's *actual* failing
input (~0.5–1 day), which may answer the question outright. ⚠ **A clean run over this corpus would not
mean downstream was wrong — it would mean this corpus does not contain their case, and it must not
close that bug report.**

**Two things block anything scored, whenever it resumes.** MD5 diagnostics do not carry
`detail.capability` and the classifier expects it; and the 17 sites neither define nor exhaust a
capability set, so a capability convention needs its own review. An independent MD5 section probe —
required under every sizing — must reconcile declarations against `joints`/`mesh` or
`hierarchy`/`baseframe`/`frame` **without using the importer as its own oracle**, since a probe that
consults the parser measures the parser's agreement with itself.

The design constraint this scoping produced applies to the *conformance core*, not to MD5, and lives
where that core would be built: [conformance core generality](../swf/conformance-core-generality.md).

## 2026-08-02 — A Draco seam, with no Google code used or shipped (builder, user-directed)

The ruling: Flight will not use or ship any of Google's code, but the format's public shape may inform a
seam that makes Draco an option a consumer opts into. So `registerGltfDracoDecoder` /
`unregisterGltfDracoDecoder` / `getGltfDracoDecoder` / `hasGltfDracoDecoder` exist and no decoder does.

**Why it could not reuse the compression registry.** `@flighthq/compression` has exactly the right
pattern — empty until an explicit call, last-write-wins so a host can swap in a native implementation —
but its contract is byte-to-byte (`Decompressor`). Draco does not decompress to bytes; it decodes to
structured mesh data. The shape transfers, the registry does not.

**The decoder contract is SYNCHRONOUS**, because `parseGltf` is. A real Draco decoder needs asynchronous
WebAssembly setup, so the caller performs that once and registers only the ready decoder — registration
is what declares readiness. Stated on the type, because it is the thing an integrator will trip on.

**Attributes come back keyed by SEMANTIC, not by Draco attribute id.** The id→semantic mapping is stated
by the glTF extension block, which is Flight's side of the boundary; the decoder is handed the mapping
rather than asked to reinvent it. Accessors stay authoritative for count and type, which is what lets the
importer check a decoder against what the file promised.

**Draco is the only extension whose support is a RUNTIME fact.** `isSupportedGltfExtension` answers from
the registry, so a required-extension report follows what the caller actually plugged in.

**Two honesty fixes came with it.** `gltf.draco-decoder-missing` replaces what used to surface as
`gltf.accessor-bufferview-not-found` — technically true and actively misleading, since the bufferView is
not missing, the data is merely somewhere the reader cannot go. And a decoder that throws is contained to
a dropped primitive (`gltf.draco-decode-failed`), because third-party code should not take an import down.

**The whole seam is proved by a STUB decoder in the tests** — payload located, attribute ids handed over,
decoded arrays preferred over the bufferView-less accessors, connectivity taken from the payload. No
Draco dependency and no compressed fixture is needed to know the wiring is right, which puts this in a
different class from the fixture-blocked items.

## 2026-08-02 — The unblocked leftovers, and one of them was a defect (builder, user-directed)

**OBJ smoothing groups, without a second normal-generation pass.** `s` now drives the vertex DEDUP KEY: a
corner whose normal will be generated is keyed by its smoothing group, so two faces in different groups
cannot share a vertex — and `computeMeshGeometryNormals`, which averages across shared vertices, therefore
cannot average across the boundary. Hard edges fall out of the existing generation pass rather than
needing a smoothing-aware twin of it. A corner carrying an authored `vn` is keyed WITHOUT the group: its
normal is already authoritative, and keying it would duplicate vertices that should have merged.

The subtle call is the **unstated** case. The spec's default is `off`, and implementing that literally
turned every existing plain OBJ flat — it split a 4-vertex quad pair into 6 and broke two existing tests.
A file that never says `s` has not opted into the smoothing model at all, so unstated keeps the merged
behaviour and only an explicit `s`/`s off` drives shading. Mutation-tested: reverting the key fails
exactly the four smoothing cases.

**OBJ lines and points import as sibling meshes.** `PrimitiveTopology` belongs to the whole
`MeshGeometry`, not to a subset, so a group mixing faces with lines cannot be one mesh. A polyline's N
references become N-1 connected segments. With `s`, `l`, and `p` all now read, `obj.directive-unsupported`
has no trigger left.

**glTF `KHR_materials_unlit`** joins spec-gloss as a material REPLACEMENT — unlit is not a contribution to
the metallic-roughness model, it is the absence of it. Base color, its map, and the alpha state ride
across; metallic/roughness/normal/occlusion/emissive are dropped by the model change itself, which is the
stated point of the extension rather than a silent loss.

**`KHR_mesh_quantization` needed no code, only the declaration.** The accessor reader already reads every
integer width and applies the spec normalization exactly when `normalized` is set, so a quantized POSITION
already imported correctly — the only gap was that a file *requiring* the extension was reported
unsupported. It now sits in `CORE_GLTF_EXTENSIONS` alongside `KHR_texture_transform`, proved by a test
that reads a normalized-short position accessor end to end rather than by assertion.

**`KHR_texture_basisu` turned out to be a live defect, not a missing feature.** That extension makes the
plain `texture.source` an OPTIONAL fallback, and most real files omit it — so the resolver's
`source === undefined` check was dropping the map entirely and crumbing `gltf.texture-source-missing` for
a texture that was not missing, only elsewhere. It now prefers the basisu source. The extension stays OUT
of `CORE_GLTF_EXTENSIONS` on purpose: the KTX2 transcode is a resource-layer concern, so without a
transcoder registered downstream the image still will not decode, and the required-extension crumb saying
so is accurate at the pipeline level even though the parser's own share is complete.

**`KHR_draco_mesh_compression` is the one left, and deliberately.** It is not parser breadth — it needs a
Draco mesh decoder, a vendored dependency and a cross-package call. The shape already has a precedent in
this package: AWD's `registerAwdDecompressor` seam plus a vendored inflater. Until that call is made a
Draco file honestly reports its required extension unsupported rather than importing empty geometry.

## 2026-08-02 — The fixture-blocked gaps built as far as honesty allows (builder, user-directed)

Four directives: build the fixture-blocked gaps out as far as possible or document them clearly; parsers
**represent what is there honestly**; drop the crumb that violated the import-diagnostics rule.

**The honesty rule settled spec-gloss.** `KHR_materials_pbrSpecularGlossiness` now imports as a
`SpecularGlossinessPbrMaterial` — the model the file authored. It is the one handler that REPLACES the
document material rather than attaching a descriptor, because specular-glossiness is a different shading
model, not a contribution to the standard one. Converting to metallic-roughness at the door was the
tempting shortcut (the extension is deprecated, so that is where the asset is "supposed" to end up) and is
rejected for the same reason MTL is not unconditionally reinterpreted: a lossy remap belongs at a seam the
caller invokes by name. Channels the two models share — normal, occlusion, emissive, alpha — ride across
from the base material rather than being re-resolved, so the swap cannot disagree with the core about
sampler or color space. It declines a material another handler already claimed rather than clobbering it.

**`mtl.pbr-extension-unbound` is gone.** Its cause was our unwired MTL path, not the caller's file — the
exact shape the new rule bans. The gap is in the coverage doc instead.

**AWD cameras (block 42) now import.** The block header is the same envelope every placed AWD block uses,
which is why it reads identically to the light block. Projection type 5001/5002/5003 selects perspective /
orthographic / off-center orthographic; the perspective FOV is the VERTICAL angle in degrees, confirmed
from the reference's own frustum math (`scaleV` carries it directly), so it maps to `fovY` without an
aspect correction. AWD states no clip planes and no aspect — both belong to the runtime viewport in
Away3D, not to the asset — so the import takes that ecosystem's defaults rather than inventing numbers.
An off-center volume keeps its extents and crumbs its lost origin offset, which IS an asset fact.

**3DS keyframer: the unambiguous half is now read.** Object-node pivots (`0xB013`) import — the pivot is
subtracted from model-space geometry and the opposite translation composed into the placement, so a node
rotates about its authored origin instead of the world origin. Render-neutral by construction, and
mutation-tested against the same round-trip invariant `TRI_LOCAL` uses (breaking the compose fails exactly
the two pivot cases).

The hierarchy and the animation tracks stay unread **on purpose**, and that is the "document it" half of
the directive rather than a deferral. The `NODE_HDR` trailing uint16 has two documented readings that
disagree; no corpus file carries a keyframer to settle it; parenting would double-transform against the
world-space `TRI_LOCAL` placements without an `inverse(parentWorld) * childWorld` rebase; and rotation
tracks are incremental axis-angle with variable-length per-key TCB parameters. A wrong hierarchy visibly
misplaces geometry that renders correctly today — strictly worse than flat-but-correct. Reasoning and
scope live in [scene3d format coverage](../../scene3d-format-coverage.md).

## 2026-08-02 — Coverage moved out of the changelog; the crumb line drawn (builder, user-directed)

**A per-property "unhandled" tally for AWD materials was proposed and rejected — correctly.** The finding
behind it is real (keys 5, 6, 8, 11, 13, 21, 22 are read by nothing, key 8 on all 35 sponza materials),
but the fix was wrong: a crumb would fire on essentially every AWD file ever imported, telling the
consumer nothing they can act on. Unlike a guard, an import crumb is **not shakeable** — the parser emits
it, so its prose ships with the parser. What keeps it cheap is that the collector is optional, which means
*what a crumb says* is the whole cost control.

The rule now lives in [diagnostics](../../conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts):
a crumb reports what happened to THIS FILE'S data; a gap in our coverage is a project fact and belongs in a
document. The test is whether a correct, idiomatic file from the format's own authoring tool would trigger
it — if yes, it is announcing that we have not finished, once per import, forever.

Note this cuts against a precedent I set earlier in this same log: `awd2.block-unhandled` survives the
test only because it fires per block type a given file actually carries. The identical construction one
level down, over a property list every file populates, does not. Apply the test, not the precedent.

**Coverage now has a durable home:** [scene3d format coverage](../../scene3d-format-coverage.md), indexed
from `agents/index.md` alongside the other architecture records. A reader asking "does Flight import AWD
cameras?" should not have to reconstruct the answer from a changelog. This log keeps recording *when and
why* coverage changed; that document records *what is true now*, and every "no fixture" claim in it was
verified against the corpus rather than assumed.

Two items previously scattered across entries below are consolidated there and should be read from it
rather than from here: the 3DS keyframer blockers, and the AWD block-113 misreading.

## 2026-08-02 — Material breadth: MTL picks its own model, alpha maps land, glTF extensions reachable (builder, user-directed)

Three material-layer items, all verifiable against real corpora rather than synthetic bytes.

**MTL now picks its shading model from what the file states, and does not guess.** A file carrying any
metallic-roughness directive (`Pr`, `Pm`, `Ps`, `Pc`, `Pcr`, `aniso`, `anisor`, `map_Pr`, `map_Pm`) reads
as `StandardPbrMaterial` field-for-field; everything else reads as the `BlinnPhongMaterial` that
`Ka`/`Kd`/`Ks`/`Ns` actually IS. The rejected alternative was converting unconditionally:
`convertPhongToStandardPbrMaterial` is documented reference-not-exact, needs a metallic *guess*, and
carries a π light-exposure caveat a parser structurally cannot honor (it would have to rescale the
scene's lights, or the import renders ~3.2× dark). That conversion already exists as an explicit,
caller-invoked seam, which is where a lossy remap belongs.

`Ke`/`map_Ke` deliberately do **not** trigger the PBR branch. They name a channel both models could
carry, not a shading model — flipping on them would trade a stated `Ns` for a guessed roughness. A
classic material stating an emissive keeps its model and records `mtl.emissive-dropped` instead. Every
extension field on `ObjMaterial` is nullable so ABSENT stays distinguishable from a stated zero; that
distinction is the whole mechanism.

Two things are parsed but deliberately unbound, each crumbed rather than silently dropped:
`map_Pr`/`map_Pm` (`mtl.metallic-roughness-map-unpacked`) because MTL states them as two grayscale images
while the standard block carries ONE packed texture reading roughness from G and metallic from B —
merging them is an image operation over decoded pixels, which a parser must not do since resources are
referenced here and resolved later; and sheen/clearcoat/anisotropy (`mtl.pbr-extension-unbound`) because
Flight models those as PBR extensions composed onto an `ExtendedPbrMaterial`, not as standard-block
fields. Also: `norm` now outranks `map_Bump` for the normal map, since the former is a real tangent-space
map and the latter a grayscale height field.

**Alpha maps: the parked reason had expired, and one of the three targets does not exist.** MTL `map_d`
and 3DS `MAT_OPACMAP` (0xA210) now bind to `alphaMap` on both material lanes. The non-obvious part is
that an `alphaMap` is INERT while `alphaMode` is `'opaque'`, so a material carrying one flips to `blend`
even when its scalar transparency says fully opaque — otherwise the authored coverage image would import
into a slot the renderer never reads. Scalar and map are independent terms that multiply, so a file
stating both keeps both.

The AWD third of that parked entry has **nothing to bind**. Dumping every material block across all four
AWD fixtures gives property keys 1, 2, 3, 5, 6, 8, 11, 13, 21, 22 — no opacity-texture property appears,
and the parser already handles the scalar alpha. Worth recording separately: keys 5, 6, 8, 11, 13, 21 and
22 ARE present in real files (8 on all 35 sponza materials) and the parser reads NONE of them, silently.
That is the same silent-drop class the block-level `awd2.block-unhandled` tally closed, one level down —
a property-level tally is the obvious follow-up. Also note property 10 (ALPHA) appears in NO fixture,
which contradicts the "real AWD2 files carry this on every material" comment in `awd2Schema.ts`.

**glTF material extensions are now reachable, through the registry rather than hardcoded.**
`GltfExtensionContext` gained `resolveTexture` — the core's own resolver, bound to the parse's image
table — because a handler that built its own texture refs would produce refs `loadScene3DResources` does
not recognize. The context doc now also states the guarantee handlers depend on: `document.materials` is
index-aligned with `source.materials`.

`attachGltfPbrExtension` is the shared promote-or-append step every KHR_materials_* handler needs. It is
idempotent by design: a file using clearcoat AND sheen runs two independently imported handlers over one
material, and the second must append to the first's work rather than re-promote and discard it. Promotion
carries the resolved standard block, alpha mode, cutoff, double-sidedness and name across, and refuses
any material that is not on the metallic-roughness lane (an unlit or spec-gloss material has no standard
block to extend). Three handlers ship: `KHR_materials_emissive_strength` (which follows a material
another handler already promoted, since handler order is not guaranteed), `KHR_materials_clearcoat`, and
`KHR_materials_sheen`.

**The rest of the family followed in the same pass**, and one of them forced a second seam.
`TransmissionVolumePbrExtension` is ONE Flight descriptor for THREE glTF extensions —
`KHR_materials_transmission`, `_volume`, and `_ior` — so those handlers cannot each attach their own.
`findGltfPbrExtension` is the lookup that lets them cooperate: whichever runs first attaches the
descriptor and the others find it and fill their own fields. They stay three separately importable
handlers rather than one, because a file may state any subset (transmission alone is a thin refractive
surface; ior alone retunes an ordinary material) and because accepting one extension must never install
the others. Handler order is not guaranteed, so none may assume it is the creator — the order-independence
test runs the trio forwards and backwards and asserts ONE descriptor either way.

Also shipped: `_iridescence` (both nanometre thickness bounds import even when a thickness texture is
present, because the texture's green channel INTERPOLATES between them rather than carrying an absolute
depth), `_anisotropy` (rotation in radians — it is a math-layer angle over a tangent-space direction map,
not an authoring property), and `_specular` (whose two textures split by channel and therefore by color
space: strength in the alpha of `specularTexture`, linear; color in the RGB of `specularColorTexture`,
sRGB).

**One extension is deliberately still unbuilt.** `KHR_materials_pbrSpecularGlossiness` wants a different
shape from everything above — a material REPLACEMENT, not an extension attachment — because Flight
already carries both a `SpecularGlossinessPbrMaterial` and a `convertSpecularGlossinessToStandardPbr`.
Which of those two an importer should produce is a design question (keep the authored model, or convert
to the metallic-roughness lane at import), not parser breadth, so it wants a ruling before code.

## 2026-08-02 — 3DS meshes carry a real transform; OBJ stops importing black (builder, user-directed)

**TRI_LOCAL (0x4160) is read, and it changes what a 3DS node IS.** The constant had been declared in
`ThreeDsSchema.ts` and referenced by nothing, so every 3DS mesh node was built at `createTransform3D()`
identity. The reason that looked harmless is that **3DS stores vertices in WORLD space** — the geometry
renders in the right place precisely because the placement is already baked into it. The cost is that the
node has no transform to drive: no pivot, no hierarchy, nothing for an animation channel to bind to.

So the parser now applies the placement's INVERSE to recover model-space geometry and decomposes the
placement onto the node. Two facts worth keeping:

- The chunk's 12 floats are four contiguous 3-vectors — X axis, Y axis, Z axis, origin — which map
  **straight onto `Matrix4`'s four columns** (`m[column * 4 + row]`) with no transpose.
- Re-expressing the placement in Y-up is a **conjugation**, `C * M * transpose(C)`, not a rotation of `M`.
  Rotating it instead puts the geometry somewhere else entirely. `THREE_DS_Z_UP_TO_Y_UP` and its inverse
  are named constants for exactly this.

A singular placement records `3ds.local-matrix-singular` (Recover) and falls back to world-space geometry
with an identity node — the pre-TRI_LOCAL behavior, which still renders correctly.

**The test that earns its place.** `expectWorldPositionsPreserved` re-applies the emitted node transform
to the emitted model-space geometry and compares against the file's world vertices taken through the
Z-up→Y-up seam. It is derived from the FORMAT's own relation, not from this parser's implementation, so it
cannot quietly agree with a wrong assumption the way a hand-written expected-value table would. It is also
**mutation-tested**: deleting the conjugation's second multiply fails exactly the three round-trip cases.
Do the same for anything built on the keyframer — with no fixture, a synthetic test that encodes the same
guess as the parser proves nothing.

**OBJ no longer zero-fills normals.** `objParse` pushed `0, 0, 0` whenever a file declared no `vn`, and a
zero normal shades black under any lit material — so a plain positions-and-faces OBJ, the most common kind
there is, imported unlit. It now generates them with `computeMeshGeometryNormals`, which is what AWD and
MD5 already do when their files omit normals; OBJ was the only importer in the package that did not.
Smooth rather than flat, matching the 3DS no-smoothing-chunk choice — OBJ's `s` directive is still not
modeled, so there is no authored hard edge to honor.

**The keyframer (0xB000) is deliberately NOT built, and should not be guessed at.** Three reasons, all
verified this session rather than assumed:

1. **No fixture exists.** `soldier_ant.3ds` is the only 3DS in the reference corpus and carries neither
   0x4160 nor 0xB000 — its whole tree is MAIN → EDITOR → one material + one object → trimesh.
2. **The tree encoding is genuinely ambiguous.** `NODE_HDR` (0xB010) is name + two uint16 flags + a uint16
   hierarchy value. One documented reading makes that value the parent's index in appearance order
   (0xFFFF = root); another implementation treats it as a depth position reconstructed with a running
   index and a stack walk. They agree on well-formed 3ds Max output and diverge on edge cases, and with no
   fixture there is no way to choose empirically.
3. **Parenting now interacts with TRI_LOCAL and would be wrong done naively.** Those matrices are WORLD
   placements. Now that they ride the node transform, parenting B under A double-transforms B unless the
   child is rebased by `inverse(parentWorld) * childWorld`. Hierarchy work that skips this rebase will
   break scenes that currently render correctly.

Animation tracks add two more traps on top: 3DS rotation keys are **incremental** axis-angle (each
relative to the previous, not absolute), and every key carries variable-length TCB/spline parameters gated
by a per-key flag bitfield, so key stride is not constant. The standing recommendation is to land
hierarchy + pivot only — with the inverse-parent rebase, and an unresolvable parent falling back to root —
and to defer tracks until a real authored 3DS exists to check against.

## 2026-08-02 — 3DS lights and cameras imported; the mesh-era residue named (builder, user-directed)

**The cause, which predicts the rest of the worklist.** These parsers were written when a parse produced a
MESH. `Scene3DDocument` — nodes, lights, cameras, animations, skins — landed later, and the classic-format
parsers were never revisited against it. The residue was literal: `parseObject` returned `null` for any
named object without a trimesh, under a comment reading "Flight imports meshes only", and a test pinned
that skip. 3DS carries lights and cameras INSIDE those very object chunks, so the parser was bailing one
chunk id before the data. This is the same shape as the AWD2 light gap fixed yesterday, and the user has
scoped a worklist of the rest (see the agent assignment): 3DS keyframer + TRI_LOCAL, AWD2 camera/vertex
animation, OBJ normals, the MTL material model, alpha maps, glTF extended PBR.

**What landed.** A named object's kind is now whichever entity sub-chunk it carries — trimesh (0x4100),
light (0x4600), or camera (0x4700) — and `collectThreeDsObjects` feeds three collectors from one walk.
Lights and cameras fill the document's PLACEMENT TABLES, not the node graph, matching the AWD2 precedent:
the descriptor is authored in the entity's own LOCAL space (position at origin, aim down -Z) and the
`transform` carries placement and orientation. A light with the spot sub-chunk becomes a `SpotLight` aimed
at its target point; every other light is a `PointLight`, which is the format's own default.

**Wire semantics are verified, not recalled — and two references disagreed.** Neither AwayJS's
`Max3DSParser` nor three.js's `TDSLoader` parses these payloads (three.js carries the chunk ids as
commented-out constants only), and the canonical spec host is behind the sandbox's default-deny network
policy. Two independent implementations were consulted for the FORMAT FACTS only — byte order, field
order, units — and no code, naming, or structure was taken from either; the sources were deleted before
the parser was written, deliberately, because their licenses (BSD-3 attribution and GPL) make copying a
problem the facts themselves are not. They conflicted on two fields, resolved on the format's own terms:

- **The camera's 4th float is a focal length in MILLIMETRES, not an angle.** One reference reads it as a
  degree FOV. The format documents a lens, and the other reference's round trip (its exporter writes a
  lens) confirms it. `THREE_DS_CAMERA_APERTURE_MM = 36` converts against the 35mm gate the format meters
  on. With no aspect ratio anywhere in 3DS, the camera is emitted at aspect 1, where horizontal and
  vertical fields of view coincide — the shape glTF also lands on when `aspectRatio` is absent.
- **Spot hotspot and falloff are two ABSOLUTE cone angles, not a base plus an offset.** One reference adds
  the falloff to the hotspot under a comment marking it a fix — an implementation workaround, not a format
  fact. They are also FULL apertures, while Flight's cone is described by half-angles, so each is halved.

**Deliberate drops, each crumbed.** `3ds.light-inner-range-dropped` (3DS states where attenuation begins
and where it ends; Flight carries the single cutoff, so the outer maps and the inner has nowhere to go).
`3ds.light-disabled` — a switched-off light still imports, placement and cone intact, at zero intensity, so
re-enabling it is one field write rather than a re-import. `3ds.non-mesh-object` is **renamed**
`3ds.non-entity-object` and now means what it says: a dummy/helper object carrying none of the three
entity sub-chunks. Absent CAM_RANGES falls back to 3DS's own 1/1000 clip range and a missing lens to its
stock 50mm — format defaults, not invented ones.

**No corpus fixture carries a light or camera.** `soldier_ant.3ds`, the only 3DS in the reference corpus,
is a single mesh; the 11 new tests build their chunk bytes programmatically. So the wire layout is
verified against two independent readers and the placement math is unit-tested, but nothing has yet
round-tripped a real authored 3DS light. **A file exported from 3ds Max with a spot and a camera is the
missing proof** — worth capturing before trusting the aim on a real scene.

**Two corrections to entries below, recorded here rather than edited in place (this log is append-only).**
The 2026-07-19 entry's "glTF non-triangle primitive modes" item is **stale** —
`buildGltfPrimitiveElements` already converts line-loops and triangle-fans to canonical triangle/line
lists. The 2026-07-2x "Parked gaps" entry parks 3DS `MAT_OPACMAP` / MTL `map_d` / AWD alpha maps on the
grounds that "BlinnPhongMaterial has no `opacityMap`/`alphaMap` field" — that reason has **expired**:
`BlinnPhongMaterial.alphaMap` now exists and builder2 has attested the renderer side. The gap is
un-blocked, not un-parked; it is item 6 on the worklist and no parser reads those chunks yet.

## 2026-08-01 — AWD2 lights: blocks 41 and 51 are no longer dropped (builder, user-directed)

A downstream report on `shambler.awd`: the file carries lighting, `Scene3DDocument` already models lights,
and the AWD2 parser named neither the light block (41) nor the light-picker block (51) — both fell into the
unhandled-block tally and `document.lights` came back empty.

**The compound-light split is the design call.** An AWD light is ONE entity carrying TWO terms: a punctual
term (`color` × `diffuse`, aimed or placed) and its own ambient fill (`ambientColor` × `ambient`). Flight
models those as separate descriptors, so one block imports as a DirectionalLight/PointLight **plus** a
sibling AmbientLight named `<light> Ambient`, emitted only when the file gave it a non-zero ambient. Folding
the ambient into the punctual color would tint the wrong term; dropping it would lose the author's fill.

**Property semantics are verified, not recalled.** The key→meaning map (3 color, 4 specular, 5 diffuse, 7
ambientColor, 8 ambient, 9 shadow-mapper, 21/22/23 direction, 1/2 radius/falloff) was read off AwayJS's own
`AWDParser.ts` in `.cache/flight-reference/node_modules/@awayjs/parsers`, then confirmed against the
shambler bytes. Property width is taken from each record's own byte-length prefix rather than the file's
wide-properties flag — the record is self-describing, so a mixed-width or flag-disagreeing file still reads.

**A directional light's placement stays identity.** Its aim is the world-space `direction` on the
descriptor, which is exactly how Away3D reads it (`parseLight` applies the block matrix for POINT lights
only). Baking the matrix in as well would invite a consumer to rotate an already-world-space vector twice.

**Pickers are read, never built from.** Away3D scopes lights per MATERIAL through a picker; Flight's light
set is a scene-wide per-draw argument. So a picker is parsed only to detect the loss: a file whose pickers
do not all select every light records `awd2.light-scope-dropped`. A file with NO picker reports nothing —
it expressed no scoping to drop, and the document's light table is inert until a caller draws with it.

Losses recorded, all aggregated one-crumb-per-kind with `buildAwdDocumentLights` as origin:
`awd2.light-radius-dropped` (Away3D's falloff START, no home in Flight's single `range` cutoff),
`awd2.light-specular-dropped` (a specular scale pulled apart from diffuse), `awd2.light-unsupported-type`.

**Verified against the real asset.** `shambler.awd` now imports 2 lights — a DirectionalLight (0.7
intensity, direction (0.6601, -0.7071, -0.2534) after the left-to-right-handed z flip, white) and its split
AmbientLight (0.3) — with **zero** light diagnostics. Its 4 remaining `awd2.block-unhandled` crumbs are
types 113/122/254/255, unrelated to lighting.

`examples/packages/awd2loading` now authors a light block into its synthetic fixture and consumes it via
`parseAwd2` + `createScene3DFromDocument`, reading both descriptors out of `document.lights` — the first
consumer of that table anywhere in the repo.

**PLACEMENT CONVENTION RULED (user, 2026-08-01): glTF wins, as the industry-standard definition.** A
document light's descriptor holds the light in its OWN LOCAL space and `transform` places and orients it —
directional/spot aim down canonical local -Z, point sits at the local origin. AWD states a world-space aim,
so the importer converts that INTO the transform's rotation rather than writing it onto the descriptor.
glTF's importer already obeyed this and was left untouched.

The convention is now written down on `Scene3DDocumentLight`, with the document-stage exception noted on
`DirectionalLight` and `PointLight` themselves — the ambiguity that let two importers diverge was that
`DirectionalLight` said world-space while `Scene3DDocumentLight` said placement lives in `transform`, and
both were readable as authoritative. Document stage is PRE-composition; everything a renderer consumes
(`Scene3DLights`, `packScene3DLightBlock`) is world-space, and the caller composes at that seam.

**Still open, deliberately not built:** no `createScene3DLightsFromDocument` bridge exists, so the
awd2loading example composes the aim itself (one `rotateVector3ByQuaternion` off the local axis) and selects
its own lights. That is house-style-explicit for an example, but every consumer will repeat it — the bridge
is now unblocked and wants a home in `@flighthq/scene3d` next to `createScene3DFromDocument`.

## 2026-07-29 — md2 read-integrity: the parser family is closed (builder, review-directed)

Last of the four. The mildest by the corrected ranking, and the cleanest demonstration of axis 9 in the
set. Five probes, each verified failing pre-fix.

**AXIS 9 — the tautological bound, and the two anchors the file was handing over for free.** The frame
reads were bounded by `offFrames + numFrames * frameStride`, where `frameStride` is derived from
`numVertices` — the same input the per-frame ADDRESS uses. If that count is wrong the bound is wrong by
exactly the amount needed to keep passing, so every frame after the first is read from a drifting offset,
decoding its neighbour's bytes as scale/translate floats that are finite, plausible, and completely wrong.
MD2 declares the stride a second time in `framesize` (header offset 16) and the file's total size in
`offEnd` (offset 64), and the parser read **neither**. Both are now read and reconciled: a stride
disagreement is a Reject (nothing downstream can be trusted), a size disagreement a Recover.

**AXIS 10 — sibling disjointness.** MD2's sections *tile* the file rather than nesting, so two of them
claiming the same bytes is invisible to containment checking at any depth — each region is individually
inside the file. Overlap now reports; the probe points `offFrames` at the triangle block, which decodes
uint16 index pairs as float32 and builds a complete animated mesh out of them.

**AXIS 2 — negative header fields.** Every offset and count is a signed int32 read straight from the file.
A negative count threw out of the typed-array allocation; a negative offset passed every upper-bound test,
because the read simply started earlier. `offSkins` was the worst case: it had neither a lower bound nor a
place in the aggregate check, and through raw byte indexing (which yields `undefined` rather than throwing)
it fabricated a 64-NUL material name with a matching texture path and **no diagnostic at all**.

**One deliberate proportionality call.** Skins stay OUT of the fatal aggregate extent check. A skin is an
optional texture name, so a truncated skin table degrades the material and leaves the geometry intact, and
it keeps its existing per-record Drop. What `offSkins` actually lacked was the lower bound; adding it
closes the fabrication without escalating an optional section's truncation into a dead file. An earlier
draft did escalate, and an existing test caught it — correctly.

**THE PARSER FAMILY IS NOW CLOSED**: gltf, 3ds, awd2, md5, md2. Two unrecoverable defects found and fixed
(the 3ds hang, the awd2 inflate bomb) plus silent-wrong-read classes in all five.

scene-formats 528/528. Bare `npm run check` clean, bare `npm run test` 13000 passed / 1196 files.

**Note on the suite:** two of three full runs reported 1-2 tests SKIPPED in `scene3d-resources/md5Load`
with a ~10s duration, and the count differed between runs; the file passes alone and the third full run
was 13000/13000 clean. That is the known transient-mount flakiness, not a consequence of these changes —
recorded rather than quietly re-run until green.

## 2026-07-29 — md5 read-integrity fixes: the axis-12 class closed (builder, user-directed)

The worst remaining silent-wrong-read surface from the four-parser audit. Seven defects fixed, each with
a probe **verified to fail against the pre-fix parser** — six of the seven failed there SILENTLY, with a
fully-formed renderable mesh and either no diagnostic or one that truthfully reported a single bad line
while the real damage was every index in the file after it.

**AXIS 12 — RECOVERY-INDUCED REINDEXING. The headline, and the reason md5 ranked worst.** MD5 records are
addressed by array POSITION (a vert names a weight range, a tri names verts) and each record ALSO declares
its own ordinal — `vert 0`, `weight 3`. The parser discarded the ordinal and appended in encounter order,
so dropping one malformed line closed the gap by shifting, silently redefining every reference to every
later record. Nothing downstream could notice: the shifted indices are all still in range and all still
resolve. Now records are placed at their declared ordinal, a gap is filled with an explicit placeholder
built to FAIL the checks it will later meet (a weight with joint -1, a vertex with no influences) rather
than pass as real data, and a repeated or out-of-order ordinal keeps the first record — the only choice
that preserves positions other records already reference.

**AXIS 5 — the declared counts are now read.** `numverts`/`numtris`/`numweights` were parsed and thrown
away; they are the cheapest detector for a lost record, catching the loss even where no ordinal survives.
Each is reconciled against the records actually present.

**AXIS 11, found while fixing.** `parseMeshBlock` had two exits — a closing-brace return and a
ran-out-of-lines return — and the first skipped the new reconciliation entirely. Both now finish through
one path. Two exits doing the same finishing work is how one ends up missing a check the other has; it is
the same shape as the 3ds guard asymmetry, in a file that had only two copies instead of eight.

Also closed: **triangle indices are bounds-checked** (a negative index wrapped through `Uint32Array.from`
to ~4.29e9 and reached the GPU index buffer; a too-large one poisoned the normals of the two GOOD vertices
sharing its triangle); **negative `startWeight`** (passed the `>= length` guard, indexed before the array,
dereferenced undefined → TypeError out of a parser documented never to throw) and non-positive
`countWeights` (a vertex that silently collapsed to the model origin); **`parentIndex < -1`** (matched no
branch and was indistinguishable from a legitimate `-1` root, while `>= length` was correctly reported —
the asymmetry) plus **self-parent and multi-joint cycles** (a self-child throws in `addNodeChild`; a
two-joint cycle passed every guard and was built into a subgraph detached from the skeleton); and a
**non-unit reconstructed quaternion** — `(2,0,0)` gives norm 2, which is not a rotation, and scales the
joint it drives by four through the bind pose and the inverse-bind matrix.

**md5AnimParse — the frame layout is declared three times and none of the three was reconciled.** Each
joint's flags imply a component count, each `startIndex` claims a window in the flat frame array, and
`numAnimatedComponents` states the total. The `?? base` fallback made every disagreement invisible: an
out-of-range read silently substituted the bind pose, so a joint with a wrong window was indistinguishable
from one an animator deliberately left static. The implied total is now summed from the flags — an
INDEPENDENT statement, per axis 9, since a bound derived from the field it guards moves with the error —
and checked against the declared total, each frame's actual length, the baseframe length, and every
joint's window.

**FOLLOW-ON, same session (user-directed):** two of the three open items closed.
- **`md5mesh.no-data`** — an unrecognised file (an `.obj`, an `.md5anim`, an HTML error page) parsed to a
  structurally valid EMPTY document with an EMPTY diagnostics array, indistinguishable from successfully
  importing a file that happens to contain no geometry. `parseMd5Anim` already rejected its equivalent;
  this is the missing twin.
- **frame-component alignment** — a non-numeric token inside a `frame` block was skipped, shifting every
  component after it *within that frame*, so joint 1 read joint 0's trailing rotation as its own
  translation in one frame of an otherwise correct clip. The axis-12 class one scope down from the mesh
  records, and it takes the same remedy: substitute a placeholder to hold the position, and report it. Its
  severity moved Drop → **Recover**, correctly: the frame now survives with one named wrong component,
  which is what a usable survivor means. Dropping the whole frame instead would have been worse — frames
  are addressed by index across the clip, so losing one shifts the timeline exactly as skipping a token
  shifts the components.

**STILL OPEN, and it is a design question rather than a patch:** `.md5anim` never verifies it describes
the same skeleton as the `.md5mesh`. A joint-name miss silently falls back to POSITIONAL binding, so
`body.md5anim` on `head.md5mesh` yields a scrambled but non-empty clip with no diagnostic. This is the
cross-artifact referent-agreement case — how far should a parser verify its sidecar? — and it is routed to
review rather than picked unilaterally.

scene-formats 522/522. Bare `npm run check` clean, bare `npm run test` 12994 passed / 1196 files.

## 2026-07-29 — Four-parser read-geometry audit; 3ds hang + awd2 inflate bomb fixed (builder, review-directed)

Authorized follow-on to the glTF read-integrity work. Axes derived from first principles and **committed
before any parser was opened** (`agents/read-integrity.md`, commit bf1774e2b) so "derived first" is
checkable rather than asserted, with a recorded prediction per format. The audit then found five failure
geometries the eight axes do not name; they are now axes 9-13 in that doc, each attributed to the parser
that produced it.

**TWO SEVERE DEFECTS FIXED (c62bf62f3).**

- **3DS hangs on a 12-byte file.** Every chunk walk advances by `cursor = chunkEnd`, so a declared chunk
  length of 0 puts the end back at the cursor and the loop never progresses. Not a throw — a HANG:
  uncatchable, takes the whole import with it, and it violates the module's own "never throws on bad
  input" contract more severely than a throw would. **The trigger is not adversarial: zero padding inside
  a parent whose declared length still covers it**, which is what a block-aligning exporter produces.
  Verified live before fixing (a 12-byte file, `timeout` exit 124; with the fix removed again it hung the
  vitest runner itself). Fixed structurally: all eight chunk walks now derive their advance from one
  `readChunkEnd`, which rejects a length shorter than the header. Five of the eight already had that
  guard and three did not — the asymmetry *is* axis 11, and routing every walk through one definition is
  what makes a non-terminating walk unrepresentable rather than an invariant eight loops must remember.
  Lengths 1-5 are the same defect's quiet sibling (the cursor advances but lands mid-header, so the rest
  of the parent silently vanishes); both probes added.

- **AWD2 inflate is an unbounded allocation.** `InflateState.writeByte` doubled its output buffer with no
  cap, and the `AwdDecompressor` seam carries no output limit. A ~300 KB crafted stream declares 300 MB;
  the ratio is arbitrary. This is axis 13 and it is genuinely outside the original eight: **every other
  axis assumes the quantity sizing an allocation is a field that can be checked against the buffer, and
  under decompression it is the compression ratio — not in the file, not bounded by its length, reachable
  by no per-field check.** Capped at 256 MB; the throw is caught by the existing boundary and becomes a
  clean `awd2.decompression-failed` Reject. Verified: a 300 KB bomb is now rejected in 1.3 s. The
  *uncapped* case was deliberately NOT executed — it is an unbounded allocation on a real machine, and the
  absence of any bound is a code-reading certainty, not a hypothesis needing a demonstration.

**REMAINING, NOT YET FIXED — reported for sequencing, not silently carried.** The audit surfaced far more
than these two. Full findings are in the handoff to review; the shape of what is left, by parser:

- **md5Parse / md5AnimParse — the worst of the four, and the one on the demo path.** Recovery-induced
  reindexing (axis 12) is the headline: dropping one malformed `vert`/`weight`/`joint` line shifts every
  later record, silently redefining every index that names it, *through bounds checks that still pass*.
  Triangle indices are never bounds-checked at all (a negative index wraps through `Uint32Array.from` to
  ~4.29e9 and reaches the GPU); `numverts`/`numtris`/`numweights`/`numJoints` are parsed and discarded,
  and they are precisely the signal that would catch the reindexing at the record where it began. A
  negative `startWeight` throws. `parentIndex < -1` is silently treated as root while `>= length` is
  correctly reported — the exact asymmetry. An unrecognised file parses to a valid empty document with
  zero diagnostics. `.md5anim` never verifies it describes the same skeleton as the `.md5mesh`.
- **awd2Parse — stream data bounded by the block rather than the sub-mesh** (textbook axis 3, the check
  names the outer region); `readAwdString` bounds-checks nothing and `subarray` clamps silently against
  the whole buffer; `skipAwdAttrList` returns a cursor derived from an unvalidated length; unknown stream
  data type falls through to float32/width-4 (axis 4 verbatim); `positions.length / 3` unfloored yields a
  NaN vertex; no Adler-32 verification; header flags and version-minor never read.
- **md2Parse — the `framesize` field at header offset 16 is the independent anchor** for a bound the
  parser currently derives from `numVertices` (axis 9), and it is never read; `offEnd` likewise. Sections
  are never checked for disjointness (axis 10). `offSkins` has neither a lower bound nor an aggregate
  bound and fabricates a 64-NUL material name from out-of-buffer reads.
- **threeDsParse — remaining:** UV count never compared to vertex count (silent fallback to (0,0)); counts
  smaller than their payload; unbounded recursion depth (~45 KB of nested headers overflows the stack);
  duplicate chunks last-win with a bare assignment, so a malformed second VERTICES destroys a good first.

**SEVERITY — CORRECTED 2026-07-29, after checking rather than inferring.** My first severity call said
"md5 is on the demo path (`importMd5Mesh` is the composer for a shipped skeletal sample)". **That was
wrong.** It was inferred from a description in the codebase map, not verified. Grepping
`examples/`+`functional/`+`tools/` for every parser entry point: **the only two parsers any example
invokes are AWD2** (`examples/packages/awd2loading` → `createScene3DFromAwd2`) **and glTF**
(`examples/packages/formatloading` → `parseGltf`). Nothing in this repo exercises md5, md2, or 3ds; they
are reachable only through `@flighthq/scene3d-resources`' public `md5Load`/`md2Load`/`threeDsLoad`, so a
*user* can reach them but no demo does. The corrected ranking:

| parser | reachability | worst finding | priority |
| --- | --- | --- | --- |
| **awd2** | **demo path** (`awd2loading`) | unbounded inflate (unrecoverable) — **fixed** | highest; was live on a shipped example |
| **3ds** | dormant in-repo; public loader | hang on a zero-length chunk (unrecoverable) — **fixed** | high; unrecoverable and trivially triggered |
| **md5** | dormant in-repo; public loader | recovery-induced reindexing (silent) | **highest remaining unfixed** |
| **md2** | dormant in-repo; public loader | fabricated material name (silent, cosmetic) | lowest |

The correction does not change what to fix next — md5 still has the worst *unfixed* profile — but it does
change *why*: it is the worst silent-wrong-read surface, not the most-exercised code. And the two parsers
that turned out to be genuinely reachable are exactly the two that had unrecoverable defects, which is
the argument for having audited all four rather than triaging by assumed usage first.

**DOES `resolveGltfReadOffset` GENERALISE?** No, and the audit is unanimous on why: what these parsers
share is not a bounds *computation* but a bounds *discipline*. glTF resolves a nested strided window
(accessor ⊂ bufferView ⊂ buffer); 3DS needs a chunk-header cursor whose advance is provably positive;
MD2 needs an absolute file-relative strided region plus a partition check across siblings; AWD2 needs a
narrowable region cursor that cannot widen. Those are four different shapes, and a helper absorbing all
four would be a switch over formats wearing a function's clothes — the decomposition floor is per-format.
What DOES generalise is the axis list itself, plus one structural rule that fixes the largest class in
every parser: **identical read shapes must share one implementation** (axis 11). Each parser wants its own
small resolver — `readChunkEnd` here is the first — and the win is that the guard set can no longer
diverge across copies. Cross-parser sharing would buy a name and cost the fit.


## 2026-07-29 — Read-geometry integrity: the validation census re-derived on the right axes (builder, review-directed)

review2 re-gated the Step D census on merged develop and found two cells it had reported closed while the
underlying property was never checked. Both are the silent-wrong-read class the census declared shut. A third
site of the same class turned up while fixing them.

**THE AXIS ERROR — what actually went wrong, since it matters more than the patch.** The old census was
`consumer × type-validated × window-bounded × fault→role`, 13 rows, every cell ticked. Four faults compounded:

1. **It was derived from the patch, not from the read.** Its columns were the names of the three fixes that
   had just landed, so it could only ever ask "did I do the thing I did?". A census whose axes come from the
   remedy cannot surface what the remedy missed. The axes have to come from _what must hold for this read to
   address the right bytes_, enumerated before looking at the code.
2. **13 rows over 3 real read sites.** The rows were accessor _consumers_ (POSITION, NORMAL, indices, IBM,
   animation input/output, morph…), but every one of them reaches bytes through the same `readAccessor` base
   read. Geometry is a property of the READ SITE; only `fault→role` is a property of the consumer. Ticking
   `window✓` thirteen times was one belief restated thirteen times — it read as breadth and supplied none,
   and the repetition is exactly what made "every cell closed" feel earned.
3. **`window-bounded` was one checkbox over two independent bounds.** A span is contained by its start AND
   its end. The upper bound was implemented, so the box was ticked; the lower bound was never written and
   never missed. A negative `byteOffset` walks the read backward out of the declared view and every
   upper-bound test still passes, because the read ends where it always did.
4. **`type-validated` was mistaken for element-width integrity.** The type axis proves the accessor's
   _declared_ element type is what the consumer expects. It says nothing about whether the declared _layout_
   delivers that element intact — `byteStride` lives on the bufferView, not the accessor, so it can contradict
   the type without the type ever being wrong. A VEC3 over a 4-byte stride is `type✓ window✓` and imports
   overlapping garbage.

Under all four sits one unexamined assumption: **the spec declares these offsets/lengths/strides/counts to be
nonnegative integers and the TypeScript schema repeats it, so I read the declaration as a guarantee.** There is
no runtime schema validator behind the parse. Every blocker below reduces to that one belief.

**FIXED, structurally.** A single `resolveGltfReadOffset` now resolves every strided read — base accessor,
sparse indices, sparse values — proving all three properties before a byte is touched, returning the absolute
offset or `-1`; callers classify by role exactly as before. `isGltfByteCount` is the shared nonnegative-integer
predicate. Element width and count are proven in `readAccessor` _before_ the allocation they size. Closed:

- **lower bound (review2 blocker 1)** — `baseOffset` was only ever compared against the upper limit. A decoy
  before the view plus `accessor.byteOffset: -12` imported it as vertex data with zero diagnostics. Identical
  hole on the sparse values lane (a bad override Recover-skips; the base data is still good).
- **element width / stride (review2 blocker 2)** — any positive `byteStride` won, with no `stride >=
  elementByteSize` check. Now honored verbatim and rejected when narrower, rather than silently retightened;
  an absent or 0 stride still means tightly packed (0 is out-of-spec but common exporter shorthand).
- **unknown `type` / `componentType`** — the width tables return `undefined`, which propagates as NaN through
  every bound test and makes each one _pass_, then `readComponent` falls through to `getFloat32`. Found while
  re-deriving, not reported.
- **malformed `count`** — a fractional count silently truncates the allocation (2.5 VEC3 → 7 floats) while the
  read loop runs three times, so the last vertex writes off the end and a fractional vertex count flows
  downstream; a negative count throws RangeError out of the whole import. Found while re-deriving.
- **image bufferView slice (third site, not reported)** — the old census ticked this `✓ (Uint8Array.slice)`.
  Slice cannot overrun, which is true and irrelevant: a NEGATIVE start is not out-of-bounds, it is a different
  addressing mode that silently retargets the read to the buffer's tail. The API was checked for throwing, not
  for wrong-addressing — the same axis error wearing a different disguise.

`gltf.accessor-past-buffer` → **`gltf.accessor-invalid-read`** and `gltf.sparse-past-buffer` →
**`gltf.sparse-invalid-read`**: the old names describe one direction of one of the three properties now
enforced, so they would have actively misled anyone debugging an underrun or a stride fault.

**RE-DERIVED CENSUS.** Two tables, because the two axis families belong to different subjects — conflating
them is what produced the phantom breadth in fault 2 above.

_Read sites × geometry properties_ (every site that computes a byte address from JSON numbers):

| read site | width sound | offsets ≥ 0 ∧ integral | span ends in window ∧ buffer | count sound |
| --- | --- | --- | --- | --- |
| accessor base read (`readAccessor`, all 7 consumers) | ✓ type + componentType known, stride ≥ element | ✓ | ✓ | ✓ |
| sparse index read | ✓ componentType known, no stride permitted | ✓ | ✓ | ✓ |
| sparse value read | ✓ componentType known, no stride permitted | ✓ | ✓ | ✓ |
| image bufferView slice | n/a (opaque bytes) | ✓ | ✓ (`slice` clamps upward) | n/a |
| GLB chunk reads | n/a (fixed 4-byte header fields) | ✓ (uint32-sourced, unsigned by construction) | ✓ header/length guards | n/a |

_Consumers × fault→role_ (unchanged by this work; the axis that IS per-consumer):

| consumer | expected type | fault → role |
| --- | --- | --- |
| primitive POSITION | VEC3 | count0/fault → primitive Drop |
| NORMAL / TANGENT / TEXCOORD_0 | VEC3 / VEC4 / VEC2 | fault → Recover, absent |
| JOINTS_0 / WEIGHTS_0 | VEC4 / VEC4 | fault → Recover, unskinned |
| primitive indices | SCALAR | fault → primitive Drop |
| skin inverseBindMatrices | MAT4 | fault/short → identity Recover |
| animation input (times) | SCALAR | fault → channel Drop |
| animation output | VEC4/VEC3/SCALAR by path | fault → channel Drop |
| morph POSITION delta | VEC3 | fault → target/whole-morph Drop |
| morph NORMAL / TANGENT delta | VEC3 | fault → Recover, absent |
| sparse destination index | < accessor.count | out-of-range → Recover, skip override |
| image bufferView | — (bytes) | unreadable window → image Drop |

Five regression probes, each verified to FAIL against the pre-fix parser (four with zero diagnostics emitted —
the silent-corruption signature — and one, the negative count, throwing out of the import). scene-formats
509/509 (gltfParse 128/128), `npm run check scene3d-formats` exit 0.

**WHAT REMAINS UNPROVEN.** These fixes make each read address the bytes the file _declares_. Nothing here can
tell whether those bytes are the ones the file's author _meant_ — a well-formed accessor pointing at the wrong
bufferView is still imported faithfully. That is not a gap to close in the parser; it is the boundary of what
read-integrity validation can assert, and it should not be re-declared as a closed cell by a future census.

## 2026-07-25 — Diagnostics honesty capstone: uniformity audit + sweep-safe silent-drop batch (builder, review-directed)

Capstone on top of the completed structured-diagnostics rollout (all 9 *-formats parsers converted). A
uniformity audit (4 parallel scans) confirmed the conversion is consistent: origins are the physical
emitter everywhere (zero mismatches), the Reject/Drop/Recover/Skip axis is applied the same way, and the
severity vocabulary is uniform. Cross-format confirmation: awd2 `block-length-past-end` (Recover+break) is
the SAME convention as gltf `glb.chunk-past-end` (a break that keeps already-parsed elements is a partial
recovery, not a Drop). Then a sweep-safe fix batch closed silent-drop gaps that had a sibling precedent:
`3ds.face-subchunk-exceeds`/`3ds.mesh-empty`/`3ds.material-missing`, `md5mesh.shader-unquoted`,
`gltf.node-child-out-of-range`/`gltf.animation-target-unresolved`, `md2.skin-empty-path`,
`awd2.geometry-truncated`/`awd2.submesh-truncated`. The sequenced honesty work is now COMPLETE (review-ruled,
all through review2): A = the sweep-safe silent-drop batch above; C = threaded the collector through the gltf
material/image/texture subtree; B-diag = a Skip-crumb sweep so every parser crumbs its recognized-but-unmodeled
features; D = gltf primitive/accessor Drop-vs-Recover.

**D's SHARPENED principle (first D attempt FAILED review2, reworked):** the first attempt blanket-relabeled
`readAccessor`'s faults Drop→Recover, which was context-blind — review2 caught four output-level lies and
review sharpened the rule: **Recover requires a USABLE SURVIVOR (a non-empty, non-NaN, drawable element);
otherwise Drop and actually drop.** The fix makes `readAccessor` classification-free — it returns a structured
`{count, data, fault}` (fault = kind + detail, no severity) and each caller decides severity by the accessor's
ROLE via `reportGltfAccessorFault`:
- POSITION accessor fault (mandatory) → the primitive is unusable → `gltf.primitive-no-position` **Drop** +
  drop the primitive; the subsuming accessor fault is NOT emitted as a contradictory Recover.
- optional attribute fault (normal/tangent/uv/joints/weights) where POSITION survives → treated as ABSENT
  (`readOptionalGltfAttribute` returns null → vertex loop zero-fills finite defaults, never NaN) + the fault
  kind **Recover**. A count mismatch is likewise treated as absent.
- indices accessor fault (or empty indices) → topology is lost, storage order is not a sane triangle list →
  **Drop** + drop the primitive (`gltf.primitive-empty-indices` for the valid-but-empty case).
- unsupported primitive mode → no sane drawable interpretation → `buildGltfPrimitiveElements` returns null →
  `gltf.primitive-unsupported-mode` **Drop** + drop the primitive (was wrongly Recover-with-empty-geometry).
- collateral call sites the blunt relabel had touched, now fixed too: skin `inverseBindMatrices` fault →
  identity IBM per joint (bind pose, not a zero-matrix collapse) **Recover**; animation sampler input/output
  fault → drop the channel **Drop** (matches sibling channel drops); morph target POSITION-delta fault → drop
  the target **Drop**, optional NORMAL/TANGENT deltas → absent **Recover**.
Per-mode geometry-output regressions added (position-fail drops mesh; optional-fail keeps a finite drawable
mesh with zeroed normals; index/mode-fail drop the mesh). **Output-shape change** still stands: dropping the
no-POSITION/failed-mandatory primitive means fewer mesh nodes, so a consumer assuming glTF-primitive-index↔
child-node alignment would shift; relabel-only fallback if ever needed. No such consumer today.

**D second re-gate (review2-a8b72928 FAIL) — five role-semantics edge cases, all fixed.** The output blockers
were fixed but count-mismatch and index-correspondence cases slipped through. Applied the same usable-survivor
rule to each: (1) an optional attribute whose count ≠ the primitive's vertex count is now Recover-crumbed
(`gltf.accessor-count-mismatch`, detail accessor/expected/actual) before zero-filling, not silently dropped;
(2) a present-but-short `inverseBindMatrices` accessor (count < joints) now recovers to identity for ALL joints
(`gltf.skin-ibm-count-mismatch` Recover) instead of zero-filling missing joints (which collapsed the mesh);
(3) `buildGltfMorph` now takes the base vertex count and drops a target whose POSITION-delta count ≠ base
(`gltf.morph-target-count-mismatch` Drop); (4) because dropping ONE morph target renumbers survivors and
desyncs target↔weight↔animation indexing, ANY invalid target now drops the WHOLE morph set (return null), so
indexing stays honest — weights index-align 1:1 with the surviving targets; (5) an animation sampler with an
empty or ragged (values not a whole multiple of times) accessor pair now drops the channel
(`gltf.animation-sampler-empty` Drop) so no empty-channel animation is created. Five probe regressions added.
scene-formats 497/497 (gltfParse 116/116), npm run check exit 0.

**Item-4 morph-drop granularity — RULED whole-set-drop (review, on record).** When any morph target is invalid
the WHOLE set drops, not just that target. Why this over individual-drop-with-weight-remap: (a) whole-set-drop
is provably correct and trivially honors the no-weight-shift invariant (no partial survivors = nothing to
renumber); (b) a morph target set is authored as a COHERENT unit (facial blendshapes etc.) — a partial-morph
survivor missing one target is usually visibly wrong, not graceful degradation; (c) the remap alternative would
thread a survivor-index map from `buildGltfMorph` into `buildGltfAnimations` purely to preserve that low-value
partial case — completeness-for-a-rare-case bought with a cross-function index-aliasing bug surface, against the
"small functions, explicit ownership" rule. POSSIBLE FUTURE DEEPENING (do NOT build speculatively): individual-
target-drop with mesh-weight + weights-animation-value remap, keeping the good targets when one is bad. Revisit
ONLY if a real asset shows a partial-morph survivor is worth the cross-function index-map coupling.

**D exhaustive accessor-site sweep (review directive + review2-954ae4c2 6th finding).** review confirmed the
classification-free `readAccessor` + role-based classification is the right architecture and pushed to sweep
EVERY accessor consumer so no further gap remains. Two closed: (a) `applyAccessorSparse` read `sparse.count`
elements through a DataView with NO bounds guard — an oversized count threw a RangeError; now guarded (skip the
override, keep the valid base accessor data → `gltf.sparse-past-buffer` Recover). (b) the animation cardinality
guard checked flattened `values.length % times.length` — a LINEAR VEC4 output with 1 element vs 2 keys has
length 4 and passed (4 % 2 == 0). Now validates ELEMENT counts by interpolation: fixed-width channels require
`outputCount === (CUBICSPLINE ? 3 : 1) · inputCount` (`gltf.animation-sampler-cardinality` Drop), and weights
channels are validated per-mesh in `appendGltfWeightsChannels` against `perKey · keys · targetWidth`
(`gltf.weights-cardinality-mismatch` Drop) since their SCALAR output is target-width-scaled. The complete
accessor-consumer census: 7 `readAccessor` sites (skin IBM, animation input/output, primitive POSITION/indices,
morph POSITION, `readOptionalGltfAttribute`) + `applyAccessorSparse` + the two animation cardinality gates —
all now apply the usable-survivor rule. Image bufferView slicing uses bounds-safe `Uint8Array.slice` (no throw)
and GLB parsing has its own header/length guards. Three more regressions. scene-formats 500/500
(gltfParse 119/119), npm run check exit 0.

**D READ-INTEGRITY foundation (review-2153529d + review2-16c12072 findings 1–3).** review reframed review2's
three findings as a deeper class than severity-labeling: READ-INTEGRITY that was never happening — the
usable-survivor rule is meaningless if the read itself silently pulls bytes from OUTSIDE the accessor's window
or reinterprets a wrong-width type. Fixed as a structural layer (not three patches), then a full validation
census (below) surfaced and closed everything in one pass:
- **accessor TYPE validation** — `readAccessor` gained an `expectedType` param; a wrong element type (e.g. a
  VEC3 "rotation" output, a VEC2 "NORMAL") returns a `gltf.accessor-type-mismatch` fault the caller classifies
  by role (mandatory → Drop, optional → Recover-absent). Threaded to every consumer with its layout-fixed type.
- **bufferView-WINDOW bound** — base reads (`readAccessor`) and both sparse reads (`applyAccessorSparse`) now
  clamp to `min(bufferView.byteOffset + byteLength, buffer end)`, not just the buffer end. A POSITION needing
  36 bytes through a declared 4-byte view now faults (`gltf.accessor-past-buffer`) instead of reading 32 bytes
  of unrelated buffer.
- **sparse DESTINATION-INDEX bound** — `applyAccessorSparse` pre-scans indices; a sparse index ≥ accessor.count
  (a silently-ignored typed-array write) skips the whole override and keeps the base → `gltf.sparse-index-out-
  of-range` Recover.
- **animation input/output ROLE type** — input must be SCALAR; output type by path (rotation VEC4,
  translation/scale VEC3, weights SCALAR) via `GLTF_ANIMATION_OUTPUT_TYPES`; a mismatch drops the channel.

VALIDATION CENSUS (accessor consumer × type-validated × window-bounded × fault→role) — every cell closed:
**SUPERSEDED 2026-07-29 — this table's "every cell closed" was false; its AXES were wrong. See the
2026-07-29 read-geometry entry at the top for what it missed and why. Kept as written for the record.**
| consumer | expected type | type✓ | window✓ | fault → role |
| --- | --- | --- | --- | --- |
| primitive POSITION | VEC3 | ✓ | ✓ | count0/fault → primitive Drop |
| NORMAL / TANGENT / TEXCOORD_0 | VEC3 / VEC4 / VEC2 | ✓ | ✓ | fault → Recover, absent |
| JOINTS_0 / WEIGHTS_0 | VEC4 / VEC4 | ✓ | ✓ | fault → Recover, unskinned |
| primitive indices | SCALAR | ✓ | ✓ | fault → primitive Drop |
| skin inverseBindMatrices | MAT4 | ✓ | ✓ | fault/short → identity Recover |
| animation input (times) | SCALAR | ✓ | ✓ | fault → channel Drop |
| animation output | VEC4/VEC3/SCALAR by path | ✓ | ✓ | fault → channel Drop |
| morph POSITION delta | VEC3 | ✓ | ✓ | fault → target/whole-morph Drop |
| morph NORMAL / TANGENT delta | VEC3 | ✓ | ✓ | fault → Recover, absent |
| sparse index/value reads | — | n/a | ✓ | past-window → Recover, skip override |
| sparse destination index | < accessor.count | ✓ | n/a | out-of-range → Recover, skip override |
| image bufferView slice | — (bytes) | n/a | ✓ (`Uint8Array.slice`) | short → decoder handles |
| GLB chunk reads | — (bytes) | n/a | ✓ (header/length guards) | — |
Four more regressions (VEC3-rotation type Drop, optional wrong-type Recover, sparse-index-out-of-range Recover,
bufferView-window overrun Drop). scene-formats 504/504 (gltfParse 123/123), npm run check exit 0.

**AWD skeleton-binding / multi-skeleton — DECIDED DEFERRED NON-GOAL (user-pinned 2026-07-25).** Not
"blocked awaiting a multi-skeleton .awd + animator-block spec" — it is deferred because AWD is a legacy
format and there is no multi-skeleton AWD corpus to hold an implementation honest. A multi-skeleton file
binds all skinned meshes to the first skeleton (see the 2026-07-17 entry). Revisit ONLY if a real
multi-skeleton asset appears; do not resurrect it speculatively.

## 2026-07-24 — AWD2 materials import as ShadedMaterial (builder, user-directed review-bed46182/7062769f)

`resolveAwdMaterial` now emits a **ShadedMaterial** (was BlinnPhongMaterial), UNIFORMLY — including a
method-less material (empty `modifiers[]`). The durable WHY is in the resolveAwdMaterial doc comment (AWD's
MethodMaterial = BlinnPhong base + method array ≅ ShadedMaterial base + modifier stack; empty stack compiles
to the same base program, stays lossless if methods appear, lets a demo author append a modifier without a
kind conversion — do NOT collapse to BlinnPhong). scene-formats gains a `@flighthq/shading` dependency
(`createShadedMaterial`). Base props mapped: color(1)→diffuse, diffuseTex(2)→diffuseMap, normalTex(3)→normalMap,
**alpha(10)→ folded into diffuse RGBA + alphaMode='blend' when < 1** (new). A method-bearing material
(numMethods > 0) **warns via the diagnostics seam and imports the base only**. scene-formats 395/395, full
`npm run check` exit 0.

**Empirical findings that reshaped the parcel's rules (dumped the real material blocks):**
- The parcel listed "specular color, gloss→shininess, ambient" as base properties to read. **They are NOT
  base properties in real AWD2 files.** Every material in the corpus carries only props {1:color, 2:diffuseTex,
  [3:normalTex], 10:alpha(f32), 11/13:bool flags, 12:unused baddr}. In Away3D's model specular/gloss/normal/
  env/fog are **METHODS**, not base props — which is exactly why `numMethods` is the hinge. So there is nothing
  to read for specular/gloss/ambient on the base; ShadedMaterial's specular/shininess stay at defaults.
- **The method→modifier WALK is deferred, not built.** The whole reference corpus is `numMethods == 0`, so the
  AWD2 method-block byte layout can't be observed or tested in-sandbox; shipping a blind walk would be
  speculative (violates the honest-parse mandate). Instead: read `numMethods`, warn when > 0, leave method
  bodies unwalked. When a real method-bearing AWD2 file + the verified method-type spec are available, the
  walk + Fog/EnvMap/fresnel/soft-shadow→modifier mapping gets built and tested properly. Surfaced to review.

**Still open (example-side, not importer):** an AWD-loading example must `registerBuiltInModifiers` + register
the shaded mesh renderer (not just the BlinnPhong renderer) now that AWD meshes carry ShadedMaterial. No AWD
example exists in-repo yet; note carried for whoever builds it.

## 2026-07-24 — AWD → AWD2: API/file split, version guard, compressed-animation fix, real-corpus verify (builder, user-directed)

The AWD importer is now explicitly **AWD2** end-to-end, reserving the bare `Awd3` namespace for the
future AwayJS SceneGraph (version-3) parser.

**API split (user-ratified).** Renamed the public surface: `parseAwd`→`parseAwd2`,
`createScene3DFromAwd`→`createScene3DFromAwd2`, `parseAwdSkeletonAnimations`→`parseAwd2SkeletonAnimations`,
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
(parse → Scene3DDocument → createScene3DFromAwd2). All parse with **0 warnings**:
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
`Awd3`/`createScene3DFromAwd3` namespace the AWD2 rename freed. Sample corpus: awayjs-examples `src/assets/AWD3/`.

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

`createScene3DFromAwd` now emits `joints0`/`weights0` + parses the skeleton block + sets `mesh.skin`
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
`{clip, skeleton}`; only its own tests called it). Flag for downstream (flight-reference) AWD usage.

**App flow — CURRENT NAMES.** `scene = createScene3DFromAwd2(bytes)` → find the skinned mesh →
`parseAwd2SkeletonAnimations(bytes, mesh.skin.skeleton.joints)`. The names in the entry above are the
pre-split ones and no longer exist in source; they were renamed in the API split recorded earlier in this
log, and this line is restated here because a consumer greps the newest entry, not the oldest. Note the
animation entry point is PLURAL. Animation is deliberately a second call and is not part of the scene
constructor, so a scene carrying no animations is the designed shape rather than a parse failure — and
`Scene3D.animations` is a `Record<string, AnimationClip>`, not an array, so it has no `.length`.

**Needs host visual gate (unverifiable in-sandbox):** the skinned *render* (shambler deforming), and
specifically **animated deformation correctness** — the AWD joint matrices are kept in the existing
local-transform interpretation; static bind pose renders correctly (bind skin = identity) but
local-vs-inverse-bind under animation can only be confirmed visually (fix localized if wrong). Also:
multi-skeleton AWD binds all skinned meshes to the first skeleton (warns); AWD anim drives translation
only (pre-existing).
