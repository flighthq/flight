---
package: '@flighthq/swf'
updated: 2026-08-02
---

# swf status

Built 2026-07-30 as the first named-graph source for `Scene2DDocument`. Animated timelines landed
2026-08-01; shape geometry 2026-08-02.

- `createScene2DFromSwf` safely reads `FWS` headers and bounded tag records, and reads `CWS`/`ZWS` through
  a registered decompressor. Compression is not SWF's domain — a `CWS` body is a zlib stream and a `ZWS`
  body an LZMA one, both general formats riding inside the container — so the package vendors neither codec and
  resolves through the one shared registry in `@flighthq/compression` rather than owning a private one:
  a caller registers deflate once and every container that carries the same algorithm — SWF's `CWS`, an
  AWD2 block — can read it. The registry starts empty, is filled only by an
  explicit call, and is last-write-wins so a host can replace a portable decoder with a native one.
  Compression with nothing registered reports the same null sentinel as a malformed file: the bytes are
  unreadable either way. Decompressed bytes are spliced behind a header rewritten to `FWS`, since the
  declared length already counts uncompressed bytes.
- `DefineShape` through `DefineShape4` decode to real drawable geometry on `Shape` nodes: solid fills
  with per-record alpha, linear/radial/focal gradients with their ratios and converted matrices, and
  strokes with width, caps, joins, and miter limit. SWF records edges rather than contours — each edge
  naming the fill on its left and right — so a fill is recovered: edges are collected per style, the
  right-hand side is reversed so every edge of a fill runs the same way around it, and runs are stitched
  end-to-start into closed contours. That reversal is what makes the command stream's nonzero winding
  match the fill SWF meant, holes included. Coordinates are exact whole twips, so stitching needs no
  tolerance.
- Every core tag's disposition — carried, or deliberately read past and why — is tabulated in
  [`tag-coverage.md`](tag-coverage.md), with corpus frequencies beside each.
- `DoInitAction` recognizes the same playback commands as `DoAction`, bound to frame 1 of the sprite it
  names, since an init action runs once before that sprite's first frame.
- A placement's colour transform contributes its alpha multiplier, applied per frame beside the matrix, so
  an authored fade follows. The colour channels are read past: tinting a node is a material feature rather
  than a node property, and importing it would need a decision this codec should not make alone.
- AVM2 `DoABC` timeline commands are recognized too, through `@flighthq/abc`. AVM2 has no playback
  opcodes: a compiler turns frame scripts into an `addFrameScript` call in the generated class
  constructor, pairing a zero-based frame index with a handler that is usually a *method on the class*
  reached by name rather than an inline function — so recognition reads the constructor's call, resolves
  the handler through the instance's method traits, and then reads that body. `SymbolClass` ties the class
  name back to a character, with character 0 being the root. Both levels are read, never run, and the same
  all-or-nothing rule applies to the handler body.
- AVM1 `DoAction` timeline commands are recognized and emitted as data. AVM1 gives playback control its
  own single-byte opcodes — stop, play, and both goto forms are literal instructions rather than method
  calls — so reading them is the same kind of work as reading a placement record, and nothing from the
  file is ever executed. A recognized block becomes a `Timeline` frame script bound to Flight's own
  MovieClip calls. A block is recognized only when *every* action in it is a playback command; anything
  else and the block is declined whole, because honouring the legible half misrepresents the frame. A goto
  landing on a frame that gotos back is depth-bounded rather than allowed to recurse.
- `DefineButton` and `DefineButton2` import their up state as a one-frame timeline, so a button
  instantiates, bounds, nests, and masks through the same path a sprite does. The other interaction
  states are dropped rather than stacked invisibly, because a document is a still scene.
- `DefineBits` with `JPEGTables` splices the legacy split-JPEG form back into one payload — the tables
  lose their end marker, the image its start marker. A pair that will not splice contributes no image and
  leaves the document alone; real files carry the halves inside sprites and in either order.
- `DefineFont`, `DefineFont2`, and `DefineFont3` decode into the generic, index-keyed
  `GlyphOutlineSource` seam and are publicly recoverable by SWF character id through
  `createGlyphOutlineSourcesFromSwf`. An embedded SWF font is a table of paths in its own EM grid, so no
  text stack is consulted: `DefineFont2/3` contribute their codepoint, advance, and vertical-metric
  tables; a separate `DefineFontInfo/2` supplies legacy `DefineFont` codepoints. A glyph whose outline
  fails costs that glyph rather than the font, and a version 3 font's finer grid (twenty times a version 1
  or 2 font's) is carried so the same outline scales correctly.
