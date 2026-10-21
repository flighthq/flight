use crate::path::Path;
use crate::flatten_path::flatten_path;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(None);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_contour_orientation_matches_get_path_contour_orientation() {
        let s = test_path();
        let ra = s.contour_orientation(Some(0.5));
        let rb = get_path_contour_orientation(&s, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn path_signed_area_matches_get_path_signed_area() {
        let s = test_path();
        let ra = s.signed_area(Some(0.5));
        let rb = get_path_signed_area(&s, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Contour orientation result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContourOrientation {
    Ccw,
    Cw,
    Degenerate,
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Returns the orientation of the path's primary (first) contour.
pub fn get_path_contour_orientation(path: &Path, tolerance: Option<f64>) -> ContourOrientation {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    if contours.is_empty() {
        return ContourOrientation::Degenerate;
    }
    let area = shoelace_area(&contours[0]);
    if area > 0.0 {
        return ContourOrientation::Ccw;
    }
    if area < 0.0 {
        return ContourOrientation::Cw;
    }
    return ContourOrientation::Degenerate;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Returns the signed area of the path (summed across all contours) by applying the shoelace
/// formula to the flattened contours.
pub fn get_path_signed_area(path: &Path, tolerance: Option<f64>) -> f64 {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    let mut total: f64 = 0.0;
    for ci in 0..contours.len() {
        total += shoelace_area(&contours[ci]);
    }
    return total;
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
fn shoelace_area(contour: &[f64]) -> f64 {
    let n = contour.len() / 2;
    if n < 3 {
        return 0.0;
    }
    let mut area: f64 = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += contour[i * 2] * contour[j * 2 + 1];
        area -= contour[j * 2] * contour[i * 2 + 1];
    }
    return area / 2.0;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn contour_orientation(&self, tolerance: Option<f64>) -> ContourOrientation {
        return get_path_contour_orientation(self, tolerance);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn signed_area(&self, tolerance: Option<f64>) -> f64 {
        return get_path_signed_area(self, tolerance);
    }
}
