//! Arc-length motion-path markers over a `Path` (TS `motionPath.ts`).

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Vector2, Vector2Like, create_vector2};
use flight_path::{
    Path, get_path_length, get_path_position_at_distance, get_path_tangent_at_distance,
};

use crate::types::*;

/// Allocates a motion-path marker at the start of `path` (TS `createMotionPath`): distance 0,
/// direction forward. `speed` is the traversal rate (a magnitude, path units per
/// `update_motion_path` delta-time unit),
/// `loop_mode` the end behavior. The path arc length is measured once with
/// `get_path_length(path, tolerance)` and cached in `length`; `tolerance` is the curve-flattening
/// tolerance forwarded to that measurement. The path handle is retained, not copied.
// flight-lint: allow(f64) D1: speed and tolerance flow through flight-path's f64 arc-length API
pub fn create_motion_path(
    path: Ref<Path>,
    speed: Option<f64>,
    loop_mode: Option<MotionPathLoopMode>,
    tolerance: Option<f64>,
) -> MotionPath {
    let mut out: MotionPath = allocate_entity();
    initialize_motion_path(&mut out, path, speed, loop_mode, tolerance);
    return out;
}

/// Initializes a motion-path marker under construction (TS `initializeMotionPath`): direction
/// forward, distance 0, the retained `path`, `speed`, `loop_mode`, and the arc length measured once
/// with `get_path_length(path, tolerance)`.
// flight-lint: allow(f64) D1: speed and tolerance flow through flight-path's f64 arc-length API
pub fn initialize_motion_path(
    out: &mut MotionPath,
    path: Ref<Path>,
    speed: Option<f64>,
    loop_mode: Option<MotionPathLoopMode>,
    tolerance: Option<f64>,
) {
    out.direction = MotionPathDirection::Forward;
    out.distance = 0.0;
    out.length = get_path_length(&path.read().unwrap(), tolerance);
    out.loop_mode = loop_mode.unwrap_or(MotionPathLoopMode::Clamp);
    out.path = path;
    out.speed = speed.unwrap_or(0.0);
}

/// Resolves the end behavior after advancing `mp` by `move` units along its direction (TS
/// `applyMotionPathLoopMode`). `clamp` stops at the ends; `loop` wraps modulo the length into
/// `[0, length)`; `pingpong` folds a phase line of period `2 * length` back into `[0, length]`, with
/// the current direction selecting the branch, so one large step may cross the path repeatedly.
// flight-lint: allow(f64) D1: move and length are f64 path arc lengths; modulo and phase folding stay in the path precision
fn apply_motion_path_loop_mode(mp: &mut MotionPath, movement: f64, length: f64) {
    let loop_mode = mp.loop_mode;
    let distance = mp.distance;
    let direction = mp.direction as i8 as f64;
    if loop_mode == MotionPathLoopMode::Loop {
        let mut wrapped = (distance + direction * movement) % length;
        if wrapped < 0.0 {
            wrapped += length;
        }
        mp.distance = wrapped;
        return;
    }
    if loop_mode == MotionPathLoopMode::Pingpong {
        let period = 2.0 * length;
        let phase = if direction < 0.0 {
            period - distance
        } else {
            distance
        };
        let mut advanced = (phase + movement) % period;
        if advanced < 0.0 {
            advanced += period;
        }
        if advanced <= length {
            mp.distance = advanced;
            mp.direction = MotionPathDirection::Forward;
        } else {
            mp.distance = period - advanced;
            mp.direction = MotionPathDirection::Backward;
        }
        return;
    }
    let mut clamped = distance + direction * movement;
    if clamped < 0.0 {
        clamped = 0.0;
    } else if clamped > length {
        clamped = length;
    }
    mp.distance = clamped;
}

