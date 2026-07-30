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
- `PlaceObject` through `PlaceObject4` cover legacy and current first-frame placement records;
  `RemoveObject` and `RemoveObject2` update that display list before its first-frame snapshot.
- Named placement forms preserve instance names and affine transforms, converting twips to pixels.
  Legacy unnamed sprite placements still expose their recursively named descendants.
- `SymbolClass`, `ExportAssets`, and direct `PlaceObject3`/`PlaceObject4` class names preserve linkage
  identity.
- `registerSwfScene2DDocumentImporter` explicitly opts the codec into a caller-owned
  `scene2d-resources` registry; importing the module has no registration side effect.
- Missing sprite End tags, duplicate definitions, cyclic symbol graphs, excessive nesting, and
  excessive instantiated-node counts reject safely.
- Compressed `CWS`/`ZWS`, later MovieClip frames, visual definition bodies, bitmap/video/button/font
  extents, and opaque `DoABC` exposure remain staged rather than being represented incompletely.

The package is wired through the SDK root and formats barrel, build graph, package layer, path aliases,
and lockfile. Synthetic byte-level tests cover all four placement generations, both removal
generations, linkage, transforms, opt-in registration, compressed rejection, malformed/truncated input,
recursively nested sprites, composed transforms, recursive-graph rejection, stage bounds, direct
definition bounds, and recursively composed sprite extents. A canonical externally produced fixture
remains unavailable locally; evidence is still synthetic.
