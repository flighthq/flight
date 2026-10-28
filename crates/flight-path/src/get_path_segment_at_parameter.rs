use flight_geometry::Vector2;

use crate::path::{Path, PathCommand};

#[cfg(test)]
mod sugar_tests {
    use flight_geometry::create_vector2;

    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_segment_curvature_at_parameter_matches_get_path_segment_curvature_at_parameter() {
        let s = test_path();
        let ra = s.segment_curvature_at_parameter(1, 0.25);
        let rb = get_path_segment_curvature_at_parameter(&s, 1, 0.25);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_segment_point_at_parameter_matches_get_path_segment_point_at_parameter() {
        let mut oa2 = create_vector2(0.0, 0.0);
        let mut ob2 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.segment_point_at_parameter(1, 0.25, &mut oa2);
        let rb = get_path_segment_point_at_parameter(&s, 1, 0.25, &mut ob2);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }

    #[test]
    fn path_segment_tangent_at_parameter_matches_get_path_segment_tangent_at_parameter() {
        let mut oa2 = create_vector2(0.0, 0.0);
        let mut ob2 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.segment_tangent_at_parameter(1, 0.25, &mut oa2);
        let rb = get_path_segment_tangent_at_parameter(&s, 1, 0.25, &mut ob2);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the signed curvature at parameter `t` on a cubic bezier.
pub fn get_cubic_bezier_curvature(
    x0: f64,
    y0: f64,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x1: f64,
    y1: f64,
    t: f64,
) -> f64 {
    let u = 1.0 - t;
    let u2 = u * u;
    let t2 = t * t;
    let dx = 3.0 * (u2 * (c1x - x0) + 2.0 * u * t * (c2x - c1x) + t2 * (x1 - c2x));
    let dy = 3.0 * (u2 * (c1y - y0) + 2.0 * u * t * (c2y - c1y) + t2 * (y1 - c2y));
    let ddx = 6.0 * (u * (c2x - 2.0 * c1x + x0) + t * (x1 - 2.0 * c2x + c1x));
    let ddy = 6.0 * (u * (c2y - 2.0 * c1y + y0) + t * (y1 - 2.0 * c2y + c1y));
    let cross = dx * ddy - dy * ddx;
    let speed2 = dx * dx + dy * dy;
    let speed = speed2.sqrt();
    if speed == 0.0 {
        return 0.0;
    }
    return cross / (speed2 * speed);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the point at parameter `t` on a cubic bezier. Writes into `out`.
pub fn get_cubic_bezier_point(
    x0: f64,
    y0: f64,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x1: f64,
    y1: f64,
    t: f64,
    out: &mut Vector2,
) {
    let u = 1.0 - t;
    let u2 = u * u;
    let u3 = u2 * u;
    let t2 = t * t;
    let t3 = t2 * t;
    out.x = (u3 * x0 + 3.0 * u2 * t * c1x + 3.0 * u * t2 * c2x + t3 * x1) as f32;
    out.y = (u3 * y0 + 3.0 * u2 * t * c1y + 3.0 * u * t2 * c2y + t3 * y1) as f32;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the tangent direction at parameter `t` on a cubic bezier. Writes into `out`.
pub fn get_cubic_bezier_tangent(
    x0: f64,
    y0: f64,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x1: f64,
    y1: f64,
    t: f64,
    out: &mut Vector2,
) {
    let u = 1.0 - t;
    let u2 = u * u;
    let t2 = t * t;
    out.x = (3.0 * (u2 * (c1x - x0) + 2.0 * u * t * (c2x - c1x) + t2 * (x1 - c2x))) as f32;
    out.y = (3.0 * (u2 * (c1y - y0) + 2.0 * u * t * (c2y - c1y) + t2 * (y1 - c2y))) as f32;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the signed curvature at parameter `t` on the n-th segment of `path`.
/// Returns `None` if `segment_index` is out of range.
pub fn get_path_segment_curvature_at_parameter(
    path: &Path,
    segment_index: usize,
    t: f64,
) -> Option<f64> {
    return walk_path_segment_curvature(path, segment_index, t);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Evaluates the point at parameter `t` on the n-th segment of `path`.
/// Returns `true` on success; `false` if `segment_index` is out of range.
pub fn get_path_segment_point_at_parameter(
    path: &Path,
    segment_index: usize,
    t: f64,
    out: &mut Vector2,
) -> bool {
    return walk_path_segment(path, segment_index, t, out, false);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Evaluates the tangent direction at parameter `t` on the n-th segment of `path`.
/// Returns `true` on success; `false` if `segment_index` is out of range.
pub fn get_path_segment_tangent_at_parameter(
    path: &Path,
    segment_index: usize,
    t: f64,
    out: &mut Vector2,
) -> bool {
    return walk_path_segment(path, segment_index, t, out, true);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the signed curvature at parameter `t` on a quadratic bezier.
pub fn get_quadratic_bezier_curvature(
    x0: f64,
    y0: f64,
    cx: f64,
    cy: f64,
    x1: f64,
    y1: f64,
    t: f64,
) -> f64 {
    let u = 1.0 - t;
    let dx = 2.0 * (u * (cx - x0) + t * (x1 - cx));
    let dy = 2.0 * (u * (cy - y0) + t * (y1 - cy));
    let ddx = 2.0 * (x1 - 2.0 * cx + x0);
    let ddy = 2.0 * (y1 - 2.0 * cy + y0);
    let cross = dx * ddy - dy * ddx;
    let speed2 = dx * dx + dy * dy;
    let speed = speed2.sqrt();
    if speed == 0.0 {
        return 0.0;
    }
    return cross / (speed2 * speed);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the point at parameter `t` on a quadratic bezier. Writes into `out`.
pub fn get_quadratic_bezier_point(
    x0: f64,
    y0: f64,
    cx: f64,
    cy: f64,
    x1: f64,
    y1: f64,
    t: f64,
    out: &mut Vector2,
) {
    let u = 1.0 - t;
    out.x = (u * u * x0 + 2.0 * u * t * cx + t * t * x1) as f32;
    out.y = (u * u * y0 + 2.0 * u * t * cy + t * t * y1) as f32;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns the tangent direction at parameter `t` on a quadratic bezier. Writes into `out`.
pub fn get_quadratic_bezier_tangent(
    x0: f64,
    y0: f64,
    cx: f64,
    cy: f64,
    x1: f64,
    y1: f64,
    t: f64,
    out: &mut Vector2,
) {
    let u = 1.0 - t;
    out.x = (2.0 * (u * (cx - x0) + t * (x1 - cx))) as f32;
    out.y = (2.0 * (u * (cy - y0) + t * (y1 - cy))) as f32;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn walk_path_segment(
    path: &Path,
    segment_index: usize,
    t: f64,
    out: &mut Vector2,
    want_tangent: bool,
) -> bool {
    let commands = &path.commands;
    let data = &path.data;
    let mut current_segment: usize = 0;
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut di: usize = 0;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            x = data[di];
            y = data[di + 1];
            di += 2;
        } else if command == PathCommand::WideMoveTo as u8 {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
        } else if command == PathCommand::LineTo as u8 {
            let x1 = data[di];
            let y1 = data[di + 1];
            di += 2;
            if current_segment == segment_index {
                if want_tangent {
                    out.x = (x1 - x) as f32;
                    out.y = (y1 - y) as f32;
                } else {
                    out.x = (x + t * (x1 - x)) as f32;
                    out.y = (y + t * (y1 - y)) as f32;
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == PathCommand::WideLineTo as u8 {
            let x1 = data[di + 2];
            let y1 = data[di + 3];
            di += 4;
            if current_segment == segment_index {
                if want_tangent {
                    out.x = (x1 - x) as f32;
                    out.y = (y1 - y) as f32;
                } else {
                    out.x = (x + t * (x1 - x)) as f32;
                    out.y = (y + t * (y1 - y)) as f32;
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            let cx = data[di];
            let cy = data[di + 1];
            let x1 = data[di + 2];
            let y1 = data[di + 3];
            di += 4;
            if current_segment == segment_index {
                if want_tangent {
                    get_quadratic_bezier_tangent(x, y, cx, cy, x1, y1, t, out);
                } else {
                    get_quadratic_bezier_point(x, y, cx, cy, x1, y1, t, out);
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == PathCommand::CubicCurveTo as u8 {
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let x1 = data[di + 4];
            let y1 = data[di + 5];
            di += 6;
            if current_segment == segment_index {
                if want_tangent {
                    get_cubic_bezier_tangent(x, y, c1x, c1y, c2x, c2y, x1, y1, t, out);
                } else {
                    get_cubic_bezier_point(x, y, c1x, c1y, c2x, c2y, x1, y1, t, out);
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        }
    }
    return false;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn walk_path_segment_curvature(path: &Path, segment_index: usize, t: f64) -> Option<f64> {
    let commands = &path.commands;
    let data = &path.data;
    let mut current_segment: usize = 0;
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut di: usize = 0;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            x = data[di];
            y = data[di + 1];
            di += 2;
        } else if command == PathCommand::WideMoveTo as u8 {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
        } else if command == PathCommand::LineTo as u8 {
            di += 2;
            if current_segment == segment_index {
                return Some(0.0);
            }
            x = data[di - 2];
            y = data[di - 1];
            current_segment += 1;
        } else if command == PathCommand::WideLineTo as u8 {
            di += 4;
            if current_segment == segment_index {
                return Some(0.0);
            }
            x = data[di - 2];
            y = data[di - 1];
            current_segment += 1;
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            let cx = data[di];
            let cy = data[di + 1];
            let x1 = data[di + 2];
            let y1 = data[di + 3];
            di += 4;
            if current_segment == segment_index {
                return Some(get_quadratic_bezier_curvature(x, y, cx, cy, x1, y1, t));
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == PathCommand::CubicCurveTo as u8 {
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let x1 = data[di + 4];
            let y1 = data[di + 5];
            di += 6;
            if current_segment == segment_index {
                return Some(get_cubic_bezier_curvature(
                    x, y, c1x, c1y, c2x, c2y, x1, y1, t,
                ));
            }
            x = x1;
            y = y1;
            current_segment += 1;
        }
    }
    return None;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn segment_curvature_at_parameter(&self, segment_index: usize, t: f64) -> Option<f64> {
        return get_path_segment_curvature_at_parameter(self, segment_index, t);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn segment_point_at_parameter(
        &self,
        segment_index: usize,
        t: f64,
        out: &mut Vector2,
    ) -> bool {
        return get_path_segment_point_at_parameter(self, segment_index, t, out);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn segment_tangent_at_parameter(
        &self,
        segment_index: usize,
        t: f64,
        out: &mut Vector2,
    ) -> bool {
        return get_path_segment_tangent_at_parameter(self, segment_index, t, out);
    }
}