/// Returns the marker's heading angle in radians — `atan2(tangentY, tangentX)` of the path tangent
/// at the current distance (TS `getMotionPathHeading`). An empty/degenerate path falls back to the
/// path tangent's `(1, 0)` default, giving a heading of 0.
// flight-lint: allow(f64) D1: the heading is computed from flight-path's f64 arc-length sampling and returned as a radian angle
pub fn get_motion_path_heading(mp: &MotionPath) -> f64 {
    let mut tangent = create_vector2(0.0, 0.0);
    get_path_tangent_at_distance(&mp.path.read().unwrap(), mp.distance, &mut tangent, None);
    return (tangent.y as f64).atan2(tangent.x as f64);
}

/// Samples the marker's current world position and unit tangent into `point_out` and `tangent_out`
/// (TS `getMotionPathPosition`). Returns false for an empty/degenerate path, in which case the point
/// output is left unchanged.
// flight-lint: allow(f64) D1: the distance is a f64 arc length sampled by flight-path
pub fn get_motion_path_position(
    mp: &MotionPath,
    point_out: &mut Vector2Like,
    tangent_out: &mut Vector2Like,
) -> bool {
    return get_path_position_at_distance(
        &mp.path.read().unwrap(),
        mp.distance,
        point_out,
        tangent_out,
        None,
    );
}

/// Returns the marker's normalized progress `distance / length` in `[0, 1]` (TS
/// `getMotionPathProgress`). A zero-length path reports 0.
// flight-lint: allow(f64) D1: progress is a ratio of f64 arc lengths
pub fn get_motion_path_progress(mp: &MotionPath) -> f64 {
    return if mp.length > 0.0 {
        mp.distance / mp.length
    } else {
        0.0
    };
}

/// True when the marker sits at the terminal edge for its current direction (TS
/// `isMotionPathAtEnd`).
pub fn is_motion_path_at_end(mp: &MotionPath) -> bool {
    return match mp.direction {
        MotionPathDirection::Forward => mp.distance >= mp.length,
        MotionPathDirection::Backward => mp.distance <= 0.0,
    };
}

/// Sets the traversal direction without changing the distance (TS `setMotionPathDirection`).
pub fn set_motion_path_direction(mp: &mut MotionPath, direction: MotionPathDirection) {
    mp.direction = direction;
}

/// Seeks the marker to an absolute arc-length distance, clamping to `[0, length]` (TS
/// `setMotionPathDistance`). Direction and speed are unchanged.
// flight-lint: allow(f64) D1: the seek distance is a f64 arc length
pub fn set_motion_path_distance(mp: &mut MotionPath, distance: f64) {
    let mut clamped = distance;
    if clamped < 0.0 {
        clamped = 0.0;
    } else if clamped > mp.length {
        clamped = mp.length;
    }
    mp.distance = clamped;
}

/// Seeks the marker to a normalized progress, clamping `t` to `[0, 1]` and setting
/// `distance = t * length` (TS `setMotionPathProgress`). Direction and speed are unchanged.
// flight-lint: allow(f64) D1: progress times a f64 arc length
pub fn set_motion_path_progress(mp: &mut MotionPath, t: f64) {
    let mut clamped = t;
    if clamped < 0.0 {
        clamped = 0.0;
    } else if clamped > 1.0 {
        clamped = 1.0;
    }
    mp.distance = clamped * mp.length;
}

/// Advances the marker by `delta_time` milliseconds: moves `speed * delta_time` path units along the
/// current direction, then resolves the loop mode (TS `updateMotionPath`). A non-positive delta or a
/// zero-length path is a no-op. All inputs are read before any write.
// flight-lint: allow(f64) D1: delta time and speed produce a f64 path arc length
pub fn update_motion_path(mp: &mut MotionPath, delta_time: f64) {
    if delta_time <= 0.0 {
        return;
    }
    let length = mp.length;
    if length <= 0.0 {
        return;
    }
    let movement = mp.speed * delta_time;
    apply_motion_path_loop_mode(mp, movement, length);
}
