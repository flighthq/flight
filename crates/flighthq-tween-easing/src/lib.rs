//! Easing functions for animation.
//!
//! Each function maps `t` in `[0.0, 1.0]` to an eased value, with
//! `f(0.0) == 0.0` and `f(1.0) == 1.0`.

use std::f32::consts::PI;

/// A function that maps a normalized time `t` in `[0.0, 1.0]` to an eased value.
pub type EasingFn = fn(f32) -> f32;

// Back easing constants.
const BACK_S: f32 = 1.70158;
const BACK_S2: f32 = BACK_S * 1.525;

// Elastic easing constants.
const ELASTIC_P: f32 = 0.4;
const ELASTIC_P2: f32 = 0.45;
// s = (p / (2 * PI)) * asin(1) = p / 4
const ELASTIC_S: f32 = ELASTIC_P / 4.0;
const ELASTIC_S2: f32 = ELASTIC_P2 / 4.0;

// ---------------------------------------------------------------------------
// Back
// ---------------------------------------------------------------------------

/// Back ease-in: overshoots slightly before settling at the target.
pub fn ease_in_back(t: f32) -> f32 {
    t * t * ((BACK_S + 1.0) * t - BACK_S)
}

/// Back ease-in-out: overshoots on both ends.
pub fn ease_in_out_back(mut t: f32) -> f32 {
    t *= 2.0;
    if t < 1.0 {
        0.5 * (t * t * ((BACK_S2 + 1.0) * t - BACK_S2))
    } else {
        t -= 2.0;
        0.5 * (t * t * ((BACK_S2 + 1.0) * t + BACK_S2) + 2.0)
    }
}

/// Back ease-out: overshoots slightly past the target then returns.
pub fn ease_out_back(mut t: f32) -> f32 {
    t -= 1.0;
    t * t * ((BACK_S + 1.0) * t + BACK_S) + 1.0
}

// ---------------------------------------------------------------------------
// Bounce
// ---------------------------------------------------------------------------

fn bounce_out(mut t: f32) -> f32 {
    if t < 1.0 / 2.75 {
        7.5625 * t * t
    } else if t < 2.0 / 2.75 {
        t -= 1.5 / 2.75;
        7.5625 * t * t + 0.75
    } else if t < 2.5 / 2.75 {
        t -= 2.25 / 2.75;
        7.5625 * t * t + 0.9375
    } else {
        t -= 2.625 / 2.75;
        7.5625 * t * t + 0.984375
    }
}

/// Bounce ease-in: bounces at the start.
pub fn ease_in_bounce(t: f32) -> f32 {
    1.0 - bounce_out(1.0 - t)
}

/// Bounce ease-in-out: bounces at both ends.
pub fn ease_in_out_bounce(t: f32) -> f32 {
    if t < 0.5 {
        (1.0 - bounce_out(1.0 - 2.0 * t)) / 2.0
    } else {
        (1.0 + bounce_out(2.0 * t - 1.0)) / 2.0
    }
}

/// Bounce ease-out: bounces at the end.
pub fn ease_out_bounce(t: f32) -> f32 {
    bounce_out(t)
}

// ---------------------------------------------------------------------------
// Cubic
// ---------------------------------------------------------------------------

/// Cubic ease-in: accelerates from zero velocity.
pub fn ease_in_cubic(t: f32) -> f32 {
    t * t * t
}

/// Cubic ease-in-out: accelerates then decelerates.
pub fn ease_in_out_cubic(t: f32) -> f32 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0_f32).powi(3) / 2.0
    }
}

/// Cubic ease-out: decelerates to zero velocity.
pub fn ease_out_cubic(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(3)
}

// ---------------------------------------------------------------------------
// Elastic
// ---------------------------------------------------------------------------

/// Elastic ease-in: oscillates at the start like a spring.
pub fn ease_in_elastic(mut t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    t -= 1.0;
    -(2.0_f32.powf(10.0 * t) * ((t - ELASTIC_S) * (2.0 * PI) / ELASTIC_P).sin())
}

/// Elastic ease-in-out: oscillates at both ends like a spring.
pub fn ease_in_out_elastic(mut t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    t *= 2.0;
    if t < 1.0 {
        t -= 1.0;
        -0.5 * (2.0_f32.powf(10.0 * t) * ((t - ELASTIC_S2) * (2.0 * PI) / ELASTIC_P2).sin())
    } else {
        t -= 1.0;
        0.5 * 2.0_f32.powf(-10.0 * t) * ((t - ELASTIC_S2) * (2.0 * PI) / ELASTIC_P2).sin() + 1.0
    }
}

