/// Ease-in cubic: slow start, accelerating.
pub fn ease_in_cubic(t: f32) -> f32 {
    return t * t * t;
}

/// Ease-in-out cubic: slow start and end.
pub fn ease_in_out_cubic(t: f32) -> f32 {
    if t < 0.5 {
        return 4.0 * t * t * t;
    }
    return 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0;
}

/// Ease-out cubic: fast start, decelerating.
pub fn ease_out_cubic(t: f32) -> f32 {
    return 1.0 - (1.0 - t).powi(3);
}
