---
package: '@flighthq/camera-controls'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
---

# camera-controls — Review

## Verdict

**Solid — 82/100.** A well-bounded set of input-agnostic camera intent and framing primitives
covering orbit, fly, 2D follow, sphere framing, and trauma-based shake. Each behavior is a
separate importable atom; none owns input, a renderer, or an event loop. The charter's North star
principles are followed throughout: intent-not-input, explicit current/goal/camera, discernible
atoms, and symmetric 2D+3D scope. The score rises from the prior review (78) because the camera
shake system has landed, closing the most prominent gap in the old survey.

## Present capabilities

### Orbit controller (`orbitCameraController.ts`, 183 lines)

`createOrbitCameraController` returns an Entity with current and goal azimuth/polar/distance,
clamp limits, a mutable `target` Vector3, and a `smoothTime` constant. Seven verb functions operate
on it:

- `rotateOrbitCameraController` — moves goal azimuth/polar by radian deltas, polar clamped.
- `dollyOrbitCameraController` — moves goal distance, clamped to [min, max].
- `panOrbitCameraController` — slides the target in a world-up plane at the current goal azimuth.
- `panOrbitCameraControllerInViewPlane` — slides the target in the actual camera view plane
  (screen-up follows goal polar).
- `snapOrbitCameraController` — syncs current to clamped goal without writing a camera.
- `resetOrbitCameraController` — restores constructor defaults or a seed; syncs current = goal.
- `updateOrbitCameraController` — eases current toward goal via `damp` (shortest arc on azimuth),
  derives eye from spherical coords, writes look-at into `Camera3D`. Snaps when smoothTime <= 0.

`cloneOrbitCameraController` and `copyOrbitCameraController` round out allocation. Copy does not
alias the mutable `target` vector and preserves Entity runtime state on `out`.

All seven orbit verbs share the `OrbitCameraController` stem per charter Decision 2026-07-22.

### Fly controller (`flyCameraController.ts`, 132 lines)

`createFlyCameraController` returns an Entity with current and goal yaw/pitch, clamp limits, a
mutable `position` Vector3, and `smoothTime`. Five verb functions:

- `lookFlyCameraController` — moves goal yaw/pitch by radian deltas, pitch clamped.
- `moveFlyCameraController` — translates position along horizontal heading (forward/right at yaw)
  plus world-up. Movement is immediate, not eased.
- `snapFlyCameraController` — syncs current angles to clamped goals.
- `resetFlyCameraController` — restores defaults or seed.
- `updateFlyCameraController` — eases current angles via `damp` (shortest arc on yaw), builds
  forward direction, writes look-at into `Camera3D`.

`cloneFlyCameraController` and `copyFlyCameraController` follow the same patterns as orbit.

### Camera shake (`cameraShake.ts`, 89 lines)

Added since the prior review. A trauma-based additive shake system:

- `createCameraShake` — Entity with `trauma`, `decay`, `frequency`, `translationAmplitude`,
  `rotationAmplitude`, and internal `time`.
- `addCameraShakeTrauma` — accumulates trauma clamped to [0, 1].
- `resetCameraShake` — zeros trauma and time.
- `updateCameraShake` — advances the clock, decays trauma linearly, and writes a deterministic
  6-DOF offset (translation xyz + rotation xyz) into an `out: CameraShakeOffset`. Intensity is
  quadratic (`trauma^2`). Noise is three incommensurate sine phases per axis — cheap, deterministic,
  smooth, and never visibly loops.
- `createCameraShakeOffset` — allocates a zeroed output struct.

`CameraShakeOffset` is a plain struct (not an Entity), which is correct for a reusable output
value type.

### 2D follow (`follow.ts`, 78 lines)

`updateCamera2DFollow` — single-function controller that moves a `Camera2D` toward a target:

1. Deadzone box (half-extents): no motion while target is inside.
2. Smooth toward goal via `damp` (frame-rate independent; `smoothTime` <= 0 snaps).
3. Optional world-bounds clamping: visible rectangle stays inside the level; centers on an axis
   where the level is smaller than the view.

Takes `Camera2DFollowOptions` (deadzone half-extents, smoothTime, worldBounds). No separate Entity;
it writes the camera directly.

### Sphere framing (`framing.ts`, 69 lines)

- `frameOrbitCameraControllerToSphere` — frames a bounding sphere with an orbit controller and
  active viewport aspect. Perspective: changes goal distance. Orthographic: changes projection
  half-extents. Target moves to sphere center. Returns `false` for invalid inputs without mutation.
- `getPerspectiveProjectionFrameDistanceToSphere` — pure math: eye-to-center distance for a sphere
  in perspective.
- `setOrthographicProjectionFrameToSphere` — sets orthographic half-extents to contain a sphere
  without distortion.

Near/far clip planes are never touched — clip-plane policy stays with the caller, matching the
charter boundary.

## Test coverage

49 tests across 5 colocated test files, all passing. Coverage is meaningful:

- **Orbit** (14 tests): creation defaults, options seeding, Entity identity, dolly clamping, pan at
  azimuth 0, view-plane pan at nonzero polar, reset from seed, rotate with polar clamp, snap to
  clamped goals, update snap path, update eased path, shortest-arc seam crossing.
- **Fly** (12 tests): creation defaults, options seeding, Entity identity, look with pitch clamp,
  move at yaw 0, reset from seed, snap to clamped goals, update snap path, update eased path,
  shortest-arc seam crossing.
- **Framing** (6 tests): perspective sphere framing, orthographic sphere framing, target centering,
  invalid-input rejection, perspective distance for wide and tall viewports, orthographic aspect
  preservation.
