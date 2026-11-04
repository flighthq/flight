use std::f32::consts::PI;

/// Ease-in elastic: oscillates below zero before reaching the target.
pub fn ease_in_elastic(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    let time = t - 1.0;
    return -(2.0_f32.powf(10.0 * time) * ((time - S) * (2.0 * PI) / P).sin());
}

/// Ease-in-out elastic: oscillates at both ends.
pub fn ease_in_out_elastic(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    let t2 = t * 2.0;
    if t2 < 1.0 {
        let t2 = t2 - 1.0;
        return -0.5 * (2.0_f32.powf(10.0 * t2) * ((t2 - S2) * (2.0 * PI) / P2).sin());
    }
    let t2 = t2 - 1.0;
    return 0.5 * 2.0_f32.powf(-10.0 * t2) * ((t2 - S2) * (2.0 * PI) / P2).sin() + 1.0;
}

/// Ease-out elastic: overshoots past 1 and oscillates back.
pub fn ease_out_elastic(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    return 2.0_f32.powf(-10.0 * t) * ((t - S) * (2.0 * PI) / P).sin() + 1.0;
}

const P: f32 = 0.4;
const P2: f32 = 0.45;
// S = (P / (2*PI)) * asin(1) = (P / TAU) * (PI/2) = P / 4
const S: f32 = P / 4.0;
const S2: f32 = P2 / 4.0;
