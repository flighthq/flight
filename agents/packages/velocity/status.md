---
package: '@flighthq/velocity'
updated: 2026-08-08
by: principal
---

# velocity — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/velocity/src/` (and its two consumers) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **The affine reprojection has no consumer.** `getVelocitySampleAt` (`velocitySample.ts:9`) computes
  `current·p − previous·p` at an arbitrary local point and ships through both lanes, but its only
  callers anywhere in `packages/` are its own tests. Both velocity-buffer writers still read the
  translation-only value: `scene2d-gl/src/glVelocity.ts:27` and `scene2d-wgpu/src/wgpuVelocity.ts:26`
  import `getVelocity` alone. Adopting it is a cross-package change and the payoff of the function.
- **The baseline contributor is translation-only.** `contributeTransformVelocity` derives velocity from
  `world.tx` / `world.ty` deltas (`transformVelocity.ts:34-35`), so a node rotating or scaling about a
  fixed origin reports zero velocity even though every point on it moved. `previousWorldTransform` is
  committed in full (`:43-44`), so the data for the correct answer is there and unused.
- **The child walk asserts the transform trait.** `child as unknown as Readonly<Transform2DNode<Traits>>`
  (`transformVelocity.ts:51`), because `HierarchyNode` does not carry it. The clean fix — an
  `isTransform2DNode` check or a typed child accessor — lives in `@flighthq/node`.
- **No time normalization.** `beginVelocityFrame(field)` takes no `dt` (`velocityField.ts:18`) and
  `VelocityField` has no `dt` field (`types/src/Velocity.ts`). Velocity is per-frame in node units with
  no per-second query, so a variable-timestep caller has to divide outside the package.
- **No angular velocity.** `VelocitySample` is `previousWorldTransform`, `velocity`, `lastFrameId`,
  `explicitFrameId` (`types/src/Velocity.ts`). A spinning node contributes nothing a writer can use.
- **No way to enumerate what moved.** `VelocityField.samples` is a `WeakMap`, so there is no
  `forEachVelocity` and no live-this-frame list. Adding one changes the ownership model the WeakMap
  keying was chosen for, so it wants a ruling rather than an implementation.
- **No signals, no acceleration, no multi-frame history.** `enableVelocityFieldSignals`,
  `contributeAcceleration`, and `enableVelocityHistory` do not exist. Each is a real feature of a mature
  motion-vector layer (TAA reprojection and N-frame trails need the last), and each changes the
  allocation model, so each is an explicit opt-in to design rather than a gap to fill quietly.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The whole 2026-06-25 entry checked out
  **false**: it declared the package "reduced/restructured" down to eight exports with "no
  `getVelocitySampleAt`" anywhere, and parked the one Recommended item as untargetable. The live tree
  has twenty exports across three modules, and `getVelocitySampleAt` is present with the
  `Readonly<Matrix>` parameter that item asked for — the real defect is that nothing calls it. Also
  dropped: "`@flighthq/velocity` is absent from the Package Map" — `AGENTS.md` names it in the
  Rendering line. `contributeAffineVelocity`, `contributeAngularVelocity`, `getVelocityPerSecond`, and
  the `VelocitySample.angularVelocity` / `VelocityField.dt` fields were claimed as landed by the
  2026-06-24 entry and are absent; they are recorded above as gaps, not as history.
- **2026-06-24** — Value algebra (`addVelocity` … `zeroVelocity`) added alongside the field/sample core.
