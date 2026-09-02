---
package: '@flighthq/spritesheet'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md (blessed 2026-07-02)
  - status.md (2026-08-08)
  - assessment.md (2026-08-01, all 5 sweep items landed)
  - prior review.md (2026-07-13, solid/74)
  - source + tests (packages/spritesheet/src/, 9 source files + 7 test files, 132 tests by `it(` count)
  - packages/types/src/Spritesheet*.ts (13 type files)
  - package.json (exports, dependencies, sideEffects)
---

# spritesheet -- Review

> Evidence: the **live worktree** (`packages/spritesheet/src/`, 668 source lines across 9 files, 132 tests across 7 colocated test files). This review supersedes the 2026-07-13 solid/74 review. The score rises because the five Approved sweep items that were then unexecuted have all landed: the seek-for-non-forward-directions fix, its tests, the `SpritesheetData` types migration, the `loop` to `repeatCount` migration, and the direction-aware per-frame-duration fix. The remaining gap is the set of chartered features that were always deferred -- frame events, bitmap binding, guard modules -- none of which regressed.

## Verdict

**solid -- 80/100.** The package is a well-built sprite-animation runtime with direction-aware playback (forward/reverse/pingpong/pingpong_reverse), per-frame variable durations, finite repeats via `repeatCount`, seek, queue chaining, pooling, lifecycle, validation, and authoring builders. All five Approved sweep items from the 2026-07-02 assessment have landed and are verified in both source and tests. The score stays below "strong" because: (1) the three chartered integration features (frame events, bitmap binding, clock) are unbuilt, (2) pivot/rotation data reaches `SpritesheetFrame` but nothing in this package applies it to a drawable target, (3) there are no guard or `explain*` modules for the sentinels returned by `getSpritesheetPlayerFrame` or `createSpritesheetAnimationFromFrameNames`, (4) `SpritesheetPlayer` is a plain record rather than an entity, preventing runtime-slot attachment, and (5) functional coverage is canvas-only.

## Present capabilities

- **Entity model** -- `createSpritesheet` / `cloneSpritesheet` / `getSpritesheetAnimation` (`spritesheet.ts`). `Spritesheet` and `SpritesheetAnimation` extend `Entity` via `createEntity`. `SpritesheetFrame` is a plain value record (no entity identity), which is appropriate for its role.

- **Hydration and builders** -- `createSpritesheetFromData` resolves frame names to atlas region IDs with positional fallback, carries direction/durations/pivot/rotation through to runtime types, and builds the animations record keyed by name. `createSpritesheetFromGrid` delegates to `createTextureAtlasFromGrid` for row-major grid slicing. `createSpritesheetAnimationFromFrameNames` selects frames by exact match, prefix, or RegExp and returns `null` when no atlas or no match (`spritesheetFrom.ts`, `spritesheetAnimation.ts`).

- **Data constructors** -- `createSpritesheetData`, `createSpritesheetAnimationData`, `createSpritesheetFrameData` (`spritesheetData.ts`). The `*Data` types themselves are canonical in `@flighthq/types` and re-exported here for a single import surface.

- **Direction-aware playback** -- `updateSpritesheetPlayer` implements all four `SpritesheetAnimationDirection` values via a virtual-index model. `resolveVirtualFrameCount` produces `2n-2` for pingpong, and `resolveVirtualIndexToDisplayIndex` maps virtual to display indices per direction. Per-frame variable durations use a `WeakMap`-cached cumulative `Float64Array` with binary search (`getCumulativeDurations`). The cumulative table indexes `frameDurations` through the same direction-aware mapping as playback, so reverse and pingpong-reverse hold the displayed frame for its own duration -- this was the bug fixed in the sweep (`spritesheetPlayer.ts:200-218`).

- **Repeat control** -- `repeatCount: number` on `SpritesheetAnimation`: `-1` = infinite, `0` = play once, `N` = play `N+1` times total. Finite completion triggers `onComplete`; loop boundaries trigger `onLoop`. The migration from `loop: boolean` is complete across runtime types, data types, constructors, hydration, and playback logic.

