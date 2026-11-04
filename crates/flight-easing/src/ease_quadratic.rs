/// Ease-in-out quadratic: slow start and end.
pub fn ease_in_out_quadratic(t: f32) -> f32 {
    if t < 0.5 {
        return 2.0 * t * t;
    }
    return 1.0 - (-2.0 * t + 2.0).powi(2) / 2.0;
}

/// Ease-in quadratic: slow start, accelerating.
pub fn ease_in_quadratic(t: f32) -> f32 {
    return t * t;
}

/// Ease-out quadratic: fast start, decelerating.
pub fn ease_out_quadratic(t: f32) -> f32 {
    return t * (2.0 - t);
}
