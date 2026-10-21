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

The resulting `f64` inventory is limited to those three decisions:

- `CollisionPolygon2D` storage, polygon validation, and the 2D SAT kernel and entry points retain
  the measured `1e15` domain. AABB and OBB vertices are widened only when entering that kernel.
- `CollisionCircle2D`, `CollisionRaycastHit2D`, the 2D raycast query/kernel, and its Rust sugar
  delegate retain the measured `1e9` domain. Stored f32 AABBs, OBBs, and capsules are widened only
  inside the retained raycast query.
- The collision guard's injected clock and the logged operation timestamp retain millisecond `f64`.
  The 2D sweep translation helper only widens its f32 delta when updating retained circle or polygon
  storage; it is not a separate double-precision computation family.

All other collision numeric families are `f32`: contact and manifold generation, containment,
segments, 2D support and non-SAT operations, every 3D shape and operation, distance, sweep, hull,
heightfield, and triangle-mesh code. Direct `cargo-flight-lint check --crate flight-collision`
passes with no baseline; no broad `f64` allow covers any of them.

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

### Source-aligned structural signatures

The previously undecided structural differences are resolved. Rust retains the approved leading
out parameter and explicit registry where required by D5/D9; the remaining source contract is
matched directly:

- Explanation calls return a fresh `CollisionTestExplanation2D` or `CollisionTestExplanation3D`.
- Distance accepts the three optional source offsets, defaulting each to zero.
- Shape sweeps accept separate translations for both shapes and an optional `max_fraction` that
  defaults to one.
- Heightfield and triangle-mesh collision accept the convex shape first and write a
  `CollisionContactManifold3D`.
- Heightfield and triangle-mesh sweeps accept convex-first source deltas and the optional
  `max_fraction` default.

### Source-decided corrections

The remaining source-rule questions from the audit are resolved in code:

- `raycast_collision_shape2d`, `raycast_collision_shape3d`,
  `raycast_collision_heightfield3d`, and `raycast_collision_triangle_mesh3d` are out-first; their
  final `max_fraction` is optional and defaults to infinity.
- All six `test_segment_*_collision2d` functions are boolean-only `(a, b)` queries with no mutable
  hit outputs or chaining return.
- Heightfield, point-containment, 2D support, and convex-hull parameter names match the source.
- Polygon validation uses `&Vec<f64>` for the retained polygon domain; convex validation and convex
  hull input use `&Vec<f32>`; hull output remains the approved growable `Vec<usize>`. Direct
  conformance has no remaining parameter, name, or array findings.

### Rust-only implementation helpers

Capsule support and the four concrete face writers are crate-private implementation details. The
public and contract lanes expose only the source-shaped support and face-query APIs.
