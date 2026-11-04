use std::f32::consts::PI;

/// Ease-in-out sine: sinusoidal acceleration and deceleration.
pub fn ease_in_out_sine(t: f32) -> f32 {
    return -((PI * t).cos() - 1.0) / 2.0;
}

/// Ease-in sine: sinusoidal slow start.
pub fn ease_in_sine(t: f32) -> f32 {
    return 1.0 - (t * PI / 2.0).cos();
}

/// Ease-out sine: sinusoidal fast start.
pub fn ease_out_sine(t: f32) -> f32 {
    return (t * PI / 2.0).sin();
}
