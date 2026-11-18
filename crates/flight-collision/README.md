# flight-collision

## Numeric precision (D1)

Collision is a spatial crate: every coordinate, distance, normal, depth, fraction, support result,
GJK/EPA simplex and polytope value, contact point, and tolerance is `f64`, matching the `f64`
geometry and math layers and the source's JS-number domain. There is no `f32` in the crate's source
or tests, and `cargo-flight-lint` treats `flight-collision` as a spatial crate, so any future `f32`
needs an `allow(f32) <reason>` boundary declaration.

Tolerances keep their source meaning. Relative tolerances (`1e-9`, `1e-12`, extent-scaled `1e-6`)
and iteration budgets are unchanged. The zero-extent fallbacks and the triangle-mesh degeneracy
floor use `f64::EPSILON`, which is the source's `Number.EPSILON` (2^-52) exactly.

`tests/precision_test.rs` covers large-coordinate/small-delta cases that single precision cannot
represent: a sub-millimetre circle overlap and a circle raycast at `1e9`, 2D polygon SAT
penetration at `1e15`, a 10-micrometre sphere–AABB penetration at `1e8`, and a sphere raycast, a
10-micrometre sphere–sphere overlap, and a millimetre support-distance gap at `1e9`.

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
- Polygon validation, convex validation, and convex hull input use `&Vec<f64>`; hull output remains
  the approved growable `Vec<usize>`. Direct
  conformance has no remaining parameter, name, or array findings.

### Rust-only implementation helpers

Capsule support and the four concrete face writers are crate-private implementation details. The
public and contract lanes expose only the source-shaped support and face-query APIs.
