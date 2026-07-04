//! Closest-point-on-path query.
//!
//! Flattens the path to line segments, then projects the query point onto each
//! segment and returns the nearest result.

use flighthq_types::{Path, Vector2Like};

use crate::flatten_path::flatten_path;

/// Finds the closest point on `path` to `(px, py)`, writing the result into
/// `out`. Returns the Euclidean distance from `(px, py)` to the nearest point.
///
/// Returns `-1.0` and leaves `out` unchanged for an empty path. Curves are
/// adaptively flattened to `tolerance` before the query.
pub fn get_path_nearest_point(
    path: &Path,
    px: f32,
    py: f32,
    out: &mut Vector2Like,
    tolerance: f32,
) -> f32 {
    let contours = flatten_path(path, tolerance);
    let mut best_dist_sq = f32::INFINITY;
    let mut best_x: f32 = 0.0;
    let mut best_y: f32 = 0.0;

    for contour in &contours {
        let mut i = 2;
        while i < contour.len() {
            let ax = contour[i - 2];
            let ay = contour[i - 1];
            let bx = contour[i];
            let by = contour[i + 1];
            let dx = bx - ax;
            let dy = by - ay;
            let len_sq = dx * dx + dy * dy;
            let t = if len_sq == 0.0 {
                0.0
            } else {
                ((px - ax) * dx + (py - ay) * dy) / len_sq
            }
            .clamp(0.0, 1.0);
            let cx = ax + t * dx;
            let cy = ay + t * dy;
            let dist_sq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
            if dist_sq < best_dist_sq {
                best_dist_sq = dist_sq;
                best_x = cx;
                best_y = cy;
            }
            i += 2;
        }
    }

    if best_dist_sq == f32::INFINITY {
        return -1.0;
    }
    out.x = best_x;
    out.y = best_y;
    best_dist_sq.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    // get_path_nearest_point
    #[test]
    fn get_path_nearest_point_empty() {
        let p = create_path(PathWinding::NonZero);
        let mut out = Vector2Like::default();
        assert_eq!(get_path_nearest_point(&p, 5.0, 5.0, &mut out, 0.25), -1.0);
    }

    #[test]
    fn get_path_nearest_point_on_segment() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like::default();
        let dist = get_path_nearest_point(&p, 5.0, 3.0, &mut out, 0.25);
        assert!(approx_eq(dist, 3.0));
        assert!(approx_eq(out.x, 5.0));
        assert!(approx_eq(out.y, 0.0));
    }

    #[test]
    fn get_path_nearest_point_clamps_to_endpoint() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        let mut out = Vector2Like::default();
        let dist = get_path_nearest_point(&p, 20.0, 0.0, &mut out, 0.25);
        assert!(approx_eq(dist, 10.0));
        assert!(approx_eq(out.x, 10.0));
        assert!(approx_eq(out.y, 0.0));
    }
}
