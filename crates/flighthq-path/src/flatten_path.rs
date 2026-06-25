//! Adaptive curve flattening — converts a [`Path`] to straight-line contours.
//!
//! Each contour is a `Vec<f32>` of flat `x, y` pairs in the path's own coordinate space.
//! Quadratic and cubic segments are adaptively subdivided until their deviation from the
//! chord is within `tolerance` (path units). The path's winding rule travels on the [`Path`]
//! itself, not here.

use flighthq_types::{Path, path_command};

const MAX_SUBDIVISION_DEPTH: u32 = 16;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/// Flattens all curves in `path` into straight-line contours.
///
/// Returns one `Vec<f32>` per sub-path (each starting at a `MOVE_TO`), where each
/// entry is a flat `[x0, y0, x1, y1, …]` polyline. `tolerance` is the maximum
/// allowable perpendicular deviation in path units; defaults to `0.25` in the
/// TypeScript source.
pub fn flatten_path(path: &Path, tolerance: f32) -> Vec<Vec<f32>> {
    let commands = &path.commands;
    let data = &path.data;
    let tolerance_sq = tolerance * tolerance;
    let mut contours: Vec<Vec<f32>> = Vec::new();
    let mut contour: Option<usize> = None; // index into contours of the active contour
    let mut x = 0.0f32;
    let mut y = 0.0f32;
    let mut di = 0usize;

    for &command in commands {
        if command == path_command::MOVE_TO {
            x = data[di];
            y = data[di + 1];
            di += 2;
            contours.push(vec![x, y]);
            contour = Some(contours.len() - 1);
        } else if command == path_command::WIDE_MOVE_TO {
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contours.push(vec![x, y]);
            contour = Some(contours.len() - 1);
        } else if command == path_command::LINE_TO {
            let idx = ensure_contour(&mut contours, &mut contour);
            x = data[di];
            y = data[di + 1];
            di += 2;
            contours[idx].push(x);
            contours[idx].push(y);
        } else if command == path_command::WIDE_LINE_TO {
            let idx = ensure_contour(&mut contours, &mut contour);
            x = data[di + 2];
            y = data[di + 3];
            di += 4;
            contours[idx].push(x);
            contours[idx].push(y);
        } else if command == path_command::CURVE_TO {
            let idx = ensure_contour(&mut contours, &mut contour);
            let cx = data[di];
            let cy = data[di + 1];
            let x1 = data[di + 2];
            let y1 = data[di + 3];
            di += 4;
            flatten_quadratic(&mut contours[idx], x, y, cx, cy, x1, y1, tolerance_sq, 0);
            x = x1;
            y = y1;
        } else if command == path_command::CUBIC_CURVE_TO {
            let idx = ensure_contour(&mut contours, &mut contour);
            let c1x = data[di];
            let c1y = data[di + 1];
            let c2x = data[di + 2];
            let c2y = data[di + 3];
            let x1 = data[di + 4];
            let y1 = data[di + 5];
            di += 6;
            flatten_cubic(
                &mut contours[idx],
                x,
                y,
                c1x,
                c1y,
                c2x,
                c2y,
                x1,
                y1,
                tolerance_sq,
                0,
            );
            x = x1;
            y = y1;
        }
        // NO_OP and unrecognized verbs consume no data and are skipped.
    }

    contours
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Starts an implicit contour at the origin when a draw verb precedes any move,
/// mirroring the canvas reader's `moveTo(0, 0)` fallback. Returns the contour
/// index to draw into.
fn ensure_contour(contours: &mut Vec<Vec<f32>>, contour: &mut Option<usize>) -> usize {
    if let Some(idx) = *contour {
        return idx;
    }
    contours.push(vec![0.0, 0.0]);
    let idx = contours.len() - 1;
    *contour = Some(idx);
    idx
}

/// Squared perpendicular distance from `(px, py)` to the segment `(x0,y0)-(x1,y1)`.
///
/// Used as the flatness test to avoid a `sqrt` per check.
fn distance_to_chord_sq(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_sq = dx * dx + dy * dy;
    if length_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    (cross * cross) / length_sq
}

/// Appends the flattened points of a cubic Bézier (excluding the start, including the end)
/// via recursive de Casteljau subdivision at the midpoint.
fn flatten_cubic(
    out: &mut Vec<f32>,
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
    flatten_cubic(
        out,
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
    );
    flatten_cubic(
        out,
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
    );
}

/// Appends the flattened points of a quadratic Bézier (excluding the start, including the end).
fn flatten_quadratic(
    out: &mut Vec<f32>,
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    tolerance_sq: f32,
    depth: u32,
) {
    if depth >= MAX_SUBDIVISION_DEPTH
        || distance_to_chord_sq(cx, cy, x0, y0, x1, y1) <= tolerance_sq
    {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{
        append_path_cubic_curve_to, append_path_curve_to, append_path_line_to, append_path_move_to,
        create_path,
    };
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-4
    }

    // distance_to_chord_sq
    #[test]
    fn distance_to_chord_sq_point_on_chord_is_zero() {
        // midpoint of (0,0)-(2,0) lies on the chord
        let d = distance_to_chord_sq(1.0, 0.0, 0.0, 0.0, 2.0, 0.0);
        assert!(d < 1e-10);
    }

    #[test]
    fn distance_to_chord_sq_perpendicular_distance() {
        // Point 1 unit above midpoint of unit horizontal segment
        let d = distance_to_chord_sq(0.5, 1.0, 0.0, 0.0, 1.0, 0.0);
        assert!(approx_eq(d, 1.0));
    }

    #[test]
    fn distance_to_chord_sq_degenerate_chord() {
        // Degenerate chord: distance is point-to-point squared
        let d = distance_to_chord_sq(3.0, 4.0, 0.0, 0.0, 0.0, 0.0);
        assert!(approx_eq(d, 25.0));
    }

    // flatten_path — move_to starts a new contour
    #[test]
    fn flatten_path_move_to_starts_contour() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 1.0, 2.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0], [1.0, 2.0]);
    }

    // flatten_path — line_to appends to contour
    #[test]
    fn flatten_path_line_to_appends_point() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 5.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0], [0.0, 0.0, 10.0, 5.0]);
    }

    // flatten_path — two move_tos produce two contours
    #[test]
    fn flatten_path_two_move_tos_produce_two_contours() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 1.0, 0.0);
        append_path_move_to(&mut p, 5.0, 5.0);
        append_path_line_to(&mut p, 6.0, 5.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 2);
        assert_eq!(&contours[0][..], &[0.0f32, 0.0, 1.0, 0.0]);
        assert_eq!(&contours[1][..], &[5.0f32, 5.0, 6.0, 5.0]);
    }

    // flatten_path — no move before draw starts implicit contour at origin
    #[test]
    fn flatten_path_implicit_contour_starts_at_origin() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_line_to(&mut p, 1.0, 0.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        assert_eq!(&contours[0][..4], &[0.0f32, 0.0, 1.0, 0.0]);
    }

    // flatten_path — quadratic on a degenerate (straight) curve produces the endpoint
    #[test]
    fn flatten_path_quadratic_straight_collinear() {
        // Control point on the chord → should flatten to just the endpoint
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_curve_to(&mut p, 5.0, 0.0, 10.0, 0.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        // Last two values should be the endpoint (10, 0)
        let c = &contours[0];
        assert!(approx_eq(*c.last().unwrap(), 0.0));
        assert!(approx_eq(c[c.len() - 2], 10.0));
    }

    // flatten_path — quadratic off-axis produces intermediate points
    #[test]
    fn flatten_path_quadratic_curved_has_multiple_points() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_curve_to(&mut p, 50.0, 100.0, 100.0, 0.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        // Should have more than 2 points (start + endpoint only is not enough for this curve)
        assert!(contours[0].len() > 4);
        // Last point should be the endpoint
        let c = &contours[0];
        assert!(approx_eq(*c.last().unwrap(), 0.0));
        assert!(approx_eq(c[c.len() - 2], 100.0));
    }

    // flatten_path — cubic on a degenerate straight line
    #[test]
    fn flatten_path_cubic_straight_line() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_cubic_curve_to(&mut p, 3.33, 0.0, 6.67, 0.0, 10.0, 0.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        let c = &contours[0];
        assert!(approx_eq(*c.last().unwrap(), 0.0));
        assert!(approx_eq(c[c.len() - 2], 10.0));
    }

    // flatten_path — cubic curve produces intermediate points
    #[test]
    fn flatten_path_cubic_curved_has_multiple_points() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_cubic_curve_to(&mut p, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0);
        let contours = flatten_path(&p, 0.25);
        assert_eq!(contours.len(), 1);
        assert!(contours[0].len() > 4);
        let c = &contours[0];
        assert!(approx_eq(*c.last().unwrap(), 0.0));
        assert!(approx_eq(c[c.len() - 2], 100.0));
    }

    // flatten_path — empty path produces no contours
    #[test]
    fn flatten_path_empty_path() {
        let p = create_path(PathWinding::NonZero);
        let contours = flatten_path(&p, 0.25);
        assert!(contours.is_empty());
    }
}
