---
package: '@flighthq/spritesheet'
crate: flighthq-spritesheet
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# spritesheet — Charter

## What it is

`@flighthq/spritesheet` is the **runtime + authoring half** of sprite/atlas-based frame animation: defining named animations over a `TextureAtlas`, advancing a playback head over time, and resolving the current frame's atlas region + offset for consumption by display objects and timelines. It owns three things — the entity model (`Spritesheet`, `SpritesheetAnimation`, `SpritesheetFrame`), the playback runtime (`SpritesheetPlayer`: direction-aware advance, per-frame durations, speed, seek, pause/resume/stop, pooling, signals, frame events), and the authoring builders (grid/strip slicer, name-pattern animation builder, hydration from `*Data`).

Where it ends: it is the **runtime member of a triad** with `@flighthq/spritesheet-formats` (file codecs — Aseprite, TexturePacker, etc.). Pixel-level rendering of a resolved frame belongs to the renderer (`displayobject-<backend>`). The time primitive will come from `@flighthq/clock` once it exists.

## North star

1. **Data flows through to playback, losslessly.** Everything `SpritesheetData` can express — direction, per-frame durations, named-frame resolution, pivot, rotation, events, tags — must reach the runtime `SpritesheetPlayer` and survive a tick. The player applies pivot/rotation/offset to the bound target.
2. **Plain data, free functions, explicit allocation.** Animations and frames are value descriptors; playback is advanced by `updateSpritesheetPlayer`, not hidden runtime magic. The uniform-timing update path allocates nothing per frame. `dispose*` detaches signals; `acquire*`/`release*` pool bracket is honored.
3. **Sentinels over throws.** `null` for no-match / no-atlas / clean-validation. `update*` returns a boolean active/changed signal.
4. **The runtime half of a triad, not a monolith.** Cooperates with `spritesheet-formats` (codec) and the renderer (rasterize) across clean seams. `@flighthq/types` is the header layer for every cross-package type.
5. **AAA sprite-animation fidelity.** The bar is what a game developer reaches for: directions, per-frame timing, finite repeats, seek/scrub, frame events, tag-based sub-animations, pooling, validation.

## Boundaries

**In scope:**

- The entity model + `*Data` authoring schema (descriptor types in `@flighthq/types`).
- `SpritesheetPlayer` runtime: direction-aware advance (forward/reverse/pingpong/pingpong_reverse), per-frame durations, speed, seek-to-frame/time, pause/resume/stop, play/queue chaining, finite repeats (`repeatCount`), pooling, completion/loop signals, frame events, onion-skin preview.
- Authoring builders: grid/strip slicer, name-pattern animation builder, hydration from `*Data`.
- Direct `Bitmap` binding (`bindSpritesheetPlayerToBitmap`): drive a bitmap's source rect, offset, pivot, and rotation from the current player frame. Lives here; depends only on types.
- Structural validation (`validateSpritesheet`/`validateSpritesheetData`) — tree-shakes out if not imported.
- Timeline source (`createSpritesheetTimelineSource`) for MovieClip integration.
- Frame events / Aseprite-style tags as a target capability.
- Clock consumption (`@flighthq/clock`) once the clock package exists.

**Non-goals:**

- File codecs (Aseprite, TexturePacker, JSON-hash/array) — `@flighthq/spritesheet-formats`.
- Pixel rendering of a resolved frame — `displayobject-<backend>`.
- Resource/loader orchestration — cross-package, not owned here.
- Atlas packing — separate concern.

## Decisions

- **[2026-07-02] `SpritesheetData` types promoted to `@flighthq/types`.** `SpritesheetData`, `SpritesheetAnimationData`, `SpritesheetFrameData`, and related authoring descriptors move to the header layer. Both this package and `spritesheet-formats` depend on types for the canonical schema.

  **Why:** Types go in types. The data schema is a cross-package descriptor consumed by the formats sibling — it belongs in the header layer, not as a package-local definition.

- **[2026-07-02] Frame events and Aseprite-style tags are in scope.** Per-frame callbacks and tag/sub-animation playback are targets. Needs `SpritesheetFrameEvent` payload type in `@flighthq/types`, an `events`/`frameEvents` field on the data schema, and coordination with `spritesheet-formats` on the tag/event data shape.

  **Why:** Events are important for game code. Frame events (sound cues, hit frames, spawn points) are a core feature of mature sprite animation systems.

- **[2026-07-02] `repeatCount: number` replaces `loop: boolean`.** Finite repeats via `repeatCount`: `-1` = infinite, `0` = play once (no repeats), `N` = play N+1 times total. This is a breaking type change on `SpritesheetAnimation` in `@flighthq/types`. Matches the industry convention (GSAP `repeat`, CSS `animation-iteration-count`, Spine, Unity).

  **Why:** `loopCount`/`repeatCount` with `-1` for infinite is the universal standard. `loop: boolean` is simpler but can't express "loop 3 times then stop" — a common game requirement. Pre-release is the time to make the breaking change.

- **[2026-07-02] Direct `Bitmap` binding lives in spritesheet.** `bindSpritesheetPlayerToBitmap` lives here, not in `displayobject`. The dependency model is clean: `Bitmap` is defined in `@flighthq/types`, so no `displayobject` dependency is needed. The function applies the current frame's atlas region, offset, pivot, and rotation to the bitmap entity.

  **Why:** "bindSpritesheetPlayer" is a spritesheet verb. The dependency is types-only — no coupling to displayobject internals.

- **[2026-07-02] Pivot/rotation consumption is spritesheet's job.** The player implementation applies pivot/rotation/offset to the bound target (bitmap or timeline source). This is not a renderer responsibility — the player knows the frame data and drives the target's properties accordingly.

  **Why:** The player owns the frame data; applying it to the target is a natural extension of playback, not a rendering concern.

- **[2026-07-02] Validation stays in spritesheet, tree-shakes naturally.** `validateSpritesheet`/`validateSpritesheetData` remain in this package. Since the package is `sideEffects: false` and the barrel is a thin re-export, users who don't import the validators pay zero bundle cost.

  **Why:** Tree-shaking already handles the "don't pay if you don't import" concern. The validators are spritesheet-domain logic, not a formats/loader concern.

- **[2026-07-02] Clock integration.** Spritesheet player will consume `@flighthq/clock` once it exists, replacing raw `deltaTime` with a clock-sourced time step.

  **Why:** `@flighthq/clock` is the shared time primitive. Spritesheet playback is a time-driven system — pause/resume/speed are all clock concerns.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Frame event / tag design.** The `SpritesheetFrameEvent` payload shape, how Aseprite tags map to runtime sub-animation records, and the data-schema fields need design before implementation. Cross-package coordination with `spritesheet-formats`.

2. **`gotoAndStop` / `gotoAndPlay` ergonomics.** Whether to add seek-and-pause/play convenience functions (a familiar pairing) or leave callers composing `seek` + `pause` themselves. Minor.

3. **Resource / loader integration.** Whether this package gains a `loader`-aware path resolving `SpritesheetData` + image resource into a ready `Spritesheet`. Cross-package. The half-wired `imageFile` fields on `SpritesheetData`/`GridSliceOptions` carry a path that no builder currently loads.

4. **`@flighthq/clock` design dependency.** Spritesheet player's clock adoption depends on the clock package's design (entity shape, how consumers read time). Sequenced after the clock package.