- **Transport and lifecycle** -- `playSpritesheetAnimation` (with `restart` guard), `queueSpritesheetAnimation` (append), `pauseSpritesheetPlayer` / `resumeSpritesheetPlayer` / `stopSpritesheetPlayer`. `seekSpritesheetPlayerToFrame` converts display-to-virtual indices via `resolveDisplayIndexToFirstVirtualIndex` (the fix for non-forward directions). `seekSpritesheetPlayerToTime` clamps and resolves via the virtual-index model. `cloneSpritesheetPlayer` produces independent signals and queue. `disposeSpritesheetPlayer` clears signals and marks complete (correct `dispose*` semantics).

- **Pooling** -- `acquireSpritesheetPlayer` / `releaseSpritesheetPlayer` as paired brackets with a module-scoped pool. Release disconnects signals and resets all fields; acquire returns a clean idle player.

- **Preview** -- `getSpritesheetPlayerFrame` retrieves the current frame; `getSpritesheetPlayerFrameAt` retrieves a neighbor at a wrapping offset without mutating the player (onion-skin preview).

- **Validation** -- `validateSpritesheet` checks frame-to-region and animation-to-frame resolution; `validateSpritesheetData` checks frame names and `frameDurations` length alignment. Both return `SpritesheetValidationDiagnostic[] | null` (sentinels, not throws).

- **Tests** -- 132 tests across 7 colocated files (28 `describe` blocks). Every exported function has a matching `describe`. Direction playback, per-frame durations, reverse/pingpong seek, finite repeats, pooling, queue chaining, and validation are covered. Non-forward-direction seek tests were added in the sweep and pin elapsed-time + frame-index stability after a zero-delta update.

## Gaps

