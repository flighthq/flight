---
package: '@flighthq/physics3d'
status: solid
score: 96
updated: 2026-08-21
ingested:
  - charter.md
  - status.md
  - performance.md
  - source
  - tests
  - collision and spatial seams
---

# Physics3D qualification review

This is the measurable release gate for calling `@flighthq/physics3d` AAA-complete. “AAA” is not a
feature count: it means the promised operating envelope has thresholds, repeatable evidence, and no
known charter hole inside it.

## Current verdict

**AAA-qualified TypeScript rigid-body core; full charter qualification remains open at the native
target.** Every feature, numerical, terrain, performance/allocation, lifecycle, diagnostic, determinism,
and CCD gate in the executable TypeScript target now has a checked-in challenge. The core exceeds
physics2d in joint breadth, breakage/reaction reporting, broadphase choice, shape breadth, and diagnostic
coverage. `@flighthq/physics3d-abi` now establishes the native ownership contract, but the explicitly
paused Rust/WASM target and its parity evidence do not exist yet; this review does not substitute a
portable TypeScript implementation for evidence from that target.

## Passing evidence

| Gate | Evidence | Current result |
| --- | --- | --- |
| Package correctness | `npx vitest run packages/physics3d/src --maxWorkers=2` | 32 files, 699 tests pass |
| Collision integration | `npx vitest run packages/collision/src packages/physics3d/src --maxWorkers=2` | 68 files, 1,171 tests pass |
| Static checks | `npm run typecheck`, `npm run exports:check`, `npm run order`, `npm run api:check`, `npm run portable:check` | pass |
| Long stack | 12 unit boxes, four retaining walls, 900 steps at 60 Hz | finite, ordered, supported, asleep; top > 11 |
| Mass ratios | fixed-rotation 2-box stack, 600 steps | 100:1 default and 1,000:1 at 4 substeps: separation > 0.99, asleep |
| Restitution | elastic sphere between flat walls, 3,600 steps | speed 6 within 9 decimals, angular speed < 1e-9, contained |
| Friction isotropy | fixed box at speed 5, axis and diagonal, 240 steps | both stop; travel differs < 0.005, cross-axis drift < 0.001 |
| Joint endurance | 12-link driven 3D ball joint chain, 1,200 steps | finite; maximum link error < 0.025 |
| Angular integration | asymmetric torque-free spinner at 1, 2, and 4 substeps | finite; drift shrinks by at least 30% per halving and ends < 5% |
| Substep topology | one 1/30 step at 2 substeps versus two 1/60 steps through first impact | pose and velocity agree to 12 decimals |
| Workspace retention | stable contacts, islands, solver constraints/points/maps, grid/BVH pair output | object identity retained across steady topology |
| Determinism | exact repeat trace and reversed insertion-order trace | exact equality |
| Static concave terrain | 17 x 17 accelerated mesh and heightfield, 16 distributed boxes, 900 steps | all finite, supported at y 0.49–0.52, asleep |
| Terrain seams | transformed/version-invalidated local BVH, manifold reduction, raycast, shapecast, CCD, debug geometry | regression-covered |
| Performance | `npm run benchmark:physics3d`; 256-contact stack, 256 sparse movers, and a 256-body 64:1 mixed-scale scene on default/tuned grid and BVH | all checked-in CPU p95, heap, exact indexing-mode, and candidate-pair ceilings pass |
| Linear CCD | 0.1-wide wall, bullet at 600 units/s over a 1/60 s step | remains on near side |
| Rotational CCD | long blade crosses a peg only between start/end orientations | deflects and loses angular speed |
| CCD impact semantics | TOI friction/restitution, pre/post hooks, persistent begin/end identity, pass-through sensor and occluded sensor | regression-covered |
| CCD angular envelope | 120 rad/s, radius 5, 1/60 s at budgets 128 and 10 | publishes 115-sample/0.087-unit target gap and 10-sample/1-unit capped gap |
| Lifecycle | duplicate/cross-world ownership, removal wakeup, cache/event cleanup, step mutation barriers | regression-covered |
| Invalid input | non-finite controls, malformed collider geometry/material/filter/derived kind | rejected before mutation/intake |

The stack's geometric target is a top centre at 11.5. The accepted default regression floor is 11;
the measured result is about 11.11. Raising position iterations from 3 to 8 produces 11.388 and 20
produces 11.438. These are declared qualification scenes, not a promise of arbitrary scale or mass ratio.

The performance reference and exact ceilings live in [performance.md](./performance.md). Terrain uses a
retained, version-invalidated local BVH in `@flighthq/collision`: concave shapes are intentionally absent
from the convex support registry, and physics3d permits them only on static bodies.

## Blocking gate

1. **Platform evidence.** The TypeScript implementation is the executable specification, and
   `@flighthq/physics3d-abi` now fixes the persistent handle/buffer boundary. The charter's Rust/WASM
   performance target still has no implementation, parity suite, ownership measurements, or JS/WASM
   crossing budget. Native work remains paused by user direction; do not imply target-wide AAA
   qualification until its differential and performance gates pass.

## Qualification rule

The TypeScript target may be called AAA-qualified against the declared scenes above. Do not replace the
package-wide verdict with unqualified “AAA-complete” until the native blocking gate either passes a
checked-in, repeatable threshold or is explicitly removed from the charter by user direction. New claims
belong in this table with the scene, duration, configuration, metric, and bound that make them falsifiable.
