---
package: "@flighthq/animation"
updated: 2026-08-08
by: principal
---

# animation — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/animation/src/` (and `packages/types/src/`) on 2026-08-08.
This is the 3D animation-data primitive — clips, tracks, players, blending, layers, state machines.
`timeline`, `movieclip`, `motionpath`, `clock`, and `spring` are separate cells.

The package is deep and the list is short on purpose: tracks (Step/Linear/Cubic, quaternion-aware),
clip events, players with PingPong, N-way blend trees, masked layer stacks, root-motion extraction, and
opt-in signals are all present and reachable.

- **Two exports are unreachable through either blessed lane.** `advanceAnimationPlayers`
  (`animationAdvance.ts:7`) and `advanceAnimationStateMachineWithScratch`
  (`animationStateMachineAdvance.ts:6`) are `export function`s whose modules do not appear in
  `contract.ts`. Their only importers are intra-package (`animationLayerStack.ts:13`, `:17`,
  `animationStateMachine.ts:13`) plus their colocated tests. Either they earn a `contract.ts` line as
  the scratch-owning variants a caller composing its own stack would need, or they lose the `export`
  and stop being API-shaped. Right now they are neither.
- **The state machine carries one transition, machine-wide.** `AnimationStateMachine` holds a single
  `transitionFromStateIndex` / `transitionToStateIndex` pair (`types/src/AnimationStateMachine.ts:33`,
  `:34`) against one `transitionCurve` (`:30`) and one `transitionDuration` (`:31`). So every edge in
  the graph shares a duration and a curve, a transition cannot be interrupted or queued by another, and
  there is no per-edge configuration. Caller-owned conditions are a deliberate design (`:20-22`) and not
  at issue; per-edge timing is the gap.
- **Blend trees take weights, not parameters.** `AnimationBlendTreeInput` carries a bare scalar
  `weight` (`types/src/AnimationBlendTree.ts:12`) set through `setAnimationBlendTreeInputWeight`. There
  is no blend *space* — no 1D threshold mapping and no 2D cartesian/freeform mapping from a gameplay
  parameter (speed, direction) onto those weights — so every caller reimplements that arithmetic.
- **Root motion is extraction only.** `extractAnimationRootMotion` (`animationRootMotion.ts:46`)
  returns the additive vector or compositional quaternion delta; applying it to a transform stays
  binding-owned. That is the correct boundary for a target-free core, but it means no consumer in this
  repo demonstrates the round trip.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract; the prior file was five sessions of
  past-tense narration with no `Open` section at all, so nothing was dropped as false — every feature
  it claimed to have landed is present and reachable. The items above are new findings from reading the
  source against the contract, not restatements.
- **2026-08-02** — `@flighthq/shape` consumes the animation substrate for MorphShape scalar binding via
  an opaque `targetRef`; no change to this package.
- **2026-07-25** — Clip-level events: validated, sorted `{ time, name, payload }` entries with
  half-open crossing rules across forward, reverse, Repeat, and PingPong traversal.
- **2026-07-25** — `AnimationRootMotionExtractor` for one explicit channel over arbitrary unwrapped
  time ranges, using construction-owned scratch.
- **2026-07-25** — `AnimationLayerStack`: ordered pose stack over blend trees or state machines, with
  per-layer weight, override/additive policy, and an optional channel-index mask.
- **2026-07-25** — `AnimationBlendTree` and `AnimationStateMachine` added over the existing
  accumulate/add/finish primitives; shared player identity advances once per stack.
- **2026-07-24** — Two-player `AnimationCrossfade` with quaternion-aware blending and completion
  polling.
