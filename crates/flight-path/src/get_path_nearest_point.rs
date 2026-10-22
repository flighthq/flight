use flight_geometry::Vector2;

use crate::path::Path;
use crate::flatten_path::flatten_path;

#[cfg(test)]
mod sugar_tests {
    use flight_geometry::create_vector2;

    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path();
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_nearest_point_matches_get_path_nearest_point() {
        let mut oa2 = create_vector2(0.0, 0.0);
        let mut ob2 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.nearest_point(3.0, 4.0, &mut oa2, Some(0.5));
        let rb = get_path_nearest_point(&s, 3.0, 4.0, &mut ob2, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Finds the closest point on `path` to (px, py), writing the result into `out`.
/// Returns the distance from (px, py) to the nearest point. Returns -1 and leaves
/// `out` unchanged for an empty path.
pub fn get_path_nearest_point(
    path: &Path,
    px: f64,
    py: f64,
    out: &mut Vector2,
    tolerance: Option<f64>) -> f64 {
    let tolerance = tolerance.unwrap_or(0.25);
    let mut contours = Vec::new();
    flatten_path(&mut contours, path, Some(tolerance));
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

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn nearest_point(&self, px: f64, py: f64, out: &mut Vector2, tolerance: Option<f64>) -> f64 {
        return get_path_nearest_point(self, px, py, out, tolerance);
    }
}
