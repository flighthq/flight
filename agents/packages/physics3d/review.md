---
package: '@flighthq/physics3d'
status: solid
score: 84
updated: 2026-08-21
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - collision and spatial seams
---

# Physics3D qualification review

This is the measurable release gate for calling `@flighthq/physics3d` AAA-complete. “AAA” is not a
feature count: it means the promised operating envelope has thresholds, repeatable evidence, and no
known charter hole inside it.

## Current verdict

**Production-capable convex rigid-body core; not yet AAA-complete.** The core now exceeds physics2d in
joint breadth, breakage/reaction reporting, 3D broadphase choice, convex shape breadth, and diagnostic
coverage. It is still blocked by static concave terrain and by missing numerical/performance acceptance
budgets. Those are release blockers, not reasons to discount the evidence already present.

## Passing evidence

| Gate | Evidence | Current result |
| --- | --- | --- |
| Package correctness | `npx vitest run packages/physics3d/src` | 31 files, 661 tests pass |
| Collision integration | `npx vitest run packages/collision/src packages/physics3d/src` | 66 files, 1,117 tests pass |
| Static checks | `npm run typecheck`, `npm run exports:check`, `npm run order`, `npm run api:check` | pass |
| Long stack | 12 unit boxes, four retaining walls, 900 steps at 60 Hz | finite, ordered, supported, asleep; top > 11 |
| Joint endurance | 12-link driven 3D ball joint chain, 1,200 steps | finite and bounded |
| Determinism | exact repeat trace and reversed insertion-order trace | exact equality |
| Linear CCD | 0.1-wide wall, bullet at 600 units/s over a 1/60 s step | remains on near side |
| Rotational CCD | long blade crosses a peg only between start/end orientations | deflects and loses angular speed |
| Lifecycle | duplicate/cross-world ownership, removal wakeup, cache/event cleanup, step mutation barriers | regression-covered |
| Invalid input | non-finite controls, malformed collider geometry/material/filter/derived kind | rejected before mutation/intake |

The stack's geometric target is a top centre at 11.5. The measured default is about 11.11; raising
position iterations from 3 to 8 produces 11.388 and 20 produces 11.438. This demonstrates convergence,
but no product tolerance has yet declared which result is sufficient.

## Blocking gates

1. **Static triangle mesh and heightfield collision.** Both are in the charter. They require a
   mesh-vs-convex path over accelerated triangles; a convex support registration cannot represent them.
2. **Numerical acceptance envelope.** Set and pass thresholds for stack height/error, mass ratios,
   restitution energy drift, friction drift, joint error, high angular speed, and timestep/substep scaling.
   Cover at least ordinary, stress, and adversarial scenes with fixed seeds and exact configuration.
3. **Performance and allocation budgets.** Record bodies, contacts, broadphase distribution, hardware,
   p50/p95 step time, and steady-state allocations for both uniform-grid and BVH backends. A green stress
   test without a frame budget does not qualify a game engine.
4. **CCD impact semantics.** Translation and rotation prevent the demonstrated tunnelling cases, but
   impact-time friction, contact hooks, and persistent contact/event reporting need a declared contract
   and challenge scenes. Angular sampling is bounded and therefore must publish the speed/extent envelope
   its configured budget guarantees.
5. **Platform evidence.** The TypeScript implementation is the executable specification. The charter's
   Rust/WASM performance target has no parity or differential suite yet; do not imply native-target
   qualification until it does.

## Qualification rule

Do not replace the verdict with “AAA-complete” until every blocking gate either passes a checked-in,
repeatable threshold or is explicitly removed from the charter by user direction. New claims belong in
this table with the scene, duration, configuration, metric, and bound that make them falsifiable.
