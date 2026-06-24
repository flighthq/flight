---
package: '@flighthq/spritesheet'
crate: flighthq-spritesheet
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# spritesheet — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/spritesheet` is the **runtime + authoring half** of sprite/atlas-based frame animation: defining named animations over a `TextureAtlas`, advancing a playback head over time, and resolving the current frame's atlas region + offset for consumption by display objects and timelines. It owns three things — the entity model (`Spritesheet`, `SpritesheetAnimation`, `SpritesheetFrame`, and the authoring `*Data` descriptor schema), the playback runtime (`SpritesheetPlayer`: direction-aware advance, per-frame durations, speed, seek, pause/resume/stop, pooling, signals), and the authoring builders (grid/strip slicer, name-pattern animation builder, hydration from `*Data`).

Where it ends: it is the **runtime member of a triad** (analogous to `particles` / `particles-formats`). The file `↔` value codec — importing/exporting Aseprite/TexturePacker/etc. on-disk formats — belongs to the sibling `@flighthq/spritesheet-formats`, not here. Pixel-level rendering of a resolved frame belongs to the renderer (`displayobject-<backend>`). Display-object integration today flows through `createSpritesheetTimelineSource` into `@flighthq/timeline` / MovieClip; this package contributes the animation source, not the scene-graph node itself.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks. Edit to your framing; nothing here is blessed._

1. **Data flows through to playback, losslessly.** Everything `SpritesheetData` can express — direction, per-frame durations, named-frame resolution, pivot, rotation — must reach the runtime `SpritesheetPlayer` and survive a tick. The prior review's central indictment was a data↔runtime gap; closing it (and keeping it closed) is the package's defining bar. A field that is plumbed to the runtime but silently dropped on the next `update` is a regression, not a feature.
2. **Plain data, free functions, explicit allocation.** Animations and frames are value descriptors; playback is advanced by a named `updateSpritesheetPlayer` call, not by hidden runtime magic. `create*`/`clone*`/`acquire*` allocate; the uniform-timing update path allocates nothing per frame. `dispose*` detaches signals; the `acquire*`/`release*` pool bracket is honored. This mirrors the SDK's allocation-explicit, side-effect-free rules.
3. **Sentinels over throws.** `null` for no-match / no-atlas / clean-validation; `update*` returns a boolean active/changed signal. Expected failure is a return value, not an exception.
4. **The runtime half of a triad, not a monolith.** The package stays bounded to runtime + authoring; it cooperates with `spritesheet-formats` (codec) and the renderer (rasterize) across clean seams rather than absorbing them. `@flighthq/types` is the header layer for every cross-package type.
5. **AAA sprite-animation fidelity is the target.** The bar is what a developer reaches for in a mature sprite-animation library — directions, per-frame timing, seek/scrub, onion-skin preview, pooling, validation — pursued canonically (industry terms, no thin stubs), with frame events/tags as the next horizon.

## Boundaries (proposed)

_Drawn from the review and the neighboring packages. Edit freely._

**In scope**

- The entity model + `*Data` authoring schema, and `cloneSpritesheet`.
- The `SpritesheetPlayer` runtime: direction-aware advance (forward / reverse / pingpong / pingpong_reverse), per-frame durations, speed, seek-to-frame / seek-to-time, pause/resume/stop, play/queue chaining, pooling, completion/loop signals, onion-skin preview.
- Authoring builders: grid/strip slicer, name-pattern animation builder, hydration from `*Data`.
- Structural validation of a `Spritesheet` / `SpritesheetData`.
- The animation **source** for timeline integration (`createSpritesheetTimelineSource`).

**Non-goals (proposed)**

