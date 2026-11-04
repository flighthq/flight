/// Ease-in with overshoot: starts by pulling back before accelerating forward.
pub fn ease_in_back(t: f32) -> f32 {
    return t * t * ((S + 1.0) * t - S);
}

/// Ease-in-out with overshoot at both ends.
pub fn ease_in_out_back(t: f32) -> f32 {
    let t2 = t * 2.0;
    if t2 < 1.0 {
        return 0.5 * (t2 * t2 * ((S2 + 1.0) * t2 - S2));
    }
    let t2 = t2 - 2.0;
    return 0.5 * (t2 * t2 * ((S2 + 1.0) * t2 + S2) + 2.0);
}

/// Ease-out with overshoot: decelerates past the target before settling back.
pub fn ease_out_back(t: f32) -> f32 {
    let t = t - 1.0;
    return t * t * ((S + 1.0) * t + S) + 1.0;
}

const S: f32 = 1.70158;
const S2: f32 = 1.70158 * 1.525;