- **No frame events or tag-based sub-animations.** `SpritesheetFrameEvent` does not exist in `@flighthq/types`. The `SpritesheetAnimation` type has no `events` field and no named sub-range support. Aseprite tags imported by `spritesheet-formats` can only become separate top-level animation records -- in-place tag ranges are not representable. This is the largest feature gap for game consumers (sound cues, hit frames, spawn points). Chartered and deferred (Decision #2).

- **No bitmap binding.** `bindSpritesheetPlayerToBitmap` does not exist. The only path from a player to something drawable is `createSpritesheetTimelineSource` in `@flighthq/movieclip`, which is outside this package. A caller wanting just the current frame's rect calls `getSpritesheetPlayerFrame` and applies it manually. Pivot and rotation data reach `SpritesheetFrame` but nothing in this package applies them to a target. Chartered and deferred (Decision #4).

- **`SpritesheetPlayer` is not an entity.** The type does not extend `Entity`, and `createSpritesheetPlayer` builds an object literal rather than calling `createEntity`. Subsystem state (the cumulative-duration cache) sits in a module-scoped `WeakMap` keyed by the animation rather than on a runtime slot. This is consistent with the type being a lightweight playback head, but limits extensibility.

- **No guard or `explain*` module.** The sentinels returned by `getSpritesheetPlayerFrame` (`null` when no animation or out-of-range), `getSpritesheetPlayerFrameAt` (`null`), and `createSpritesheetAnimationFromFrameNames` (`null` when no atlas or no match) have no pull-query behind them. The diagnostics convention calls for every silent sentinel to have a shakeable `explain*` function returning plain data.

- **Module-scoped pool.** The player pool (`playerPool` at `spritesheetPlayer.ts:307`) is a single array shared by every caller. There is no per-context or per-system pool isolation.

- **Default mismatch between runtime and data constructors.** `createSpritesheetAnimation` defaults `frameDuration: 0` and `repeatCount: 0` (play once). `createSpritesheetAnimationData` defaults `frameDuration: 100` and `repeatCount: -1` (loop forever). A hand-built runtime animation with defaults collapses to the `|| 1` ms fallback in `resolveAnimationTotalTime`. The difference is arguably intentional (data = authored defaults, runtime = bare construct), but the `frameDuration: 0` default is a latent authoring trap.

- **Queue overshoot semantics are undocumented.** When advancing to a queued animation, `elapsed` resets to `0` rather than carrying the remainder of the delta that crossed the boundary. No `onComplete` fires on the chain-advance. These are defensible choices but undocumented.

- **Functional coverage is canvas-only.** `functional/scenes/spritesheet-frame.canvas.ts` has no WebGL, WebGPU, or DOM sibling.

- **Clock integration.** Blocked on the `@flighthq/clock` package. Chartered and correctly deferred (Decision #7).

- **`createSpritesheetFromTileset`** -- listed in the prior review's present capabilities but does not exist anywhere in the repo. The charter's "Authoring builders" scope mentions grid/strip slicer; only grid is implemented.

## Charter contradictions

None. The prior review identified two contradictions -- the `loop: boolean` / `repeatCount` migration (Decision #3) and the absence of a bound target for pivot/rotation application (Decision #4 / North star 1). The first is now resolved: `repeatCount` is the shipped shape across all types, constructors, and playback. The second remains an unbuilt feature, but it is a recognized deferral (parked in the assessment backlog), not code contradicting a principle. The charter's in-scope list still names "Timeline source (`createSpritesheetTimelineSource`) for MovieClip integration" -- this function now lives in `@flighthq/movieclip`, making the charter line stale, though the functionality exists.

## Contract & docs fit

- **Two-lane exports: correct.** `index.ts` exports 28 value names and 3 re-exported types; `contract.ts` is the star-export barrel. No subpath exports beyond `.` and `./contract`.
- **`sideEffects: false`: correct.** No top-level side effects. Module-scoped pool and WeakMap are lazy (populated only on function call).
- **Types in types: correct.** All `Spritesheet*` interfaces and the `SpritesheetAnimationDirection` union live in `@flighthq/types`. The package exports only functions and type re-exports.
- **Sentinels over throws: correct.** `null` for no-match/no-atlas/clean-validation; `boolean` from `updateSpritesheetPlayer`.
- **Naming: correct.** Full unabbreviated type names in function names (`createSpritesheetAnimationFromFrameNames`, `seekSpritesheetPlayerToFrame`, etc.). Globally unique.
- **Entity usage: correct where applied.** `Spritesheet` and `SpritesheetAnimation` extend `Entity` and are created via `createEntity`. `SpritesheetFrame` is a plain value record (appropriate). `SpritesheetPlayer` is a plain record (noted above as a gap for runtime-slot attachment).
- **Dependencies: minimal and correct.** `@flighthq/entity`, `@flighthq/signals`, `@flighthq/textureatlas`, `@flighthq/types`. No dependency on `@flighthq/sdk`.
- **`dispose*` vs `acquire*`/`release*`: correctly distinguished.** `disposeSpritesheetPlayer` detaches signals and clears state (GC-eligible). `acquireSpritesheetPlayer`/`releaseSpritesheetPlayer` are pool brackets.
- **Closed `switch (direction)`: appropriate.** Four-value enum in tight-loop playback -- sanctioned exception to the open-registry preference.
- **Stale charter line.** "Timeline source (`createSpritesheetTimelineSource`) for MovieClip integration" is listed as in-scope but lives in `@flighthq/movieclip`. Should be updated to reflect the current boundary.

## Candidate open directions

1. **Frame-event and tag-sub-animation design** (existing open direction 1). Still the gating design item. Needs `SpritesheetFrameEvent` payload type, `events` field on the data schema, per-frame signal emission in the player, and coordination with `spritesheet-formats` for Aseprite tag mapping. The largest feature delta to AAA completeness.

2. **`bindSpritesheetPlayerToBitmap`** (existing backlog). The only in-package consumer of a resolved frame. Without it, pivot/rotation/offset data is carried by `SpritesheetFrame` but never applied to a drawable by this package. Design questions: which `Bitmap` fields it sets, how rotated atlas regions are handled, whether it returns the frame or mutates the bitmap.

3. **Guard and `explain*` modules.** The diagnostics convention requires an `explain*` pull-query for every silent sentinel. `getSpritesheetPlayerFrame` returning `null` (no animation, empty frames, out-of-range index) and `createSpritesheetAnimationFromFrameNames` returning `null` (no atlas, no matches) are candidates for `explainSpritesheetPlayerFrame` / `explainSpritesheetAnimationFromFrameNames`. Tree-shakeable, no bundle cost when unused.

4. **Queue/completion semantics.** When `repeatCount` exhaustion, queue-advance, and completion share the same code path, the overshoot carry-over and signal-emission rules should be pinned. Currently overshoot is discarded on chain-advance and `onComplete` is suppressed -- reasonable, but worth one deliberate ruling to document or revise.

5. **Multi-backend functional coverage.** Extending `spritesheet-frame.canvas.ts` to WebGL, WebGPU, and DOM backends to verify rotated regions, pingpong direction, and pivot offsets across renderers.
