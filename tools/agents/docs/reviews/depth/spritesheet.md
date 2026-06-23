# Depth Review: @flighthq/spritesheet

**Domain**: Spritesheet / atlas-based frame animation — defining named animations over a texture atlas, advancing a playback head over time, resolving the current frame's atlas region + offset, and integrating with display objects / timelines.

**Verdict**: partial — **48/100**

The package has a clean, correct core for the _single most common_ use case (a looping/once linear forward animation driven by a fixed per-frame duration, with complete/loop signals and an animation queue). But it falls short of an authoritative sprite-animation library on two fronts that matter most in this domain: (1) the runtime playback model is missing playback features the package's _own_ data model already declares (direction, per-frame durations, playback speed, named-frame resolution), and (2) it offers no construction/authoring affordances beyond a single tileset adapter. The richer `SpritesheetData` schema and the `spritesheet-formats` sibling exist, but the _runtime that actually plays animations_ does not consume the data model's expressiveness — that is depth missing-by-omission, not by design.

## Present capabilities

- **Entity model** — `createSpritesheet` (atlas + `animations` record + `frames`), `createSpritesheetAnimation` (frames index list, `frameDuration`, `loop`, `originX/Y`), `createSpritesheetFrame` (atlas region `id` + `offsetX/Y`). Clean entity/runtime + free-function shape consistent with the SDK style.
- **Authoring data schema** — `SpritesheetData` / `SpritesheetAnimationData` / `SpritesheetFrameData` with a notably _richer_ surface than the runtime: `direction` (`forward | reverse | pingpong | pingpong_reverse`), `frameDurations` (per-frame timing), `frameNames`, `pivotX/Y`, `rotated`, `sourceWidth/Height`, trim offsets, `scale`. This is the right canonical descriptor set.
- **Playback runtime** — `createSpritesheetPlayer`, `updateSpritesheetPlayer(player, deltaTime)` (delta-driven), `getSpritesheetPlayerFrame` resolves the active `SpritesheetFrame`. Handles looping vs. play-once, clamps to the last frame on completion.
- **Animation control** — `playSpritesheetAnimation` (with `restart` flag to avoid re-triggering the same anim), `queueSpritesheetAnimation` (sequential chaining), `getSpritesheetAnimation(sheet, label)` lookup by name.
- **Events** — `onComplete` and `onLoop` signals on the player (loop-count delta detection drives `onLoop`).
- **Integration seams** — `createSpritesheetFromTileset` (build a sheet from a `Tileset`), `createSpritesheetTimelineSource` (expose an animation as a `TimelineSource` so a MovieClip can play it; bitmap-per-target via WeakMap, shareable across clips).

## Gaps vs an authoritative sprite-animation library

The most damning gaps are features the package's **own `SpritesheetAnimationData` declares but the runtime ignores** — these read as unfinished, not deliberate:

- **Playback direction** — `SpritesheetAnimationData.direction` supports `reverse` / `pingpong` / `pingpong_reverse`, but the runtime `SpritesheetAnimation` entity has no `direction` field and `updateSpritesheetPlayer` only ever advances forward (`floor(timeInLoop / frameDuration)`). Ping-pong and reverse — table-stakes for sprite animation — are unreachable at playback time.
- **Per-frame durations** — `frameDurations: number[] | null` exists in the data schema, but the runtime animation only carries a single uniform `frameDuration`. Variable-timing animations (the norm in Aseprite/Texture Packer exports) cannot be played with their authored timing.
- **No bridge from `SpritesheetData` → runtime `Spritesheet`** — there is no `createSpritesheetFromData` / hydration function. The rich data model and the runtime model are disconnected; `frameNames`/`name`-based lookup never reaches runtime (`frames` are bare numeric indices, animation lookup is by record key only).

Beyond the self-inconsistency, an authoritative library is also missing:

