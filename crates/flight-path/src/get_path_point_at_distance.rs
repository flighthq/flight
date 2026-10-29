use flight_geometry::Vector2Like;

use crate::flatten_path::flatten_path;
use crate::path::Path;

#[cfg(test)]
mod sugar_tests {
    use flight_geometry::create_vector2;

    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_point_at_distance_matches_get_path_point_at_distance() {
        let mut oa1 = create_vector2(0.0, 0.0);
        let mut ob1 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.point_at_distance(7.0, &mut oa1, Some(0.5));
        let rb = get_path_point_at_distance(&s, 7.0, &mut ob1, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa1), format!("{:?}", ob1));
    }

    #[test]
    fn path_position_at_distance_matches_get_path_position_at_distance() {
        let mut oa1 = create_vector2(0.0, 0.0);
        let mut ob1 = create_vector2(0.0, 0.0);
        let mut oa2 = create_vector2(0.0, 0.0);
        let mut ob2 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.position_at_distance(7.0, &mut oa1, &mut oa2, Some(0.5));
        let rb = get_path_position_at_distance(&s, 7.0, &mut ob1, &mut ob2, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa1), format!("{:?}", ob1));
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }

    #[test]
    fn path_tangent_at_distance_matches_get_path_tangent_at_distance() {
        let mut oa1 = create_vector2(0.0, 0.0);
        let mut ob1 = create_vector2(0.0, 0.0);
        let s = test_path();
        let ra = s.tangent_at_distance(7.0, &mut oa1, Some(0.5));
        let rb = get_path_tangent_at_distance(&s, 7.0, &mut ob1, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", oa1), format!("{:?}", ob1));
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Evaluates the point on the path at `distance` arc-length units from the start.
/// Returns `true` if the path has geometry; `false` for an empty path.
pub fn get_path_point_at_distance(
    path: &Path,
    distance: f64,
    out: &mut Vector2Like,
    tolerance: Option<f64>,
) -> bool {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    return sample_path_point(&contours, distance, out);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Evaluates both the point and the unit tangent at `distance`.
pub fn get_path_position_at_distance(
    path: &Path,
    distance: f64,
    point_out: &mut Vector2Like,
    tangent_out: &mut Vector2Like,
    tolerance: Option<f64>,
) -> bool {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    let has_point = sample_path_point(&contours, distance, point_out);
    sample_path_tangent(&contours, distance, tangent_out);
    return has_point;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Evaluates the unit tangent direction of the path at `distance` arc-length units.
pub fn get_path_tangent_at_distance(
    path: &Path,
    distance: f64,
    out: &mut Vector2Like,
    tolerance: Option<f64>,
) -> bool {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    return sample_path_tangent(&contours, distance, out);
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
fn sample_path_point(contours: &[Vec<f64>], distance: f64, out: &mut Vector2Like) -> bool {
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
                let t = if seg_len > 0.0 {
                    remaining / seg_len
                } else {
                    0.0
                };
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

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
fn sample_path_tangent(contours: &[Vec<f64>], distance: f64, out: &mut Vector2Like) -> bool {
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

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn point_at_distance(
        &self,
        distance: f64,
        out: &mut Vector2Like,
        tolerance: Option<f64>,
    ) -> bool {
        return get_path_point_at_distance(self, distance, out, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn position_at_distance(
        &self,
        distance: f64,
        point_out: &mut Vector2Like,
        tangent_out: &mut Vector2Like,
        tolerance: Option<f64>,
    ) -> bool {
        return get_path_position_at_distance(self, distance, point_out, tangent_out, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn tangent_at_distance(
        &self,
        distance: f64,
        out: &mut Vector2Like,
        tolerance: Option<f64>,
    ) -> bool {
        return get_path_tangent_at_distance(self, distance, out, tolerance);
    }
}