- **File ↔ value codecs** (Aseprite, TexturePacker, JSON-hash/array, etc.) — that is `@flighthq/spritesheet-formats`.
- **Pixel rendering** of a resolved frame — that is the renderer (`displayobject-<backend>`).
- **Resource/loader orchestration** (turning a `*Data` + image resource into a ready `Spritesheet` through `@flighthq/resources` / `@flighthq/loader`) — cross-package, not owned here unless directed.
- **Owning the display-object node.** Whether a lightweight `bindSpritesheetPlayerToBitmap` lives here or in `displayobject` is an open direction, not a settled in-scope claim.

## Decisions

None blessed yet.

## Open directions

_The real questions. Every candidate from `review.md`, plus the structural forks that touch this package. An agent **asks** here rather than assuming._

1. **Boundary with `spritesheet-formats` / home of `SpritesheetData`.** `SpritesheetData` lives in this package today but is the import target of the formats sibling. Is the data schema's home correct, or should the canonical descriptor live in `@flighthq/types` (header layer) with both packages depending on it? (Structural fork A — source-data vs. graph participation — and the triad shape.)
2. **Frame events / tags — the largest feature gap.** No per-frame callbacks, no Aseprite-style tag/sub-animation playback. Settling this needs a `SpritesheetFrameEvent` payload type in `@flighthq/types`, an `events`/`frameEvents` field on `SpritesheetAnimationData`, and coordination with `spritesheet-formats` on the tag/event data shape. North-star question: **is Aseprite-tag-level fidelity in scope?** Cross-package design item, not within-package sweep work.
3. **`loopCount: number` vs `loop: boolean`.** Finite repeats ("loop N times then stop") are a known fork. Changing it is a breaking type change, so decide before the next type-touching pass.
4. **Direct Bitmap binding ownership.** Does a lightweight `bindSpritesheetPlayerToBitmap` (drive a bitmap's source rectangle + offset from a player, without a timeline) belong here or in `displayobject`? (Structural fork A again — the spritesheet sim vs. the display node's participation.)
5. **Pivot / rotation consumption.** `pivotX/Y` and `rotated` now reach the runtime `SpritesheetFrame` but are consumed nowhere (`createSpritesheetTimelineSource` applies only offset/origin). Is honoring them a spritesheet-package responsibility (in the timeline source and any future bitmap binding), or strictly a renderer responsibility? This decides whether the carried fields are this package's contract or pass-through to a backend.
6. **Validation scope.** Is `validateSpritesheet` / `validateSpritesheetData` the intended home for structural checks, or should it move to a `spritesheet-formats` / loader pre-flight? It currently spans both runtime and `*Data` shapes.
7. **Resource / loader integration.** Should this package gain a `loader`-aware path that resolves a `SpritesheetData` + image resource into a ready `Spritesheet` through `@flighthq/resources` / `@flighthq/loader`? (`SpritesheetData.imageFile` / `GridSliceOptions.imageFile` carry a path that no builder currently loads — the field reads as half-wired pending this decision.) Cross-package.
8. **`gotoAndStop` / `gotoAndPlay` ergonomics.** Seek exists, but there is no "seek and pause/play in one call" convenience; callers must `seek` + `pause` themselves. Minor — confirm whether the SDK wants this OpenFL-familiar pairing.
9. **Rust-port parity.** No `flighthq-spritesheet` crate yet; correctly gated on the TS surface settling. When the open directions above land, the crate follows.

### Known correctness nits (for the assessment, not direction)

These are within-package fixes surfaced by the review, recorded here so the direction discussion can ignore them — they are sweep work, not forks:

- **`seekSpritesheetPlayerToFrame` is direction-incorrect for non-forward animations.** It treats a _display_ frame index as a _virtual_ index when syncing `elapsed` (via `resolveVirtualIndexStartTime`), so for `reverse` / `pingpong` / `pingpong_reverse` the next `updateSpritesheetPlayer` jumps to a different frame than the one seeked to, and the seek does not "stick." Untested for non-forward directions.
- **Divider-comment style nit** — `// ----- Internal helpers -----` mildly violates the "avoid structural divider comments" rule (low-stakes).
