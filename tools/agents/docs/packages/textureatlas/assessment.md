---
package: '@flighthq/textureatlas'
updated: 2026-07-03
basedOn: ./review.md
---

# textureatlas — Assessment

Based on the 2026-07-03 review (partial, 45/100). All four items approved 2026-07-02 have landed: the `loadTextureAtlasFromBytes` rename, the xml re-export removal, `detectTextureAtlasFormat`, and the Package Map descriptions are all verified in source and in the codebase map — dropped from Recommended. Formats-package work (Cocos plist parser, multipage threading through parsers) now belongs to the `textureatlas-formats` cell, which exists as its own folder.

## Recommended

Sweep-safe: within `@flighthq/textureatlas`, no cross-package coupling, no open design decision. Consumer call-site updates for renames/signature tightening are mechanical, matching the precedent of the 2026-07-02 sweep.

1. **Draw-placement helpers.** Add `getTextureAtlasRegionFrame(region, out)` (where the trimmed rect sits inside the original frame, from `sourceX/Y` + `originalWidth/Height`) and a rotated-UV quad writer (four UV corners for a `rotated` region). Out-param, alias-safe, per house style. Today every renderer and user re-derives trim/rotation math — review's top sweep-safe priority. Within the charter's "UV computation" scope.

2. **Region management symmetry.** Add `removeTextureAtlasRegion` and `clearTextureAtlasRegions`, and fix id allocation: `addTextureAtlasRegion` assigns `id = regions.length`, so ids silently collide after any splice. Stable id allocation is a correctness fix, not a feature.

3. **Tighten `setTextureAtlasRegion`.** It writes only 6 of 14 fields (leaving `rotated`/`trimmed`/`source*`/`original*`/`name`/`id` stale — an easy-to-misuse partial setter), coerces pivot `null → 0` so "no pivot" round-trips differently than `createTextureAtlasRegion`, and defaults everything after `x` to `0` (a caller passing only `x` is surely a bug). Make it a full-field setter, require the four rect values, round-trip `null` pivot.

4. **Entity quartet + trivial predicates.** `disposeTextureAtlas` (release the image reference/regions; `@flighthq/image` already has a dispose story), `getTextureAtlasRegionCount`, `hasTextureAtlasRegion(atlas, name)`.

5. **Explicit name index.** `buildTextureAtlasRegionIndex` — an O(1) name→region index built explicitly (per the no-hidden-work rule), for atlases with hundreds of regions where every query is currently a linear scan.

6. **Rename `addTextureAtlasRegionRectangleXY` → `addTextureAtlasRegionCorners`.** The `XY` suffix is the one name in the package that needs explanation; `Corners` self-identifies. Greenfield rename per the mandate.

7. **Fix the stale package.json description.** It still says "Texture atlases and tilesets: …" though tilesets live in `@flighthq/tileset` — extraction residue.

## Backlog

- **Multi-page / multipack atlases.** `pages: ImageResource[]` (or a `TextureAtlasPage` entity) plus `pageIndex` on `TextureAtlasRegion`, threaded through `textureatlas-formats` (whose libGDX parser currently loses page binding). The review's single largest structural gap. _Parked — design decision / cross-package (types + formats); already charter Open direction #2._
- **Nine-slice / nine-patch metadata.** `splits`/`pads` fields or a nullable `TextureAtlasRegionNineSlice` — needed for UI atlas workflows. _Parked — design decision on the region type's shape; falls under charter Open direction #1 (region metadata expansion)._
- **Name + ordinal index queries.** libGDX-style `findRegion(name, index)`; today the ordinal is baked into the name (`walk_3`) by the libGDX parser and unrecoverable as data. _Parked — data-model design decision entangled with `textureatlas-formats`; candidate Open direction for the charter._
- **Cocos plist parser.** Charter Decision #5 blesses it, but it lives in `@flighthq/textureatlas-formats` — track it in that cell. _Parked — belongs to the neighbor cell._
- **Rust `flighthq-textureatlas` crate conformance.** _Parked — global posture (TS is the spec; Rust conforms in parity passes)._

## Approved

- [2026-07-02 · picked] Sweep items 1–4: Uint8Array rename, remove xml re-exports, detectTextureAtlasFormat, Package Map descriptions
