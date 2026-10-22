use std::collections::HashMap;

use flight_entity::EntityRuntimeSlot;
use flight_entity::allocate_entity;
use flight_geometry::Matrix;

/// An opaque caller-assigned source handle. TS keys the velocity field by object identity
/// (`WeakMap<object, VelocitySample>`); the Rust contract uses an explicit numeric handle, which the
/// transpiler maps back to the object key. This caller-numeric handle is a recorded D0 exception:
/// arbitrary caller objects do not get Entity identity.
// flight-lint: allow(contract-vocabulary) D1 range declaration for opaque source ids: callers must keep values <= 2^53 because TS maps them to object identity keys
pub type SourceId = u64;

/// A two-dimensional velocity value.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Velocity2D {
    pub x: f32,
    pub y: f32,
}

/// The reason for a velocity explanation result.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VelocityReason {
    NoSample,
    Stale,
    ExplicitZero,
    DerivedZero,
    Ok,
}

/// Diagnostic result from `explain_velocity`, describing why a source has
/// its current velocity value.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct VelocityExplanation {
    pub current_frame_id: i32,
    pub explicit: bool,
    pub last_frame_id: i32,
    pub reason: VelocityReason,
    pub x: f32,
    pub y: f32,
}

/// Per-source velocity sample, storing the current velocity and the previous
/// world transform for deriving transform-based velocity.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct VelocitySample {
    pub previous_world_transform: Option<Matrix>,
    pub velocity: Velocity2D,
    pub last_frame_id: i32,
    pub explicit_frame_id: i32,
}

/// The velocity field: a frame counter and a map from source identifiers to
/// their per-frame velocity samples. Any system (physics, tween, camera, manual
/// edit) contributes a source's screen-space velocity for the current frame,
/// and any consumer reads it. The accessors are source-agnostic.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct VelocityField {
    pub frame_id: i32,
    pub samples: HashMap<SourceId, VelocitySample>,
    runtime: EntityRuntimeSlot,
}

pub fn create_velocity_field() -> VelocityField {
    let mut out: VelocityField = allocate_entity();
    initialize_velocity_field(&mut out);
    return out;
}

pub fn initialize_velocity_field(out: &mut VelocityField) {
    out.frame_id = 0;
    out.samples = HashMap::new();
}

/// Adds velocity contributions: `out = a + b`.
pub fn add_velocity(out: &mut Velocity2D, a: &Velocity2D, b: &Velocity2D) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + bx;
    out.y = ay + by;
}

pub fn begin_velocity_frame(field: &mut VelocityField) {
    field.frame_id += 1;
}

/// Clamps velocity to `max_length` (alias-safe: `out` may equal `velocity`).
/// The most common motion-blur safety helper -- prevents runaway blur lengths
/// on fast objects.
pub fn clamp_velocity(out: &mut Velocity2D, velocity: &Velocity2D, max_length: f32) {
    let vx = velocity.x;
    let vy = velocity.y;
    let len_sq = vx * vx + vy * vy;
    let max_sq = max_length * max_length;
    if len_sq > max_sq && len_sq > 0.0 {
        let scale = max_length / len_sq.sqrt();
        out.x = vx * scale;
        out.y = vy * scale;
    } else {
        out.x = vx;
        out.y = vy;
    }
}

pub fn clone_velocity2d(source: &Velocity2D) -> Velocity2D {
    return Velocity2D {
        x: source.x,
        y: source.y,
    };
}

pub fn contribute_velocity(field: &mut VelocityField, source: SourceId, x: f32, y: f32) {
    let frame_id = field.frame_id;
    let sample = ensure_velocity_sample(field, source);
    sample.velocity.x = x;
    sample.velocity.y = y;
    sample.last_frame_id = frame_id;
    sample.explicit_frame_id = frame_id;
}

/// Copies one velocity value into another (alias-safe: out may equal source).
pub fn copy_velocity(out: &mut Velocity2D, source: &Velocity2D) {
    let sx = source.x;
    let sy = source.y;
    out.x = sx;
    out.y = sy;
}

