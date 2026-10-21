use flight_entity::throw_range_error;

/// Return `value` ceiled to the nearest multiple of `step`.
///
/// `ceil_to(7.0, 5.0)` -> `10.0`. When `step <= 0` the result is `value`.
pub fn ceil_to(value: f32, step: f32) -> f32 {
    if step <= 0.0 {
        return value;
    }
    return (value / step).ceil() * step;
}

/// True non-negative modulo: `euclidean_mod(value, divisor)`.
///
/// Unlike Rust's `%` operator on floats, the result is always in `[0, divisor)`
/// regardless of the sign of `value`. Panics when `divisor == 0`.
pub fn euclidean_mod(value: f32, divisor: f32) -> f32 {
    if divisor == 0.0 {
        throw_range_error("euclideanMod: divisor must not be 0");
    }
    return ((value % divisor) + divisor) % divisor;
}

/// Return `value` floored to the nearest multiple of `step`.
///
/// `floor_to(7.0, 5.0)` -> `5.0`. When `step <= 0` the result is `value`.
pub fn floor_to(value: f32, step: f32) -> f32 {
    if step <= 0.0 {
        return value;
    }
    return (value / step).floor() * step;
}

/// Return the fractional part of `value` — the part after the decimal point.
///
/// Always returns a value in `[0, 1)` for positive inputs. For negative inputs
/// the sign is preserved (e.g. `fract(-1.3)` -> `-0.3`), mirroring GLSL `fract`.
pub fn fract(value: f32) -> f32 {
    return value - value.trunc();
}

/// Round `value` to the nearest multiple of `step`, with halfway ties away from zero.
///
/// `round_to(7.0, 5.0)` -> `5.0`; `round_to(8.0, 5.0)` -> `10.0`. When `step <= 0`
/// the result is `value`.
pub fn round_to(value: f32, step: f32) -> f32 {
    if step <= 0.0 {
        return value;
    }
    let magnitude = (value.abs() / step).round() * step;
    if magnitude == 0.0 {
        return 0.0;
    }
    return if value < 0.0 { -magnitude } else { magnitude };
}
