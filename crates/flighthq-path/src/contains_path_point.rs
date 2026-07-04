//! Point-in-path test using winding number and adaptive curve flattening.
//!
//! Casts a rightward ray from the query point and counts signed crossings of
//! the path contours. For `EvenOdd` winding the result is `(crossings & 1) != 0`;
//! for `NonZero` it is `crossings != 0`.

use flighthq_types::{Path, PathWinding, path_command};

const MAX_SUBDIVISION_DEPTH: u32 = 16;

/// Tests whether point `(px, py)` lies inside `path` using the path's winding
/// rule. Curves are adaptively flattened to `tolerance` path units before the
/// winding number test.
pub fn contains_path_point(path: &Path, px: f32, py: f32, tolerance: f32) -> bool {
    let winding = compute_path_winding_number(path, px, py, tolerance);
    match path.winding {
        PathWinding::EvenOdd => (winding & 1) != 0,
        PathWinding::NonZero => winding != 0,
    }
}

/// Squared perpendicular distance from `(px, py)` to chord `(x0,y0)-(x1,y1)`.
fn chord_dist_sq(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    (cross * cross) / len_sq
}

/// Computes the absolute winding number of `(px, py)` relative to `path` by
/// walking the command stream and accumulating signed ray crossings.
fn compute_path_winding_number(path: &Path, px: f32, py: f32, tolerance: f32) -> i32 {
    let commands = &path.commands;
    let data = &path.data;
    let tolerance_sq = tolerance * tolerance;
    let mut winding_number: i32 = 0;
    let mut x: f32 = 0.0;
    let mut y: f32 = 0.0;
    let mut contour_start_x: f32 = 0.0;
    let mut contour_start_y: f32 = 0.0;
    let mut has_contour = false;
    let mut last_x: f32 = 0.0;
    let mut last_y: f32 = 0.0;
    let mut di: usize = 0;

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == path_command::MOVE_TO {
            if has_contour {
                winding_number += count_segment_crossings(
                    px,
                    py,
                    last_x,
                    last_y,
                    contour_start_x,
                    contour_start_y,
                );
            }
            x = data[di];
            y = data[di + 1];
            di += 2;
            contour_start_x = x;
            contour_start_y = y;
            last_x = x;
            last_y = y;
            has_contour = true;
        } else if command == path_command::WIDE_MOVE_TO {
            if has_contour {
                winding_number += count_segment_crossings(
                    px,
                    py,
                    last_x,
                    last_y,
                    contour_start_x,
                    contour_start_y,
                );
            }
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contour_start_x = x;
            contour_start_y = y;
            last_x = x;
            last_y = y;
            has_contour = true;
        } else if command == path_command::LINE_TO {
            let nx = data[di];
            let ny = data[di + 1];
            di += 2;
            if has_contour {
                winding_number += count_segment_crossings(px, py, last_x, last_y, nx, ny);
            }
            last_x = nx;
            last_y = ny;
            x = nx;
            y = ny;
        } else if command == path_command::WIDE_LINE_TO {
            let nx = data[di + 2];
            let ny = data[di + 3];
            di += 4;
            if has_contour {
                winding_number += count_segment_crossings(px, py, last_x, last_y, nx, ny);
            }
            last_x = nx;
            last_y = ny;
            x = nx;
            y = ny;
        } else if command == path_command::CURVE_TO {
            let cx = data[di];
            let cy = data[di + 1];
            let ax = data[di + 2];
            let ay = data[di + 3];
            di += 4;
            if has_contour {
                winding_number += flatten_quadratic_winding_number(
                    px,
                    py,
                    last_x,
                    last_y,
                    cx,
                    cy,
                    ax,
                    ay,
                    tolerance_sq,
                    0,
                );
            }
            last_x = ax;
            last_y = ay;
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
            if has_contour {
                winding_number += flatten_cubic_winding_number(
                    px,
                    py,
                    last_x,
                    last_y,
                    c1x,
                    c1y,
                    c2x,
                    c2y,
                    ax,
                    ay,
                    tolerance_sq,
                    0,
                );
            }
            last_x = ax;
            last_y = ay;
            x = ax;
            y = ay;
        } else if command == path_command::CLOSE {
            if has_contour {
                winding_number += count_segment_crossings(
                    px,
                    py,
                    last_x,
                    last_y,
                    contour_start_x,
                    contour_start_y,
                );
                last_x = contour_start_x;
                last_y = contour_start_y;
                x = contour_start_x;
                y = contour_start_y;
                has_contour = false;
            }
        }
        // NO_OP and unrecognized verbs consume no data.
    }

    // Close the final open contour.
    if has_contour {
        winding_number +=
            count_segment_crossings(px, py, last_x, last_y, contour_start_x, contour_start_y);
    }

    let _ = (x, y); // suppress unused warnings — kept for parity with TS

    winding_number.abs()
}

