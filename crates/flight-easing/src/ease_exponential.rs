/// Ease-in exponential: very slow start, then rapid acceleration.
pub fn ease_in_exponential(t: f32) -> f32 {
    if t == 0.0 {
        return 0.0;
    }
    return 2.0_f32.powf(10.0 * t - 10.0);
}

/// Ease-in-out exponential: exponential acceleration and deceleration.
pub fn ease_in_out_exponential(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    if t < 0.5 {
        return 2.0_f32.powf(20.0 * t - 10.0) / 2.0;
    }
    return (2.0 - 2.0_f32.powf(-20.0 * t + 10.0)) / 2.0;
}

/// Ease-out exponential: fast start, then rapid deceleration.
pub fn ease_out_exponential(t: f32) -> f32 {
    if t == 1.0 {
        return 1.0;
    }
    return 1.0 - 2.0_f32.powf(-10.0 * t);
}
