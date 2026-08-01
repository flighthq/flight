---
package: '@flighthq/swf'
updated: 2026-08-01
---

# swf status

Built 2026-07-30 as the first named-graph source for `Scene2DDocument`. Animated timelines landed
2026-08-01.

- `createScene2DFromSwf` safely reads uncompressed `FWS` headers and bounded tag records.
- Every timeline in the file — the root and each `DefineSprite` symbol — crosses as `movieclip`
  playback data. The document root and every placed sprite instance are `MovieClip`s bound to a
  `TimelineSource` built from the parsed frames, so a caller plays, seeks, and reads labels through the
  ordinary `movieclip` API and the codec retains no player of its own.
- Frames are retained as whole display lists rather than the authored deltas, so a seek to any frame is
  a lookup and never replays the frames before it. `FrameLabel` and `DefineSceneAndFrameLabelData`
  become `TimelineSource.labels`; the header's 8.8-fixed frame rate becomes its `frameRate` and governs
  every timeline in the file. Scene names are read past to reach the label table but are not imported as
  labels.
- Every node a timeline can ever show is allocated at import, one per depth+character instance across
  all its frames, so `constructFrame` only attaches, detaches, reorders by depth, and re-transforms.
  Playback allocates nothing, a slot reference target stays valid while its instance is off-frame, and a
  loop back to frame 1 restores the same nodes instead of replacing them. An unchanged placement matrix
  is the same object, so a surviving instance is not re-transformed each frame.
- The slot manifest is therefore the union of named instances across every frame, not the opening frame
  alone, while only the current frame's instances are attached.
- `DefineSprite` timelines instantiate recursively, including unnamed intermediate containers needed to
  preserve composed transforms; every named descendant joins the flat enumerable slot manifest, listed
  after the container that carries it.
- The stage RECT becomes the document root's authored local bounds. Shape, morph-shape, static/edit
  text definition bounds become placed-target extents, and sprite extents recursively union every
  available child bound through its placement matrix, across every frame of the symbol rather than its
  first — a node's local bounds do not change as its playhead moves.
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
  Only a move targeting an existing depth inherits omitted fields, and stray moves are ignored. A move
  keeps its depth and character so it keeps its node across frames, while a replacement at the same
  depth is a different instance and gets a node of its own.
- Named placement forms preserve instance names and affine transforms, converting twips to pixels.
  Legacy unnamed sprite placements still expose their recursively named descendants.
- `SymbolClass`, `ExportAssets`, and direct `PlaceObject3`/`PlaceObject4` class names preserve linkage
  identity.
- `registerSwfScene2DDocumentImporter` explicitly opts the codec into a caller-owned
  `scene2d-resources` registry; importing the module has no registration side effect.
- Missing sprite End tags, duplicate definitions, cyclic symbol graphs, excessive nesting, and
  excessive instantiated-node counts reject safely. Retaining whole frames added an amplification path —
  a display list placed once can be multiplied by every ShowFrame that follows it — so a per-document
  snapshot budget rejects a file that would exceed it, rather than materializing it.
- Compressed `CWS`/`ZWS`, visual definition bodies, legacy table-based JPEG/button/font extents, frame
  scripts, and opaque `DoABC` exposure remain staged rather than being represented incompletely.

The package is wired through the SDK root and formats barrel, build graph, package layer, path aliases,
and lockfile, and depends on `movieclip` for the playback nodes it produces. Synthetic byte-level tests
cover all four placement generations, both removal generations, fresh/move/replacement state, linkage,
transforms, opt-in registration, compressed rejection, malformed/truncated input, recursively nested
sprites, composed transforms, recursive-graph rejection, stage bounds, RECT-based definition bounds,
embedded JPEG/PNG/GIF, lossless-bitmap and video dimensions, and recursively composed sprite extents.
Timeline coverage adds the all-frames slot manifest against first-frame attachment, a later-frame move
replayed onto the instance it targets, depth ordering when a later frame places an instance between two
others, labels from both label tags with the header frame rate, an independently seekable nested sprite
playhead, and snapshot-budget rejection. A canonical
uncompressed Ruffle named-shape fixture has also crossed `createScene2DFromSwf`; its exact revision,
MIT license, source hash, derived manifest, and ignored-asset reproduction procedure are recorded in
[`fixture-evidence.md`](fixture-evidence.md). The external binary is not committed, and the hermetic
test suite reproduces its zero-bit RECT compatibility case synthetically.
