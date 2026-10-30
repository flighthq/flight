//! flight-compiler: nullable-options

use crate::Velocity2D;
use crate::VelocityExplanation;
use crate::VelocityReason;
use flight_entity::NonEntityCreateResult;
use flight_geometry::Matrix;

/// Per-source velocity sample, storing the current velocity and the previous
/// world transform for deriving transform-based velocity.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct VelocitySample {
    pub previous_world_transform: Option<Matrix>,
    pub velocity: Velocity2D,
    pub last_frame_id: i32,
    pub explicit_frame_id: i32,
}

/// The default sample a store creates for a source it has not seen: zero
/// velocity, no previous transform, and `-1` (never touched) frame ids.
// flight-lint: allow(conform-extra) approved velocity native-store split: portable sample rule, contract-only until the generated TS velocitySample carries it
pub fn create_velocity_sample() -> NonEntityCreateResult<VelocitySample> {
    return VelocitySample {
        previous_world_transform: None,
        velocity: Velocity2D { x: 0.0, y: 0.0 },
        last_frame_id: -1,
        explicit_frame_id: -1,
    };
}

/// Explains why a sample reads as its current velocity at `frame_id`: no
/// sample, stale (not touched this frame), explicit or derived zero, or ok.
// flight-lint: allow(conform-extra) approved velocity native-store split: portable sample rule, contract-only until the generated TS velocitySample carries it
pub fn explain_velocity_sample(
    sample: Option<&VelocitySample>,
    frame_id: i32,
) -> VelocityExplanation {
    if let Some(stored) = sample {
        if stored.last_frame_id != frame_id {
            return VelocityExplanation {
                current_frame_id: frame_id,
                explicit: false,
                last_frame_id: stored.last_frame_id,
                reason: VelocityReason::Stale,
                x: 0.0,
                y: 0.0,
            };
        }
        let explicit = stored.explicit_frame_id == frame_id;
        let x = stored.velocity.x;
        let y = stored.velocity.y;
        if x == 0.0 && y == 0.0 {
            let reason = if explicit {
                VelocityReason::ExplicitZero
            } else {
                VelocityReason::DerivedZero
            };
            return VelocityExplanation {
                current_frame_id: frame_id,
                explicit: explicit,
                last_frame_id: stored.last_frame_id,
                reason: reason,
                x: 0.0,
                y: 0.0,
            };
        }
        return VelocityExplanation {
            current_frame_id: frame_id,
            explicit: explicit,
            last_frame_id: stored.last_frame_id,
            reason: VelocityReason::Ok,
            x: x,
            y: y,
        };
    }
    return VelocityExplanation {
        current_frame_id: frame_id,
        explicit: false,
        last_frame_id: -1,
        reason: VelocityReason::NoSample,
        x: 0.0,
        y: 0.0,
    };
}

/// Returns the per-pixel screen-space velocity at local-space point
/// (`point_x`, `point_y`) by computing `current * p - previous * p` using
/// the sample's stored previous_world_transform and the node's current world
/// transform. Writes the result into `out`. Returns zero when the sample has
/// no previous transform.
///
/// Use when the full affine delta (rotation + scale) at a specific point is
/// needed, such as when writing a per-pixel velocity buffer from a
/// screen-space fragment shader.
pub fn get_velocity_sample_at(
    sample: &VelocitySample,
    current_world_transform: &Matrix,
    point_x: f32,
    point_y: f32,
    out: &mut Velocity2D,
) {
    if let Some(prev) = sample.previous_world_transform.as_ref() {
        let cx = current_world_transform.a * point_x
            + current_world_transform.c * point_y
            + current_world_transform.tx;
        let cy = current_world_transform.b * point_x
            + current_world_transform.d * point_y
            + current_world_transform.ty;
        let px = prev.a * point_x + prev.c * point_y + prev.tx;
        let py = prev.b * point_x + prev.d * point_y + prev.ty;
        out.x = cx - px;
        out.y = cy - py;
        return;
    }
    out.x = 0.0;
    out.y = 0.0;
}

/// Returns true when the sample was touched at `frame_id` and its velocity is
/// nonzero. A missing or stale sample has no velocity.
// flight-lint: allow(conform-extra) approved velocity native-store split: portable sample rule, contract-only until the generated TS velocitySample carries it
pub fn is_velocity_sample_nonzero(sample: Option<&VelocitySample>, frame_id: i32) -> bool {
    if let Some(stored) = sample {
        return stored.last_frame_id == frame_id
            && (stored.velocity.x != 0.0 || stored.velocity.y != 0.0);
    }
    return false;
}

/// Writes the sample's velocity at `frame_id` into `out`. Writes zero for a
/// missing sample or one that is stale (not touched at `frame_id`).
// flight-lint: allow(conform-extra) approved velocity native-store split: portable sample rule, contract-only until the generated TS velocitySample carries it
pub fn read_velocity_sample(sample: Option<&VelocitySample>, frame_id: i32, out: &mut Velocity2D) {
    if let Some(stored) = sample {
        if stored.last_frame_id == frame_id {
            out.x = stored.velocity.x;
            out.y = stored.velocity.y;
            return;
        }
    }
    out.x = 0.0;
    out.y = 0.0;
}

/// Records an explicit velocity contribution on the sample at `frame_id`: the
/// velocity, and both the last-touched and explicit frame ids, so a transform
/// baseline run later in the same frame leaves it in place.
// flight-lint: allow(conform-extra) approved velocity native-store split: portable sample rule, contract-only until the generated TS velocitySample carries it
pub fn write_velocity_sample(sample: &mut VelocitySample, frame_id: i32, x: f32, y: f32) {
    sample.velocity.x = x;
    sample.velocity.y = y;
    sample.last_frame_id = frame_id;
    sample.explicit_frame_id = frame_id;
}
