# flight-camera-controls

Stateful camera controllers and effects: orbit and fly intent controllers with damped goals, 2D
follow with a deadzone and world-bounds clamping, sphere framing for projections, and deterministic
trauma-based shake. Controllers take intent deltas, never raw input; no hardware, OS, timer or render
operation lives here.

## Controllers

- `OrbitCameraController` holds spherical goal/current coordinates and a retained target vector
  (`Ref<Vector3>`). Verbs move the goals (`rotate`, `dolly`, `pan`, `pan_in_view_plane`); `update`
  clamps and damps them toward the goals (shortest arc for azimuth via `delta_angle`), places the eye
  on the sphere, and writes a look-at view into the camera. Polar limits default to just inside ±90°,
  the minimum distance to 0.01, and the maximum to +∞. `clone` creates independent value state;
  `copy` writes into an existing controller without replacing its runtime or target vector.
- `FlyCameraController` holds a position vector and yaw/pitch goals. `look` moves the goals (pitch
  clamped), `move` translates along the horizontal heading at the current yaw, `reset` and `snap`
  restore/synchronize state, and `update` damps and writes the look-at view.
- `update_camera_2d_follow` composes the deadzone goal, exponential damping (`smoothTime`), and
  world-bounds clamping of the visible rectangle. The camera crate's guard state is threaded through
  explicitly (D5) because the visible-bounds query reports through it.
- `frame_orbit_camera_controller_to_sphere` changes only `goal_distance` for a perspective
  projection and only the projection half-extents for orthographic; raw projections and invalid
  inputs return false without mutation.

## Constructor decisions (D23)

`CameraShake` creates and initializes with no arguments, and `CameraShake::new()` mirrors that
signature. Its decay, frequency and amplitude options only assign authored fields, so callers assign those
fields after construction. Defaults remain decay 1.5, frequency 15, rotation amplitude 3 and
translation amplitude 0.5; trauma and time start at zero. `CameraShakeOptions` remains a plain value
record; it is not an Entity construction parameter.

`FlyCameraController` keeps the original optional seed: initialization derives both the current and
goal yaw/pitch from the same inputs and creates an independent position vector. `OrbitCameraController`
also keeps its optional seed: azimuth, polar and distance each initialize coupled current/goal state,
and target coordinates initialize an independent vector. Their source defaults and optionality remain
unchanged. The Rust allocation bootstrap supplies each controller's sole position/target Entity;
construction fills that vector rather than allocating and discarding another one. Public initializers
preserve the preallocated controller runtime and vector identity. They are construction seams; the
existing `reset` verbs retain their source behavior.

## Shake

`CameraShake` accumulates trauma (clamped to 1) and `update` decays it, then writes a deterministic
additive offset from three incommensurate sine phases per axis; intensity is `trauma²`. Translation is
world units, rotation degrees. No random source or clock is read by the crate.

## Identity and aliases

Entity value returns, private runtime slots, and `impl_entity` follow D12; `create_*` is the only
factory chain, and option records are plain structs built with literals. `clone_*` allocates fresh
state (the position/target vectors are distinct), and `copy_*` retains the destination's vectors.
Update paths read inputs into locals before writing outputs.

## Sugar (D18)

`CameraShake` (`new`, `add_trauma`, `reset`, `update`), `CameraShakeOffset::new`,
`FlyCameraController` (`new`, `clone_controller`, `copy_from`, `look`, `move_by`, `reset`, `snap`,
`update`) and `OrbitCameraController` (`new`, `clone_controller`, `copy_from`, `dolly`, `pan`,
`pan_in_view_plane`, `reset`, `rotate`, `snap`, `update`) delegate to the free functions, each with
one inline comparison. `move_by` keeps the fuller name because `move` is a Rust keyword, and
`copy_from`/`clone_controller` avoid colliding with Rust's `Copy`/`Clone` traits.

No sugar is invented for the framing helpers whose receiver is a camera-owned projection type, or for
`update_camera_2d_follow` whose receiver is the camera-owned `Camera2D`: those types already have
their own crate's sugar, and an inherent impl is impossible outside their crate.

## Precision

All math is `f32` (D1 default; the source declares plain `number` and the math helpers are f32). No
`f64` is used.
