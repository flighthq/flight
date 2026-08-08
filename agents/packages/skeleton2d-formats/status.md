---
package: '@flighthq/skeleton2d-formats'
updated: 2026-08-08
by: principal
---

# skeleton2d-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/skeleton2d-formats/src/` on 2026-08-08. Spine
`.json`, Spine `.skel` (4.x) and DragonBones `.json` all parse end to end; what follows is what they
still refuse.

- **The runtime can play morphs no importer produces.** Deform/`ffd` timelines are Skip-crumbed by all
  three parsers (`spineParse.ts:618`, `dragonBonesParse.ts:173`, and the binary's deform section) while
  `@flighthq/skeleton2d` ships `Skeleton2DDeformAnimationTarget` and four deformers.
- **Same asymmetry for constraints.** IK/transform/path timelines are consumed and crumbed
  (`spineParse.ts:615-617`, `dragonBonesParse.ts:174`), as are the setup-pose constraint declarations
  (`spine.ik-constraint-unsupported` and siblings), though skeleton2d ships all three solvers. Nothing
  ever builds a `Skeleton2DConstraint`.
- **Four attachment types are walked and dropped that skeleton2d already models** — bounding box,
  clipping, point and path (`spineParse.ts:157,170`; `spineBinaryParse.ts:849-864`). **Linked mesh** is
  the one with no runtime counterpart, and it is what costs the `goblingirl` skin 2 of its 20 entries;
  borrowing another skin's geometry is the whole point of a wardrobe, so it is the natural next gap.
- **Events are unmodeled end to end** (`spineBinaryParse.ts:160`, `spineParse.ts:619`). Blocked on
  skeleton2d, which carries no event type.
- **Draw order is Spine-only.** Both Spine parsers emit `Skeleton2DImportAnimation.drawOrder`
  (`spineParse.ts:620`, `spineBinaryParse.ts:189`); DragonBones `zOrder` is still crumbed
  (`dragonBonesParse.ts:175`). The `drawOrder` field is optional purely because of that.
- **DragonBones quadratic `tweenEasing` collapses to Linear** (`dragonBonesParse.ts:502-510`). Held
  deliberately: the three-rig corpus contains zero non-zero values, so implementing it would mean
  writing format semantics from memory. `curve` bezier easing *is* honored on both formats.
- **A custom format can never outrank a built-in.** `parseSkeleton2D` returns the first matching
  detector (`skeletonDetect.ts:47`) and lazy init always inserts Spine and DragonBones first
  (`:19-23`), so a later `registerSkeleton2DFormat` is appended behind them. Fork recorded, not chosen:
  (a) leave it, (b) try non-built-in kinds first, (c) explicit priority.
- **Unregistering a built-in is one-way.** `detectSpine` / `detectDragonBones` are module-private
  (`skeletonDetect.ts:29,38`) while the parsers are exported, so nothing restores what
  `unregisterSkeleton2DFormat` (`:67`) removed. Fork: (a) export the detectors, (b) add
  `resetSkeleton2DFormats()`, (c) accept one-way removal and say so.
- **`spineParse.ts:541-543` lies about its own file.** The doc comment says draw-order timelines are
  Skip-crumbed and per-keyframe beziers approximate to Linear; both are implemented below it
  (`:620`, `:415-521`).
- **DragonBones reads only the first armature** (`:72`); shared meshes (`:697`) and legacy weighted
  meshes without `bonePose` (`:709`) are held as `null` at their `displayIndex`.
- **Spine partial-channel slot colour is unrepresentable.** `rgb`, `alpha` and the dark-colour variants
  crumb out (`spineBinaryParse.ts:712`, `spineParse.ts:655-661`) because `Slot2D` carries one packed
  colour and no dark colour.
- **The y-axis convention is assumed, not confirmed.** DragonBones is Flash y-down, Spine/Flight y-up;
  only a posed-output oracle against DragonBones' own runtime settles it (charter #4).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract; front matter added (the file had none).
  Deleted the whole "Next (per charter build order)" section as false — bezier easing, DragonBones
  `.json` and Spine `.skel` are all landed, and its "Do NOT fetch spineboy (non-permissive)" line was
  contradicted by the licence authorization recorded in the same file. The stray "**Remaining:** Spine
  `.skel` binary" went with it. Also dropped "alternate skins Skip-crumbed": those two crumb kinds now
  survive only in tests asserting their *absence*. The hand-copied diagnostic inventory is gone rather
  than corrected — grep the source, which is what the full kinds exist for.
- **2026-08-05** — Registry audit: every `register*` write is a caller opt-in, but `getRegistry()` on
  the read path materializes the built-ins, which is where the two forks above come from.
- **2026-07-31** — DragonBones corpus-verified against three editor-authored rigs (never committed);
  caught 489 silently empty clips that were 5.6 blend trees. DragonBones `curve` easing implemented,
  closing the Spine asymmetry.
- **2026-07-30** — Slot colour and attachment-swap timelines landed across all three parsers; curve
  rebasing switched to the dominant component after a near-constant channel produced control points
  far outside the unit square.
- **2026-07-30** — Named skins became first-class as `AttachmentSkin2D` (the word `Skin2D` was already
  the weighted-mesh bone binding); verified identical `.json` vs `.skel` wardrobes on `goblins`.
- **2026-07-30** — A purchased Spine licence solved the oracle problem. `.skel` increments 2-4 landed
  and consume the 67 563-byte spineboy rig to the exact final byte, matching the `.json` parse on all
  bones, slots, attachments and 344 bone channels. Spine runtime source was never read.
- **2026-07-30** — DragonBones `.json` completed through increment 4 (frame timelines), with its own
  frame-rate time axis, rotation unwrap, and per-frame-tween → per-track interpolation.
