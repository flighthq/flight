//! Axis-aligned bounding rectangle of a [`Path`], including true bezier extrema.
//!
//! Quadratic extrema are found via the linear root of the first derivative. Cubic
//! extrema solve the quadratic `B'(t) = 0` per axis and include only roots in `(0, 1)`.

use flighthq_types::{Path, RectangleLike, path_command};

/// Evaluates a cubic bezier `B(t) = (1-t)^3*p0 + 3*(1-t)^2*t*p1 + 3*(1-t)*t^2*p2 + t^3*p3`.
fn eval_cubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let mt = 1.0 - t;
    mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3
}

/// Evaluates a quadratic bezier `B(t) = (1-t)^2*p0 + 2*(1-t)*t*p1 + t^2*p2`.
fn eval_quadratic(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let mt = 1.0 - t;
    mt * mt * p0 + 2.0 * mt * t * p1 + t * t * p2
}

/// Expands bounds with the extrema of a cubic bezier segment.
fn expand_cubic_bounds(
    x0: f32,
    y0: f32,
    c1x: f32,
    c1y: f32,
    c2x: f32,
    c2y: f32,
    x3: f32,
    y3: f32,
    min_x: &mut f32,
    min_y: &mut f32,
    max_x: &mut f32,
    max_y: &mut f32,
) {
    expand(
        *min_x, *min_y, *max_x, *max_y, x3, y3, min_x, min_y, max_x, max_y,
    );
    cubic_extremum_roots(x0, c1x, c2x, x3, |t| {
        let ex = eval_cubic(x0, c1x, c2x, x3, t);
        let ey = eval_cubic(y0, c1y, c2y, y3, t);
        expand(
            *min_x, *min_y, *max_x, *max_y, ex, ey, min_x, min_y, max_x, max_y,
        );
    });
    cubic_extremum_roots(y0, c1y, c2y, y3, |t| {
        let ex = eval_cubic(x0, c1x, c2x, x3, t);
        let ey = eval_cubic(y0, c1y, c2y, y3, t);
        expand(
            *min_x, *min_y, *max_x, *max_y, ex, ey, min_x, min_y, max_x, max_y,
        );
    });
}

/// Expands bounds with the extrema of a quadratic bezier segment.
fn expand_quadratic_bounds(
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x2: f32,
    y2: f32,
    min_x: &mut f32,
    min_y: &mut f32,
    max_x: &mut f32,
    max_y: &mut f32,
) {
    expand(
        *min_x, *min_y, *max_x, *max_y, x2, y2, min_x, min_y, max_x, max_y,
    );
    if let Some(tx) = quadratic_extremum_t(x0, cx, x2) {
        let ex = eval_quadratic(x0, cx, x2, tx);
        let ey = eval_quadratic(y0, cy, y2, tx);
        expand(
            *min_x, *min_y, *max_x, *max_y, ex, ey, min_x, min_y, max_x, max_y,
        );
    }
    if let Some(ty) = quadratic_extremum_t(y0, cy, y2) {
        let ex = eval_quadratic(x0, cx, x2, ty);
        let ey = eval_quadratic(y0, cy, y2, ty);
        expand(
            *min_x, *min_y, *max_x, *max_y, ex, ey, min_x, min_y, max_x, max_y,
        );
    }
}

