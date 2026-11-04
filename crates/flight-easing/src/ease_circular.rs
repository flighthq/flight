/// Ease-in circular: slow start with a circular arc.
pub fn ease_in_circular(t: f32) -> f32 {
    return 1.0 - (1.0 - t * t).sqrt();
}

/// Ease-in-out circular: circular arc at both ends.
pub fn ease_in_out_circular(t: f32) -> f32 {
    if t < 0.5 {
        return (1.0 - (1.0 - 4.0 * t * t).sqrt()) / 2.0;
    }
    return ((1.0 - (-2.0 * t + 2.0).powi(2)).sqrt() + 1.0) / 2.0;
}

/// Ease-out circular: fast start with a circular arc.
pub fn ease_out_circular(t: f32) -> f32 {
    return (1.0 - (t - 1.0) * (t - 1.0)).sqrt();
}