/// Exponential moving average (EMA) of velocity across frames. Useful for
/// jitter-free motion buffers. `factor` in (0, 1]: 1 = no smoothing (current
/// wins), 0.1 = heavy smoothing (previous dominates). Alias-safe: `out` may
/// equal `current` or `previous`.
pub fn damp_velocity(
    out: &mut Velocity2D,
    current: &Velocity2D,
    previous: &Velocity2D,
    factor: f32,
) {
    let cx = current.x;
    let cy = current.y;
    let px = previous.x;
    let py = previous.y;
    out.x = cx * factor + px * (1.0 - factor);
    out.y = cy * factor + py * (1.0 - factor);
}

/// Get-or-create a source's per-frame sample. Shared with the transform-delta
/// contributor.
pub fn ensure_velocity_sample(field: &mut VelocityField, source: SourceId) -> &mut VelocitySample {
    return field
        .samples
        .entry(source)
        .or_insert_with(|| VelocitySample {
            previous_world_transform: None,
            velocity: Velocity2D { x: 0.0, y: 0.0 },
            last_frame_id: -1,
            explicit_frame_id: -1,
        });
}

pub fn explain_velocity(field: &VelocityField, source: SourceId) -> VelocityExplanation {
    let current_frame_id = field.frame_id;
    let sample = field.samples.get(&source);
    return match sample {
        None => VelocityExplanation {
            current_frame_id: current_frame_id,
            explicit: false,
            last_frame_id: -1,
            reason: VelocityReason::NoSample,
            x: 0.0,
            y: 0.0,
        },
        Some(sample) => {
            if sample.last_frame_id != current_frame_id {
                return VelocityExplanation {
                    current_frame_id: current_frame_id,
                    explicit: false,
                    last_frame_id: sample.last_frame_id,
                    reason: VelocityReason::Stale,
                    x: 0.0,
                    y: 0.0,
                };
            }
            let explicit = sample.explicit_frame_id == current_frame_id;
            let x = sample.velocity.x;
            let y = sample.velocity.y;
            if x == 0.0 && y == 0.0 {
                let reason = if explicit {
                    VelocityReason::ExplicitZero
                } else {
                    VelocityReason::DerivedZero
                };
                return VelocityExplanation {
                    current_frame_id: current_frame_id,
                    explicit: explicit,
                    last_frame_id: sample.last_frame_id,
                    reason: reason,
                    x: 0.0,
                    y: 0.0,
                };
            }
            VelocityExplanation {
                current_frame_id: current_frame_id,
                explicit: explicit,
                last_frame_id: sample.last_frame_id,
                reason: VelocityReason::Ok,
                x: x,
                y: y,
            }
        }
    };
}

/// Writes the source's current-frame velocity into `out`. Returns zero
/// velocity for sources with no sample or whose sample is stale (not touched
/// this frame).
pub fn get_velocity(field: &VelocityField, source: SourceId, out: &mut Velocity2D) {
    let sample = field.samples.get(&source);
    match sample {
        Some(sample) if sample.last_frame_id == field.frame_id => {
            out.x = sample.velocity.x;
            out.y = sample.velocity.y;
        }
        _ => {
            out.x = 0.0;
            out.y = 0.0;
        }
    }
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS VelocityExplanation reason union; @flighthq/types exports the union only
pub fn get_velocity_reason_string(value: VelocityReason) -> &'static str {
    return match value {
        VelocityReason::NoSample => "no-sample",
        VelocityReason::Stale => "stale",
        VelocityReason::ExplicitZero => "explicit-zero",
        VelocityReason::DerivedZero => "derived-zero",
        VelocityReason::Ok => "ok",
    };
}

pub fn has_velocity(field: &VelocityField, source: SourceId) -> bool {
    let sample = field.samples.get(&source);
    return match sample {
        Some(sample) => {
            sample.last_frame_id == field.frame_id
                && (sample.velocity.x != 0.0 || sample.velocity.y != 0.0)
        }
        None => false,
    };
}

/// Returns true if the velocity vector's magnitude is within `epsilon` of zero.
/// Useful for skipping velocity-buffer writes on effectively-still objects.
pub fn is_velocity_zero(velocity: &Velocity2D, epsilon: Option<f32>) -> bool {
    let epsilon = epsilon.unwrap_or(0.0);
    return velocity.x.abs() <= epsilon && velocity.y.abs() <= epsilon;
}

