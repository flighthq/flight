---
package: '@flighthq/spritesheet'
updated: 2026-08-08
by: principal
---

# spritesheet — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/spritesheet/src/` and `packages/types/src/` on 2026-08-08. Nearly the
whole deferral list in the previous revision had landed; what survives verification:

- **No frame events.** `enableSpritesheetPlayerFrameSignals` does not exist anywhere in `packages/`,
  and the player carries only `onComplete` / `onLoop`
  (`packages/types/src/SpritesheetPlayer.ts:11-12`). Aseprite tag and per-frame event data imported by
  `spritesheet-formats` has nowhere to land, and no `SpritesheetFrameEvent` type exists.
- **No tag/range sub-animations.** `SpritesheetAnimation` (`packages/types/src/SpritesheetAnimation.ts`)
  is a flat frame-index list with no named sub-range, so an Aseprite tag can only become a whole
  separate animation record.
- **No direct node binding.** `bindSpritesheetPlayerToBitmap` does not exist; the only path from a
  player to something drawable is `createSpritesheetTimelineSource` in `@flighthq/movieclip`
  (`packages/movieclip/src/spritesheetTimelineSource.ts`). A caller wanting just the current frame's
  rect calls `getSpritesheetPlayerFrame` and does the rest itself.
- **The player is not an entity, so subsystem state has nowhere to attach.**
  `SpritesheetPlayer` (`packages/types/src/SpritesheetPlayer.ts:4`) and `SpritesheetFrame` (`:1`) are
  plain records while `Spritesheet` (`Spritesheet.ts:6`) and `SpritesheetAnimation`
  (`SpritesheetAnimation.ts:4`) extend `Entity`, and `createSpritesheetPlayer` builds an object literal
  rather than calling `createEntity` (`spritesheetPlayer.ts:34`). With no runtime slot available, the
  cumulative-duration cache is a module-scoped `WeakMap` keyed by the *animation*
  (`spritesheetPlayer.ts:313`) rather than runtime state on the entity that owns the durations.
- **The player pool is module-scoped** (`spritesheetPlayer.ts:307`) — one array shared by every caller,
  with `acquireSpritesheetPlayer` (`:4`) resetting fields but reusing whatever signals the previous
  holder left cleared.
- **Functional coverage is canvas-only.** `functional/scenes/spritesheet-frame.canvas.ts` has no
  WebGL, WebGPU, or DOM sibling, so rotated regions, pingpong direction, and pivot offsets are pinned
  on one backend.
- **No guard or `explain*` module.** `validateSpritesheet` / `validateSpritesheetData`
  (`spritesheetValidation.ts:10`, `:58`) return diagnostics on demand, but the sentinels returned by
  `getSpritesheetPlayerFrame` (`:56`) and `createSpritesheetAnimationFromFrameNames`
  (`spritesheetAnimation.ts:20`) have no pull query behind them.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline claim was **false in both
  directions**: the 2026-06-25 entry recorded that the direction-aware player "is not present in this
  worktree" and parked three items on that basis, but head carries `seekSpritesheetPlayerToFrame`
  (`spritesheetPlayer.ts:126`), `seekSpritesheetPlayerToTime` (`:135`), and full direction handling
  including the pingpong virtual-index mapping (`:180-260`). Also dropped: pooling as deferred
  (`acquireSpritesheetPlayer` `:4` / `releaseSpritesheetPlayer` `:109`), `validateSpritesheet` as
  deferred (`spritesheetValidation.ts`), the onion-skin helper as deferred
  (`getSpritesheetPlayerFrameAt` `:71`), the allocation-free hot path as deferred (cumulative-duration
  cache with binary search, `:203-217`), `loop: boolean` as the shipped shape (it is `repeatCount`,
  `-1` = indefinite), `atlas.image` (the atlas holds a `texture`), the `flighthq-spritesheet` crate (no
  `crates/` directory here), and the `packages/node/src/node.ts` `disconnectAllSignals` bug (zero
  occurrences in the tree).
- **2026-06-25** — Recommended sweep found its three items unmapped to head source; no edits made.
- **2026-06-24** — Player maturation pass: pause/resume/stop/clone/dispose, direction-aware playback,
  per-frame durations, `createSpritesheetFromData` / `…FromGrid`, and
  `createSpritesheetAnimationFromFrameNames`.
