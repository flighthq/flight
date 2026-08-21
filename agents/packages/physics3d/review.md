---
package: '@flighthq/physics3d'
status: solid
score: 88
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
coverage. The first numerical acceptance envelope is now checked in. Static concave terrain, measured
performance, complete CCD semantics, and native-target evidence remain release blockers.

## Passing evidence

| Gate | Evidence | Current result |
| --- | --- | --- |
| Package correctness | `npx vitest run packages/physics3d/src` | 31 files, 669 tests pass |
| Collision integration | `npx vitest run packages/collision/src packages/physics3d/src` | 66 files, 1,126 tests pass |
| Static checks | `npm run typecheck`, `npm run exports:check`, `npm run order`, `npm run api:check` | pass |
| Long stack | 12 unit boxes, four retaining walls, 900 steps at 60 Hz | finite, ordered, supported, asleep; top > 11 |
| Mass ratios | fixed-rotation 2-box stack, 600 steps | 100:1 default and 1,000:1 at 4 substeps: separation > 0.99, asleep |
| Restitution | elastic sphere between flat walls, 3,600 steps | speed 6 within 9 decimals, angular speed < 1e-9, contained |
| Friction isotropy | fixed box at speed 5, axis and diagonal, 240 steps | both stop; travel differs < 0.005, cross-axis drift < 0.001 |
| Joint endurance | 12-link driven 3D ball joint chain, 1,200 steps | finite; maximum link error < 0.025 |
| Angular integration | asymmetric torque-free spinner at 1, 2, and 4 substeps | finite; drift shrinks by at least 30% per halving and ends < 5% |
| Substep topology | one 1/30 step at 2 substeps versus two 1/60 steps through first impact | pose and velocity agree to 12 decimals |
| Workspace retention | stable contacts, islands, solver constraints/points/maps, grid/BVH pair output | object identity retained across steady topology |
| Determinism | exact repeat trace and reversed insertion-order trace | exact equality |
| Linear CCD | 0.1-wide wall, bullet at 600 units/s over a 1/60 s step | remains on near side |
| Rotational CCD | long blade crosses a peg only between start/end orientations | deflects and loses angular speed |
| Lifecycle | duplicate/cross-world ownership, removal wakeup, cache/event cleanup, step mutation barriers | regression-covered |
| Invalid input | non-finite controls, malformed collider geometry/material/filter/derived kind | rejected before mutation/intake |

The stack's geometric target is a top centre at 11.5. The accepted default regression floor is 11;
the measured result is about 11.11. Raising position iterations from 3 to 8 produces 11.388 and 20
produces 11.438. These are declared qualification scenes, not a promise of arbitrary scale or mass ratio.

## Blocking gates

1. **Static triangle mesh and heightfield collision.** Both are in the charter. They require a
   mesh-vs-convex path over accelerated triangles; a convex support registration cannot represent them.
2. **Performance and allocation budgets.** Record bodies, contacts, broadphase distribution, hardware,
   p50/p95 step time, and steady-state allocations for both uniform-grid and BVH backends. A green stress
   test without a frame budget does not qualify a game engine. Major solver and broadphase workspaces now
   retain object identity, but that is evidence toward this gate rather than a substitute for measurement.
3. **CCD impact semantics.** Translation and rotation prevent the demonstrated tunnelling cases, but
   impact-time friction, contact hooks, and persistent contact/event reporting need a declared contract
   and challenge scenes. Angular sampling is bounded and therefore must publish the speed/extent envelope
   its configured budget guarantees.
4. **Platform evidence.** The TypeScript implementation is the executable specification. The charter's
   Rust/WASM performance target has no parity or differential suite yet; do not imply native-target
   qualification until it does.

## Qualification rule

Do not replace the verdict with “AAA-complete” until every blocking gate either passes a checked-in,
repeatable threshold or is explicitly removed from the charter by user direction. New claims belong in
this table with the scene, duration, configuration, metric, and bound that make them falsifiable.
