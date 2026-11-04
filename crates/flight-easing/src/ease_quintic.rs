/// Ease-in-out quintic: slow start and end.
pub fn ease_in_out_quintic(t: f32) -> f32 {
    if t < 0.5 {
        return 16.0 * t * t * t * t * t;
    }
    return 1.0 - (-2.0 * t + 2.0).powi(5) / 2.0;
}

/// Ease-in quintic: slow start, accelerating.
pub fn ease_in_quintic(t: f32) -> f32 {
    return t * t * t * t * t;
}

/// Ease-out quintic: fast start, decelerating.
pub fn ease_out_quintic(t: f32) -> f32 {
    return 1.0 - (1.0 - t).powi(5);
}
