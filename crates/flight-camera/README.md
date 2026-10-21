# flight-camera

Mathematical 2D/3D cameras: projection descriptors, view matrices, aspect/jitter setters, the
inverse-view-projection cache, culling, picking, frustum corners, planar reflection, shadow-camera
fitting, cube-capture faces and the 2D world/screen transforms. No render backend, webcam, device
capture or OS operation lives here.

## Identity model

The source retains object references, so the Rust port does too:

- `Camera3D.view`, `inverse_view_projection` and `jitter` are `Ref` handles. Setters mutate those
  objects in place; `set_camera_3d_view_matrix4_from_matrix4` copies bytes into the retained view
  matrix, `set_camera_3d_jitter` writes the retained vector, and
  `update_camera_3d_inverse_view_projection` only refreshes the cache on success.
- `Projection` is the source's discriminated union: each member is an entity, so the variant carries
  the member's `Ref`. The source's literal `kind` field is the variant itself; `create_*` retains the
  descriptor identity through `Camera3DOptions.projection`, and `set_camera_3d_aspect` mutates the
  retained descriptor.
- `RawProjection.matrix` is a `Ref` to a copied matrix (the source copies the data at construction).

Out-parameter functions read every input into locals before writing `out`, so a distinct `out` is
always safe. The source's whole-object aliasing cases (`out` identical to `camera.view`, to
`worldPoint`, or to `ray.origin`; `out` equal to the reflection source camera) are not expressible
in safe Rust — the borrow checker rejects the aliasing call — so those tests become the distinct-out
cases with identical math.

## Guards (D5)

The source's module-level guard hooks and enabled flag become one caller-owned `CameraGuardState`.
`enable_camera_guards` installs an adapter that captures the caller's `LogStateRef` and a live clock
and samples that clock at each warning, so timestamps are operation time. The core modules stay
message-free; the degraded visible bounds still fail toward drawing (a finite unbounded rectangle)
whether or not a hook is installed.

## Semantics

- `set_camera_3d_aspect`: perspective writes `aspect`; orthographic keeps `half_height` and sets
  `half_width = half_height * aspect`; raw is a no-op.
- View projection = projection × view, with jitter applied as `clip.xy += jitter * clip.w` and the
  oblique near-clip plane (Lengyel) applied afterwards when present.
- Depth conversion keeps the source's degenerate cases (zero range and zero denominator return 0).
- The 2D visible bounds report the enclosing world AABB; a zero zoom produces the finite unbounded
  rectangle instead of an error.
- Cube capture and shadow-camera fitting are pure CPU math; `face` indexes the GL face table.

## Sugar (D18)

`Camera3D` has `new` plus delegate methods for every public function where it is the out/first
receiver (`forward`, `position`, `right`, `up`, `frustum`, `frustum_corners`, `view_projection_matrix4`,
`inverse_view_projection_matrix4`, `screen_to_world_ray`, `world_to_screen`, `ray_through_bounding_sphere`,
`linear_depth`, `view_space_z`, `explain_view`, setters, reflection, cube face, shadow configuration).
`Camera2D` has `new`, `look_at`, `view_matrix`, `project_point`, `unproject_point`, `parallax_point`,
`visible_bounds`, `zoom_at_screen_point`. `Projection` has `is_orthographic`, `is_perspective`,
`is_raw`, `matrix4`; each projection entity has `new` (and `OrthographicProjection::texel_size`).
Each method has one inline comparison against its free function in `camera_sugar.rs`.

## Precision

All math is `f32` per D1 (the source declares plain `number`). The only `f64` is the injected guard
clock's millisecond timestamp.
