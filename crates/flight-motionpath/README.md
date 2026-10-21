# flight-motionpath

Arc-length motion-path markers over `flight-path`'s `Path`: where the marker is, where it is
heading, how far along it is, and how it behaves at the ends. Path owns the geometry and the
"point at distance D" sampling; this crate owns the per-frame marker state. No animation loop,
timer or device operation lives here.

## Model

- `MotionPath` is an Entity whose `path` is the source's retained object handle (`Ref<Path>`);
  `distance`, `length` and `speed` are arc lengths/rates (f64, the precision of `flight-path`'s
  API), `direction` is the closed `MotionPathDirection` (`Forward` = 1, `Backward` = -1), and
  `loop_mode` is the closed source union with its canonical string table.
- `create_motion_path` measures the path arc length once with `get_path_length(path, tolerance)` and
  caches it; no later call re-measures. `speed` defaults to 0 and `loop_mode` to `clamp`.
- `get_motion_path_position` delegates to `get_path_position_at_distance`; an empty path returns
  false and leaves the point output unchanged (the tangent falls back to `(1, 0)` inside the path
  package, so the heading is 0).
- `update_motion_path` ignores non-positive deltas and zero-length paths. `loop` wraps the signed
  advance modulo length into `[0, length)`; `pingpong` folds a `2 * length` phase line back into
  `[0, length]`, selecting the branch from the current direction, so one large step may cross the
  path several times; `clamp` stops at the ends. Boundary behavior is the source's exactly.

## Sugar (D18)

`MotionPath::new`, `heading`, `is_at_end`, `position`, `progress`, `set_direction`, `set_distance`,
`set_progress`, `update` delegate to the free functions, each with one inline comparison in
`motion_path_sugar.rs`.

## Precision

`distance`, `length`, `speed` and `tolerance` are f64 because they flow directly through
`flight-path`'s f64 arc-length API; rounding to f32 would change end/loop boundary comparisons.
Each f64 use carries its own allow marker naming that evidence. No blanket precision waiver is
introduced.