- `DefineText` and `DefineText2` compose into drawable geometry: a text record carries glyph indices and
  advances rather than characters, so this is placement rather than layout — each glyph is emitted at the
  pen position, scaled by the record height over the font's EM units, recoloured from the record, and the
  pen advances by the recorded amount. It consumes the same `GlyphOutlineSource` exposed to other font
  consumers. Composition is deferred until the whole file is walked, because a text record may address a
  font declared after it.
- `DefineEditText` still materializes nothing. It carries a *string* plus a font reference and layout
  properties, not glyph indices, so drawing it needs the font's code table and advances plus line
  breaking — and flattening it to paths at import would destroy the one thing that makes it edit text.
  The reusable path-backed source, codepoint lookup, advances, and metrics now exist; materializing an
  editable/layout node over that source is the remaining text-layer work.
- A placement earns a node when it is named, carries a timeline, or now has geometry, so unnamed shapes —
  most of what a still frame is made of — are materialized. Each placement of a shape character gets its
  own copy of the decoded commands.
- A shape body that does not parse leaves the definition as the bounded placeholder it was before any
  geometry was decoded, on a reader of its own so one unreadable body never fails the document. The
  authored RECT keeps sizing every node, including shapes, because it carries stroke width and authoring
  padding the command stream does not.
- A bitmap-filled shape emits its geometry and points the fill at a texture whose pixels arrive later.
  Dropping the fill used to drop its contours with it, so artwork built entirely from bitmap-filled shapes
  imported as an empty document — reported from downstream against a real file. The shape now carries a
  `beginTextureFill` over a sourceless `Texture`, and the parse records which bitmap character each fill
  is waiting on.
- `createScene2DSymbolFromSwf` instantiates a symbol the file exported by linkage name but never placed,
  and `readSwfExportedSymbolNames` lists them. A document built only from placements has nothing to show
  for a library symbol, which is what a consumer hits when the authoring tool published a symbol for code
  to create rather than putting it on a timeline. Each call builds a fresh instance, because a symbol is a
  template rather than a shared node.
- `SwfReader` is its own module — the bounded bit reader the document, timeline, and shape decoders all
  share.
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
- `SetBackgroundColor` becomes the document's `backgroundColor` as opaque packed RGBA — it carries no
  alpha in the file and a stage is opaque. It is document metadata, not a node: a colour the viewport
  clears to, which an application honours or ignores. A file that declares none reports null rather than a
  guessed default.
- The stage RECT becomes the document root's authored local bounds. Shape, morph-shape, static/edit
  text definition bounds become placed-target extents, and sprite extents recursively union every
  available child bound through its placement matrix, across every frame of the symbol rather than its
  first — a node's local bounds do not change as its playhead moves.
- Embedded images leave the importer as asset references carrying their bytes undecoded. A placed
  `DefineBits*` character becomes a bounded node plus a `Scene2DAssetReference` whose `bytes` is a
  zero-copy view of the payload and whose `mimeType` is sniffed from its magic (`image/png`, `image/gif`,
  `image/jpeg`, or the SWF-specific lossless types). Decoding is the resolve step's job, so it can be
  asynchronous and a caller that never resolves an image never pays for its pixels. `uri` addresses the
  character within the document (`swf:bitmap/<id>`) because an embedded asset has no address to fetch
  from.
- Lossless bitmap definitions retain their declared pixel dimensions, including colormapped alpha
  headers, and video stream definitions retain declared frame dimensions. A video payload stays opaque
  and no visual body is materialized.
- `DefineBitsJPEG2` through `DefineBitsJPEG4` retain dimensions from bounded JPEG SOF, PNG IHDR, and
  GIF header scans, including the legacy layout where the encoding tables and the pixels are two
  concatenated streams — the end-of-image marker between them no longer ends the scan, and it is removed
  from the bytes a resolver receives. JPEG3/4 alpha payloads remain opaque behind their validated offsets.
- RECT readers accept the zero-bit encoding used by empty authored shapes, preserving a zero-size
  local bound instead of rejecting the document.
