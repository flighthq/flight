//! Bezier evaluation and path segment parametric queries.

use flighthq_types::{Path, Vector2Like, path_command};

/// Evaluates the point at parameter `t` on a cubic bezier.
pub fn get_cubic_bezier_point(
    x0: f32,
    y0: f32,
    c1x: f32,
    c1y: f32,
    c2x: f32,
    c2y: f32,
    x1: f32,
    y1: f32,
    t: f32,
    out: &mut Vector2Like,
) {
    let u = 1.0 - t;
    let u2 = u * u;
    let u3 = u2 * u;
    let t2 = t * t;
    let t3 = t2 * t;
    out.x = u3 * x0 + 3.0 * u2 * t * c1x + 3.0 * u * t2 * c2x + t3 * x1;
    out.y = u3 * y0 + 3.0 * u2 * t * c1y + 3.0 * u * t2 * c2y + t3 * y1;
}

/// Evaluates the tangent direction at parameter `t` on a cubic bezier (first derivative).
pub fn get_cubic_bezier_tangent(
    x0: f32,
    y0: f32,
    c1x: f32,
    c1y: f32,
    c2x: f32,
    c2y: f32,
    x1: f32,
    y1: f32,
    t: f32,
    out: &mut Vector2Like,
) {
    let u = 1.0 - t;
    let u2 = u * u;
    let t2 = t * t;
    out.x = 3.0 * (u2 * (c1x - x0) + 2.0 * u * t * (c2x - c1x) + t2 * (x1 - c2x));
    out.y = 3.0 * (u2 * (c1y - y0) + 2.0 * u * t * (c2y - c1y) + t2 * (y1 - c2y));
}

/// Evaluates the point at parameter `t` on a quadratic bezier.
pub fn get_quadratic_bezier_point(
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    t: f32,
    out: &mut Vector2Like,
) {
    let u = 1.0 - t;
    out.x = u * u * x0 + 2.0 * u * t * cx + t * t * x1;
    out.y = u * u * y0 + 2.0 * u * t * cy + t * t * y1;
}

/// Evaluates the tangent direction at parameter `t` on a quadratic bezier (first derivative).
pub fn get_quadratic_bezier_tangent(
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    t: f32,
    out: &mut Vector2Like,
) {
    let u = 1.0 - t;
    out.x = 2.0 * (u * (cx - x0) + t * (x1 - cx));
    out.y = 2.0 * (u * (cy - y0) + t * (y1 - cy));
}

/// Evaluates the point at parameter `t` on the n-th segment of `path` (0-indexed).
/// MOVE_TO does not count; LINE_TO, CURVE_TO, CUBIC_CURVE_TO each count as one segment.
pub fn get_path_segment_point_at_parameter(
    path: &Path,
    segment_index: usize,
    t: f32,
    out: &mut Vector2Like,
) -> bool {
    walk_path_segment(path, segment_index, t, out, false)
}

/// Evaluates the tangent direction at parameter `t` on the n-th segment of `path`.
pub fn get_path_segment_tangent_at_parameter(
    path: &Path,
    segment_index: usize,
    t: f32,
    out: &mut Vector2Like,
) -> bool {
    walk_path_segment(path, segment_index, t, out, true)
}

fn walk_path_segment(
    path: &Path,
    segment_index: usize,
    t: f32,
    out: &mut Vector2Like,
    want_tangent: bool,
) -> bool {
    let commands = &path.commands;
    let data = &path.data;
    let mut current_segment = 0usize;
    let mut x = 0.0f32;
    let mut y = 0.0f32;
    let mut di = 0usize;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == path_command::MOVE_TO {
            x = data[di];
            y = data[di + 1];
            di += 2;
        } else if command == path_command::WIDE_MOVE_TO {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
        } else if command == path_command::LINE_TO {
            let x1 = data[di];
            let y1 = data[di + 1];
            di += 2;
            if current_segment == segment_index {
                if want_tangent {
                    out.x = x1 - x;
                    out.y = y1 - y;
                } else {
                    out.x = x + t * (x1 - x);
                    out.y = y + t * (y1 - y);
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == path_command::WIDE_LINE_TO {
            let x1 = data[di + 2];
            let y1 = data[di + 3];
            di += 4;
            if current_segment == segment_index {
                if want_tangent {
                    out.x = x1 - x;
                    out.y = y1 - y;
                } else {
                    out.x = x + t * (x1 - x);
                    out.y = y + t * (y1 - y);
                }
                return true;
            }
            x = x1;
            y = y1;
            current_segment += 1;
        } else if command == path_command::CURVE_TO {
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
        } else if command == path_command::CUBIC_CURVE_TO {
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
        // CLOSE is not a parametric segment.
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    #[test]
    fn quadratic_bezier_at_endpoints() {
        let mut out = Vector2Like { x: 0.0, y: 0.0 };
        get_quadratic_bezier_point(0.0, 0.0, 5.0, 10.0, 10.0, 0.0, 0.0, &mut out);
        assert!((out.x).abs() < 1e-6);
        assert!((out.y).abs() < 1e-6);
        get_quadratic_bezier_point(0.0, 0.0, 5.0, 10.0, 10.0, 0.0, 1.0, &mut out);
        assert!((out.x - 10.0).abs() < 1e-6);
        assert!((out.y).abs() < 1e-6);
    }

    #[test]
    fn segment_point_on_line() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like { x: 0.0, y: 0.0 };
        assert!(get_path_segment_point_at_parameter(&p, 0, 0.5, &mut out));
        assert!((out.x - 5.0).abs() < 1e-6);
    }

    #[test]
    fn segment_out_of_range() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like { x: 0.0, y: 0.0 };
        assert!(!get_path_segment_point_at_parameter(&p, 5, 0.5, &mut out));
    }
}