/// Computes the axis-aligned bounding rectangle of `path` including true bezier
/// extrema (not just the control-point hull). Writes the result into `out`.
///
/// Returns `true` if the path contains any geometry. Returns `false` and sets
/// `out` to a zero rectangle for an empty path.
pub fn get_path_bounds(path: &Path, out: &mut RectangleLike) -> bool {
    let commands = &path.commands;
    let data = &path.data;
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut x: f32 = 0.0;
    let mut y: f32 = 0.0;
    let mut di: usize = 0;

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == path_command::MOVE_TO {
            x = data[di];
            y = data[di + 1];
            di += 2;
            expand(
                min_x, min_y, max_x, max_y, x, y, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
        } else if command == path_command::WIDE_MOVE_TO {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            expand(
                min_x, min_y, max_x, max_y, x, y, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
        } else if command == path_command::LINE_TO {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            expand(
                min_x, min_y, max_x, max_y, nx, ny, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
            x = nx;
            y = ny;
        } else if command == path_command::WIDE_LINE_TO {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            expand(
                min_x, min_y, max_x, max_y, nx, ny, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
            x = nx;
            y = ny;
        } else if command == path_command::CURVE_TO {
            let cx = data[di];
            let cy = data[di + 1];
            let ax = data[di + 2];
            let ay = data[di + 3];
            di += 4;
            expand_quadratic_bounds(
                x, y, cx, cy, ax, ay, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
            x = ax;
            y = ay;
        } else if command == path_command::CUBIC_CURVE_TO {
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let ax = data[di + 4];
            let ay = data[di + 5];
            di += 6;
            expand_cubic_bounds(
                x, y, c1x, c1y, c2x, c2y, ax, ay, &mut min_x, &mut min_y, &mut max_x, &mut max_y,
            );
            x = ax;
            y = ay;
        }
        // CLOSE, NO_OP, and unrecognized verbs consume no data and do not affect bounds.
    }

    if min_x == f32::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return false;
    }
    out.x = min_x;
    out.y = min_y;
    out.width = max_x - min_x;
    out.height = max_y - min_y;
    true
}

/// Calls `cb` for each root `t` in `(0, 1)` of the cubic derivative `B'(t) = 0`
/// along one axis.
fn cubic_extremum_roots<F: FnMut(f32)>(p0: f32, p1: f32, p2: f32, p3: f32, mut cb: F) {
    let a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    let b = 2.0 * (p0 - 2.0 * p1 + p2);
    let c = p1 - p0;
    if a.abs() < 1e-12 {
        if b.abs() < 1e-12 {
            return;
        }
        let t = -c / b;
        if t > 0.0 && t < 1.0 {
            cb(t);
        }
        return;
    }
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return;
    }
    let sqrt_d = discriminant.sqrt();
    let t1 = (-b + sqrt_d) / (2.0 * a);
    let t2 = (-b - sqrt_d) / (2.0 * a);
    if t1 > 0.0 && t1 < 1.0 {
        cb(t1);
    }
    if t2 > 0.0 && t2 < 1.0 && (t2 - t1).abs() > 1e-12 {
        cb(t2);
    }
}

/// Inline bounds expansion.
fn expand(
    cur_min_x: f32,
    cur_min_y: f32,
    cur_max_x: f32,
    cur_max_y: f32,
    px: f32,
    py: f32,
    min_x: &mut f32,
    min_y: &mut f32,
    max_x: &mut f32,
    max_y: &mut f32,
) {
    *min_x = if px < cur_min_x { px } else { cur_min_x };
    *min_y = if py < cur_min_y { py } else { cur_min_y };
    *max_x = if px > cur_max_x { px } else { cur_max_x };
    *max_y = if py > cur_max_y { py } else { cur_max_y };
}

/// Returns `t` in `(0, 1)` at which the quadratic bezier coordinate reaches its
/// extremum, or `None` if the denominator is zero or `t` lies outside `(0, 1)`.
fn quadratic_extremum_t(p0: f32, p1: f32, p2: f32) -> Option<f32> {
    let denom = p0 - 2.0 * p1 + p2;
    if denom == 0.0 {
        return None;
    }
    let t = (p0 - p1) / denom;
    if t > 0.0 && t < 1.0 { Some(t) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{
        append_path_cubic_curve_to, append_path_line_to, append_path_move_to, create_path,
    };
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    // get_path_bounds
    #[test]
    fn get_path_bounds_empty_returns_false() {
        let p = create_path(PathWinding::NonZero);
        let mut out = RectangleLike::default();
        assert!(!get_path_bounds(&p, &mut out));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn get_path_bounds_rectangle() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 10.0, 20.0);
        append_path_line_to(&mut p, 110.0, 20.0);
        append_path_line_to(&mut p, 110.0, 70.0);
        append_path_line_to(&mut p, 10.0, 70.0);

        let mut out = RectangleLike::default();
        assert!(get_path_bounds(&p, &mut out));
        assert!(approx_eq(out.x, 10.0));
        assert!(approx_eq(out.y, 20.0));
        assert!(approx_eq(out.width, 100.0));
        assert!(approx_eq(out.height, 50.0));
    }

    #[test]
    fn get_path_bounds_cubic_includes_extrema() {
        // An S-curve that bulges beyond its endpoints.
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_cubic_curve_to(&mut p, 0.0, 100.0, 100.0, -100.0, 100.0, 0.0);

        let mut out = RectangleLike::default();
        assert!(get_path_bounds(&p, &mut out));
        // The curve bulges above y=0 and below y=0; bounds must include those extrema.
        assert!(out.y < 0.0, "min_y should be negative: {}", out.y);
        assert!(
            out.height > 50.0,
            "height should capture full extent: {}",
            out.height
        );
    }
}
