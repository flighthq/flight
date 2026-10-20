use crate::path::{Path, PathCommand, PathWinding};

const MAX_SUBDIVISION_DEPTH: usize = 16;

/// Tests whether point (px, py) lies inside the path using the path's winding rule.
/// Curves are adaptively flattened before the winding number test.
pub fn contains_path_point(path: &Path, px: f64, py: f64, tolerance: f64) -> bool {
    let winding = compute_path_winding_number(path, px, py, tolerance);
    if path.winding == PathWinding::EvenOdd {
        return (winding & 1) != 0;
    }
    return winding != 0;
}

fn chord_dist_sq(px: f64, py: f64, x0: f64, y0: f64, x1: f64, y1: f64) -> f64 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    return (cross * cross) / len_sq;
}

fn compute_path_winding_number(path: &Path, px: f64, py: f64, tolerance: f64) -> i32 {
    let commands = &path.commands;
    let data = &path.data;
    let tolerance_sq = tolerance * tolerance;
    let mut winding_number: i32 = 0;
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut contour_start_x: f64 = 0.0;
    let mut contour_start_y: f64 = 0.0;
    let mut has_contour = false;
    let mut last_x: f64 = 0.0;
    let mut last_y: f64 = 0.0;
    let mut di: usize = 0;

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            if has_contour {
                winding_number += count_segment_crossings(px, py, last_x, last_y, contour_start_x, contour_start_y);
            }
            x = data[di];
            y = data[di + 1];
            di += 2;
            contour_start_x = x;
            contour_start_y = y;
            last_x = x;
            last_y = y;
            has_contour = true;
        } else if command == PathCommand::WideMoveTo as u8 {
            if has_contour {
                winding_number += count_segment_crossings(px, py, last_x, last_y, contour_start_x, contour_start_y);
            }
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contour_start_x = x;
            contour_start_y = y;
            last_x = x;
            last_y = y;
            has_contour = true;
        } else if command == PathCommand::LineTo as u8 {
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
        } else if command == PathCommand::WideLineTo as u8 {
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
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            let cx = data[di];
            let cy = data[di + 1];
            let ax = data[di + 2];
            let ay = data[di + 3];
            di += 4;
            if has_contour {
                winding_number += flatten_quadratic_winding_number(px, py, last_x, last_y, cx, cy, ax, ay, tolerance_sq, 0);
            }
            last_x = ax;
            last_y = ay;
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
            if has_contour {
                winding_number += flatten_cubic_winding_number(px, py, last_x, last_y, c1x, c1y, c2x, c2y, ax, ay, tolerance_sq, 0);
            }
            last_x = ax;
            last_y = ay;
            x = ax;
            y = ay;
        } else if command == PathCommand::Close as u8 {
            if has_contour {
                winding_number += count_segment_crossings(px, py, last_x, last_y, contour_start_x, contour_start_y);
                last_x = contour_start_x;
                last_y = contour_start_y;
                x = contour_start_x;
                y = contour_start_y;
                has_contour = false;
            }
        }
    }
    if has_contour {
        winding_number += count_segment_crossings(px, py, last_x, last_y, contour_start_x, contour_start_y);
    }
    return winding_number.abs();
}

fn count_segment_crossings(px: f64, py: f64, x0: f64, y0: f64, x1: f64, y1: f64) -> i32 {
    if (y0 <= py && y1 > py) || (y1 <= py && y0 > py) {
        let cross_x = x0 + ((py - y0) * (x1 - x0)) / (y1 - y0);
        if px < cross_x {
            return if y1 > y0 { 1 } else { -1 };
        }
    }
    return 0;
}

fn flatten_cubic_winding_number(
    px: f64, py: f64,
    x0: f64, y0: f64,
    c1x: f64, c1y: f64,
    c2x: f64, c2y: f64,
    x1: f64, y1: f64,
    tolerance_sq: f64,
    depth: usize,
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
    return flatten_cubic_winding_number(px, py, x0, y0, x01, y01, x012, y012, xm, ym, tolerance_sq, depth + 1)
        + flatten_cubic_winding_number(px, py, xm, ym, x123, y123, x23, y23, x1, y1, tolerance_sq, depth + 1);
}

fn flatten_quadratic_winding_number(
    px: f64, py: f64,
    x0: f64, y0: f64,
    cx: f64, cy: f64,
    x1: f64, y1: f64,
    tolerance_sq: f64,
    depth: usize,
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
    return flatten_quadratic_winding_number(px, py, x0, y0, mx01, my01, mx, my, tolerance_sq, depth + 1)
        + flatten_quadratic_winding_number(px, py, mx, my, mx12, my12, x1, y1, tolerance_sq, depth + 1);
}
