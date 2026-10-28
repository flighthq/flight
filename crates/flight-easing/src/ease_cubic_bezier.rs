use std::sync::Arc;

use crate::EasingFunction;

/// Returns an easing function for the CSS cubic-bezier curve whose control
/// points are P1=(x1,y1) and P2=(x2,y2); the endpoints are fixed at (0,0) and
/// (1,1). The returned function maps an input progress `t` (interpreted as the
/// curve's x) to the curve's y.
pub fn ease_cubic_bezier(x1: f32, y1: f32, x2: f32, y2: f32) -> EasingFunction {
    let cx = 3.0 * x1;
    let bx = 3.0 * (x2 - x1) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;

    return Arc::new(move |t: f32| -> f32 {
        if t <= 0.0 {
            return 0.0;
        }
        if t >= 1.0 {
            return 1.0;
        }
        return sample_y(ay, by, cy, solve_parameter_for_x(ax, bx, cx, t, 1e-7));
    });
}

fn sample_derivative_x(ax: f32, bx: f32, cx: f32, s: f32) -> f32 {
    return (3.0 * ax * s + 2.0 * bx) * s + cx;
}

fn sample_x(ax: f32, bx: f32, cx: f32, s: f32) -> f32 {
    return ((ax * s + bx) * s + cx) * s;
}

fn sample_y(ay: f32, by: f32, cy: f32, s: f32) -> f32 {
    return ((ay * s + by) * s + cy) * s;
}

fn solve_parameter_for_x(ax: f32, bx: f32, cx: f32, x: f32, epsilon: f32) -> f32 {
    let mut s = x;
    for _ in 0..8 {
        let x_error = sample_x(ax, bx, cx, s) - x;
        if x_error.abs() < epsilon {
            return s;
        }
        let derivative = sample_derivative_x(ax, bx, cx, s);
        if derivative.abs() < 1e-6 {
            break;
        }
        s -= x_error / derivative;
    }
    let mut low = 0.0_f32;
    let mut high = 1.0_f32;
    s = x;
    if s < low {
        return low;
    }
    if s > high {
        return high;
    }
    while low < high {
        let sampled = sample_x(ax, bx, cx, s);
        if (sampled - x).abs() < epsilon {
            return s;
        }
        if x > sampled {
            low = s;
        } else {
            high = s;
        }
        s = (high - low) * 0.5 + low;
    }
    return s;
}
