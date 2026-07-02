---
package: '@flighthq/textureatlas'
updated: 2026-07-02
basedOn: status.md
---

# textureatlas — Assessment

Verified against the live tree (3 source files, 3 test files, 63 tests, 19 exports) and the direction session (2026-07-02). Six charter decisions blessed. No depth review exists.

## Recommended

Sweep-safe: within `@flighthq/textureatlas` and `@flighthq/textureatlas-formats`, no open design decision beyond what the charter has blessed.

1. **Rename `loadTextureAtlasFromArrayBuffer` → `loadTextureAtlasFromBytes`, accept `Uint8Array`.** Per charter Decision #1. Change parameter type from `ArrayBuffer` to `Uint8Array`. Update barrel, tests, describe blocks.

2. **Remove `@flighthq/xml` re-exports from `textureatlas-formats` barrel.** Per charter Decision #3. Remove `parseXmlAttributes`, `parseXmlDocument`, and `XmlElement` re-exports from the barrel. Starling parser imports them internally; they don't need to be in the public API.

3. **Add `detectTextureAtlasFormat` to `textureatlas-formats`.** Per charter Decision #4. Auto-detect format from raw content. Return `TextureAtlasFormatKind | null`. Add test file.

4. **Package Map descriptions for textureatlas and textureatlas-formats.** Per charter Open direction #3. Update the codebase map.

## Backlog

- **Cocos plist parser.** _Parked — AAA completeness gap._ Charter Decision #5 blesses this but it's a new feature, not a sweep.
- **Rust `flighthq-textureatlas` crate.** _Parked — global posture._ Already exists from resources split.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: Uint8Array rename, remove xml re-exports, detectTextureAtlasFormat, Package Map descriptions