/// Elastic ease-out: oscillates at the end like a spring.
pub fn ease_out_elastic(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    2.0_f32.powf(-10.0 * t) * ((t - ELASTIC_S) * (2.0 * PI) / ELASTIC_P).sin() + 1.0
}

// ---------------------------------------------------------------------------
// Expo
// ---------------------------------------------------------------------------

/// Exponential ease-in: accelerates sharply from zero.
pub fn ease_in_expo(t: f32) -> f32 {
    if t == 0.0 {
        0.0
    } else {
        2.0_f32.powf(10.0 * t - 10.0)
    }
}

/// Exponential ease-in-out: sharp acceleration then deceleration.
pub fn ease_in_out_expo(t: f32) -> f32 {
    if t == 0.0 || t == 1.0 {
        return t;
    }
    if t < 0.5 {
        2.0_f32.powf(20.0 * t - 10.0) / 2.0
    } else {
        (2.0 - 2.0_f32.powf(-20.0 * t + 10.0)) / 2.0
    }
}

/// Exponential ease-out: decelerates sharply to zero.
pub fn ease_out_expo(t: f32) -> f32 {
    if t == 1.0 {
        1.0
    } else {
        1.0 - 2.0_f32.powf(-10.0 * t)
    }
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

/// Linear: no easing, constant velocity.
pub fn linear(t: f32) -> f32 {
    t
}

// ---------------------------------------------------------------------------
// Quad
// ---------------------------------------------------------------------------

/// Quadratic ease-in: accelerates from zero velocity.
pub fn ease_in_quad(t: f32) -> f32 {
    t * t
}

/// Quadratic ease-in-out: accelerates then decelerates.
pub fn ease_in_out_quad(t: f32) -> f32 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0_f32).powi(2) / 2.0
    }
}

/// Quadratic ease-out: decelerates to zero velocity.
pub fn ease_out_quad(t: f32) -> f32 {
    t * (2.0 - t)
}

// ---------------------------------------------------------------------------
// Quart
// ---------------------------------------------------------------------------

/// Quartic ease-in: accelerates from zero velocity.
pub fn ease_in_quart(t: f32) -> f32 {
    t * t * t * t
}

/// Quartic ease-in-out: accelerates then decelerates.
pub fn ease_in_out_quart(t: f32) -> f32 {
    if t < 0.5 {
        8.0 * t * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0_f32).powi(4) / 2.0
    }
}

/// Quartic ease-out: decelerates to zero velocity.
pub fn ease_out_quart(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(4)
}

// ---------------------------------------------------------------------------
// Quint
// ---------------------------------------------------------------------------

/// Quintic ease-in: accelerates from zero velocity.
pub fn ease_in_quint(t: f32) -> f32 {
    t * t * t * t * t
}

/// Quintic ease-in-out: accelerates then decelerates.
pub fn ease_in_out_quint(t: f32) -> f32 {
    if t < 0.5 {
        16.0 * t * t * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0_f32).powi(5) / 2.0
    }
}

/// Quintic ease-out: decelerates to zero velocity.
pub fn ease_out_quint(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(5)
}

// ---------------------------------------------------------------------------
// Sine
// ---------------------------------------------------------------------------

/// Sine ease-in: accelerates from zero based on a sine curve.
pub fn ease_in_sine(t: f32) -> f32 {
    1.0 - (t * PI / 2.0).cos()
}

/// Sine ease-in-out: smooth acceleration and deceleration using a sine curve.
pub fn ease_in_out_sine(t: f32) -> f32 {
    -((PI * t).cos() - 1.0) / 2.0
}

