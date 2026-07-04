//! Point, tangent, and position sampling at arc-length distance along a [`Path`].
//!
//! Flattens the path and walks the resulting polyline contours, accumulating
//! arc length until the requested distance is reached. Clamps to the first or
//! last endpoint when the distance is out of range.

use flighthq_types::{Path, Vector2Like};

use crate::flatten_path::flatten_path;

/// Evaluates the point on `path` at `distance` arc-length units from the start,
/// writing it into `out`. Returns `true` if the path contains any geometry;
/// `false` if the path is empty, in which case `out` is left unchanged.
///
/// When `distance` exceeds the total path length, the result clamps to the
/// final endpoint. When `distance` is negative, it clamps to the first endpoint.
pub fn get_path_point_at_distance(
    path: &Path,
    distance: f32,
    out: &mut Vector2Like,
    tolerance: f32,
) -> bool {
    let contours = flatten_path(path, tolerance);
    sample_path_point(&contours, distance, out)
}

/// Evaluates both the point and the unit tangent at `distance`, writing results
/// into `point_out` and `tangent_out`. More efficient than calling both functions
/// separately (one flatten pass).
pub fn get_path_position_at_distance(
    path: &Path,
    distance: f32,
    point_out: &mut Vector2Like,
    tangent_out: &mut Vector2Like,
    tolerance: f32,
) -> bool {
    let contours = flatten_path(path, tolerance);
    let has_point = sample_path_point(&contours, distance, point_out);
    sample_path_tangent(&contours, distance, tangent_out);
    has_point
}

/// Evaluates the unit tangent direction of `path` at `distance` arc-length
/// units from the start, writing the result into `out`. Returns `true` on
/// success, `false` for an empty path.
pub fn get_path_tangent_at_distance(
    path: &Path,
    distance: f32,
    out: &mut Vector2Like,
    tolerance: f32,
) -> bool {
    let contours = flatten_path(path, tolerance);
    sample_path_tangent(&contours, distance, out)
}

/// Shared arc-length walk: finds the point at `distance` across all contours.
fn sample_path_point(contours: &[Vec<f32>], distance: f32, out: &mut Vector2Like) -> bool {
    if contours.is_empty() {
        return false;
    }
    let mut remaining = distance;
    for contour in contours {
        if contour.len() < 2 {
            continue;
        }
        // Clamp to start of first contour.
        if remaining <= 0.0 {
            out.x = contour[0];
            out.y = contour[1];
            return true;
        }
        let mut i = 2;
        while i < contour.len() {
            let dx = contour[i] - contour[i - 2];
            let dy = contour[i + 1] - contour[i - 1];
            let seg_len = (dx * dx + dy * dy).sqrt();
            if remaining <= seg_len {
                let t = if seg_len > 0.0 {
                    remaining / seg_len
                } else {
                    0.0
                };
                out.x = contour[i - 2] + t * dx;
                out.y = contour[i - 1] + t * dy;
                return true;
            }
            remaining -= seg_len;
            i += 2;
        }
    }
    // Clamped to the last endpoint.
    let last = &contours[contours.len() - 1];
    out.x = last[last.len() - 2];
    out.y = last[last.len() - 1];
    true
}

/// Shared arc-length walk: finds the unit tangent at `distance` across all contours.
fn sample_path_tangent(contours: &[Vec<f32>], distance: f32, out: &mut Vector2Like) -> bool {
    if contours.is_empty() {
        out.x = 1.0;
        out.y = 0.0;
        return false;
    }
    let mut remaining = distance;
    let mut last_tx: f32 = 1.0;
    let mut last_ty: f32 = 0.0;
    for contour in contours {
        if contour.len() < 4 {
            continue;
        }
        let mut i = 2;
        while i < contour.len() {
            let dx = contour[i] - contour[i - 2];
            let dy = contour[i + 1] - contour[i - 1];
            let seg_len = (dx * dx + dy * dy).sqrt();
            if seg_len > 0.0 {
                let inv_len = 1.0 / seg_len;
                last_tx = dx * inv_len;
                last_ty = dy * inv_len;
            }
            if remaining <= seg_len {
                out.x = last_tx;
                out.y = last_ty;
                return true;
            }
            remaining -= seg_len;
            i += 2;
        }
    }
    out.x = last_tx;
    out.y = last_ty;
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    // get_path_point_at_distance
    #[test]
    fn get_path_point_at_distance_empty() {
        let p = create_path(PathWinding::NonZero);
        let mut out = Vector2Like::default();
        assert!(!get_path_point_at_distance(&p, 5.0, &mut out, 0.25));
    }

    #[test]
    fn get_path_point_at_distance_midpoint() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like::default();
        assert!(get_path_point_at_distance(&p, 5.0, &mut out, 0.25));
        assert!(approx_eq(out.x, 5.0));
        assert!(approx_eq(out.y, 0.0));
    }

    #[test]
    fn get_path_point_at_distance_clamps_to_end() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like::default();
        assert!(get_path_point_at_distance(&p, 100.0, &mut out, 0.25));
        assert!(approx_eq(out.x, 10.0));
        assert!(approx_eq(out.y, 0.0));
    }

    #[test]
    fn get_path_point_at_distance_clamps_negative() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 5.0, 5.0);
        append_path_line_to(&mut p, 15.0, 5.0);
        let mut out = Vector2Like::default();
        assert!(get_path_point_at_distance(&p, -1.0, &mut out, 0.25));
        assert!(approx_eq(out.x, 5.0));
        assert!(approx_eq(out.y, 5.0));
    }

    // get_path_position_at_distance
    #[test]
    fn get_path_position_at_distance_returns_both() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut pt = Vector2Like::default();
        let mut tg = Vector2Like::default();
        assert!(get_path_position_at_distance(
            &p, 5.0, &mut pt, &mut tg, 0.25
        ));
        assert!(approx_eq(pt.x, 5.0));
        assert!(approx_eq(tg.x, 1.0));
        assert!(approx_eq(tg.y, 0.0));
    }

    // get_path_tangent_at_distance
    #[test]
    fn get_path_tangent_at_distance_empty() {
        let p = create_path(PathWinding::NonZero);
        let mut out = Vector2Like::default();
        assert!(!get_path_tangent_at_distance(&p, 0.0, &mut out, 0.25));
        // default direction
        assert!(approx_eq(out.x, 1.0));
        assert!(approx_eq(out.y, 0.0));
    }

    #[test]
    fn get_path_tangent_at_distance_horizontal() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like::default();
        assert!(get_path_tangent_at_distance(&p, 5.0, &mut out, 0.25));
        assert!(approx_eq(out.x, 1.0));
        assert!(approx_eq(out.y, 0.0));
    }
}
