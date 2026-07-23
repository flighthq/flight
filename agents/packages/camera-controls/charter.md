---
package: "@flighthq/camera-controls"
crate: flighthq-camera-controls
lastDirection: 2026-07-22
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# camera-controls — Charter

> Durable vision and core values for `@flighthq/camera-controls`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/camera-controls` is the SDK's **camera intent + framing layer** — the small set of
input-agnostic controller primitives that turn a user's *intent* ("orbit", "fly forward", "follow that
target", "frame this sphere") into explicit writes on a camera from `@flighthq/camera`. It sits one
layer above the pure camera math and one layer below any input device: an application maps its own
keyboard/pointer/gamepad events onto a controller's verbs and calls the controller's `update` to write
the camera each frame. The package owns **no** event loop, renderer, or input source.

It is **dimension-agnostic** — the sibling of the unified `@flighthq/camera` (which itself carries both
`Camera2D` and `Camera3D`). A "controller" is an *intent* abstraction, not a math model, so the same
cell holds the 2D `follow` controller and the 3D `orbit`/`fly` controllers. Each controller is a plain
Entity of current/goal state, stepped by free `out`-parameter functions; deps stay limited to `camera`,
`entity`, `geometry`, `math`, and `types`, and the package is import-side-effect-free and
headless-testable.

## North star

- **Intent, not input.** Controllers expose semantic verbs (rotate/dolly/pan/move/look/follow) over
  explicit state; device bindings are the application's job, never a dependency here.
- **Explicit current→goal→camera.** State is a plain Entity with distinct current and goal fields;
  smoothing is frame-rate-independent and crosses ±π by the shortest arc; one named `update` writes the
  camera. Nothing steps or allocates that the caller did not invoke.
- **Discernible atoms, never a modeful super-controller.** Every behavior is a separate importable
  primitive. Advanced behaviors (arcball/trackball, rails/cinematic paths, additive shake,
  collision-aware fly) are *new atoms or adapters*, never `mode` flags on a universal controller.
- **Symmetric with the unified camera.** Because `camera` merged 2D+3D, its controller sibling does too;
  tree-shaking zeroes the cost of the dimension a bundle does not use.

## Boundaries

**In scope:** orbit / fly / 2D follow intent controllers; sphere-based framing; the current/goal state,
clamps, shortest-arc damping, and camera-writing `update` for each; small framing math (perspective goal
distance, orthographic extents) that composes camera projections.

**Not in scope (non-goals):** input-device bindings (keyboard/pointer/gamepad → verbs stay in
input/application adapters); an event loop or renderer; physics (collision-aware fly consumes a
caller-supplied query, it does not import a physics engine); a single modeful controller that gates
behaviors behind flags; silently mutating camera clip planes / depth precision during framing.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-22] Dimension-agnostic scope — the cell owns both 2D and 3D controllers.** `camera-controls`
  is the *intent/framing* layer over the unified `@flighthq/camera`, not a per-dimension cell. The 2D
  `follow` controller and the 3D `orbit`/`fly` controllers live together because "controller" is an
  intent abstraction, not a math model — the dimension-split rationale (different Matrix vs Matrix4 math)
  applies to the *math* package, which is exactly why `camera` itself merged 2D+3D. Keeping the
  controller sibling unified is the symmetric, non-arbitrary choice; a single-dimension bundle pays
  nothing for the other via tree-shaking. (Supersedes the "accident of the `camera2d` migration"
  framing — it is now a deliberate ruling.) User-directed.
- **[2026-07-22] Unify the orbit verbs on the `OrbitCameraController` stem.** Rename the three primary
  interaction verbs so all seven orbit verbs share one greppable, self-identifying stem and none collides
  case-only with the type: `orbitCameraController` → **`rotateOrbitCameraController`** (rotate is the
  honest verb and removes the `orbitOrbit`/case-collision hazard), `dollyCameraController` →
  **`dollyOrbitCameraController`**, `panCameraController` → **`panOrbitCameraController`**; the existing
  `panOrbitCameraControllerInViewPlane` and `create/reset/snap/updateOrbitCameraController` are already
  correct and stay. Pre-release, so consumers migrate directly. User-directed.
- **[2026-07-23] Designer-set orbit/pitch limits stay in radians (resolves Open direction #1).**
  Confirmed against the code: the SDK is radians throughout the math/geometry/camera family
  (`DEG_TO_RAD`/`RAD_TO_DEG` in `@flighthq/math`, `fovY` radians, `Camera2D.rotation` radians), and
  degrees appear *only* at the scene-graph transform-authoring seam (`node.rotation`/`skewY` →
  `DEG_TO_RAD` in `@flighthq/node`). Controller limits (`maxPolar`, pitch clamps) live in the
  camera-math world, so radians is the consistent, non-arbitrary default. User-confirmed.

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes._

1. ~~Designer-authored angle units~~ — **RESOLVED 2026-07-23: radians** (user-confirmed). See Decisions.
   Revisit only if a dedicated designer-facing authoring layer over these limits ever appears.
2. **Advanced-controller family — as new atoms, never modes.** Arcball/trackball semantics, rail /
   cinematic path following, additive shake, and collision-aware fly movement all want a direction call
   on ownership and shape when a real consumer needs them — each a separate importable primitive or
   adapter per North star, not a flag on a universal controller.
3. **Framing depth policy.** Perspective framing deliberately does not touch near/far. A later
   composition may *propose* an explicit clip range, but must never silently mutate camera depth
   precision. Box-tight framing (an oriented view-space box instead of a sphere) can be a separate
   utility if consumers need less conservative placement.
