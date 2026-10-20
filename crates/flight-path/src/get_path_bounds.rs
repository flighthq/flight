use flight_geometry::Rectangle;

use crate::path::{Path, PathCommand};

/// Computes the axis-aligned bounding rectangle of `path` including true bezier extrema.
/// Writes the result into `out`. Returns `true` if the path contains any geometry;
/// returns `false` and sets `out` to an empty zero-rectangle for an empty path.
pub fn get_path_bounds(path: &Path, out: &mut Rectangle) -> bool {
    let commands = &path.commands;
    let data = &path.data;
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut di: usize = 0;

    let mut expand = |px: f64, py: f64| {
        if px < min_x { min_x = px; }
        if px > max_x { max_x = px; }
        if py < min_y { min_y = py; }
        if py > max_y { max_y = py; }
    };

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            expand(nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::WideMoveTo as u8 {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            expand(nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::LineTo as u8 {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            expand(nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::WideLineTo as u8 {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            expand(nx, ny);
            x = nx;
            y = ny;
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            let cx = data[di];
            let cy = data[di + 1];
            let ax = data[di + 2];
            let ay = data[di + 3];
            di += 4;
            expand_quadratic_bounds(x, y, cx, cy, ax, ay, &mut expand);
            x = ax;
            y = ay;
        } else if command == PathCommand::CubicCurveTo as u8 {
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let ax = data[di + 4];
            let ay = data[di + 5];
            di += 6;
            expand_cubic_bounds(x, y, c1x, c1y, c2x, c2y, ax, ay, &mut expand);
            x = ax;
            y = ay;
        }
    }

    if min_x == f64::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return false;
    }
    out.x = min_x as f32;
    out.y = min_y as f32;
    out.width = (max_x - min_x) as f32;
    out.height = (max_y - min_y) as f32;
    return true;
}

fn cubic_extremum_roots(p0: f64, p1: f64, p2: f64, p3: f64, cb: &mut impl FnMut(f64)) {
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

fn eval_cubic(p0: f64, p1: f64, p2: f64, p3: f64, t: f64) -> f64 {
    let mt = 1.0 - t;
    return mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
}

fn eval_quadratic(p0: f64, p1: f64, p2: f64, t: f64) -> f64 {
    let mt = 1.0 - t;
    return mt * mt * p0 + 2.0 * mt * t * p1 + t * t * p2;
}

fn expand_cubic_bounds(
    x0: f64, y0: f64,
    c1x: f64, c1y: f64,
    c2x: f64, c2y: f64,
    x3: f64, y3: f64,
    expand: &mut impl FnMut(f64, f64),
) {
    expand(x3, y3);
    cubic_extremum_roots(x0, c1x, c2x, x3, &mut |t| {
        expand(eval_cubic(x0, c1x, c2x, x3, t), eval_cubic(y0, c1y, c2y, y3, t));
    });
    cubic_extremum_roots(y0, c1y, c2y, y3, &mut |t| {
        expand(eval_cubic(x0, c1x, c2x, x3, t), eval_cubic(y0, c1y, c2y, y3, t));
    });
}

fn expand_quadratic_bounds(
    x0: f64, y0: f64,
    cx: f64, cy: f64,
    x2: f64, y2: f64,
    expand: &mut impl FnMut(f64, f64),
) {
    expand(x2, y2);
    let tx = quadratic_extremum_t(x0, cx, x2);
    if let Some(t) = tx {
        expand(eval_quadratic(x0, cx, x2, t), eval_quadratic(y0, cy, y2, t));
    }
    let ty = quadratic_extremum_t(y0, cy, y2);
    if let Some(t) = ty {
        expand(eval_quadratic(x0, cx, x2, t), eval_quadratic(y0, cy, y2, t));
    }
}

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
