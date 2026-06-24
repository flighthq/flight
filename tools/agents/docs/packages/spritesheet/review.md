---
package: '@flighthq/spritesheet'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/spritesheet.md
  - source
---

# spritesheet — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/spritesheet/` (source + tests) and the bundle `changes.patch`. Findings cited as `67dc46d64:<path>`. Supersedes the prior depth review (48/100).

## Verdict

**solid — 80/100.** One focused pass took this package from the prior review's 48/100 to a near-complete sprite-animation runtime: the data↔runtime gap that was the prior review's central indictment is closed (direction, per-frame durations, speed, named-frame resolution, pivot/rotation all now flow from `SpritesheetData` into the runtime and through playback), and the package additionally grew authoring builders (grid + name-pattern), full playback control (pause/resume/stop/seek), pooling, validation, and onion-skin preview. It is one direction decision (frame events / tags) and a couple of correctness/seam nits away from authoritative.

**Note on the status doc.** The distributed worker report (`status.md`, as-claimed, score 74) is _stale against its own final source_: it lists pooling, validation, the allocation-free cumulative-duration cache, and the onion-skin `getSpritesheetPlayerFrameAt` as **deferred**, but the head source implements all four — `acquireSpritesheetPlayer`/`releaseSpritesheetPlayer`, `validateSpritesheet`/`validateSpritesheetData`, the `cumulativeDurationsCache` WeakMap, and `getSpritesheetPlayerFrameAt` are present and tested. The captured `dist/` confirms this: `dist/index.d.ts` and `dist/spritesheetPlayer.d.ts` predate these additions (no validation export, no acquire/release, no `getSpritesheetPlayerFrameAt`), so the report was written mid-session and the working tree moved past it. This review reflects the **source**, which is the correct authority — and scores higher (80) than the report's self-estimate (74) as a result.

## Present capabilities

Grounded in `67dc46d64:packages/spritesheet/src/`:

- **Entity model + clone** — `createSpritesheet`, `getSpritesheetAnimation`, and a new `cloneSpritesheet` (deep-copies frames, shallow-copies the `animations` record and atlas) (`spritesheet.ts`). `createSpritesheetFrame` now carries `pivotX/pivotY/rotated` (`spritesheetFrame.ts`), and `createSpritesheetAnimation` carries `direction` + `frameDurations` (`spritesheetAnimation.ts`) — the runtime types are now as expressive as the `*Data` schema.
- **Hydration bridge** — `createSpritesheetFromData(data, atlas)` (`spritesheetFrom.ts`) resolves `frameNames` → atlas region IDs via a name map (positional-index fallback), carries direction / per-frame durations onto animations and pivot / rotation onto frames, and keys `animations` by `SpritesheetAnimationData.name`. This is the converter the prior review flagged as the load-bearing missing piece. Empty `frameNames` falls back to all frames.
- **Authoring builders** — `createSpritesheetFromGrid(options)` (row-major grid/strip slicer with margin/spacing/explicit-or-derived cell size and `namePrefix`, building a fresh `TextureAtlas`), `createSpritesheetAnimationFromFrameNames(sheet, pattern, options?)` (exact / prefix-string / `RegExp` selection over atlas region names, sentinel `null` on no-atlas or no-match), and the pre-existing `createSpritesheetFromTileset`.
- **Direction-aware playback** — `updateSpritesheetPlayer` (`spritesheetPlayer.ts`) now implements forward / reverse / pingpong / pingpong_reverse via a virtual-index model (`resolveVirtualFrameCount` = `2n-2` for pingpong, `resolveVirtualIndexToDisplayIndex` maps virtual→display per direction), honors `paused` (no-op), scales `deltaTime` by `speed`, and supports per-frame durations through a lazily-built, WeakMap-cached cumulative-duration array (`getCumulativeDurations`) with an O(log n) binary search (`resolveVirtualIndexFromTime`). The uniform path allocates nothing per update.
- **Playback control** — `pauseSpritesheetPlayer`, `resumeSpritesheetPlayer`, `stopSpritesheetPlayer`, `seekSpritesheetPlayerToFrame`, `seekSpritesheetPlayerToTime`, plus `playSpritesheetAnimation` (with `restart` guard) and `queueSpritesheetAnimation` chaining.
- **Lifecycle** — `cloneSpritesheetPlayer` (fresh signals, copied state/queue), `disposeSpritesheetPlayer` (disconnects `onComplete`/`onLoop`, clears animation+queue — correct SDK `dispose*` semantics), and a pool bracket `acquireSpritesheetPlayer`/`releaseSpritesheetPlayer`.
- **Preview** — `getSpritesheetPlayerFrame` (current frame) and `getSpritesheetPlayerFrameAt(player, sheet, frameOffset)` (wrapping neighbor lookup for onion-skin), both non-mutating.
- **Validation** — `validateSpritesheet` / `validateSpritesheetData` (`spritesheetValidation.ts`) emit a `SpritesheetValidationDiagnostic[] | null` (sentinel-on-clean) reporting dangling region IDs, out-of-range animation frame refs, empty animations, missing frame names, and mismatched `frameDurations` lengths.
- **Timeline integration** — `createSpritesheetTimelineSource` (`spritesheetTimelineSource.ts`) exposes an animation as a `TimelineSource` (per-target bitmap via `WeakMap`, shareable across MovieClips).
- **Tests** — every exported function has a colocated, alphabetized `describe` block (player test covers acquire/clone/create/dispose/getFrame/getFrameAt/pause/play/queue/release/resume/seek×2/stop/update; `spritesheetFrom.test.ts` and `spritesheetValidation.test.ts` cover the new builders and validators). `exports:check` binding is intact.

