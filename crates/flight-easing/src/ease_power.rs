use std::sync::Arc;

use crate::EasingFunction;

/// Returns an InOut-Power easing function for an arbitrary exponent.
/// The inflection point is always at (0.5, 0.5).
pub fn ease_in_out_power(exponent: f32) -> EasingFunction {
    return Arc::new(move |t: f32| -> f32 {
        if t < 0.5 {
            return (t * 2.0).powf(exponent) * 0.5;
        }
        return 1.0 - ((1.0 - t) * 2.0).powf(exponent) * 0.5;
    });
}

/// Returns an In-Power easing function for an arbitrary exponent.
pub fn ease_in_power(exponent: f32) -> EasingFunction {
    return Arc::new(move |t: f32| -> f32 {
        return t.powf(exponent);
    });
}

/// Returns an Out-Power easing function for an arbitrary exponent.
pub fn ease_out_power(exponent: f32) -> EasingFunction {
    return Arc::new(move |t: f32| -> f32 {
        return 1.0 - (1.0 - t).powf(exponent);
    });
}
