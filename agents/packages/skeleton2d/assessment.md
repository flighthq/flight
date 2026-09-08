---
package: '@flighthq/skeleton2d'
updated: 2026-09-08
basedOn: ./review.md
---

# skeleton2d — Assessment

Sorted from the 2026-09-02 review (`review.md`). Verified 2026-09-08: 2 of 10 review gaps resolved (`explainSkeleton2DDeformLength` strict equality, `cloneSkeleton2D` skins sharing). 8 remain open. 232 test cases across 21 test files.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/skeleton2d`, no unresolved design decision.

- **Extract `MATRIX_STRIDE = 6` to a shared constant.** Duplicated across 7 files. Bundlers inline constants, so no tree-shaking cost. Reduces the maintenance surface.
- **Add `resetSkeleton2DToSetup(skeleton)` convenience.** No reset-to-bind-pose function exists; callers must manually re-apply setup transforms.
- **Update charter dependency list.** Charter says `geometry, math, types`; actual deps include `animation`, `entity`, `log`, `node`, `path`, `registry`. Editorial fix.

## Depth gaps

1. **IK one/two-bone only.** Named deferral — no N-bone chain or FABRIK solver. Charter-acknowledged.
2. **No IK softness.** Named deferral.
3. **Transform constraint world-space only.** Named deferral.
4. **No event model.** Named deferral — highest-priority for `skeleton2d-formats` integration, which needs frame events for animation playback.
5. **Attachment-swap vs wardrobe.** Named deferral — the skin-set slot-swap mechanism.
6. **Solver helper duplication.** `toSkeleton2DParentSpace`, `wrapSkeleton2DAngle`, `MINIMUM_DETERMINANT` repeated across 3 solver files. The review accepts this as a tree-shaking trade-off; documenting the rationale explicitly would prevent future agents from "fixing" it.

## Backlog

_None._

## Approved

_None._