- **Follow** (5 tests): deadzone no-motion, smoothed partial motion, snap to deadzone edge,
  world-bounds clamping with visible-rect check, centering when world is smaller than view.
- **Shake** (12 tests): trauma accumulation and floor clamp, creation defaults and custom options,
  zeroed offset factory, reset, zero-trauma output, active-trauma output, linear decay, quadratic
  intensity scaling, deterministic reproduction, amplitude bounds.

Tests use `createEntity`-based constructors (not object literals) for SDK types. Clone/copy tests
verify runtime state preservation and vector independence.

## Gaps

- **No clone/copy/reset/snap for CameraShake.** The orbit and fly controllers have the full
  `clone*`/`copy*`/`reset*`/`snap*` verb set. `CameraShake` has `resetCameraShake` but no
  `cloneCameraShake` or `copyCameraShake`. Shake is a simpler entity (fewer fields, no mutable
  sub-object), so the omission is minor, but the asymmetry is visible in the API surface.

- **No fly controller framing.** `frameOrbitCameraControllerToSphere` frames a sphere for orbit,
  but there is no equivalent for fly (e.g. placing the fly controller at the framing distance
  looking toward the sphere center). The fly controller has a `position` field that must be
  positioned manually.

- **Advanced controller atoms remain unbuilt.** Per charter Open direction #2: arcball/trackball
  semantics, rail/cinematic path following, and collision-aware fly movement. These are explicitly
  parked pending a real consumer and a direction session, not an oversight.

- **No 2D follow Entity.** `updateCamera2DFollow` takes options as a per-call bag rather than
  maintaining a persistent Entity with current/goal state. The design is intentional and lightweight,
  but it means there is no persistent follow-controller object to serialize, inspect, or compose
  with other systems that expect Entities.

- **Duplicated `WORLD_UP` constant.** Both `orbitCameraController.ts` and `flyCameraController.ts`
  allocate their own `createVector3(0, 1, 0)` at module scope. Functionally harmless, but a shared
  constant would remove the duplication.

## Charter contradictions

None. The code satisfies all four North star principles:

1. **Intent, not input** — no input-device dependencies; the package depends only on camera, entity,
   geometry, math, and types.
2. **Explicit current/goal/camera** — orbit and fly controllers separate current and goal state;
   `update*` eases and writes the camera; shake produces an additive offset the caller applies.
3. **Discernible atoms** — orbit, fly, follow, framing, and shake are five separate source files
   with separate imports. No mode flags or universal controller.
4. **Symmetric with unified camera** — 2D follow and 3D controllers coexist in one package; the
   charter Decision 2026-07-22 blesses this as deliberate.

The approved orbit verb rename (Decision 2026-07-22) has been executed: `rotateOrbitCameraController`,
`dollyOrbitCameraController`, `panOrbitCameraController` are the live names.

The angle-units Decision (2026-07-23) is followed: all controller limits and deltas are radians,
consistent with the camera/geometry/math layer.

## Contract and docs fit

**Package compliance with codebase conventions:**

- All exported types live in `@flighthq/types`: `OrbitCameraController`, `OrbitCameraControllerOptions`,
  `FlyCameraController`, `FlyCameraControllerOptions`, `CameraShake`, `CameraShakeOptions`,
  `CameraShakeOffset`, `Camera2DFollowOptions`. No inline type definitions in the package.
- Two blessed export lanes: `.` (curated public API in `index.ts`) and `./contract` (full surface
  via `contract.ts`). The public lane explicitly lists 27 named exports.
- `sideEffects: false` in `package.json`. No top-level side effects in any module (module-scope
  objects are scratch/constant allocations, not registrations).
- Function names use full unabbreviated type names throughout
  (`dollyOrbitCameraController`, `updateCamera2DFollow`, `getPerspectiveProjectionFrameDistanceToSphere`).
- `Readonly<T>` is used on source parameters in clone/copy/create/reset signatures and on
  `BoundingSphereLike` in framing. `out` parameters are mutable.
- Sentinel return: `frameOrbitCameraControllerToSphere` returns `false` for invalid inputs rather
  than throwing. No throws anywhere in the package.
- `import type` on its own line, never mixed inline — verified in all source files.
- Module-level scratch objects and constants at the bottom of each file.
- Dependencies: `camera`, `entity`, `geometry`, `math`, `types` — all via `/contract` subpath.
  No dependency on `@flighthq/sdk`.

**Candidate admin-doc revisions:**

- The Package Map in `AGENTS.md` lists `camera-controls` under "3D data" alongside `camera`. This
  is technically correct but could mislead: the package also holds the 2D follow controller, so
  it is not purely 3D. The charter's "dimension-agnostic" framing is more accurate.
- The prior assessment's `Approved` entry records the orbit verb rename as "Blessed, not yet
  implemented" — but the rename has been implemented. This is a stale LANDED marker that the
  assessment should record per CONTRACT.md completion rules.

## Candidate open directions

These are questions the charter does not answer that arose during review:

1. **Should CameraShake carry clone/copy verbs for API symmetry?** The orbit and fly controllers
   have the full verb set. Shake is simpler but the inconsistency is visible. A direction call on
   whether every controller-like Entity gets the full verb set would settle this for future atoms
   too.

2. **Should fly have a framing primitive?** Orbit has `frameOrbitCameraControllerToSphere`; fly has
   nothing analogous. Whether this is a deliberate asymmetry (fly is positioned by the app, period)
   or a gap depends on expected use patterns.

3. **Should 2D follow be an Entity?** The current per-call options bag is lightweight but cannot
   participate in Entity-based systems (serialization, binding, inspection). If the
   advanced-controller family grows, the follow controller may need the same Entity shape as orbit
   and fly.
