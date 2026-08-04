---
package: '@flighthq/scene2d-resources'
updated: 2026-08-02
---

# scene2d-resources status

Built 2026-07-29.

- `Scene2DDocument` carries an unattached `Node2D` root plus TWO enumerable contracts, split by what
  resolving one produces: `slots` yields a node the application supplies, `imageResources` yields pixels
  the document carried. An importer therefore decides the graph's shape at parse and nothing downstream
  can change what a node IS — only what a slot holds and what pixels a texture carries.
- Bounds nodes support authored extents; `Node2D` supports linkage identity and managed content swap.
- `resolveScene2DResources` synchronously reconciles application slots.
- `loadScene2DImageResources` owns the operation-scoped Promise, cancellation, and progress boundary. It
  decodes each reference once and binds the image into every `Texture` waiting on it, so a character
  placed a hundred times costs one decode.
- URL acquisition is caller-supplied, and source dispatch uses an empty-by-default open registry.
- SVG and Lottie adapters are opt-in. The standalone SWF package now supplies the first named-graph
  adapter; Rive remains second, and custom codecs can register without changing this package.
- Hand-authored tests cover slot/linkage behavior, idempotent reference-owned replacement, synchronous
  reconciliation, deterministic async results, cancellation relay, registry replacement, URL acquisition,
  malformed built-in rejection, SVG, and Lottie.
- Scoped package checks/tests and bundle-size verification pass. Bare repository checks/tests remain the final
  handoff gate.
- SWF now proves recursively nested first-frame named slots across legacy and current placement/removal
  records plus fresh/move/replacement state and snapshot isolation, composed transforms, linkage, and
  stage / available RECT, embedded-image, lossless-bitmap, video, and sprite extents. A revision-pinned
  external Ruffle `FWS` also verifies a named placement through the shared document boundary; its
  provenance, hash, and derived manifest remain SWF-owned evidence. Later MovieClip
  frames, visual definition bodies, compressed files, and broader fixture coverage remain SWF-side
  depth rather than resource-pipeline responsibilities.

2026-08-02 — the node-returning asset lane is gone. `Scene2DAssetReference` and its
`resolveAssetContent`/`loadAssetContent` seams let a caller-supplied callback decide what node an authored
character became, which inverted responsibility: the callback had strictly less information than the
importer did, `content: Node2D` could not express a bitmap consumed only by a shape fill, and
`setScene2DSlotReferenceContent` addChilds into the target — so N placements of one character
STRUCTURALLY required N distinct returned nodes and correct sharing was inexpressible. The replacement is
`ImageResourceReference`, which already existed for 3D and is dimension-neutral. A format that embeds a
whole sub-document recurses through the (synchronous, registry-dispatched) importer at parse instead,
which is why neither contract carries a node-producing byte payload.

Design follow-up: building this package exposed that the 3D twin's progressive capability had a
synchronous-looking name. The subsequent 3D migration preserved it as `updateScene3DResourceStreaming`
and made its resolve stage strictly synchronous too.