## Gaps vs an authoritative sprite-animation library

- **Frame events / tags** — no per-frame callbacks and no Aseprite-style tag/sub-animation playback. This is the single largest remaining feature gap (mature engines: Aseprite tags, Spine events). It is correctly deferred — it needs a `SpritesheetFrameEvent` payload type in `@flighthq/types`, an `events` field on `SpritesheetAnimationData`, and coordination with `spritesheet-formats` on the tag/event data shape. A cross-package design item, not within-package sweep work.
- **`seekSpritesheetPlayerToFrame` is direction-incorrect for non-forward animations** — it sets `player.frameIndex = clamped` (a _display_ frame index) and then syncs `player.elapsed = resolveVirtualIndexStartTime(animation, clamped)`, but `resolveVirtualIndexStartTime` expects a _virtual_ index. For `forward` the two coincide (the only case the tests exercise), but for `reverse`/`pingpong`/`pingpong_reverse` the synced `elapsed` is wrong, so the _next_ `updateSpritesheetPlayer` jumps to a different frame than the one seeked to. The `frameIndex` itself is also a display index, which `updateSpritesheetPlayer` will overwrite from `elapsed` on the next tick — so the seek does not "stick" across an update for non-forward directions. This is a latent bug at the same data↔runtime seam the prior review called out, now one layer deeper. Untested for non-forward directions.
- **No `gotoAndStop` / `gotoAndPlay` pairing** — seek exists but there is no "seek and pause in one call" convenience; callers must `seek` + `pause` themselves. Minor ergonomic gap.
- **Finite loop counts** — `loop` is still a boolean; no `loopCount: number` ("loop N times then stop"). Deferred deliberately (would change the API surface); the status doc flags it for a user decision.
- **Direct Bitmap binding** — the only display-object path remains `TimelineSource`/MovieClip; there is no lightweight `bindSpritesheetPlayerToBitmap` (drive a bitmap's source rectangle + offset from a player without a timeline). Flagged in the prior review and the status doc; ownership (spritesheet vs. displayobject) is the open question.
- **Resource/loader integration** — no `loader`-aware path that resolves a `SpritesheetData` + image resource into a ready `Spritesheet` through `@flighthq/resources` / `@flighthq/loader`. Cross-package.
- **Pivot/rotation are carried but never consumed** — `pivotX/Y` and `rotated` now reach the runtime `SpritesheetFrame` (good — they were dropped before), but nothing in this package _uses_ them: `createSpritesheetTimelineSource` applies only `offsetX/Y` and `originX/Y`, ignoring pivot and the 90°-rotated atlas-region case. The data is plumbed; the playback/render consumption is not. (Render consumption may legitimately belong to the renderer, not here — see Open directions.)
- **Rust-port parity** — no `flighthq-spritesheet` crate yet. Correctly gated on the TS surface settling.

## Charter contradictions

The charter is a seeded stub — only **What it is** is filled; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore no stated principle, boundary, or decision for the code to contradict, so **none found**. The package's identity matches the one-line charter ("defining named animations over a texture atlas, advancing a playback head over time, resolving the current frame's atlas region + offset, integrating with display objects / timelines"). The thinness of the charter is itself the finding — see Candidate open directions.

## Contract & docs fit

**Lives up to the contract:**

- **`@flighthq/types`-first** — every cross-package type is in the header layer: `SpritesheetAnimationDirection.ts` (promoted from a local definition), enriched `SpritesheetAnimation`/ `SpritesheetFrame`/`SpritesheetPlayer`, plus `GridSliceOptions.ts` and `SpritesheetValidationDiagnostic.ts` (`SpritesheetValidationSeverity` + diagnostic). No cross-package type is defined inline. (`SpritesheetData`/`*FrameData`/`*AnimationData` stay local to the package as authoring-descriptor types, consistent with how the data schema is treated as package-private.)
- **Full unabbreviated names** — every export carries the `Spritesheet*` type word; verbs (`create`/`get`/`play`/`queue`/`update`/`clone`/`dispose`/`pause`/`resume`/`stop`/`seek`/`validate`/ `acquire`/`release`) match SDK conventions. `dispose*` vs the `acquire*`/`release*` pool bracket are used with their correct distinct meanings.
- **Sentinels not throws** — `null` for no-match / no-atlas / clean-validation; no exceptions for expected failure. `update*` returns a `boolean` active/changed signal.
- **Single root export, `sideEffects: false`** — `index.ts` is a thin barrel; `package.json` declares one `.` entry and `"sideEffects": false`; pool state is a loose module variable at the bottom of `spritesheetPlayer.ts` (not top-level side-effecting). Compliant.
- **Source style** — exports alphabetized; internal helpers below the public surface behind a divider banner comment (`// ----- Internal helpers -----`), which mildly violates the "avoid structural divider comments" rule but is low-stakes.
- **Structural-fork fit** — the `switch (direction)` in `resolveVirtualIndexToDisplayIndex` is a _closed union_, not a registry; under fork B this is the sanctioned exception (a tight loop over a fixed four-value set that is not a growing family), so it is **correct as-is**, not a registry candidate. No hot-loop feature-bundling smell (fork C): the variable-timing branch is hoisted to a cached cumulative array, not branched per-particle inside the loop.

**Candidate doc revisions:**

- The Package Map line ("a logical package providing sprite-based animation, analogous in structure to `particles`") is accurate and now well-earned — no change needed, though the analogy could note that, like `particles`/`particles-formats`, this is the runtime half of a triad with `spritesheet-formats`.
- `SpritesheetData.imageFile` and `GridSliceOptions.imageFile` carry an image path, but neither builder loads it (`createSpritesheetFromGrid` requires the caller to assign `atlas.image`); not a contract violation, but the field reads as half-wired pending the loader integration gap above.

## Candidate open directions

The charter's silence on North star / Boundaries / Decisions forced several assumptions; each is a question for the user to settle:

1. **Where is the boundary with `spritesheet-formats`?** This package owns the runtime + authoring _builders_ and a `*Data` schema; the formats sibling owns file import/export. `SpritesheetData` lives here but is the import target of formats — is the data schema's home correct, or should the canonical descriptor live in `@flighthq/types` (header layer) with both packages depending on it? (Touches fork A: source-data vs. participation, and the triad shape.)
2. **Frame events / tags** — the largest feature gap. Settle the `SpritesheetFrameEvent` payload shape, the `events`/`frameEvents` data field, and the formats-sibling tag mapping before building. North-star question: is Aseprite-tag-level fidelity in scope?
3. **`loopCount` vs `loop: boolean`** — finite repeats are a known fork; decide before the next type-touching pass (changing it is a breaking type change).
4. **Direct Bitmap binding ownership** — does `bindSpritesheetPlayerToBitmap` belong here or in `displayobject`? (Fork A again — the spritesheet sim vs. the display node's participation.)
5. **Pivot/rotation consumption** — pivot and rotated-region handling are now plumbed to the runtime but consumed nowhere. Is honoring them a spritesheet-package responsibility (in the timeline source and a future bitmap binding) or strictly a renderer responsibility? This decides whether the carried fields are this package's contract or just pass-through to a backend.
6. **Validation scope** — is `validate*` the intended home for structural checks, or should it move to a `spritesheet-formats` / loader pre-flight? It currently spans both runtime and `*Data` shapes.
