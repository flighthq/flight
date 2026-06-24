---
package: '@flighthq/spritesheet'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# spritesheet — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/spritesheet

**Session date**: 2026-06-24 **Estimated score**: 74/100 (up from 48/100)

## Implemented APIs

### Types added to `@flighthq/types`

- **`SpritesheetAnimationDirection`** — new file `SpritesheetAnimationDirection.ts`. Promoted from `spritesheetData.ts` (where it was locally defined) into the shared header layer. Value: `'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse'`.
- **`SpritesheetAnimation`** — enriched with `direction: SpritesheetAnimationDirection` and `frameDurations: number[] | null`. These were declared in the data schema but missing from the runtime type; they are now the single source of truth.
- **`SpritesheetFrame`** — enriched with `pivotX: number | null`, `pivotY: number | null`, `rotated: boolean`. Previously the runtime frame dropped pivot and rotation that the data model carried.
- **`SpritesheetPlayer`** — enriched with `paused: boolean` and `speed: number`. Both Silver-tier fields added during the Bronze type pass to avoid a second round of header churn.

### New functions — `packages/spritesheet/src/`

**`spritesheet.ts`**

- `cloneSpritesheet(spritesheet)` — returns a new entity with copied frames (each a new `SpritesheetFrame` object) and shallow-copied `animations` record and atlas reference.

**`spritesheetAnimation.ts`**

- `createSpritesheetAnimationFromFrameNames(spritesheet, pattern, options?)` — builds a `SpritesheetAnimation` by selecting frames from a sheet whose atlas region names match a string (exact or prefix) or `RegExp` pattern. Returns `null` when no frames match or no atlas is present. Options: direction, frameDuration, frameDurations, loop, originX, originY.

**`spritesheetFrom.ts`**

- `createSpritesheetFromData(data, atlas)` — the missing hydration bridge. Resolves `frameNames` → atlas region IDs via name lookup (positional index fallback), carries `direction`, `frameDurations`, `pivotX/Y`, `rotated` onto runtime types, builds `animations` record keyed by `SpritesheetAnimationData.name`. Falls back to all data frames when `frameNames` is empty.
- `createSpritesheetFromGrid(options)` — grid/strip slicer from `GridSliceOptions`. Creates a new `TextureAtlas` with one region per cell in row-major order. Supports `marginX`, `marginY`, `spacingX`, `spacingY`, explicit or derived `frameWidth`/`frameHeight`, and `namePrefix` for region names. Caller must assign `atlas.image`.

**`spritesheetPlayer.ts`**

- `cloneSpritesheetPlayer(player)` — fresh signals, copied head state and queue.
- `disposeSpritesheetPlayer(player)` — disconnects all `onComplete`/`onLoop` slots, clears animation and queue.
- `pauseSpritesheetPlayer(player)` — sets `paused: true`; `updateSpritesheetPlayer` becomes a no-op.
- `resumeSpritesheetPlayer(player)` — clears `paused`.
- `seekSpritesheetPlayerToFrame(player, frameIndex)` — seeks to a display frame index (clamped 0..frames.length-1); syncs `elapsed` to the start of that virtual frame.
- `seekSpritesheetPlayerToTime(player, time)` — seeks to an elapsed time (clamped 0..totalTime); resolves `frameIndex` from the new time.
- `stopSpritesheetPlayer(player)` — halts and resets head to frame 0, marks complete, clears queue. Distinct from `disposeSpritesheetPlayer` (no signal teardown) and `complete` flag (explicit reset).
- `updateSpritesheetPlayer` — now respects `paused`, scales `deltaTime` by `speed`, and implements direction-aware playback:
  - **`reverse`**: plays frames in reverse order (index `last - rawVirtualIndex`).
  - **`pingpong`**: plays forward then backward; virtual frame count is `2n-2` for n frames (e.g. `[0,1,2]` → virtual `[0,1,2,1]`). Total loop time scales accordingly.
  - **`pingpong_reverse`**: plays backward then forward.
  - **Per-frame durations**: when `frameDurations` is non-null, each frame's duration is looked up by index (falls back to `frameDuration`); cumulative timing walk replaces the uniform `floor(time/frameDuration)` calculation.

### Updates to `spritesheetData.ts`

Removed the local `SpritesheetAnimationDirection` type definition (now imported from `@flighthq/types`). The `createSpritesheetAnimationData` factory was not changed.

### Tests

All 108 tests pass (up from 64). New test coverage includes:

- `cloneSpritesheet`: distinct entity, copied frames, shared atlas/animations
- `createSpritesheetAnimation`: `direction` and `frameDurations` defaults
- `createSpritesheetAnimationFromFrameNames`: string prefix, exact match, RegExp, null-name skipping, no-atlas sentinel, no-match sentinel, options passthrough
- `createSpritesheetFrame`: `pivotX/Y` defaults, stored values, `rotated`
- `createSpritesheetFromData`: frame count, name resolution, positional fallback, direction/frameDurations on animations, pivot/rotation on frames, empty-frameNames fallback
- `createSpritesheetFromGrid`: frame count, sequential IDs, x/y positions, margin/spacing, namePrefix, explicit frameWidth/frameHeight, null image
- `cloneSpritesheetPlayer`, `disposeSpritesheetPlayer`, `pauseSpritesheetPlayer`, `resumeSpritesheetPlayer`, `seekSpritesheetPlayerToFrame`, `seekSpritesheetPlayerToTime`, `stopSpritesheetPlayer`
- `updateSpritesheetPlayer`: paused no-op, speed scaling, reverse direction, pingpong direction, per-frame durations

