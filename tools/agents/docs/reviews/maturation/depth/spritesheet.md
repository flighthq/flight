# Maturation Roadmap: @flighthq/spritesheet

**Current verdict**: partial — 48/100. A clean, correct core for the single most common case (looping/once linear-forward animation on a uniform per-frame duration with complete/loop signals and a queue), but the runtime ignores capabilities its own `SpritesheetData` schema already declares (direction, per-frame durations, named frames, pivot/rotation), and authoring is limited to one tileset adapter.

The single load-bearing problem is the **data↔runtime split**: `SpritesheetAnimationData`/`SpritesheetFrameData` are strictly richer than the runtime `SpritesheetAnimation`/`SpritesheetFrame`, and there is no converter. Bronze exists primarily to close that gap. Note that format import/export (Aseprite/Starling/TexturePacker) is already implemented in the `@flighthq/spritesheet-formats` sibling and is correctly out of scope here.

## Bronze

Minimum viable: make the runtime honor the data model it already ships, and add the one missing build entry point. This is the 20% that removes the "advertises what it can't deliver" defect.

- **Enrich the runtime types in `@flighthq/types` first** (header layer):
  - `SpritesheetAnimation`: add `direction: SpritesheetAnimationDirection` and `frameDurations: number[] | null` (per-frame timing; `null` falls back to uniform `frameDuration`). Move `SpritesheetAnimationDirection` from `spritesheetData.ts` into `@flighthq/types` (it is a cross-package contract now).
  - `SpritesheetFrame`: add `pivotX: number | null`, `pivotY: number | null`, `rotated: boolean` so rotated-packed regions and per-frame pivots survive to runtime.