/// Returns the magnitude (length) of the velocity vector.
pub fn length_of_velocity(velocity: &Velocity2D) -> f32 {
    return (velocity.x * velocity.x + velocity.y * velocity.y).sqrt();
}

/// Linearly interpolates between two velocity values. Alias-safe: `out` may
/// equal `a` or `b`.
pub fn lerp_velocity(out: &mut Velocity2D, a: &Velocity2D, b: &Velocity2D, t: f32) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + (bx - ax) * t;
    out.y = ay + (by - ay) * t;
}

/// Normalizes the velocity vector to unit length. Returns the zero vector when
/// length is zero. Alias-safe: `out` may equal `source`.
pub fn normalize_velocity(out: &mut Velocity2D, source: &Velocity2D) {
    let sx = source.x;
    let sy = source.y;
    let len = (sx * sx + sy * sy).sqrt();
    if len > 0.0 {
        let inv = 1.0 / len;
        out.x = sx * inv;
        out.y = sy * inv;
    } else {
        out.x = 0.0;
        out.y = 0.0;
    }
}

/// Scales a velocity by a scalar factor. Used for pixel-ratio conversion and
/// unit normalization. Alias-safe: `out` may equal `velocity`.
// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS VelocityExplanation reason union; @flighthq/types exports the union only
pub fn parse_velocity_reason(value: &str) -> Option<VelocityReason> {
    return match value {
        "no-sample" => Some(VelocityReason::NoSample),
        "stale" => Some(VelocityReason::Stale),
        "explicit-zero" => Some(VelocityReason::ExplicitZero),
        "derived-zero" => Some(VelocityReason::DerivedZero),
        "ok" => Some(VelocityReason::Ok),
        _ => None,
    };
}

pub fn scale_velocity(out: &mut Velocity2D, velocity: &Velocity2D, scale: f32) {
    let vx = velocity.x;
    let vy = velocity.y;
    out.x = vx * scale;
    out.y = vy * scale;
}

/// Subtracts `b` from `a`: `out = a - b`. Alias-safe.
pub fn subtract_velocity(out: &mut Velocity2D, a: &Velocity2D, b: &Velocity2D) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax - bx;
    out.y = ay - by;
}

/// Zeroes a source's velocity this frame -- a teleport/cut that must not smear.
pub fn suppress_velocity(field: &mut VelocityField, source: SourceId) {
    contribute_velocity(field, source, 0.0, 0.0);
}

/// Sets both components to zero.
pub fn zero_velocity(out: &mut Velocity2D) {
    out.x = 0.0;
    out.y = 0.0;
}

impl Default for VelocityReason {
    fn default() -> Self {
        return VelocityReason::NoSample;
    }
}

impl Velocity2D {
    pub fn add(&self, other: &Self) -> Self {
        let mut out = Self::default();
        add_velocity(&mut out, self, other);
        return out;
    }

    pub fn clamped(&self, max_length: f32) -> Self {
        let mut out = Self::default();
        clamp_velocity(&mut out, self, max_length);
        return out;
    }

    pub fn damped(&self, previous: &Self, factor: f32) -> Self {
        let mut out = Self::default();
        damp_velocity(&mut out, self, previous, factor);
        return out;
    }

    pub fn is_zero(&self, epsilon: Option<f32>) -> bool {
        return is_velocity_zero(self, epsilon);
    }

    pub fn length(&self) -> f32 {
        return length_of_velocity(self);
    }

    pub fn lerp(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        lerp_velocity(&mut out, self, other, t);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_velocity(&mut out, self);
        return out;
    }

    pub fn scaled(&self, scale: f32) -> Self {
        let mut out = Self::default();
        scale_velocity(&mut out, self, scale);
        return out;
    }

    pub fn subtracted(&self, other: &Self) -> Self {
        let mut out = Self::default();
        subtract_velocity(&mut out, self, other);
        return out;
    }
}

impl VelocityField {
    pub fn new() -> Self {
        return create_velocity_field();
    }
}

flight_entity::impl_entity!(VelocityField);
