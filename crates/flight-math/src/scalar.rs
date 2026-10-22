use crate::next_power_of_two;
use crate::previous_power_of_two;

/// Round `n` up to the next power of two.
///
/// Alias for `next_power_of_two` — provided for clarity at texture-sizing call
/// sites where the direction is important.
pub fn ceil_power_of_two(n: i32) -> u32 {
    return next_power_of_two(n);
}

/// Round `n` down to the previous power of two.
///
/// Alias for `previous_power_of_two` — provided for clarity at texture-sizing
/// call sites where the direction is important.
pub fn floor_power_of_two(n: i32) -> u32 {
    return previous_power_of_two(n);
}

/// Quantize `value` into `steps` equal buckets over `[min, max]`.
///
/// Returns a value snapped to one of `steps + 1` evenly-spaced values between
/// `min` and `max`. When `steps <= 0` the result is `min`. When `min == max`
/// the result is `min`.
pub fn quantize(value: f32, steps: f32, min: f32, max: f32) -> f32 {
    if steps <= 0.0 || min == max {
        return min;
    }
    let t = (value - min) / (max - min);
    let clamped = if t < 0.0 {
        0.0
    } else if t > 1.0 {
        1.0
    } else {
        t
    };
    return min + ((clamped * steps).round() / steps) * (max - min);
}

/// Zero-aware sign: returns `1` for positive, `-1` for negative, `0` for zero.
pub fn sign(value: f32) -> f32 {
    return if value > 0.0 {
        1.0
    } else if value < 0.0 {
        -1.0
    } else {
        0.0
    };
}
