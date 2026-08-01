---
package: '@flighthq/spritesheet'
updated: 2026-08-01
basedOn: ./review.md
---

# spritesheet — Assessment

Sorted from the depth review (80/100, solid), the live tree, and the direction session (2026-07-02).
Eight decisions blessed. The package is a near-complete sprite-animation runtime; all four approved
sweep items have landed, leaving the larger design items parked below.

## Recommended

_None open._ Re-verified against live source on 2026-08-01 (9 source files, 7 test files, 130 tests,
28 exports). The completed items are recorded under [Landed](#landed), outside this section so the TODO
generator stops reporting them as work.

## Landed

1. ~~**Migrate `SpritesheetData`/`SpritesheetAnimationData`/`SpritesheetFrameData` to `@flighthq/types`.**~~ Landed; the descriptors live in `packages/types/src/SpritesheetData.ts` and the spritesheet packages import them from the header.
2. ~~**Fix `seekSpritesheetPlayerToFrame` for non-forward directions.**~~ Landed. The display frame is
   converted to the first virtual occurrence before its start time is resolved, keeping `frameIndex` and
   `elapsed` consistent for reverse and both pingpong directions. A mutation restoring the old direct-index
   behavior fails the reverse regression test.
3. ~~**Add non-forward-direction seek tests.**~~ Landed. Reverse, pingpong, and pingpong-reverse cases
   assert the chosen virtual start and remain on the requested display frame after a zero-delta update.
4. ~~**Replace `loop` with `repeatCount`.**~~ Landed across runtime/data types, constructors, hydration,
   format importers, example callers, and playback. `-1` repeats indefinitely, `0` plays once, and `N`
   completes after `N+1` total cycles; tests pin defaults, finite completion/signals, and importer output.
5. ~~**Use direction-aware per-frame durations.**~~ Landed while testing the same virtual/display seam.
   The cumulative duration table now indexes `frameDurations` through the canonical direction mapping,
   so reverse and pingpong-reverse hold the displayed frame for its own duration rather than its mirror's.

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