- **`createSpritesheetFromData(data: Readonly<SpritesheetData>, atlas: Readonly<TextureAtlas>): Spritesheet`** — the missing hydration bridge. Resolves `frameNames` → atlas region ids, copies pivot/rotation onto `SpritesheetFrame`, builds the `animations` record keyed by `SpritesheetAnimationData.name`, and carries `direction`/`frameDurations` onto each runtime animation.
- **Direction-aware playback** in `updateSpritesheetPlayer`: implement `reverse`, `pingpong`, and `pingpong_reverse` (the depth review's "table-stakes" gap). Forward stays the default path.
- **Per-frame durations** in `updateSpritesheetPlayer`: when `frameDurations` is present, advance the head against the cumulative timing array instead of `floor(timeInLoop / frameDuration)`.
- **`createSpritesheetFromGrid(atlas, columns, rows, frameWidth, frameHeight, options?)`** — strip/grid slicer from a raw image, the single most common way developers build a sheet. Emits ordered `SpritesheetFrame`s.
- **`disposeSpritesheetPlayer(player)`** — detach/clear the `onComplete`/`onLoop` signals the player owns (the package currently owns signals with no dispose, out of step with SDK dispose discipline).

## Silver

Competitive and solid: full playback control surface, the common professional ergonomics, and finite-repeat semantics that match Aseprite/PixiJS/Phaser expectations.

- **Playback transport**:
  - `pauseSpritesheetPlayer(player)` / `resumeSpritesheetPlayer(player)` (add a `paused: boolean` field to `SpritesheetPlayer` in `@flighthq/types`).
  - `stopSpritesheetPlayer(player)` (halt and reset head to frame 0, distinct from `complete`).
  - `seekSpritesheetPlayerToFrame(player, frameIndex)` and `seekSpritesheetPlayerToTime(player, time)` — scrub; the `gotoAndStop`/`gotoAndPlay` equivalents (a `playOnSeek`/stop flag rather than two near-duplicate functions).
- **Speed / time-scale**: add `speed: number` (playback rate multiplier) to `SpritesheetPlayer`; `updateSpritesheetPlayer` scales `deltaTime` by it. Allow negative speed for reverse scrub.
- **Finite loop counts**: change the data/runtime `loop` story so animations can "loop N times then stop". Keep `loop: boolean` for the common case but add `loopCount: number` (`-1` = infinite, `0`/`1` = play once, `n` = repeat n times) on `SpritesheetAnimation`; expose `getSpritesheetPlayerLoopCount(player)` readout.
- **Direct Bitmap binding** (no MovieClip required): `bindSpritesheetPlayerToBitmap(player, spritesheet, bitmap)` / `updateSpritesheetBitmap(...)` — drive a `Bitmap`'s source rectangle + offset/pivot from the player each frame. This is the lightweight path the timeline route currently forces past.
- **Frame events / animation tags** via an `enable*` signal group:
  - `enableSpritesheetPlayerFrameSignals(player)` adding `onFrame: Signal<SpritesheetFrameEvent>` (fires when `frameIndex` changes) — opt-in so the cost is paid only when used.
  - `SpritesheetAnimationData.events`/`frameEvents` (string-tagged frames, e.g. `"footstep"`) carried to runtime; resolved and emitted through `onFrame`.
- **Cloning**: `cloneSpritesheetPlayer(player)` (fresh signals, copied head state) and `cloneSpritesheet(spritesheet)`.
- **Name-pattern → animation builder**: `createSpritesheetAnimationFromFrameNames(spritesheet, pattern, options)` — group atlas regions by name prefix/index into an animation (the standard "walk_0..walk_7" workflow).
- **Cross-frame pivot/rotation at the binding layer**: ensure the Bitmap binding and timeline source both honor `rotated`/`pivotX/Y` so rotated-packed atlases render correctly across backends (parity-relevant).

## Gold

Authoritative / AAA: exhaustive coverage, performance, full error/edge handling, complete tests and docs, and 1:1 Rust-port parity.

- **Tag/range sub-animations** (Aseprite-style): a single sheet exposing multiple named tag ranges over one frame list, with per-tag direction and repeat — `getSpritesheetTagAnimation(spritesheet, tag)`; round-trips from the `-formats` Aseprite tag data.
- **Onion-skin / preview helpers**: `getSpritesheetPlayerFrameAt(player, spritesheet, frameOffset)` for editor/tooling preview (neighbor frames without mutating the head).
- **Deterministic, allocation-free hot path**: precompute a resolved cumulative-duration array on the runtime `SpritesheetAnimation` (built at hydration, not per-update); `updateSpritesheetPlayer` does no per-frame allocation. Add an `out`-param frame resolver `getSpritesheetPlayerFrameInto(player, spritesheet, out)` to avoid the `SpritesheetFrame | null` lookup allocation in render loops.
- **Pooling**: `acquireSpritesheetPlayer` / `releaseSpritesheetPlayer` paired-bracket pool for many short-lived emitter-style sprites.
- **Full edge-case + error contract**: empty animations, single-frame animations, zero/negative durations, pingpong with one frame, mid-pingpong direction change, queue interaction with finite loops, seek past end, negative speed crossing frame 0 — all covered by tests with sentinel returns (`null`/`false`/`-1`), throwing only on misuse.
- **Spritesheet validation**: `validateSpritesheet(spritesheet): SpritesheetValidationResult | null` and `validateSpritesheetData(data)` — report frames referencing missing atlas regions, animations referencing out-of-range frames, unresolved `frameNames` (sentinel `null` when valid).
- **Resource integration**: a `loader`-aware path so a `SpritesheetData` + image resource resolve into a ready `Spritesheet` through `@flighthq/resources`/`@flighthq/loader` without manual atlas wiring.
- **Complete test + doc coverage**: colocated tests mirroring every export (already the pattern); a functional test scene driving a sheet across raster backends to lock rotated-region/pivot/direction parity; package-level usage docs.
- **Rust-port parity**: a `flighthq-spritesheet` crate mirroring the matured surface — free functions over `(&mut SpritesheetPlayer, ...)`, `out`-params for the frame resolver, `Option` sentinels, signals via the `Signal<T>` payload model, kinds as `KindId`. Conformance-tested against the TS runtime per the conformance map.

## Sequencing & effort

Recommended order, dependencies, and items to surface:

1. **Bronze types change in `@flighthq/types` first** (small, but load-bearing): `direction` + `frameDurations` on `SpritesheetAnimation`, `pivotX/Y` + `rotated` on `SpritesheetFrame`, and relocate `SpritesheetAnimationDirection` into types. **Surface to the user** — this is the design decision called out in the depth review and the header-layer change that everything else builds on. Decide here whether `loop: boolean` stays or is subsumed by `loopCount` (Silver) so the type churns once, not twice.
2. **`createSpritesheetFromData` + direction/per-frame-duration playback** (Bronze core): the data↔runtime bridge and the matching `updateSpritesheetPlayer` logic land together — the bridge is meaningless until the runtime consumes the richer fields. Highest value, fixes the self-inconsistency. Medium effort.
3. **`createSpritesheetFromGrid` + `disposeSpritesheetPlayer`** (Bronze, independent, low effort): can land in parallel; no type dependencies beyond `TextureAtlas`/`Tileset` already imported.
4. **Silver transport + speed + finite loops**: small per-function effort but each touches `SpritesheetPlayer`/`SpritesheetAnimation` types — fold the `paused`/`speed`/`loopCount` fields into the step-1 type pass if possible to avoid repeated header churn. Sequence transport (pause/resume/stop/seek) before frame events.
5. **Bitmap binding helper** (Silver): depends on `@flighthq/displayobject` (already a dependency) and on Bronze pivot/rotation reaching runtime. Cross-package read of `Bitmap` shape — confirm the `Bitmap` source-rectangle setter is the intended seam; **surface if the binding belongs here vs. a thin helper in `displayobject`** (it parallels `createSpritesheetTimelineSource`, so here is reasonable).
6. **Frame events via `enableSpritesheetPlayerFrameSignals`** (Silver): opt-in signal group; needs a `SpritesheetFrameEvent` payload type in `@flighthq/types`. Coordinate the event-tag data shape with `@flighthq/spritesheet-formats` so Aseprite tag/event import maps cleanly (cross-package design item to surface).
7. **Gold**: allocation-free hot path, pooling, validation, tag sub-animations, resource integration, full edge-case tests, functional parity scene. Largest effort; the Rust `flighthq-spritesheet` crate is the final parity gate and should follow the TS surface stabilizing, not lead it.

Cross-package / design-decision items to raise explicitly: (a) the `@flighthq/types` enrichment in step 1; (b) `loop: boolean` vs `loopCount`; (c) Bitmap-binding ownership (spritesheet vs displayobject); (d) the frame-event/tag data shape shared with `spritesheet-formats`. Atlas packing remains out of scope (lives elsewhere), and format import/export stays in the `-formats` sibling.
