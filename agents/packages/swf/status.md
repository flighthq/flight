---
package: '@flighthq/swf'
updated: 2026-07-30
---

# swf status

Built 2026-07-30 as the first named-graph source for `Scene2DDocument`.

- `createScene2DFromSwf` safely reads uncompressed `FWS` headers and bounded tag records.
- The first root-timeline frame becomes a renderer-neutral display root with named slot references.
- `DefineSprite` first-frame timelines instantiate recursively, including unnamed intermediate
  containers needed to preserve composed transforms; every named descendant joins the flat enumerable
  slot manifest.
- The stage RECT becomes the document root's authored local bounds. Shape, morph-shape, static/edit
  text definition bounds become placed-target extents, and sprite extents recursively union every
  available child bound through its placement matrix.
- Lossless bitmap definitions retain their declared pixel dimensions, including colormapped alpha
  headers, and video stream definitions retain declared frame dimensions. Their media payloads remain
  opaque and no visual body is materialized.
- `DefineBitsJPEG2` through `DefineBitsJPEG4` retain dimensions from bounded JPEG SOF, PNG IHDR, and
  GIF header scans. JPEG3/4 alpha payloads remain opaque behind their validated offsets.
- RECT readers accept the zero-bit encoding used by empty authored shapes, preserving a zero-size
  local bound instead of rejecting the document.
- `PlaceObject` through `PlaceObject4` cover legacy and current first-frame placement records;
  `RemoveObject` and `RemoveObject2` update that display list before its first-frame snapshot.
- `PlaceObject2`/`PlaceObject3` distinguish fresh placements from move/update and replacement records.
  Only a move targeting an existing depth inherits omitted fields; stray moves are ignored, and the
  first-frame snapshot remains isolated from later-frame mutations.
- Named placement forms preserve instance names and affine transforms, converting twips to pixels.
  Legacy unnamed sprite placements still expose their recursively named descendants.
- `SymbolClass`, `ExportAssets`, and direct `PlaceObject3`/`PlaceObject4` class names preserve linkage
  identity.
- `registerSwfScene2DDocumentImporter` explicitly opts the codec into a caller-owned
  `scene2d-resources` registry; importing the module has no registration side effect.
- Missing sprite End tags, duplicate definitions, cyclic symbol graphs, excessive nesting, and
  excessive instantiated-node counts reject safely.
- Compressed `CWS`/`ZWS`, later MovieClip frames, visual definition bodies, legacy table-based
  JPEG/button/font extents, and opaque `DoABC` exposure remain staged rather than being represented
  incompletely.

The package is wired through the SDK root and formats barrel, build graph, package layer, path aliases,
and lockfile. Synthetic byte-level tests cover all four placement generations, both removal
generations, fresh/move/replacement state, first-frame isolation, linkage, transforms, opt-in
registration, compressed rejection, malformed/truncated input, recursively nested sprites, composed
transforms, recursive-graph rejection, stage bounds, RECT-based definition bounds, embedded
JPEG/PNG/GIF, lossless-bitmap and video dimensions, and recursively composed sprite extents. A canonical
uncompressed Ruffle named-shape fixture has also crossed `createScene2DFromSwf`; its exact revision,
MIT license, source hash, derived manifest, and ignored-asset reproduction procedure are recorded in
[`fixture-evidence.md`](fixture-evidence.md). The external binary is not committed, and the hermetic
test suite reproduces its zero-bit RECT compatibility case synthetically.
