/// A two-dimensional velocity value.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Velocity2D {
    pub x: f32,
    pub y: f32,
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

/// Clones a `Velocity2D` value (D23 value type: copy and clone).
pub fn clone_velocity2d(source: &Velocity2D) -> Velocity2D {
    return Velocity2D {
        x: source.x,
        y: source.y,
    };
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

/// Sets both components to zero.
pub fn zero_velocity(out: &mut Velocity2D) {
    out.x = 0.0;
    out.y = 0.0;
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
