use crate::path::{Path, PathCommand};

const MAX_SUBDIVISION_DEPTH: usize = 16;

/// Flattens a Path's curves into straight-line contours. Each contour is a flat
/// [x0, y0, x1, y1, ...] polyline. Quadratic and cubic segments are adaptively subdivided
/// until their deviation from a chord is within `tolerance` (path units).
/// A CLOSE verb appends the contour's start point, making the closure explicit.
pub fn flatten_path(path: &Path, tolerance: f64) -> Vec<Vec<f64>> {
    let commands = &path.commands;
    let data = &path.data;
    let tolerance_sq = tolerance * tolerance;
    let mut contours: Vec<Vec<f64>> = Vec::new();
    let mut contour: Option<usize> = None;
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    let mut contour_start_x: f64 = 0.0;
    let mut contour_start_y: f64 = 0.0;
    let mut di: usize = 0;

    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 {
            x = data[di];
            y = data[di + 1];
            di += 2;
            contour_start_x = x;
            contour_start_y = y;
            contours.push(vec![x, y]);
            contour = Some(contours.len() - 1);
        } else if command == PathCommand::WideMoveTo as u8 {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contour_start_x = x;
            contour_start_y = y;
            contours.push(vec![x, y]);
            contour = Some(contours.len() - 1);
        } else if command == PathCommand::LineTo as u8 {
            contour = ensure_contour(&mut contours, contour);
            x = data[di];
            y = data[di + 1];
            di += 2;
            contours[contour.unwrap()].push(x);
            contours[contour.unwrap()].push(y);
        } else if command == PathCommand::WideLineTo as u8 {
            contour = ensure_contour(&mut contours, contour);
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contours[contour.unwrap()].push(x);
            contours[contour.unwrap()].push(y);
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            contour = ensure_contour(&mut contours, contour);
            let ci_idx = contour.unwrap();
            flatten_quadratic(
                &mut contours[ci_idx], x, y,
                data[di], data[di + 1], data[di + 2], data[di + 3],
                tolerance_sq, 0,
            );
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
        } else if command == PathCommand::CubicCurveTo as u8 {
            contour = ensure_contour(&mut contours, contour);
            let ci_idx = contour.unwrap();
            flatten_cubic(
                &mut contours[ci_idx], x, y,
                data[di], data[di + 1], data[di + 2], data[di + 3],
                data[di + 4], data[di + 5],
                tolerance_sq, 0,
            );
            x = data[di + 4];
            y = data[di + 5];
            di += 6;
        } else if command == PathCommand::Close as u8 {
            if let Some(ci_idx) = contour {
                if x != contour_start_x || y != contour_start_y {
                    contours[ci_idx].push(contour_start_x);
                    contours[ci_idx].push(contour_start_y);
                }
            }
            x = contour_start_x;
            y = contour_start_y;
            contour = None;
        }
    }

    return contours;
}

fn ensure_contour(contours: &mut Vec<Vec<f64>>, contour: Option<usize>) -> Option<usize> {
    if contour.is_some() {
        return contour;
    }
    contours.push(vec![0.0, 0.0]);
    return Some(contours.len() - 1);
}

fn distance_to_chord_sq(px: f64, py: f64, x0: f64, y0: f64, x1: f64, y1: f64) -> f64 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_sq = dx * dx + dy * dy;
    if length_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    return (cross * cross) / length_sq;
}

fn flatten_cubic(
    out: &mut Vec<f64>,
    x0: f64, y0: f64,
    c1x: f64, c1y: f64,
    c2x: f64, c2y: f64,
    x1: f64, y1: f64,
    tolerance_sq: f64,
    depth: usize,
) {
    let d1 = distance_to_chord_sq(c1x, c1y, x0, y0, x1, y1);
    let d2 = distance_to_chord_sq(c2x, c2y, x0, y0, x1, y1);
    if depth >= MAX_SUBDIVISION_DEPTH || (d1 <= tolerance_sq && d2 <= tolerance_sq) {
        out.push(x1);
        out.push(y1);
        return;
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
    flatten_cubic(out, x0, y0, x01, y01, x012, y012, xm, ym, tolerance_sq, depth + 1);
    flatten_cubic(out, xm, ym, x123, y123, x23, y23, x1, y1, tolerance_sq, depth + 1);
}

fn flatten_quadratic(
    out: &mut Vec<f64>,
    x0: f64, y0: f64,
    cx: f64, cy: f64,
    x1: f64, y1: f64,
    tolerance_sq: f64,
    depth: usize,
) {
    if depth >= MAX_SUBDIVISION_DEPTH || distance_to_chord_sq(cx, cy, x0, y0, x1, y1) <= tolerance_sq {
        out.push(x1);
        out.push(y1);
        return;
    }
    let x01 = (x0 + cx) / 2.0;
    let y01 = (y0 + cy) / 2.0;
    let x12 = (cx + x1) / 2.0;
    let y12 = (cy + y1) / 2.0;
    let xm = (x01 + x12) / 2.0;
    let ym = (y01 + y12) / 2.0;
    flatten_quadratic(out, x0, y0, x01, y01, xm, ym, tolerance_sq, depth + 1);
    flatten_quadratic(out, xm, ym, x12, y12, x1, y1, tolerance_sq, depth + 1);
}
