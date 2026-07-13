---
package: '@flighthq/spritesheet'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - charter.md (blessed 2026-07-02)
  - status.md
  - assessment.md (Approved ledger, 2026-07-02)
  - prior review.md (2026-06-24, bundle-based)
  - source + tests (packages/spritesheet/src/, live tree)
  - packages/types/src/Spritesheet*.ts
  - npm run api spritesheet
---

# spritesheet — Review

> Evidence: the **live worktree** (`packages/spritesheet/src/`, 8 source files + 7 test files, 131 tests by `it(` count). Rereview of the 2026-06-24 review (solid/80, evidence then was the `builder-67dc46d64` bundle). This is the first review against the **blessed 2026-07-02 charter**, which now speaks where the prior rubric was silent — the score moves down not because the code regressed but because the rubric got teeth: three of the four Approved sweep items have not landed, and a second direction-mapping bug surfaced.

## Verdict

**solid — 74/100.** The direction-aware playback runtime, authoring builders, hydration, validation, pooling, and lifecycle are all real and tested — a genuinely solid sprite-animation core. But judged against its own blessed charter: the 2026-07-02 Approved sweep is ¾ unexecuted (seek fix, seek tests, `repeatCount` — only the types migration landed), the known seek bug is still live, a **new** per-frame-duration/direction bug exists at the same seam, and every blessed integration surface (frame events, `bindSpritesheetPlayerToBitmap`, clock) is unbuilt, leaving pivot/rotation data plumbed to a runtime nothing consumes.

## Approved-sweep verification (2026-07-02 · picked, items 1–4)

- **1. Fix seek for non-forward directions — NOT landed.** `seekSpritesheetPlayerToFrame` (`spritesheetPlayer.ts:126-134`) still passes the clamped *display* index straight to `resolveVirtualIndexStartTime`, which expects a *virtual* index. Correct only for `forward`; for `reverse`/`pingpong`/`pingpong_reverse` the synced `elapsed` is wrong and the next `updateSpritesheetPlayer` jumps off the seeked frame.
- **2. Non-forward seek tests — NOT landed.** The `seekSpritesheetPlayerToFrame`/`ToTime` describes (`spritesheetPlayer.test.ts:356-407`) exercise only default-direction animations.
- **3. `SpritesheetData` types → `@flighthq/types` — LANDED.** `SpritesheetData.ts`, `SpritesheetAnimationData.ts`, `SpritesheetFrameData.ts` live in types; `spritesheetData.ts` imports and re-exports them with a correct provenance comment. Decision #1 executed.
- **4. `loop` → `repeatCount` — NOT landed.** `SpritesheetAnimation.loop: boolean` and `SpritesheetAnimationData.loop: boolean` are unchanged in types; `createSpritesheetAnimation`, `createSpritesheetFromData`, and `updateSpritesheetPlayer` all still read `loop`.

## Present capabilities

- **Entity model + clone** — `createSpritesheet` / `cloneSpritesheet` / `getSpritesheetAnimation` (`spritesheet.ts`); `createSpritesheetFrame` carries `pivotX/pivotY/rotated`; `createSpritesheetAnimation` carries `direction` + `frameDurations`.
- **Hydration + builders** — `createSpritesheetFromData` (name→region resolution with positional fallback, direction/durations/pivot/rotation carried through), `createSpritesheetFromGrid` (row-major slicer with margin/spacing/derived cell size), `createSpritesheetFromTileset`, `createSpritesheetAnimationFromFrameNames` (exact/prefix/RegExp, `null` sentinels) (`spritesheetFrom.ts`, `spritesheetAnimation.ts`).
- **Direction-aware playback** — `updateSpritesheetPlayer` implements forward/reverse/pingpong/pingpong_reverse via the virtual-index model (`resolveVirtualFrameCount` = `2n−2` for pingpong), honors `paused`, scales by `speed`, per-frame durations via a WeakMap-cached cumulative `Float64Array` with binary search; the uniform path is allocation-free (`spritesheetPlayer.ts:151-253`).
- **Transport + lifecycle + pooling** — play (with `restart` guard), queue chaining, pause/resume/stop, seek-to-frame/time, `cloneSpritesheetPlayer`, `disposeSpritesheetPlayer` (correct `dispose*` semantics), `acquireSpritesheetPlayer`/`releaseSpritesheetPlayer` pool bracket, `onComplete`/`onLoop` signals.
- **Preview + validation** — `getSpritesheetPlayerFrame`/`getSpritesheetPlayerFrameAt` (wrapping onion-skin lookup); `validateSpritesheet`/`validateSpritesheetData` emitting `SpritesheetValidationDiagnostic[] | null` (`spritesheetValidation.ts`).
- **Tests** — 131 tests across 7 colocated files; every export has a describe; direction playback, per-frame durations, pooling, and validation are covered.

