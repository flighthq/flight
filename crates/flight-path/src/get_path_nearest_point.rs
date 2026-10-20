use flight_geometry::Vector2;

use crate::path::Path;
use crate::flatten_path::flatten_path;

/// Finds the closest point on `path` to (px, py), writing the result into `out`.
/// Returns the distance from (px, py) to the nearest point. Returns -1 and leaves
/// `out` unchanged for an empty path.
pub fn get_path_nearest_point(
    path: &Path,
    px: f64,
    py: f64,
    out: &mut Vector2,
    tolerance: f64,
) -> f64 {
    let contours = flatten_path(path, tolerance);
    let mut best_dist_sq = f64::INFINITY;
    let mut best_x: f64 = 0.0;
    let mut best_y: f64 = 0.0;

    for ci in 0..contours.len() {
        let contour = &contours[ci];
        let mut i = 2;
        while i < contour.len() {
            let ax = contour[i - 2];
            let ay = contour[i - 1];
            let bx = contour[i];
            let by = contour[i + 1];
            let dx = bx - ax;
            let dy = by - ay;
            let len_sq = dx * dx + dy * dy;
            let t;
            if len_sq == 0.0 {
                t = 0.0;
            } else {
                let raw = ((px - ax) * dx + (py - ay) * dy) / len_sq;
                t = if raw < 0.0 { 0.0 } else if raw > 1.0 { 1.0 } else { raw };
            }
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

    if best_dist_sq == f64::INFINITY {
        return -1.0;
    }
    out.x = best_x as f32;
    out.y = best_y as f32;
    return best_dist_sq.sqrt();
}
