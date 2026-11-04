/// Ease-in-out quartic: slow start and end.
pub fn ease_in_out_quartic(t: f32) -> f32 {
    if t < 0.5 {
        return 8.0 * t * t * t * t;
    }
    return 1.0 - (-2.0 * t + 2.0).powi(4) / 2.0;
}

/// Ease-in quartic: slow start, accelerating.
pub fn ease_in_quartic(t: f32) -> f32 {
    return t * t * t * t;
}

/// Ease-out quartic: fast start, decelerating.
pub fn ease_out_quartic(t: f32) -> f32 {
    return 1.0 - (1.0 - t).powi(4);
}
