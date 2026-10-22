/// Return the `t` value that maps to `value` in the range `[a, b]`.
///
/// The inverse of `lerp`: `inverse_lerp(a, b, lerp(a, b, t)) == t` when
/// `a != b`. Returns `0` when `a == b` to avoid division by zero.
pub fn inverse_lerp(a: f32, b: f32, value: f32) -> f32 {
    let range = b - a;
    return if range == 0.0 {
        0.0
    } else {
        (value - a) / range
    };
}

/// Linearly interpolate between `a` and `b` by factor `t`.
///
/// `t = 0` returns `a`; `t = 1` returns `b`. `t` is not clamped — pass a
/// saturated `t` for clamped behaviour. Safe in hot loops, no allocation.
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

/// Linearly interpolate `value` from `[in_min, in_max]` into `[out_min, out_max]`.
///
/// Equivalent to `lerp(out_min, out_max, inverse_lerp(in_min, in_max, value))`.
/// Input range is not clamped. Returns `out_min` when `in_min == in_max`.
pub fn remap(value: f32, in_min: f32, in_max: f32, out_min: f32, out_max: f32) -> f32 {
    let in_range = in_max - in_min;
    if in_range == 0.0 {
        return out_min;
    }
    return out_min + ((value - in_min) / in_range) * (out_max - out_min);
}

/// Hermite interpolation between `edge0` and `edge1` with a smooth ease curve.
///
/// Returns 0 for `x <= edge0`, 1 for `x >= edge1`, and smoothly interpolates
/// in between using `3t^2 - 2t^3`. This is the same `smoothstep` found in GLSL.
pub fn smooth_step(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = (x - edge0) / (edge1 - edge0);
    let s = if t < 0.0 {
        0.0
    } else if t > 1.0 {
        1.0
    } else {
        t
    };
    return s * s * (3.0 - 2.0 * s);
}

/// Returns 0 if `x < edge`, otherwise 1. The scalar step function from GLSL.
pub fn step(edge: f32, x: f32) -> f32 {
    return if x < edge { 0.0 } else { 1.0 };
}
