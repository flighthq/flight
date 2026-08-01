---
package: '@flighthq/textureatlas'
updated: 2026-08-01
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

## Landed

- ~~**`getTextureAtlasRegionSequence` allocates a new array per call** and sorts nothing.~~ **Both
  halves fixed 2026-08-01, and the report understated the ordering half.** It was not only that
  `walk_10` lands before `walk_2` under a name sort — the function returned *insertion* order, which
  is the packer's packing order and need not be frame order at all. Every order available for free
  hands back an animation whose frames play out of sequence, silently, because a scrambled animation
  still runs. It now orders by the parsed trailing ordinal (regions with none sorted after the
  numbered run, so it stays contiguous from `out[0]`), and takes `out` — the package already split
  allocation by verb, `get*` into `out` and `build*` allocating, and this was the one `get*` that
  escaped it. Sorted with an in-place insertion sort over a reused key array rather than
  `Array.sort`: stable by construction, so ties keep insertion order without relying on a host sort
  being stable, and no comparator closure or scratch allocation.
- ~~**`getTextureAtlasRegionTexture` keys its cache on the atlas *and* region object.**~~ **Documented
  and pinned 2026-08-01** rather than restructured — the assessment's read was right that it is benign
  by accident. The cache holds identity, not contents: what keeps it correct is the unconditional
  re-derive of the window on every call, which was load-bearing with nothing pinning it, one plausible
  "compute only on first mint" optimization away from a stale UV. Now stated as the contract and
  covered by two tests, including the cost of sharing — the returned Texture is mutated in place, so a
  reference held from an earlier call is rewritten by the next call rather than being a snapshot.
- ~~**Ordinals were unrecoverable as data**~~ (review gap: "libGDX-style index queries"). **Closed
  2026-08-01** by extracting the primitive the sort needed anyway: `getTextureAtlasRegionOrdinal`
  reads the trailing decimal run from the name, and `getTextureAtlasRegionByOrdinal` composes over it
  for the canonical `findRegion(name, index)` lookup. Deliberately a *derived query*, not a stored
  field — it does not pre-empt the parked data-model decision below, and a derived ordinal cannot
  disagree with the name it came from.

## Backlog

- **Multi-page / multipack atlases.** `pages: ImageResource[]` (or a `TextureAtlasPage` entity) plus `pageIndex` on `TextureAtlasRegion`, threaded through `textureatlas-formats` (whose libGDX parser currently loses page binding). The review's single largest structural gap. _Parked — design decision / cross-package (types + formats); already charter Open direction #2._
- **Nine-slice / nine-patch metadata.** `splits`/`pads` fields or a nullable `TextureAtlasRegionNineSlice` — needed for UI atlas workflows. _Parked — design decision on the region type's shape; falls under charter Open direction #1 (region metadata expansion)._
- **A stored ordinal field on `TextureAtlasRegion`.** The *query* half of this item shipped 2026-08-01 as `getTextureAtlasRegionOrdinal` / `getTextureAtlasRegionByOrdinal`, derived from the name, so `findRegion(name, index)` now exists and the ordinal is no longer unrecoverable. What remains parked is whether the ordinal should also become a field the parsers set — which is the data-model half, entangled with `textureatlas-formats` and with the multi-page work above. _Parked — design decision; candidate Open direction for the charter._
- **Cocos plist parser.** Charter Decision #5 blesses it, but it lives in `@flighthq/textureatlas-formats` — track it in that cell. _Parked — belongs to the neighbor cell._
- **Rust `flighthq-textureatlas` crate conformance.** _Parked — global posture (TS is the spec; Rust conforms in parity passes)._

## Approved

- [2026-07-02 · picked] Sweep items 1–4: Uint8Array rename, remove xml re-exports, detectTextureAtlasFormat, Package Map descriptions
- [2026-07-03 · picked] Sweep items 1–7: draw-placement helpers, region management symmetry, tighten
  `setTextureAtlasRegion`, entity quartet + trivial predicates, explicit name index, the
  `addTextureAtlasRegionCorners` rename, package.json description — **all done 2026-07-30**, with
  regression tests verified against the unfixed code. Item 3 shipped as a whole-entity setter rather
  than the prescribed positional list; see the charter decision for why.
