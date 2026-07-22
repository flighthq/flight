---
package: "@flighthq/camera-controls"
crate: flighthq-camera-controls
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# camera-controls — Charter

> Durable vision and core values for `@flighthq/camera-controls`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

_TODO — capture what this package is for, in your framing._

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes._

1. **Dimensional scope of the cell — 2D + 3D together, or 3D only?** The package currently holds both
   `updateCamera2DFollow` (operates on 2D `Camera2D`) and the 3D `orbit`/`fly` controllers (operate on
   `Camera3D`) — two different camera value types and two math models (2D deadzone/pan vs 3D
   azimuth/polar/quaternion) in one cell. The SDK splits dimensions everywhere else (see the
   `camera` merge and the `skeleton2d`/`skeleton3d` split). The 2D follow was adopted here during the
   `camera2d` dissolution, not by a deliberate call. **Decide:** either (a) this is the
   *dimension-agnostic camera-intent controllers* cell — own both explicitly and say so in North star —
   or (b) 2D follow belongs with the 2D camera math in `camera`, and `camera-controls` is the **3D**
   orbit/fly cell. Right now it is an accident of migration, not a decision. _(Review flagged this;
   pending a direction session.)_
2. **Orbit controller verb naming.** The three primary interaction verbs `dollyCameraController`,
   `orbitCameraController`, `panCameraController` drop the `Orbit` qualifier the rest of the file keeps
   (`createOrbitCameraController`, `resetOrbitCameraController`, `panOrbitCameraControllerInViewPlane`),
   and `orbitCameraController` collides case-only with the type `OrbitCameraController`. This breaks the
   "globally self-identifying, meaning-transfers-instantly" naming rule — a user grepping `Orbit` misses
   the three main verbs. Likely driver is the awkward `orbitOrbitCameraController`. **Proposed:** give
   the rotate verb a non-colliding stem (e.g. `rotateOrbitCameraController`) and qualify the rest
   (`dollyOrbitCameraController`, `panOrbitCameraController`) so all seven orbit verbs share one stem.
   Public-API rename — settle before this surface hardens.
3. **Designer-authored angle units.** Whether orbit *limits* the designer authors (`maxPolar`, pitch
   clamps) should accept **degrees** at the authoring seam while the controller math stays radians. The
   whole camera family would move together, so this is a family-wide call, not a local one.
