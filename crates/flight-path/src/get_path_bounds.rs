use flight_geometry::RectangleLike;

use crate::path::{Path, PathCommand};

#[cfg(test)]
mod sugar_tests {
    use flight_geometry::create_rectangle;

    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_bounds_matches_get_path_bounds() {
        let mut oa0 = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut ob0 = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let s = test_path();
        let ra = s.bounds(&mut oa0);
        let rb = get_path_bounds(&s, &mut ob0);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa0), format!("{:?}", ob0));
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// The running min/max extent of the points visited by the bounds pass.
struct BoundsAccumulator {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// The parameters in (0, 1) where one axis of a cubic bezier has a local extremum, in the order the
/// bounds pass visits them.
fn cubic_extremum_roots(p0: f64, p1: f64, p2: f64, p3: f64) -> Vec<f64> {
    let mut roots: Vec<f64> = Vec::new();
    let a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    let b = 2.0 * (p0 - 2.0 * p1 + p2);
    let c = p1 - p0;
    if a.abs() < 1e-12 {
        if b.abs() < 1e-12 {
            return roots;
        }
        let t = -c / b;
        if t > 0.0 && t < 1.0 {
            roots.push(t);
        }
        return roots;
    }
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return roots;
    }
    let sqrt_d = discriminant.sqrt();
    let t1 = (-b + sqrt_d) / (2.0 * a);
    let t2 = (-b - sqrt_d) / (2.0 * a);
    if t1 > 0.0 && t1 < 1.0 {
        roots.push(t1);
    }
    if t2 > 0.0 && t2 < 1.0 && (t2 - t1).abs() > 1e-12 {
        roots.push(t2);
    }
    return roots;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn eval_cubic(p0: f64, p1: f64, p2: f64, p3: f64, t: f64) -> f64 {
    let mt = 1.0 - t;
    return mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn eval_quadratic(p0: f64, p1: f64, p2: f64, t: f64) -> f64 {
    let mt = 1.0 - t;
    return mt * mt * p0 + 2.0 * mt * t * p1 + t * t * p2;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn expand_cubic_bounds(
    x0: f64,
    y0: f64,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x3: f64,
    y3: f64,
    bounds: &mut BoundsAccumulator,
) {
    expand_bounds(bounds, x3, y3);
    let x_roots = cubic_extremum_roots(x0, c1x, c2x, x3);
    for &t in &x_roots {
        expand_bounds(
            bounds,
            eval_cubic(x0, c1x, c2x, x3, t),
            eval_cubic(y0, c1y, c2y, y3, t),
        );
    }
    let y_roots = cubic_extremum_roots(y0, c1y, c2y, y3);
    for &t in &y_roots {
        expand_bounds(
            bounds,
            eval_cubic(x0, c1x, c2x, x3, t),
            eval_cubic(y0, c1y, c2y, y3, t),
        );
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn expand_bounds(bounds: &mut BoundsAccumulator, px: f64, py: f64) {
    if px < bounds.min_x {
        bounds.min_x = px;
    }
    if px > bounds.max_x {
        bounds.max_x = px;
    }
    if py < bounds.min_y {
        bounds.min_y = py;
    }
    if py > bounds.max_y {
        bounds.max_y = py;
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn expand_quadratic_bounds(
    x0: f64,
    y0: f64,
    cx: f64,
    cy: f64,
    x2: f64,
    y2: f64,
    bounds: &mut BoundsAccumulator,
) {
    expand_bounds(bounds, x2, y2);
    let tx = quadratic_extremum_t(x0, cx, x2);
    if let Some(t) = tx {
        expand_bounds(
            bounds,
            eval_quadratic(x0, cx, x2, t),
            eval_quadratic(y0, cy, y2, t),
        );
    }
    let ty = quadratic_extremum_t(y0, cy, y2);
    if let Some(t) = ty {
        expand_bounds(
            bounds,
            eval_quadratic(x0, cx, x2, t),
            eval_quadratic(y0, cy, y2, t),
        );
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Computes the axis-aligned bounding rectangle of `path` including true bezier extrema.
/// Writes the result into `out`. Returns `true` if the path contains any geometry;
/// returns `false` and sets `out` to an empty zero-rectangle for an empty path.
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
pub fn get_path_bounds(path: &Path, out: &mut RectangleLike) -> bool {
    let commands = &path.commands;
    let data = &path.data;
    let mut bounds = BoundsAccumulator {
        min_x: f64::INFINITY,
        min_y: f64::INFINITY,
        max_x: f64::NEG_INFINITY,
        max_y: f64::NEG_INFINITY,
    };
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut di: usize = 0;

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MOVE_TO as u8 {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            expand_bounds(&mut bounds, nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::WIDE_MOVE_TO as u8 {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            expand_bounds(&mut bounds, nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::LINE_TO as u8 {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            expand_bounds(&mut bounds, nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::WIDE_LINE_TO as u8 {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            expand_bounds(&mut bounds, nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::QUADRATIC_CURVE_TO as u8 {
            let cx = data[di];
            let cy = data[di + 1];
            let ax = data[di + 2];
            let ay = data[di + 3];
            di += 4;
            expand_quadratic_bounds(x, y, cx, cy, ax, ay, &mut bounds);
            x = ax;
            y = ay;
        } else if command == PathCommand::CUBIC_CURVE_TO as u8 {
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let ax = data[di + 4];
            let ay = data[di + 5];
            di += 6;
            expand_cubic_bounds(x, y, c1x, c1y, c2x, c2y, ax, ay, &mut bounds);
            x = ax;
            y = ay;
        }
    }

    if bounds.min_x == f64::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return false;
    }
    out.x = bounds.min_x as f32;
    out.y = bounds.min_y as f32;
    out.width = (bounds.max_x - bounds.min_x) as f32;
    out.height = (bounds.max_y - bounds.min_y) as f32;
    return true;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn quadratic_extremum_t(p0: f64, p1: f64, p2: f64) -> Option<f64> {
    let denom = p0 - 2.0 * p1 + p2;
    if denom == 0.0 {
        return None;
    }
    let t = (p0 - p1) / denom;
    if t > 0.0 && t < 1.0 {
        return Some(t);
    }
    return None;
}

impl Path {
    pub fn bounds(&self, out: &mut RectangleLike) -> bool {
        return get_path_bounds(self, out);
    }
}
