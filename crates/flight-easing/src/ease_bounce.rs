fn bounce_out(t: f32) -> f32 {
    if t < 1.0 / 2.75 {
        return 7.5625 * t * t;
    }
    if t < 2.0 / 2.75 {
        let t = t - 1.5 / 2.75;
        return 7.5625 * t * t + 0.75;
    }
    if t < 2.5 / 2.75 {
        let t = t - 2.25 / 2.75;
        return 7.5625 * t * t + 0.9375;
    }
    let t = t - 2.625 / 2.75;
    return 7.5625 * t * t + 0.984375;
}

/// Ease-in bounce: slow bouncing start.
pub fn ease_in_bounce(t: f32) -> f32 {
    return 1.0 - bounce_out(1.0 - t);
}

/// Ease-in-out bounce: bounces at both ends.
pub fn ease_in_out_bounce(t: f32) -> f32 {
    if t < 0.5 {
        return (1.0 - bounce_out(1.0 - 2.0 * t)) / 2.0;
    }
    return (1.0 + bounce_out(2.0 * t - 1.0)) / 2.0;
}

/// Ease-out bounce: decelerating bounces toward the target.
pub fn ease_out_bounce(t: f32) -> f32 {
    return bounce_out(t);
}
