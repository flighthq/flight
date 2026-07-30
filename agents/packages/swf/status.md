---
package: '@flighthq/swf'
updated: 2026-07-30
---

# swf status

Built 2026-07-30 as the first named-graph source for `Scene2DDocument`.

- `createScene2DFromSwf` safely reads uncompressed `FWS` headers and bounded tag records.
- The first root-timeline frame becomes a renderer-neutral display root with named slot references.
- `PlaceObject2` and `PlaceObject3` preserve instance names and affine transforms, converting twips to
  pixels.
- `SymbolClass`, `ExportAssets`, and direct `PlaceObject3` class names preserve linkage identity.
- `registerSwfScene2DDocumentImporter` explicitly opts the codec into a caller-owned
  `scene2d-resources` registry; importing the module has no registration side effect.
- Compressed `CWS`/`ZWS`, nested `DefineSprite` timelines, visual definition tags, authored extents,
  and opaque `DoABC` exposure remain staged rather than being represented incompletely.

The package is wired through the SDK root and formats barrel, build graph, package layer, path aliases,
and lockfile. Synthetic byte-level tests cover both placement variants, linkage, transforms, opt-in
registration, compressed rejection, and malformed/truncated input.