/// Sine ease-out: decelerates to zero based on a sine curve.
pub fn ease_out_sine(t: f32) -> f32 {
    (t * PI / 2.0).sin()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f32 = 1e-5;

    fn assert_approx(a: f32, b: f32) {
        assert!((a - b).abs() < EPSILON, "expected {b} but got {a}");
    }

    #[test]
    fn test_ease_in_back() {
        assert_approx(ease_in_back(0.0), 0.0);
        assert_approx(ease_in_back(1.0), 1.0);
        // midpoint overshoots negative
        let mid = ease_in_back(0.5);
        assert!(mid < 0.5, "expected undershoot at midpoint, got {mid}");
    }

    #[test]
    fn test_ease_in_out_back() {
        assert_approx(ease_in_out_back(0.0), 0.0);
        assert_approx(ease_in_out_back(1.0), 1.0);
        assert_approx(ease_in_out_back(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_back() {
        assert_approx(ease_out_back(0.0), 0.0);
        assert_approx(ease_out_back(1.0), 1.0);
        // midpoint overshoots past 0.5
        let mid = ease_out_back(0.5);
        assert!(mid > 0.5, "expected overshoot at midpoint, got {mid}");
    }

    #[test]
    fn test_ease_in_bounce() {
        assert_approx(ease_in_bounce(0.0), 0.0);
        assert_approx(ease_in_bounce(1.0), 1.0);
        let mid = ease_in_bounce(0.5);
        assert!(mid < 0.5, "expected bounce-in below 0.5, got {mid}");
    }

    #[test]
    fn test_ease_in_out_bounce() {
        assert_approx(ease_in_out_bounce(0.0), 0.0);
        assert_approx(ease_in_out_bounce(1.0), 1.0);
        assert_approx(ease_in_out_bounce(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_bounce() {
        assert_approx(ease_out_bounce(0.0), 0.0);
        assert_approx(ease_out_bounce(1.0), 1.0);
        let mid = ease_out_bounce(0.5);
        assert!(mid > 0.5, "expected bounce-out above 0.5, got {mid}");
    }

    #[test]
    fn test_ease_in_cubic() {
        assert_approx(ease_in_cubic(0.0), 0.0);
        assert_approx(ease_in_cubic(1.0), 1.0);
        assert_approx(ease_in_cubic(0.5), 0.125);
    }

    #[test]
    fn test_ease_in_out_cubic() {
        assert_approx(ease_in_out_cubic(0.0), 0.0);
        assert_approx(ease_in_out_cubic(1.0), 1.0);
        assert_approx(ease_in_out_cubic(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_cubic() {
        assert_approx(ease_out_cubic(0.0), 0.0);
        assert_approx(ease_out_cubic(1.0), 1.0);
        assert_approx(ease_out_cubic(0.5), 0.875);
    }

    #[test]
    fn test_ease_in_elastic() {
        assert_approx(ease_in_elastic(0.0), 0.0);
        assert_approx(ease_in_elastic(1.0), 1.0);
        // midpoint is non-trivial — just verify it runs
        let _ = ease_in_elastic(0.5);
    }

    #[test]
    fn test_ease_in_out_elastic() {
        assert_approx(ease_in_out_elastic(0.0), 0.0);
        assert_approx(ease_in_out_elastic(1.0), 1.0);
        let _ = ease_in_out_elastic(0.5);
    }

    #[test]
    fn test_ease_out_elastic() {
        assert_approx(ease_out_elastic(0.0), 0.0);
        assert_approx(ease_out_elastic(1.0), 1.0);
        let _ = ease_out_elastic(0.5);
    }

    #[test]
    fn test_ease_in_expo() {
        assert_approx(ease_in_expo(0.0), 0.0);
        assert_approx(ease_in_expo(1.0), 1.0);
        let mid = ease_in_expo(0.5);
        assert!(mid < 0.5, "expected slow start, got {mid}");
    }

    #[test]
    fn test_ease_in_out_expo() {
        assert_approx(ease_in_out_expo(0.0), 0.0);
        assert_approx(ease_in_out_expo(1.0), 1.0);
        assert_approx(ease_in_out_expo(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_expo() {
        assert_approx(ease_out_expo(0.0), 0.0);
        assert_approx(ease_out_expo(1.0), 1.0);
        let mid = ease_out_expo(0.5);
        assert!(mid > 0.5, "expected fast start, got {mid}");
    }

    #[test]
    fn test_linear() {
        assert_approx(linear(0.0), 0.0);
        assert_approx(linear(1.0), 1.0);
        assert_approx(linear(0.5), 0.5);
        assert_approx(linear(0.25), 0.25);
    }

    #[test]
    fn test_ease_in_quad() {
        assert_approx(ease_in_quad(0.0), 0.0);
        assert_approx(ease_in_quad(1.0), 1.0);
        assert_approx(ease_in_quad(0.5), 0.25);
    }

    #[test]
    fn test_ease_in_out_quad() {
        assert_approx(ease_in_out_quad(0.0), 0.0);
        assert_approx(ease_in_out_quad(1.0), 1.0);
        assert_approx(ease_in_out_quad(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_quad() {
        assert_approx(ease_out_quad(0.0), 0.0);
        assert_approx(ease_out_quad(1.0), 1.0);
        assert_approx(ease_out_quad(0.5), 0.75);
    }

    #[test]
    fn test_ease_in_quart() {
        assert_approx(ease_in_quart(0.0), 0.0);
        assert_approx(ease_in_quart(1.0), 1.0);
        assert_approx(ease_in_quart(0.5), 0.0625);
    }

    #[test]
    fn test_ease_in_out_quart() {
        assert_approx(ease_in_out_quart(0.0), 0.0);
        assert_approx(ease_in_out_quart(1.0), 1.0);
        assert_approx(ease_in_out_quart(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_quart() {
        assert_approx(ease_out_quart(0.0), 0.0);
        assert_approx(ease_out_quart(1.0), 1.0);
        assert_approx(ease_out_quart(0.5), 0.9375);
    }

    #[test]
    fn test_ease_in_quint() {
        assert_approx(ease_in_quint(0.0), 0.0);
        assert_approx(ease_in_quint(1.0), 1.0);
        assert_approx(ease_in_quint(0.5), 0.03125);
    }

    #[test]
    fn test_ease_in_out_quint() {
        assert_approx(ease_in_out_quint(0.0), 0.0);
        assert_approx(ease_in_out_quint(1.0), 1.0);
        assert_approx(ease_in_out_quint(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_quint() {
        assert_approx(ease_out_quint(0.0), 0.0);
        assert_approx(ease_out_quint(1.0), 1.0);
        assert_approx(ease_out_quint(0.5), 0.96875);
    }

    #[test]
    fn test_ease_in_sine() {
        assert_approx(ease_in_sine(0.0), 0.0);
        assert_approx(ease_in_sine(1.0), 1.0);
        let mid = ease_in_sine(0.5);
        assert!(mid < 0.5, "expected slow start, got {mid}");
    }

    #[test]
    fn test_ease_in_out_sine() {
        assert_approx(ease_in_out_sine(0.0), 0.0);
        assert_approx(ease_in_out_sine(1.0), 1.0);
        assert_approx(ease_in_out_sine(0.5), 0.5);
    }

    #[test]
    fn test_ease_out_sine() {
        assert_approx(ease_out_sine(0.0), 0.0);
        assert_approx(ease_out_sine(1.0), 1.0);
        let mid = ease_out_sine(0.5);
        assert!(mid > 0.5, "expected fast start, got {mid}");
    }

    #[test]
    fn test_easing_fn_type() {
        // Verify that named functions are assignable to EasingFn.
        let _: EasingFn = linear;
        let _: EasingFn = ease_in_back;
        let _: EasingFn = ease_out_back;
        let _: EasingFn = ease_in_out_back;
        let _: EasingFn = ease_in_bounce;
        let _: EasingFn = ease_out_bounce;
        let _: EasingFn = ease_in_out_bounce;
        let _: EasingFn = ease_in_cubic;
        let _: EasingFn = ease_out_cubic;
        let _: EasingFn = ease_in_out_cubic;
        let _: EasingFn = ease_in_elastic;
        let _: EasingFn = ease_out_elastic;
        let _: EasingFn = ease_in_out_elastic;
        let _: EasingFn = ease_in_expo;
        let _: EasingFn = ease_out_expo;
        let _: EasingFn = ease_in_out_expo;
        let _: EasingFn = ease_in_quad;
        let _: EasingFn = ease_out_quad;
        let _: EasingFn = ease_in_out_quad;
        let _: EasingFn = ease_in_quart;
        let _: EasingFn = ease_out_quart;
        let _: EasingFn = ease_in_out_quart;
        let _: EasingFn = ease_in_quint;
        let _: EasingFn = ease_out_quint;
        let _: EasingFn = ease_in_out_quint;
        let _: EasingFn = ease_in_sine;
        let _: EasingFn = ease_out_sine;
        let _: EasingFn = ease_in_out_sine;
    }
}
