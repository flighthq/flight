---
package: '@flighthq/physics2d'
updated: 2026-08-21
by: principal
---

# physics2d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **The capsule is complete across every seam, CCD included.** A horizontal capsule settles flat on a
  floor at an angle of 1.75e-10 and falls asleep, capsule-on-capsule stacks, and a capsule bullet at 600
  units per second stops at a wall a tenth of a unit thick instead of tunnelling.
- **Broad qualification is not established.** The suite covers a 16-body tall pile and an exact-repeat
  mixed scene, and every claim below is measured — but nothing here yet spans wide mass ratios, timestep
  variation, pathological stacking, or cross-platform determinism, and none of those should be assumed.
- **`solvePointConstraint` decouples x and y** into two sequential scalar rows rather than solving the
  2x2 block. That is a Gauss-Seidel approximation, not a defect, and it is what the revolute and weld
  point constraints both run on. Worth revisiting if a heavily-loaded hinge is seen to drift.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — Capsule CCD works: `sweepCollisionShape2D` gained its capsule arm, so a capsule bullet
  no longer passes through thin walls. The regression test pins the behaviour rather than the mechanism —
  it fails against the pre-sweep code and passes after.

- **2026-08-21** — Capsule colliders became real: the manifold pairs landed in `@flighthq/collision`, so
  `explainPhysics2DCollision` stopped naming the capsule and the contact-intake guard stopped warning
  about it. Both are now down to the area-less kinds, which is the honest remaining case — a `segment` on
  a rigid body is a modelling mistake with no fix in this package. The guard's second advice branch was
  removed rather than left unreachable.

- **2026-08-21** — Compliant revolute and prismatic limits, built on the consolidated soft-row math.
  Verified by statics rather than by recorded numbers: a 20 Hz stop settles at 0.3% of the analytic
  deflection, halving the frequency quadruples the sag exactly as `1/omega^2` demands, and mass cancels
  EXACTLY. A pinned rail (coincident bounds) deliberately stays hard — a zero-width range has no side to
  yield toward. First measurements looked wrong and were: the test's spring was far too soft for its
  load, so it was reading a swinging pendulum as a sag.
- **2026-08-21** — A translational shapecast world query, following the 3D design: swept-AABB broadphase,
  exact candidate sweeps, filters, closest-hit ties broken by body then collider index, and start-overlap
  reported as a hit at fraction 0 rather than a miss. Cross-checked against a brute-force march of the
  discrete overlap test.
- **2026-08-21** — Joint breakage. `breakForce`/`breakTorque` on the base joint with `Infinity` meaning
  unbreakable — the one place a joint may hold a non-finite number, admitted by name in the validator and
  with NaN rejected, since every comparison against NaN is false and would silently mean "never breaks".
  Detection runs inside the step where the impulses and timestep are both in hand; removal runs after the
  stepping guard lifts, because `removePhysics2DJoint` refuses to run mid-step and is right to.
- **2026-08-21** — Joint reactions across all nine solvers, as force at the anchor plus couple about it.
  The decomposition is uniform: each of the three shared appliers gives body B exactly `rB x F` of angular
  impulse for the linear impulse it delivers, so a kind's couple is whatever it wrote BESIDES that. The
  gear is not the exception it looked like — its Jacobian row is `(0,0,1)` angular or `(unit, r x unit)`
  linear, and both fall out of the same expression. Verified by statics: five kinds each report a hanging
  weight exactly, weld and revolute-motor each report exactly the moment gravity applies about the anchor,
  and a 1:1 gear passes exactly half an applied torque.
- **2026-08-21** — Guards. `enablePhysics2DGuards` covers declined steps, unresolved joints (including the
  unregistered-solver case that 3D still misses), and colliders the contact dispatcher cannot see. Every
  message names its whole fault set at once rather than the first, and is keyed on that set so a 60Hz loop
  logs once while a world that develops a SECOND fault still speaks. `npm run size` shows no movement, so
  the module and `@flighthq/log` shake out for callers who never opt in.
- **2026-08-21** — The distance spring authored the wrong stiffness. `axisEffectiveMass` returned an
  INVERSE effective mass and the solver fed it into stiffness and damping as a mass; the wheel inverted it
  correctly and the mouse used body mass, so one of three copies was wrong. Renamed to
  `axisInverseEffectiveMass` — the name is what caused it — and all three now go through `jointRows.ts`.
  The same authored 2 Hz at 4x mass gave first-step velocity 3.535 vs 0.263 and half-period 13 vs 47
  steps; it is now bit-identical at 16, matching the analytic damped half-period of 15.3. Mass cancels
  from the bias factor but NOT from gamma or the softened mass, which is why the defect stayed invisible.
- **2026-08-21** — Integration advanced the body ORIGIN and the angle independently while the solver works
  entirely at the centre of mass, so a body spinning in free space translated its own COM — `(1,0)` walked
  to `(0.9950,0.0998)` in one 0.1s step, momentum from nothing. The position-correction pass had the same
  defect and the same fix: one `advancePhysics2DBodyTransform` that moves the centre and re-derives the
  origin from the new angle. The whole 351-test suite passed BEFORE the fix, because every existing
  fixture puts its colliders symmetrically about the body origin, where the bug is invisible.
