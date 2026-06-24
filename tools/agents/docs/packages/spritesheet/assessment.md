---
package: '@flighthq/spritesheet'
updated: 2026-06-24
basedOn: ./review.md
---

# spritesheet — Assessment

> Recommendation layer over `review.md` (solid, 80/100). The maturation roadmap (`reviews/maturation/depth/spritesheet.md`, 48/100) is **absorbed here** — nearly all of its Bronze/Silver/Gold items already landed in the head source (enriched types, `createSpritesheetFromData`, direction-aware playback, per-frame durations, grid + name-pattern builders, full transport, cloning, pooling, validation, onion-skin preview, allocation-free uniform path). Mark that roadmap doc for removal once this assessment is in place; only the residue below remains, and it splits cleanly into a small within-package correctness/ergonomics set and a larger cross-package/design-fork set.

## Recommended

Strictly sweep-safe: within `@flighthq/spritesheet`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Fix `seekSpritesheetPlayerToFrame` for non-forward directions.** It sets `player.frameIndex` to a _display_ index and then syncs `player.elapsed = resolveVirtualIndexStartTime(animation, clamped)`, but that helper expects a _virtual_ index. Forward coincides (the only tested case); `reverse` / `pingpong` / `pingpong_reverse` get a wrong `elapsed`, so the next `updateSpritesheetPlayer` jumps off the seeked frame and the seek does not stick. Convert the requested display frame to its virtual index (`resolveVirtualIndexToDisplayIndex` is the inverse to invert) before syncing `elapsed`, and set both `frameIndex` and `elapsed` consistently. Pure within-package correctness at an already-owned seam. (review.md "Gaps", second bullet.)
- **Add non-forward-direction tests for the seek path.** The bug above is latent precisely because tests only exercise `forward`. Add `reverse` / `pingpong` / `pingpong_reverse` cases asserting that a `seekSpritesheetPlayerToFrame` followed by one zero-delta `updateSpritesheetPlayer` keeps the seeked frame. Colocated in `spritesheetPlayer.test.ts`; locks the fix and the roadmap's Gold edge-case row (seek/pingpong correctness). (Roadmap Gold "Full edge-case + error contract".)
- **Replace the `// ----- Internal helpers -----` divider with name/boundary structure.** The review notes this mildly violates the SDK "avoid structural divider comments" rule. Drop the banner; the loose helpers already sit below the public surface, which is the intended signal. Trivial, file-local, leaves the file cleaner. (review.md "Contract & docs fit", Source style.)

## Backlog

Parked — each carries a reason it is not sweep-safe.

- **`gotoAndStop` / `gotoAndPlay` pairing.** Seek + pause/play in one call. Minor ergonomic gap, but it is an **API-surface addition** and its shape interacts with the seek semantics above and with the `playOnSeek` flag the roadmap floated (one flag vs. two functions) — better decided after the seek fix lands and alongside the transport surface, not swept in blind. (review.md "Gaps", `gotoAndStop`.)
- **Finite loop counts (`loopCount` vs `loop: boolean`).** A breaking type change on `SpritesheetAnimation` in `@flighthq/types`; the status doc already flags it for a user decision. Routed to Open directions (#3). (review.md "Gaps", Finite loop counts.)
- **Frame events / tags (Aseprite-style).** The single largest feature gap. Needs a `SpritesheetFrameEvent` payload in `@flighthq/types`, an `events`/`frameEvents` field on `SpritesheetAnimationData`, an opt-in `enableSpritesheetPlayerFrameSignals` signal group, and a tag/event data-shape agreement with `@flighthq/spritesheet-formats`. Cross-package design item; routed to Open directions (#2). (review.md "Gaps", Frame events / tags.)
- **Direct Bitmap binding (`bindSpritesheetPlayerToBitmap`).** A lightweight player→`Bitmap` source-rect/offset driver bypassing the timeline route. Reads `@flighthq/displayobject`'s `Bitmap` seam and its home (spritesheet vs. displayobject) is undecided — fork A. Routed to Open directions (#4). (review.md "Gaps", Direct Bitmap binding.)
- **Pivot/rotation consumption.** `pivotX/Y` and `rotated` now reach the runtime `SpritesheetFrame` but nothing consumes them — `createSpritesheetTimelineSource` applies only `offsetX/Y` + `originX/Y`. Whether honoring them is this package's job (timeline source + a future bitmap binding) or strictly a renderer responsibility is an open boundary question; doing it now would also need a cross-backend functional parity scene. Routed to Open directions (#5). (review.md "Gaps", Pivot/rotation; roadmap Silver "Cross-frame pivot/rotation".)
- **Resource / loader integration.** A `loader`-aware path resolving `SpritesheetData` + image resource into a ready `Spritesheet` through `@flighthq/resources` / `@flighthq/loader`. Cross-package; also relates to the half-wired `imageFile` fields on `SpritesheetData` / `GridSliceOptions`. (review.md "Gaps", Resource/loader integration; "Contract & docs fit", half-wired `imageFile`.)
- **Validation home / scope.** `validateSpritesheet` / `validateSpritesheetData` currently span both the runtime and `*Data` shapes; whether structural checks belong here or in a `spritesheet-formats` / loader pre-flight is an open boundary. Routed to Open directions (#6). (review.md "Candidate open directions" #6.)
- **`spritesheet-formats` boundary / `SpritesheetData` home.** Whether the canonical descriptor should live in `@flighthq/types` (header layer) with both packages depending on it, vs. staying package-private here, is the triad-shape question (fork A). Routed to Open directions (#1). (review.md "Candidate open directions" #1.)
- **Rust-port parity (`flighthq-spritesheet` crate).** Correctly gated on the TS surface settling — the final parity step, not started until the seek fix and the type-touching forks above resolve. (review.md "Gaps", Rust-port parity; roadmap Gold "Rust-port parity".)

## Approved

_None. Approval is the user's verbal gate; this section is frozen on approval only._

---

### Routed to the charter's Open directions (noted, not edited here)

The charter is a seeded stub (only **What it is** is filled). The review's six candidate open directions stand and the backlog above feeds them — surface these for an explicit direction conversation rather than sweeping them:

1. **`spritesheet-formats` boundary** — is `SpritesheetData`'s home correct, or does the canonical descriptor belong in `@flighthq/types` with both packages depending on it? (fork A / triad shape)
2. **Frame events / tags scope** — settle the `SpritesheetFrameEvent` payload, the `events`/`frameEvents` field, and the formats-sibling tag mapping; is Aseprite-tag-level fidelity in scope?
3. **`loopCount` vs `loop: boolean`** — decide before the next type-touching pass (breaking type change).
4. **Direct Bitmap binding ownership** — `bindSpritesheetPlayerToBitmap` here vs. in `displayobject` (fork A).
5. **Pivot/rotation consumption** — this package's responsibility (timeline source + bitmap binding) or strictly the renderer's?
6. **Validation scope** — runtime/`*Data` checks here, or moved to a `spritesheet-formats` / loader pre-flight?
