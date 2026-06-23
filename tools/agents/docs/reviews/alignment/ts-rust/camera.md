# TS↔Rust Alignment: @flighthq/camera

**Verdict:** Fully aligned — all 11 exported functions, both filenames, and every convention map 1:1; the only "gap" is a `rust:conformance` false-positive caused by nested test modules, not real drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createCamera` / `camera.ts` | `create_camera` / `camera.rs` | None — but constructor shape differs: TS takes `Readonly<CameraOptions>` (`{far, near, projection}`), Rust takes positional `(near, far, projection)`. Idiomatic Rust (TS uses an options object for keyword-arg ergonomics; Rust uses positional params). Conventional and seen elsewhere in the port; not worth a divergence-map entry, but note the param **order** is `near, far` in Rust vs the TS option object's alphabetized `far, near`. Harmless (named in TS, positional in Rust), flagged only for awareness. |
| `createOrthographicProjection` / `projection.ts` | `create_orthographic_projection` / `projection.rs` | None. TS `Readonly<OrthographicProjectionOptions>` → Rust positional `(half_width, half_height)`. Returns concrete `OrthographicProjection` in TS vs `Projection` (the enum) in Rust — the Rust `Projection` is an enum, not a discriminated-union-of-structs, so it cannot return the narrowed variant type. Expected representation difference. |
| `createPerspectiveProjection` / `projection.ts` | `create_perspective_projection` / `projection.rs` | None. TS `aspect` defaults to `1`; Rust requires it positionally (`fov_y, aspect`). Minor: the TS default is lost in the Rust signature (caller must pass `1.0`). Acceptable for a positional Rust API; not drift. |
| `getCameraInverseViewProjectionMatrix4` / `camera.ts` | `get_camera_inverse_view_projection_matrix4` / `camera.rs` | None. `out: Matrix4Like` → `&mut Matrix4Like`; `boolean` → `bool` sentinel preserved; alias-safety preserved. Exact match. |
| `getCameraViewProjectionMatrix4` / `camera.ts` | `get_camera_view_projection_matrix4` / `camera.rs` | None. Out-param + alias-safety preserved. |
| `isOrthographicProjection` / `projection.ts` | `is_orthographic_projection` / `projection.rs` | None. TS is a type-narrowing predicate (`projection is OrthographicProjection`); Rust returns plain `bool` via `matches!`. Narrowing has no Rust equivalent (pattern-match instead); expected. |
| `isPerspectiveProjection` / `projection.ts` | `is_perspective_projection` / `projection.rs` | None. Same predicate-vs-`bool` note. |
| `setCameraJitter` / `camera.ts` | `set_camera_jitter` / `camera.rs` | None. `Camera` mutable → `&mut Camera`. Exact match. |
| `setCameraViewMatrix4FromLookAt` / `camera.ts` | `set_camera_view_matrix4_from_look_at` / `camera.rs` | None. Full type words preserved. Implementation note (not an alignment issue): Rust inlines a local `set_matrix4_look_at` because `flighthq-geometry` does not yet expose it; TS calls geometry's `setMatrix4LookAt`. Documented in the crate's own comment; a geometry-crate gap, not a camera divergence. |
| `setCameraViewMatrix4FromMatrix4` / `camera.ts` | `set_camera_view_matrix4_from_matrix4` / `camera.rs` | None. `Readonly<Matrix4Like>` → `&Matrix4Like`. Exact match. |
| `setProjectionMatrix4` / `projection.ts` | `set_projection_matrix4` / `projection.rs` | None. 5-arg out-param signature preserved exactly; `tan(fovY/2)` handling identical. |

### Tooling note (not a code issue)

`npm run rust:conformance` reports `camera | 11 | 0 | 15 | 11 ⚠️` — i.e. it claims **none** of the 11 functions are covered by a Rust test. This is a **false positive**. The crate actually has a dedicated test for every function (`cargo test -p flighthq-camera -- --list` shows 15 tests grouped as `camera::tests::create_camera::…`, `camera::tests::get_camera_view_projection_matrix4::…`, etc.).

The cause is `rustTestNames` in `scripts/rust-conformance.ts` (line ~364): it keeps only the **leaf** segment of each test path (`path.split('::').pop()`), so a test named `camera::tests::create_camera::stores_projection_near_far_…` collapses to `stores_projection_near_far_…`, which no longer contains the function name `create_camera`. `isCovered` then fails to match. This crate's `mod <function_name> { #[test] fn <behavior>() }` nesting (a clean, convention-aligned layout) is exactly what defeats the leaf-only matcher; flat `#[test] fn create_camera_stores_…()` crates score 100%. The coverage metric — not the camera crate — is what needs fixing (match against the full `::`-joined path, or any path segment, not just the leaf).

## In sync

- **Package→crate name:** `@flighthq/camera` → `flighthq-camera`, identity. Correct, and the `camera`/`webcam` semantic trap is already documented in `conformance.md` (old photo-capture `camera` → `webcam`; new `camera` is the 3D-pipeline package). No undocumented divergence.
- **Function set:** 11 TS exports → 11 Rust public functions, 1:1, no missing ports, no extra Rust functions, no abbreviations. Full type words preserved across every snake_case conversion (`getCameraInverseViewProjectionMatrix4` → `get_camera_inverse_view_projection_matrix4`, `Matrix4` / `LookAt` / `FromMatrix4` all intact).
- **Filenames:** `camera.ts`↔`camera.rs`, `projection.ts`↔`projection.rs`. Both track. (`index.ts` barrel ↔ `lib.rs` re-export — expected language difference, both thin re-exports.)
- **Conventions:** out-params (`out` → `&mut`), sentinels (`boolean` → `bool` for the non-invertible case, no panics), `Readonly<>` → `&`, alias-safety, and the scratch-matrix-before-write discipline all carry across faithfully. No teardown verbs in this package (no `dispose`/`destroy`/`acquire`/`release`).
- **Doc comments:** the Rust doc comments are near-verbatim ports of the TS leading comments, including the alias-safety notes — good fidelity.
- **Divergence map:** nothing here needs a new entry. The constructor options-object→positional shape and predicate→`bool` are idiomatic, port-wide patterns, not camera-specific drift. The only follow-up is the `rust-conformance.ts` matcher fix noted above (a tooling bug, tracked separately from the divergence map).
