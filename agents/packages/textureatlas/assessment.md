---
package: '@flighthq/textureatlas'
updated: 2026-07-30
basedOn: ./review.md
---

# textureatlas — Assessment

Based on the 2026-07-03 review (partial, 45/100). All four items approved 2026-07-02 have landed: the `loadTextureAtlasFromBytes` rename, the xml re-export removal, `detectTextureAtlasFormat`, and the Package Map descriptions are all verified in source and in the codebase map — dropped from Recommended. Formats-package work (Cocos plist parser, multipage threading through parsers) now belongs to the `textureatlas-formats` cell, which exists as its own folder.

## Recommended

The 2026-07-03 sweep list is **done** — items 1–6 landed 2026-07-30, and item 7 (the stale
package.json description) was already fixed in the tree. Re-derived below against live source.

1. **Decide whether `TextureAtlasRegion.id` should be an opaque handle rather than a caller-visible
   number.** The 2026-07-30 id work made allocation safe, but it also showed the type is doing two
   jobs: parsers assign meaningful ids from their own numbering, and `addTextureAtlasRegion` assigns
   from an allocator, and nothing distinguishes the two. A caller merging a parsed atlas into a built
   one still has to reconcile them by hand. **A data-model decision**, entangled with the multi-page
   work already in Backlog.
2. **`getTextureAtlasRegionSequence` allocates a new array per call** and sorts nothing, so a
   `walk_10` frame lands before `walk_2` under the `baseName_NNN` convention its own doc names. Either
   take an `out` array and document insertion order as the contract, or sort numerically by trailing
   ordinal — the second is a behavior change and wants a ruling.
3. **`getTextureAtlasRegionTexture` keys its cache on the atlas *and* region object**, so a region
   mutated in place through `setTextureAtlasRegion` keeps a texture whose UVs describe the previous
   frame until the next call refreshes it. The refresh does happen on every call, so this is currently
   benign — but it is benign by accident, and worth either pinning with a test or documenting.

## Backlog

- **Multi-page / multipack atlases.** `pages: ImageResource[]` (or a `TextureAtlasPage` entity) plus `pageIndex` on `TextureAtlasRegion`, threaded through `textureatlas-formats` (whose libGDX parser currently loses page binding). The review's single largest structural gap. _Parked — design decision / cross-package (types + formats); already charter Open direction #2._
- **Nine-slice / nine-patch metadata.** `splits`/`pads` fields or a nullable `TextureAtlasRegionNineSlice` — needed for UI atlas workflows. _Parked — design decision on the region type's shape; falls under charter Open direction #1 (region metadata expansion)._
- **Name + ordinal index queries.** libGDX-style `findRegion(name, index)`; today the ordinal is baked into the name (`walk_3`) by the libGDX parser and unrecoverable as data. _Parked — data-model design decision entangled with `textureatlas-formats`; candidate Open direction for the charter._
- **Cocos plist parser.** Charter Decision #5 blesses it, but it lives in `@flighthq/textureatlas-formats` — track it in that cell. _Parked — belongs to the neighbor cell._
- **Rust `flighthq-textureatlas` crate conformance.** _Parked — global posture (TS is the spec; Rust conforms in parity passes)._

## Approved

- [2026-07-02 · picked] Sweep items 1–4: Uint8Array rename, remove xml re-exports, detectTextureAtlasFormat, Package Map descriptions
- [2026-07-03 · picked] Sweep items 1–7: draw-placement helpers, region management symmetry, tighten
  `setTextureAtlasRegion`, entity quartet + trivial predicates, explicit name index, the
  `addTextureAtlasRegionCorners` rename, package.json description — **all done 2026-07-30**, with
  regression tests verified against the unfixed code. Item 3 shipped as a whole-entity setter rather
  than the prescribed positional list; see the charter decision for why.
