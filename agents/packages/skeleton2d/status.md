---
package: '@flighthq/skeleton2d'
updated: 2026-08-08
by: principal
---

# skeleton2d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/skeleton2d/src/` and `packages/types/src/` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **IK covers one- and two-bone chains only.** `solveSkeleton2DIkConstraint` dispatches on
  `chain.length === 1` / `=== 2` and silently returns for anything longer (`ikConstraint2D.ts:32-37`).
  Longer chains need a different, iterative algorithm.
- **Spine's IK `softness` is not modeled** — a named deferral recorded on the header itself
  (`packages/types/src/Skeleton2DIkConstraint.ts:18`). `Skeleton2DIkConstraint` carries
  `mix`, `bendPositive`, `stretch`, `compress` and no easing of the last stretch of reach.
- **The transform constraint is the world-space form only.** Spine's `local` and `relative` variants —
  copying local transforms, or adding rather than replacing — are absent from both the type
  (`packages/types/src/Skeleton2DTransformConstraint.ts:17`) and the solver.
- **There is no event model.** No `Skeleton2DEvent`-shaped type exists in `@flighthq/types` and no
  source file in this package mentions events, so `skeleton2d-formats` has nowhere to land the Spine
  and DragonBones event streams it currently consumes and Skip-crumbs.
- **Attachment-swap channels do not compose with the wardrobe.** A swap track carries indices into a
  table the importer resolved against the *setup* skin
  (`packages/types/src/Skeleton2DSlotAnimationTarget.ts:46`), and `setSkeleton2DSkin`
  (`skeleton2d.ts:250`) writes slot attachments without re-pointing it. Deferred by ruling, not by
  oversight: no available rig has both skins and swap timelines, so the fix would be verified against
  belief. The known shape is a re-resolve pass keyed on skin name.

Everything else the charter phased is built. Bones, all five inherit modes, bind pose and matrix
palette, the IK/transform/path solver family (opt-in registrars, none registering by default), the
full attachment set — region, mesh, path, bounding box, clipping, point — over the one
`skinSkeleton2DAttachmentPoints` primitive, slot deform, the animation-target binder registry, the
draw-order target, named skins (`getSkeleton2DSkin` / `setSkeleton2DSkin`, `skeleton2d.ts:215,250`),
and the guard/explain seam.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract; front matter added (the file had none).
  Dropped the "Still deferred → **P3:** skin sets" item as false: named skins landed —
  `AttachmentSkin2D` is a real type, `Skeleton2D.skins` a real field, and `getSkeleton2DSkin` /
  `setSkeleton2DSkin` are exported at `skeleton2d.ts:215` and `:250`. The three constraint deferrals
  and the swap-vs-skin gap re-checked and kept with citations; a new verified gap added — the package
  models no events at all.
- **2026-08-04** — Slot deform became a `Skeleton2DSlotDeform` record (offsets plus the attachment
  they were authored for), because a bare buffer survived an attachment swap and deformed the new art;
  length guards tightened from `>=` to `===`.
- **2026-08-04** — Bounding box, clipping and point attachments joined region, mesh and path, all four
  deformable ones delegating to one `skinSkeleton2DAttachmentPoints` primitive.
- **2026-08-04** — Per-axis bone animation paths (`TranslationX`/`ScaleY`/`ShearX`…) added beside the
  paired ones, fixing a silent total loss of one animated axis in both Spine parsers.
- **2026-08-04** — P2 rigging landed: IK, transform and path constraint solvers as an opt-in registered
  family, `PathAttachment2D`, deform offsets, and a kind-dispatched animation-target binder registry
  replacing the structural `typeof target.boneIndex` probe. Rules in [rig model](./rig-model.md).
- **2026-07-25** — P1 runtime landed: world-transform pass with all five inherit modes, bind pose and
  bone matrix palette, mesh/region deformers, lifecycle and sentinel lookups.