- **Playback speed / time-scale** — no `speed`/`playbackRate` multiplier on the player; you cannot slow down or speed up an animation without rescaling delta yourself.
- **Pause / resume / stop / seek** — only `play`, `queue`, and `update`. No `pauseSpritesheetPlayer`, `resumeSpritesheetPlayer`, `stopSpritesheetPlayer`, no `seekSpritesheetPlayerToFrame` / `gotoAndStop` / `gotoAndPlay`, no scrub-to-time. The completed/`complete` flag is the only halt mechanism.
- **Frame events / tags** — no per-frame callbacks or frame-tagged events (e.g. fire an event when a "footstep" frame is reached), which mature sprite engines (Aseprite tags, Spine events) provide.
- **Loop count / finite repeats** — `loop` is a boolean; no "loop N times then stop", no `loopCount` readout beyond the internal delta used for `onLoop`.
- **Direct render binding** — the only display-object path is via `TimelineSource`/MovieClip. There is no lightweight "drive this Bitmap's source rectangle from this player" helper for the common case of animating a sprite without a timeline.
- **Builders / atlas slicing** — only `createSpritesheetFromTileset`. No grid/strip slicer (`createSpritesheetFromGrid(cols, rows, frameW, frameH)`) — the single most common way developers build a sheet from a raw image — and no name-pattern → animation builder.
- **Pivot/anchor at playback** — `SpritesheetFrameData` has `pivotX/Y` and `rotated`, but the runtime `SpritesheetFrame` (`id` + `offsetX/Y`) drops pivot and rotation entirely, so rotated-packed regions and per-frame pivots are lost once you reach runtime.
- **Cloning / disposal** — no `cloneSpritesheetPlayer`, no `disposeSpritesheetPlayer` to detach the `onComplete`/`onLoop` signals it owns.

(Format import/export — Aseprite/Starling/TexturePacker — is correctly out of scope here; it lives in the `spritesheet-formats` sibling. Atlas packing is also legitimately elsewhere.)

## Naming / API-shape notes

- Naming is consistent and self-identifying: every export carries the full `Spritesheet*` type word; verbs (`create`, `get`, `play`, `queue`, `update`) match SDK conventions. `updateSpritesheetPlayer` returning `boolean` (changed/active) is a reasonable signal.
- The **data/runtime split is the core API-shape problem**: two parallel vocabularies (`SpritesheetAnimationData` vs `SpritesheetAnimation`, `SpritesheetFrameData` vs `SpritesheetFrame`) where the `*Data` variant is strictly richer and there is no converter between them. Either the runtime should grow to honor the data model (direction, per-frame durations, pivot/rotation), or the data model is over-declared. As-is it advertises capabilities the runtime cannot deliver.
- `getSpritesheetPlayerFrame` requiring both `player` and `spritesheet` is a clean stateless lookup, but it means there is no single object a renderer can poll — fine for the value-typed style, worth noting for ergonomics.
- The player owns two signals (`onComplete`, `onLoop`) but the package provides no `dispose*` to release them, slightly out of step with the SDK's dispose discipline for signal-owning entities.

## Recommendation

Treat this as a solid foundation that is **one focused pass away from "solid"** and two from "authoritative". Priority order:

1. **Close the data↔runtime gap (highest value, fixes self-inconsistency):** add `direction` and `frameDurations` (or a resolved per-frame timing array) to the runtime `SpritesheetAnimation`, implement reverse/ping-pong and variable-timing in `updateSpritesheetPlayer`, and add a `createSpritesheetFromData` hydration function. Carry `pivot`/`rotated` onto the runtime `SpritesheetFrame`.
2. **Round out playback control:** `pauseSpritesheetPlayer`, `resumeSpritesheetPlayer`, `stopSpritesheetPlayer`, `seekSpritesheetPlayerToFrame`, and a `speed`/`playbackRate` field. Add finite loop counts.
3. **Add authoring builders:** `createSpritesheetFromGrid` (strip/grid slicing from a raw image) and a name-pattern → animation helper — the most-requested entry points for this domain.
4. **Add a direct Bitmap-binding helper** (drive a bitmap's source rectangle + offset from a player without a MovieClip) and a `disposeSpritesheetPlayer`.

Surface item 1 to the user as the load-bearing decision (it touches `@flighthq/types`); items 2–4 are in-package depth work appropriate to bring to AAA completeness within a session.
