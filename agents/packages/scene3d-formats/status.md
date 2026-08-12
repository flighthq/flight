---
package: "@flighthq/scene3d-formats"
updated: 2026-08-08
by: principal
---

# scene3d-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/scene3d-formats/src/` on 2026-08-08. What each format covers today lives in
[scene3d format coverage](../../scene3d-format-coverage.md).

**Standing constraint — the MD5 corpus is population 1:** one asset family, 13 files (1 mesh + 12 anims).
No breadth or conformance claim can rest on it, so a lane over it is a smoke lane and is never named a
conformance scoreboard. Inverted too — reproducing and fixing one downstream failure is also population 1,
not evidence the importer is otherwise sound. A single `.md5anim` is not a case; it needs a compatible
mesh skeleton. A section probe must reconcile declarations without consulting the importer, or it measures
the parser against itself.

- **MD5 diagnostics carry no `detail.capability`,** and the 17 mesh + 19 anim kinds neither define nor
  exhaust a capability set. Anything scored needs that convention ruled.
- **`.md5anim` never verifies it describes the same skeleton as its `.md5mesh`.** `md5AnimParse.ts:326`
  falls back to positional binding (`nodeByName.get(entry.name) ?? joints[j]`) with no diagnostic, so
  `body.md5anim` over `head.md5mesh` gives a scrambled but non-empty clip. Design question, not a patch.
- **No Draco decoder ships, deliberately.** `gltfDraco.ts` is the registry seam only, so a Draco file
  honestly reports its extension unsupported. The contract is synchronous because `parseGltf` is — the
  caller does the WebAssembly setup and registers only a ready decoder.
- **`KHR_texture_basisu` is read (`gltfParse.ts:910`) but stays out of `CORE_GLTF_EXTENSIONS`** (`:1122`)
  — the KTX2 transcode is a resource-layer job, so the required-extension crumb stays accurate.
- **3DS keyframer: only object-node pivots are read** (`threeDsParse.ts:993`); hierarchy and tracks stay
  unread on purpose. `NODE_HDR`'s trailing uint16 has two documented readings that disagree, no corpus file
  carries a keyframer, parenting double-transforms the world-space `TRI_LOCAL` placements without an
  `inverse(parentWorld) * childWorld` rebase, and rotation keys are incremental axis-angle with
  variable-stride TCB parameters. A wrong hierarchy is worse than flat-but-correct.
- **3DS `MAT_BUMPMAP` parses to `bumpFilename` and binds to nothing** (`threeDsParse.ts:1219`, `:1281`) —
  a grayscale height field, not a normal map. Wants a bump→normal seam or a `bumpMap` field.
- **3DS read integrity:** a UV array shorter than the vertex list silently zero-fills
  (`threeDsParse.ts:817`); duplicate chunks last-win by bare assignment (`:448`), so a bad second VERTICES
  destroys a good first; the chunk walk has no depth cap.
- **AWD2 read integrity:** `readAwdString` bounds-checks nothing and its `subarray`
  clamps against the whole buffer; no Adler-32 verification; header flags and version-minor are never read;
  material properties 5, 6, 8, 11, 13 and 22 have no reader and drop silently (`awd2Schema.ts:52` names
  only 1/2/3/10/18–21).
- **AWD2 method bodies are unwalked** (`awd2Parse.ts:1794`); `numMethods > 0` records a Skip and imports
  the base only. Every corpus asset is `numMethods == 0`, so a walk has nothing to test on.
- **AWD3 is recognized and rejected, not misparsed** (`awd2Parse.ts:1033`) — the AwayJS SceneGraph binary,
  a different block model. Wants its own charter and the free `Awd3` name.
- **Two ruled non-goals — do not build speculatively.** AWD multi-skeleton binding (such a file binds every
  skinned mesh to the first skeleton; revisit only if a real asset appears), and individual morph-target
  drop with weight remapping (a morph set drops whole when any target is invalid; the alternative buys a
  rare partial case with index aliasing).
- **Nothing in this repo exercises md5, md2, 3ds, or obj.** The only parsers an example invokes are AWD2
  (`awd2loading`) and glTF (`formatloading`); the rest are reachable only via
  `@flighthq/scene3d-resources`. No 3DS fixture carries a light or camera, so that wire layout is
  unit-tested but never round-tripped an authored file, and AWD tangent handedness plus skinned animated
  deformation still need a host visual gate. The non-indexed repairs sit in the same blind spot:
  AWD2 winding/normals/tangents (`awd2Parse.ts:1515`, `:1607`) and glTF flat-normal/tangent generation
  (`gltfParse.ts:1301`) are confirmed at PARSE level only. No functional baseline covers a non-indexed
  asset in either format — likely none exists, since neither path had coverage before — so facing and
  shading are INFERRED from vertex order, never observed.
- **No USD importer exists,** though the package map and this `package.json` name it.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the standing "no
  `createScene3DLightsFromDocument` bridge exists" claim — it ships at
  `packages/scene3d/src/sceneDocumentLights.ts:38` off `scene3d`'s public index, so consumers were told to
  compose light aim by hand against a bridge that already shipped. Also: the `awdLoad.ts` → `awd2Load.ts`
  rename is done, and AWD material property 21 is read.
- **2026-08-08** — MD5 corpus measured (13 files, one family); an MD5 smoke lane and a conformance core
  both held on price against reproducing the actual failing downstream input.
- **2026-08-02** — Format-breadth arc: Draco registry seam (no decoder); OBJ smoothing groups, lines and
  points; `KHR_materials_unlit`/`_quantization`/`_basisu` and spec-gloss; MTL shading-model selection and
  alpha maps; glTF material extensions through the handler registry; 3DS `TRI_LOCAL`, pivots, lights,
  cameras.
- **2026-08-01** — AWD2 light and light-picker blocks (41/51) import, splitting the compound light into a
  punctual descriptor plus a sibling ambient. Placement ruled glTF-style: local space + transform.
- **2026-07-29** — Four-parser read-geometry audit (`agents/read-integrity.md`); 3DS zero-length-chunk hang
  and AWD2 unbounded-inflate bomb fixed, then md5 and md2 passes closed the axis-12 class.