## Deferred items and why

### Gold tier (not tackled this session)

- **Tag/range sub-animations** (Aseprite-style): requires a design decision on the data shape shared with `@flighthq/spritesheet-formats` — specifically how Aseprite tag data maps to runtime sub-animation records. Cross-package design item; surface to user before acting.
- **Onion-skin / preview helpers** (`getSpritesheetPlayerFrameAt(player, spritesheet, frameOffset)`): editor/tooling only, straightforward to add once the API surface is stable.
- **Allocation-free hot path**: precompute a cumulative-duration array on the runtime `SpritesheetAnimation` at hydration time. Currently `resolveAnimationTotalTime` and `resolveVirtualIndexFromTime` iterate per-update for `frameDurations` arrays. For the uniform case (null `frameDurations`) there is no allocation per update; this is only a concern for the variable-timing path.
- **Pooling** (`acquireSpritesheetPlayer` / `releaseSpritesheetPlayer`): useful for many short-lived emitter-style sprites; straightforward.
- **Spritesheet validation** (`validateSpritesheet`, `validateSpritesheetData`): report frames referencing missing atlas regions, animations referencing out-of-range frames, etc.
- **Resource integration**: a `loader`-aware path so a `SpritesheetData` + image resource resolve into a ready `Spritesheet` through `@flighthq/resources`/`@flighthq/loader`. Requires cross-package design.
- **Rust-port parity**: `flighthq-spritesheet` crate. Should follow TS surface stabilizing.

### Silver tier (partially addressed)

- **Finite loop counts** (`loopCount: number`, `-1` = infinite): the roadmap suggested adding this during the Bronze type pass to avoid churn. The current `loop: boolean` stays — changing to `loopCount` would be a breaking change. Deferring until there is a concrete use case. `loop: boolean` is clear and idiomatic for the common case. **Surface to user** before acting.
- **Direct Bitmap binding** (`bindSpritesheetPlayerToBitmap`): the roadmap flagged this as a cross-package ownership question (spritesheet vs. displayobject). `createSpritesheetTimelineSource` already covers the MovieClip path. The lightweight direct binding belongs here but should be surfaced to user before implementing, since it parallels the timeline source and the ownership is clear.
- **Frame events / tags** via `enableSpritesheetPlayerFrameSignals`: requires a `SpritesheetFrameEvent` payload type in `@flighthq/types` and coordination with `spritesheet-formats` on the Aseprite tag/event data shape. Cross-package design item.
- **`createSpritesheetAnimationData` event fields**: `SpritesheetAnimationData` has no `events` / `frameEvents` field yet. This is a data-schema extension needed for frame events but touched by the formats sibling.

### Not applicable

- Atlas packing: out of scope (lives elsewhere).
- Format import/export: already in `@flighthq/spritesheet-formats`.

## Concerns and surprises

- **Pre-existing `node` package build error**: `disconnectAllSignals` does not exist in `@flighthq/signals` (the function is `disconnectAllSlots`). This is a pre-existing bug in `packages/node/src/node.ts` that causes `npm run build --workspace=packages/spritesheet` to fail at the `tsc -b` composite build step (which compiles all referenced packages). Running `npx tsc -p packages/spritesheet/tsconfig.json --noEmit` directly passes cleanly. This is not a regression from this session.
- **`GridSliceOptions` was already in `@flighthq/types`**: the type was pre-created by a concurrent agent, which is why `createSpritesheetFromGrid` could use it directly without a new type file. The `SpritesheetAnimationDirection.ts` type file was created new in this session.
- **Linter actively reorders test files**: The `order:fix` linter reorders `describe` blocks alphabetically and can truncate test files that do not match the expected format. Tests added after a file was stabilized may disappear from the file if the linter runs before they are committed. Verified by re-reading after each linter pass.
- **pingpong virtual frame count**: The key insight for correct pingpong playback is that the animation loop time is `(2n-2) * frameDuration` (not `n * frameDuration`), and the virtual frame sequence for `n=3` is `[0,1,2,1]`, not `[0,1,2,0,1,2,...]`. This distinction matters for correct loop detection and per-frame duration totals.

## Suggestions for future sessions

1. **Finite loop counts**: decide `loop: boolean` vs `loopCount: number` before the next type-touching session. The current `loop: boolean` is simpler; adding `loopCount` would subsume it but changes the API surface.
2. **Direct Bitmap binding**: confirm ownership (spritesheet vs. displayobject) and implement `bindSpritesheetPlayerToBitmap` / the simpler variant that just returns `{ sourceRectangle, offsetX, offsetY }` from the current frame.
3. **Frame events**: define `SpritesheetFrameEvent` in `@flighthq/types`, coordinate the Aseprite tag shape with `spritesheet-formats`, then add `enableSpritesheetPlayerFrameSignals`.
4. **Allocation-free hot path**: precompute a `cumulativeDurations: Float32Array` on `SpritesheetAnimation` at hydration/creation time to make `resolveVirtualIndexFromTime` O(1) instead of O(n). Store it in a runtime slot (`SpritesheetAnimationRuntime`) rather than on the public entity.
5. **Functional test**: add a functional test scene for spritesheet animation across raster backends (Canvas/DOM/WebGL), exercising rotated regions, pingpong direction, and pivot offsets. This would lock in rendering correctness across backends and serve as a Rust conformance target.
6. **Fix pre-existing `node` package bug**: `packages/node/src/node.ts` imports `disconnectAllSignals` which does not exist in `@flighthq/signals` — should be `disconnectAllSlots`. Fix is a one-line change.