- `PlaceObject` through `PlaceObject4` cover legacy and current first-frame placement records;
  `RemoveObject` and `RemoveObject2` update that display list before its first-frame snapshot.
- Clip depth becomes a real clip. A placement carrying a clip depth masks every depth above its own
  through that depth, and is never drawn itself. Flight clips a node and its subtree, so one `ClipRegion`
  is applied to each covered instance — equivalent to grouping them under a clipped container, without
  restructuring the graph or disturbing the attach/detach/reorder path. The mask's contours come from its
  decoded shape and cross two transforms into each covered instance's own local space, which is where a
  `ClipRegion`'s contours live. Masking is per-frame data applied beside the matrix, so a mask that
  appears or moves between frames follows. Where masks nest, the innermost wins: Flight carries one clip
  per node rather than intersecting them. A mask whose character has no decoded geometry imposes no clip
  rather than a wrong one.
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
- A tag stream is complete when it reaches its bounded end, with or without an explicit End tag: Flash's
  own tooling ends a sprite, and sometimes the root, on its last content tag. Duplicate definitions, cyclic
  symbol graphs, excessive nesting, and excessive instantiated-node counts still reject safely. Retaining whole frames added an amplification path —
  a display list placed once can be multiplied by every ShowFrame that follows it — so a per-document
  snapshot budget rejects a file that would exceed it, rather than materializing it.
- Bitmap and text definition bodies, legacy table-based JPEG/button/font extents,
  frame scripts, and opaque `DoABC` exposure remain staged rather than being represented incompletely.
  What remains for bitmaps is the decoder behind the resolve step, not the path to it: the bytes and their
  media type now reach a resolver. A JPEG/PNG/GIF payload decodes through the platform or
  `@flighthq/image-codec`; a lossless payload needs an inflate, which an asynchronous resolver can take
  from the platform's own `DecompressionStream` rather than vendoring one. That is why the resolve step
  also settles the question of where an inflate lives — `swf` needs no decompressor seam of its own.

The package is wired through the SDK root and formats barrel, build graph, package layer, path aliases,
and lockfile, and depends on `movieclip` for the playback nodes it produces and on `shape`/`geometry` for
the geometry it decodes. Synthetic byte-level tests
cover all four placement generations, both removal generations, fresh/move/replacement state, linkage,
transforms, opt-in registration, compressed rejection, malformed/truncated input, recursively nested
sprites, composed transforms, recursive-graph rejection, stage bounds, RECT-based definition bounds,
embedded JPEG/PNG/GIF, lossless-bitmap and video dimensions, and recursively composed sprite extents.
Timeline coverage adds the all-frames slot manifest against first-frame attachment, a later-frame move
replayed onto the instance it targets, depth ordering when a later frame places an instance between two
others, labels from both label tags with the header frame rate, an independently seekable nested sprite
playhead, snapshot-budget rejection, font glyph tables in both the version 1 and version 2 offset forms
with their overrun rejections, static text placing glyphs at the right scale, colour, and advance, clip
depth producing a clip on covered instances only with the mask
undrawn and the region resolved into the covered instance's local space, and a compressed document
importing through a registered decompressor while a missing, failing, or short one rejects. Geometry coverage adds the bit reader's own overrun, alignment,
and encoding cases, and a shape suite over hand-written SHAPEWITHSTYLE bytes: a closed rectangle, twips
conversion with a quadratic edge, right-hand fill reversal, run stitching across a move, Shape 3 alpha,
stroke width and style, gradient passthrough, unpainted bitmap fills, and both malformed-body rejections —
plus end-to-end placement, per-instance geometry, and the unparseable-body placeholder. A canonical
uncompressed Ruffle named-shape fixture has also crossed `createScene2DFromSwf`, and a 306-file sweep of
Ruffle's test corpus now backs the parser end to end — nothing throws, every uncompressed file imports, and
the only rejections are the 79% of that corpus which is compressed. The sweep is what exposed the End-tag
defect above; its exact revision,
MIT license, source hash, derived manifest, and ignored-asset reproduction procedure are recorded in
[`fixture-evidence.md`](fixture-evidence.md). The external binary is not committed, and the hermetic
test suite reproduces its zero-bit RECT compatibility case synthetically.
