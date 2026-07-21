---
package: '@flighthq/camera-controls'
status: partial
score: 58
updated: 2026-07-21
ingested:
  - source
  - tests
---

# camera-controls — Review

## Verdict

**Partial — 58/100.** Orbit and fly controllers are small, input-agnostic intent primitives over the
unified `Camera3D`. Their separation from pointer/keyboard devices is exactly right: applications map
input into orbit/dolly/pan/look/move verbs, and one explicit update writes the camera view. The package
does not conceal an event loop or own the camera.

The domain is still shallow. There is no framing/fit primitive, reset/snap state, controller cloning,
arcball/trackball, rail/cinematic motion, camera shake, or collision seam. More immediately, both
`create*Controller` functions return structural literals whose types do not extend Entity; angular
damping is not wrap-aware; and orbit pan says “view plane” while vertical motion is fixed world Y.
The package charter is still a stub, so larger additions require direction rather than an automatic
controller kitchen sink.

## What is solid

- Orbit has distinct current and goal azimuth/polar/distance, explicit clamps, dolly/orbit/pan verbs,
  frame-rate-independent damping, and a single update that derives the camera look-at.
- Fly has distinct current and goal yaw/pitch, level forward/right movement, explicit world-up motion,
  pitch clamps, damping, and a single camera update.
- Neither controller imports input, DOM, application, or render packages. This preserves headless tests
  and lets one control scheme feed multiple camera behaviors.
- The package depends only on camera, geometry, math, and types and remains side-effect-free.

## Gaps and ambiguities

- `OrbitCameraController` and `FlyCameraController` do not extend Entity and their constructors return
  plain literals. This violates the current `create*` invariant and leaves the OOP/binding layer unable
  to rely on controller shape.
- `damp(currentAngle, goalAngle, ...)` treats angles as unbounded scalars. A goal crossing the ±π seam
  can take the long rotation unless callers manually maintain a continuous angle representation. The
  contract should either normalize goals with shortest-angle damping or explicitly adopt continuous
  accumulated angles and provide a helper for wrapped inputs.
- `panCameraController` calls its motion “in the view plane” but uses camera-horizontal right plus
  world Y. At non-zero polar this is not the camera's screen-up direction. World-up pan is useful, but
  it needs an honest name; a true view-plane pan is a separate primitive.
- There is no capture/restore/reset or snap-current-to-goal operation. Reusing a controller across scene
  changes requires callers to mutate multiple coupled fields correctly.
- There is no `fitCamera*`/frame-bounds composition connecting scene bounds, projection, viewport aspect,
  padding, and orbit target/distance. This is the most obvious application-facing camera utility.
- Package metadata says “2D follow and 3D orbit / fly,” but 2D follow lives in `@flighthq/camera` and
  this package exports only 3D controllers.

## Domain ceiling

Input bindings should remain adapters outside the controller core. Collision-aware fly motion should
consume a caller collision query rather than import physics. Camera shake should be an additive pose
modifier, and rail/cinematic motion should compose animation/path primitives. Those cuts keep orbit and
fly at bedrock while allowing richer assemblies without one `CameraController` union or a register-all.
