use flight_geometry::Vector2;

use crate::path::Path;
use crate::flatten_path::flatten_path;

/// Evaluates the point on the path at `distance` arc-length units from the start.
/// Returns `true` if the path has geometry; `false` for an empty path.
pub fn get_path_point_at_distance(
    path: &Path,
    distance: f64,
    out: &mut Vector2,
    tolerance: f64,
) -> bool {
    let contours = flatten_path(path, tolerance);
    return sample_path_point(&contours, distance, out);
}

/// Evaluates both the point and the unit tangent at `distance`.
pub fn get_path_position_at_distance(
    path: &Path,
    distance: f64,
    point_out: &mut Vector2,
    tangent_out: &mut Vector2,
    tolerance: f64,
) -> bool {
    let contours = flatten_path(path, tolerance);
    let has_point = sample_path_point(&contours, distance, point_out);
    sample_path_tangent(&contours, distance, tangent_out);
    return has_point;
}

/// Evaluates the unit tangent direction of the path at `distance` arc-length units.
pub fn get_path_tangent_at_distance(
    path: &Path,
    distance: f64,
    out: &mut Vector2,
    tolerance: f64,
) -> bool {
    let contours = flatten_path(path, tolerance);
    return sample_path_tangent(&contours, distance, out);
}

fn sample_path_point(contours: &[Vec<f64>], distance: f64, out: &mut Vector2) -> bool {
    if contours.is_empty() {
        return false;
    }
    let mut remaining = distance;
    for ci in 0..contours.len() {
        let contour = &contours[ci];
        if contour.len() < 2 {
            continue;
        }
        if remaining <= 0.0 {
            out.x = contour[0] as f32;
            out.y = contour[1] as f32;
            return true;
        }
        let mut i = 2;
        while i < contour.len() {
            let dx = contour[i] - contour[i - 2];
            let dy = contour[i + 1] - contour[i - 1];
            let seg_len = (dx * dx + dy * dy).sqrt();
            if remaining <= seg_len {
                let t = if seg_len > 0.0 { remaining / seg_len } else { 0.0 };
                out.x = (contour[i - 2] + t * dx) as f32;
                out.y = (contour[i - 1] + t * dy) as f32;
                return true;
            }
            remaining -= seg_len;
            i += 2;
        }
    }
    let last = &contours[contours.len() - 1];
    out.x = last[last.len() - 2] as f32;
    out.y = last[last.len() - 1] as f32;
    return true;
}

fn sample_path_tangent(contours: &[Vec<f64>], distance: f64, out: &mut Vector2) -> bool {
    if contours.is_empty() {
        out.x = 1.0;
        out.y = 0.0;
        return false;
    }
    let mut remaining = distance;
    let mut last_tx: f64 = 1.0;
    let mut last_ty: f64 = 0.0;
    for ci in 0..contours.len() {
        let contour = &contours[ci];
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
                out.x = last_tx as f32;
                out.y = last_ty as f32;
                return true;
            }
            remaining -= seg_len;
            i += 2;
        }
    }
    out.x = last_tx as f32;
    out.y = last_ty as f32;
    return true;
}
