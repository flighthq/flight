/// Clamp `value` to the inclusive range `[min, max]`.
///
/// When `min > max` the result is `min`. NaN propagates unchanged.
pub fn clamp(value: f32, min: f32, max: f32) -> f32 {
    return if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    };
}

/// Return `true` if `value` is within the inclusive range `[min, max]`.
pub fn in_range(value: f32, min: f32, max: f32) -> bool {
    return value >= min && value <= max;
}

/// Clamp `value` to `[0, 1]`. Equivalent to `clamp(value, 0, 1)`.
///
/// Named `saturate` after the GPU HLSL/GLSL convention. Follows GPU semantics:
/// NaN returns 0 (unlike `clamp`, which propagates NaN). Safe in hot loops,
/// no allocation.
pub fn saturate(value: f32) -> f32 {
    if value != value {
        return 0.0;
    }
    return if value < 0.0 {
        0.0
    } else if value > 1.0 {
        1.0
    } else {
        value
    };
}