## Gaps vs a mature sprite-animation library

- **The two seek/duration direction bugs.** (a) The Approved seek bug above. (b) **New:** `getCumulativeDurations` (`spritesheetPlayer.ts:194`) maps virtual→duration index with the *pingpong-forward* formula `vi < n ? vi : 2*(n-1)-vi`, which matches `resolveVirtualIndexToDisplayIndex` for `forward`/`pingpong` but **not** `reverse`/`pingpong_reverse` — a reverse animation with `frameDurations` holds each displayed frame for the *mirror* frame's duration. Same fix shape: derive the duration index from the display mapping. Untested for those directions.
- **Finite repeats** — `repeatCount` is blessed (Decision #3, Approved) and unbuilt; `loop: boolean` cannot express "play 3 times." Games and motion-design timelines both need this.
- **Frame events / tags** — blessed in scope (Decision #2); no `SpritesheetFrameEvent`, no `events` data field, no per-frame signal. The largest feature gap for game consumers (sound cues, hit frames).
- **No bound target** — `bindSpritesheetPlayerToBitmap` (Decision #4) is unbuilt, and `createSpritesheetTimelineSource` moved to `@flighthq/movieclip`, so **nothing in this package consumes a frame** — pivot/rotation reach `SpritesheetFrame` and stop (North star 1 says "the player applies pivot/rotation/offset to the bound target"; there is currently no such application anywhere in-package).
- **`gotoAndStop`/`gotoAndPlay`** — open direction 2; callers compose `seek`+`pause`.
- **Default mismatch** — `createSpritesheetAnimation` defaults `frameDuration: 0` while `createSpritesheetAnimationData` defaults `100`; a hand-built runtime animation with defaults collapses to the 1 ms `|| 1` fallback in `resolveAnimationTotalTime`. Minor authoring trap.
- **Queue semantics** — chaining discards overshoot (`elapsed = 0` rather than carrying the remainder) and emits no `onComplete` when advancing to a queued animation; loop-spanning deltas emit one `onLoop`. Defensible, but undocumented behavior a mature runtime pins down.
- **Clock adoption** (Decision #7) — blocked on sequencing, correctly.
- **Rust crate** — none; TS-leads posture, fine.

## Charter contradictions

Two, both "blessed decision not yet executed" rather than code contradicting principle:

1. **Decision #3 (`repeatCount` replaces `loop`)** — the code still ships `loop: boolean` throughout. Approved on 2026-07-02 and unexecuted since.
2. **North star 1's last clause** ("The player applies pivot/rotation/offset to the bound target") — there is no bound target: the binding (Decision #4/#5) is unbuilt and the timeline source departed to movieclip, so pivot/rotation are carried but never applied in-package.

No code actively violates a Boundary or a stated principle otherwise.

## Contract & docs fit

- **Contract: good.** Types-first (all `Spritesheet*` types incl. the `*Data` trio now in `@flighthq/types`); full unabbreviated names; sentinels not throws (`null` no-match/no-atlas/clean-validation, boolean from `update*`); single root barrel; `sideEffects: false`; pool + WeakMap cache as bottom-of-file module state; `dispose*` vs `acquire*`/`release*` used correctly; the `switch (direction)` closed union is the sanctioned fork-B exception (fixed four-value set in a tight loop).
- **Candidate doc revisions:**
  - **Charter › Boundaries** still lists "Timeline source (`createSpritesheetTimelineSource`) for MovieClip integration" as in-scope, but it now lives in `@flighthq/movieclip` (the Package Map's "absorbed timeline-spritesheet scope"). The charter line is stale; the move also strands Decision #5's "applies … to the bound target (bitmap **or timeline source**)" wording.
  - **Charter › What it is** still names the authoring builders as owning "hydration from `*Data`" — accurate — but the `*Data` types are no longer package-local; the "entity model + `*Data` authoring schema" phrasing could note the schema now lives in types (Decision #1 executed).
  - Package Map line ("sprite-based animation") is accurate but thin; could mirror the runtime-half-of-a-triad phrasing the charter uses.

## Candidate open directions

1. **Frame-event payload design** (existing open direction 1) — still the gating design item; nothing new to add from source.
2. **Who applies the frame now?** With the timeline source gone to movieclip, the only planned in-package consumer is `bindSpritesheetPlayerToBitmap`. If that binding stays deferred, North star 1's "applies pivot/rotation to the bound target" has no realization site — either the binding rises in priority or the North star clause should name movieclip/renderers as the application layer.
3. **Queue/completion semantics** — carry-over of overshoot time and signal behavior on chain-advance are unpinned; worth one ruling when `repeatCount` lands (repeat exhaustion and queue-advance share the completion path).
