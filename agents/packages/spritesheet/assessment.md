---
package: '@flighthq/spritesheet'
updated: 2026-07-02
basedOn: ./review.md
---

# spritesheet — Assessment

Sorted from the depth review (80/100, solid), verified against the live tree (15 player exports, 134 tests), and the direction session (2026-07-02). Eight decisions blessed. The package is a near-complete sprite-animation runtime. The remaining work splits cleanly: a seek correctness fix + type migration (sweep-safe), and larger design items (frame events, repeatCount migration, bitmap binding, pivot consumption, clock integration) that are blessed but scope beyond a sweep.

## Recommended

Sweep-safe: within `@flighthq/spritesheet` and `@flighthq/types`, no open design decision beyond what the charter has already blessed.

1. **Fix `seekSpritesheetPlayerToFrame` for non-forward directions.** It passes a display-frame index to `resolveVirtualIndexStartTime` which expects a virtual index. For `forward` the two coincide (the only tested case); for `reverse`/`pingpong`/`pingpong_reverse` the synced `elapsed` is wrong, so the next `updateSpritesheetPlayer` jumps to a different frame. Convert the requested display frame to its virtual index before syncing `elapsed`, and set both `frameIndex` and `elapsed` consistently. Pure correctness fix at an already-owned seam.

2. **Add non-forward-direction tests for the seek path.** The seek bug is latent because tests only exercise `forward`. Add `reverse`/`pingpong`/`pingpong_reverse` cases asserting that `seekSpritesheetPlayerToFrame` followed by one zero-delta `updateSpritesheetPlayer` keeps the seeked frame. Colocated in `spritesheetPlayer.test.ts`.

3. **Migrate `SpritesheetData`/`SpritesheetAnimationData`/`SpritesheetFrameData` to `@flighthq/types`.** Per Decision #1. Move the descriptor types from `packages/spritesheet/src/spritesheetData.ts` to `@flighthq/types`. Update imports in spritesheet and spritesheet-formats. Run `npm run packages:check`.

4. **Migrate `loop: boolean` to `repeatCount: number` on `SpritesheetAnimation`.** Per Decision #3. In `@flighthq/types`, change `SpritesheetAnimation.loop: boolean` to `repeatCount: number` (`-1` = infinite, `0` = play once, `N` = N additional repeats). Update `createSpritesheetAnimation`, `createSpritesheetFromData`, `createSpritesheetAnimationFromFrameNames`, and the player's loop-detection logic. Update all tests. Breaking type change — do this before any consumer ships.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Frame events / Aseprite-style tags.** _Parked — cross-package design._ Blessed (Decision #2). Needs `SpritesheetFrameEvent` payload type in types, `events` field on data schema, coordination with `spritesheet-formats` on tag data shape. Largest remaining feature gap.

- **Direct Bitmap binding (`bindSpritesheetPlayerToBitmap`).** _Parked — new API surface._ Blessed (Decision #4). Types-only dependency is confirmed clean. Applies current frame's atlas region, offset, pivot, rotation to a `Bitmap` entity. Needs design: what fields it sets, how rotated regions are handled, whether it returns the frame or mutates the bitmap.

- **Pivot/rotation consumption in timeline source.** _Parked — companion to bitmap binding._ Blessed (Decision #5). `createSpritesheetTimelineSource` currently applies only `offsetX/Y` + `originX/Y`, ignoring pivot and rotated atlas regions. Update alongside the bitmap binding so both paths handle the same set of frame properties.

- **Clock integration.** _Parked — blocked on clock package._ Blessed (Decision #7). Spritesheet player adopts `@flighthq/clock` once it exists.

- **`gotoAndStop` / `gotoAndPlay` ergonomics.** _Parked — open direction._ Minor; decide after seek fix lands.

- **Resource/loader integration.** _Parked — cross-package._ Half-wired `imageFile` fields.

- **Rust `flighthq-spritesheet` crate.** _Parked — global posture._ TS leads, Rust follows.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: fix seek for non-forward directions, add non-forward seek tests, migrate SpritesheetData types to types package, migrate loop→repeatCount
