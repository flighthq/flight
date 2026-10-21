# flight-collision

## Numeric precision (D1)

Collision coordinates continue to use `f64` only where there is item-specific evidence. The
experiments in `tests/precision_test.rs` round every tested input through `f32` before running the
same public operation; they cover both a small-coordinate control and a failure boundary.

| Item family | Measurement | Decision |
| --- | --- | --- |
| `CollisionPolygon2D`, `test_polygon_polygon_collision2d` | Two overlapping 10-unit squares produce the same 2-unit penetration near the origin after an `f32` round trip. Translated to `1e15`, the `f64` path still reports that penetration, while `f32` aliases all four vertices of each square and the same operation rejects the collapsed polygons. | Retain `f64` for the measured polygon storage and SAT entry point. |
| `CollisionCircle2D`, `CollisionRaycastHit2D`, `raycast_collision_shape2d` | A unit circle raycast gives fraction `1` in the local control under either precision. At a center of `1e9`, `f64` still hits at `999999999`; `f32` aliases the origin two units away with the center and changes the public result from hit to miss. | Retain `f64` for the measured circle/raycast input and hit record. |
| `enable_collision_guards` clock | `f64` distinguishes timestamps `2^24` ms and `2^24 + 1` ms; an `f32` round trip aliases them. | Retain the injected live clock and logged operation timestamp as `f64`. |

The near-origin controls show that `f32` is sufficient for those particular bounded inputs, but the
public TypeScript `number` domain is not bounded that way. The remaining contact, containment,
segment, 3D GJK/EPA, distance, sweep, hull, heightfield, and triangle-mesh f64 items have not been
made part of this decision. They remain individually visible in the lint baseline rather than being
covered by a blanket waiver or an unmeasured conversion.

## Source signature report

This inventory compares the Rust API with collision source commit `a627849`. It records differences;
it does not treat an `allow` marker as permission to hide unrelated drift.

### Explicit-state parameters

Twenty-six functions differ only by the leading caller-owned `CollisionRegistry2D` or
`CollisionRegistry3D` parameter approved by D5/D9:

- Registry operations: `get_collision_pair_test2d`, `get_collision_support2d`,
  `register_built_in_collision_supports2d`, `register_built_in_collision_pair_tests2d`,
  `register_collision_pair_test2d`, `register_collision_support2d`,
  `clear_collision_pair_tests3d`, `clear_collision_supports3d`, `get_collision_pair_test3d`,
  `get_collision_support3d`, `register_built_in_collision_supports3d`,
  `register_built_in_collision_pair_tests3d`, `register_collision_pair_test3d`, and
  `register_collision_support3d`.
- Face registry: `get_collision_face_query3d`, `register_built_in_collision_face_queries3d`, and
  `register_collision_face_query3d`.
- Dispatch: `collide_contact_manifold3d`, `test_collision_support2d`,
  `test_collision_support_overlap2d`, `test_collision_support3d`,
  `test_collision_support_overlap3d`, `set_collision_test_guard2d`, `test_collision2d`,
  `set_collision_test_guard3d`, and `test_collision3d`.

The three guard switch functions intentionally replace source globals: Rust
`are_collision_guards_enabled(registry2d, registry3d)` and
`disable_collision_guards(registry2d, registry3d)` correspond to zero-argument source functions;
Rust `enable_collision_guards(registry2d, registry3d, log_state, clock)` corresponds to the
zero-argument source function and injects both logging state and the live clock.

### Additional structural drift

These signatures differ by more than caller-owned state and remain visible here for an API ruling:

| Function | Rust | TypeScript source |
| --- | --- | --- |
| `explain_collision_test2d`, `explain_collision_test3d` | `(registry, a, b, out) -> bool` | `(a, b) -> CollisionTestExplanation*` |
| `write_collision_distance3d` | `(registry, a, b, out)` | `(a, b, out, offset_x = 0, offset_y = 0, offset_z = 0)` |
| `sweep_collision_shape2d` | `(registry, a, b, velocity_x, velocity_y, out)` | `(shape_a, translation_ax, translation_ay, shape_b, translation_bx, translation_by, out, max_fraction = 1)` |
| `sweep_collision_shape3d` | `(registry, a, b, velocity_x, velocity_y, velocity_z, out)` | `(shape_a, translation_ax, translation_ay, translation_az, shape_b, translation_bx, translation_by, translation_bz, out, max_fraction = 1)` |
| `collide_collision_heightfield3d` | `(registry, hf, shape, out: CollisionManifold3D)` | `(convex, heightfield, out: CollisionContactManifold3D)` |
| `collide_collision_triangle_mesh3d` | `(registry, mesh, shape, out: CollisionManifold3D)` | `(convex, mesh, out: CollisionContactManifold3D)` |
| `sweep_collision_heightfield3d` | `(registry, hf, shape, velocity_x, velocity_y, velocity_z, out)` | `(convex, delta_x, delta_y, delta_z, heightfield, out, max_fraction = 1)` |
| `sweep_collision_triangle_mesh3d` | `(registry, mesh, shape, velocity_x, velocity_y, velocity_z, out)` | `(convex, delta_x, delta_y, delta_z, mesh, out, max_fraction = 1)` |

The unwaived conformance baseline has ten parameter entries:

- `raycast_collision_shape2d`, `raycast_collision_shape3d`,
  `raycast_collision_heightfield3d`, and `raycast_collision_triangle_mesh3d` put
  `max_fraction` before `out`; the source puts `out` first and defaults `max_fraction`.
- The six `test_segment_*_collision2d` functions add mutable `out_x`, `out_y`, and `out_t`
  parameters; the source takes only `(a, b)` and returns a boolean.

Eleven further name-only mismatches remain: `hf`/`heightfield` on validation, invalidation, and
bounds; `px`/`py`/`pz` versus `x`/`y`/`z` on point containment; `direction_x`/`direction_y` versus
`dir_x`/`dir_y` on the four 2D support functions and `write_vertex_list_support2d`; and
`out_indices` versus `out` on `write_collision_convex_hull_faces3d`. The heightfield raycast also has
`hf`/`heightfield` in addition to its order drift above.

### Array negotiations

Exactly three collision parameters remain in the `conform-array` baseline:

- `get_collision_polygon_validation_status2d(points)`
- `get_collision_convex_validation_status3d(points)`
- `write_collision_convex_hull_faces3d(points, out)` — `points` only; growable `out` already maps
  to the source `number[]`.

In each case Rust borrows `points` as `&[f64]`, which maps to `ArrayLike<number>`, while the source
declares `readonly number[]`. Keeping the slice would intentionally widen TypeScript callers to plain
or typed arrays; requiring `&Vec<f64>` would preserve the source's plain-array restriction. No
`allow(conform-array)` marker has been added pending that negotiation.

The other five entries in the collision conformance baseline are Rust-only helpers:
`support_collision_capsule2d` and the four `write_collision_*_face3d` functions.