/// Returns the signed crossing count contribution of segment `(x0,y0)->(x1,y1)`
/// for the rightward ray from `(px, py)`. `+1` for upward, `-1` for downward.
fn count_segment_crossings(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> i32 {
    if (y0 <= py && y1 > py) || (y1 <= py && y0 > py) {
        let cross_x = x0 + (py - y0) * (x1 - x0) / (y1 - y0);
        if px < cross_x {
            return if y1 > y0 { 1 } else { -1 };
        }
    }
    0
}

/// Adaptively flattens a cubic bezier and accumulates crossing counts.
fn flatten_cubic_winding_number(
    px: f32,
    py: f32,
    x0: f32,
    y0: f32,
    c1x: f32,
    c1y: f32,
    c2x: f32,
    c2y: f32,
    x1: f32,
    y1: f32,
    tolerance_sq: f32,
    depth: u32,
) -> i32 {
    let d1 = chord_dist_sq(c1x, c1y, x0, y0, x1, y1);
    let d2 = chord_dist_sq(c2x, c2y, x0, y0, x1, y1);
    if depth >= MAX_SUBDIVISION_DEPTH || (d1 <= tolerance_sq && d2 <= tolerance_sq) {
        return count_segment_crossings(px, py, x0, y0, x1, y1);
    }
    let x01 = (x0 + c1x) / 2.0;
    let y01 = (y0 + c1y) / 2.0;
    let x12 = (c1x + c2x) / 2.0;
    let y12 = (c1y + c2y) / 2.0;
    let x23 = (c2x + x1) / 2.0;
    let y23 = (c2y + y1) / 2.0;
    let x012 = (x01 + x12) / 2.0;
    let y012 = (y01 + y12) / 2.0;
    let x123 = (x12 + x23) / 2.0;
    let y123 = (y12 + y23) / 2.0;
    let xm = (x012 + x123) / 2.0;
    let ym = (y012 + y123) / 2.0;
    flatten_cubic_winding_number(
        px,
        py,
        x0,
        y0,
        x01,
        y01,
        x012,
        y012,
        xm,
        ym,
        tolerance_sq,
        depth + 1,
    ) + flatten_cubic_winding_number(
        px,
        py,
        xm,
        ym,
        x123,
        y123,
        x23,
        y23,
        x1,
        y1,
        tolerance_sq,
        depth + 1,
    )
}

/// Adaptively flattens a quadratic bezier and accumulates crossing counts.
fn flatten_quadratic_winding_number(
    px: f32,
    py: f32,
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    tolerance_sq: f32,
    depth: u32,
) -> i32 {
    if depth >= MAX_SUBDIVISION_DEPTH || chord_dist_sq(cx, cy, x0, y0, x1, y1) <= tolerance_sq {
        return count_segment_crossings(px, py, x0, y0, x1, y1);
    }
    let mx01 = (x0 + cx) / 2.0;
    let my01 = (y0 + cy) / 2.0;
    let mx12 = (cx + x1) / 2.0;
    let my12 = (cy + y1) / 2.0;
    let mx = (mx01 + mx12) / 2.0;
    let my = (my01 + my12) / 2.0;
    flatten_quadratic_winding_number(px, py, x0, y0, mx01, my01, mx, my, tolerance_sq, depth + 1)
        + flatten_quadratic_winding_number(
            px,
            py,
            mx,
            my,
            mx12,
            my12,
            x1,
            y1,
            tolerance_sq,
            depth + 1,
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{
        append_path_close, append_path_curve_to, append_path_line_to, append_path_move_to,
        create_path,
    };

    // contains_path_point
    #[test]
    fn contains_path_point_empty_path() {
        let p = create_path(PathWinding::NonZero);
        assert!(!contains_path_point(&p, 0.0, 0.0, 0.25));
    }

    #[test]
    fn contains_path_point_even_odd_nested_squares() {
        // Two concentric squares, same winding direction. With evenOdd the inner
        // region should be "outside" (hole).
        let mut p = create_path(PathWinding::EvenOdd);
        // outer square
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 100.0, 0.0);
        append_path_line_to(&mut p, 100.0, 100.0);
        append_path_line_to(&mut p, 0.0, 100.0);
        append_path_close(&mut p);
        // inner square
        append_path_move_to(&mut p, 25.0, 25.0);
        append_path_line_to(&mut p, 75.0, 25.0);
        append_path_line_to(&mut p, 75.0, 75.0);
        append_path_line_to(&mut p, 25.0, 75.0);
        append_path_close(&mut p);

        // Between outer and inner -> inside (winding 1, parity odd).
        assert!(contains_path_point(&p, 10.0, 10.0, 0.25));
        // Center of inner square -> winding 2, parity even -> outside for evenOdd.
        assert!(!contains_path_point(&p, 50.0, 50.0, 0.25));
    }

    #[test]
    fn contains_path_point_inside_triangle() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 5.0, 10.0);
        append_path_close(&mut p);
        assert!(contains_path_point(&p, 5.0, 3.0, 0.25));
    }

    #[test]
    fn contains_path_point_outside_triangle() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 5.0, 10.0);
        append_path_close(&mut p);
        assert!(!contains_path_point(&p, 20.0, 20.0, 0.25));
    }

    #[test]
    fn contains_path_point_with_quadratic_curve() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_curve_to(&mut p, 50.0, 100.0, 100.0, 0.0);
        append_path_line_to(&mut p, 100.0, -50.0);
        append_path_line_to(&mut p, 0.0, -50.0);
        append_path_close(&mut p);
        // point well inside the shape
        assert!(contains_path_point(&p, 50.0, -20.0, 0.25));
        // point outside above the curve
        assert!(!contains_path_point(&p, 50.0, 80.0, 0.25));
    }
}
