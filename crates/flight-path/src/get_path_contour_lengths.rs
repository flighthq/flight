use crate::flatten_path::flatten_path;
use crate::path::Path;

#[cfg(test)]
mod sugar_tests {
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
    fn path_contour_lengths_matches_get_path_contour_lengths() {
        let s = test_path();
        let mut ra = Vec::new();
        let mut rb = Vec::new();
        s.contour_lengths(&mut ra, Some(0.5));
        get_path_contour_lengths(&mut rb, &s, Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
fn contour_length(contour: &[f64]) -> f64 {
    let mut len: f64 = 0.0;
    let mut i = 2;
    while i < contour.len() {
        let dx = contour[i] - contour[i - 2];
        let dy = contour[i + 1] - contour[i - 1];
        len += (dx * dx + dy * dy).sqrt();
        i += 2;
    }
    return len;
}

// flight-lint: allow(f64) Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured
/// Returns an array of arc lengths, one per contour in the path.
// flight-lint: allow(conform-params) D24 caller-owned computed output is first, required, cleared, and refilled
pub fn get_path_contour_lengths(out: &mut Vec<f64>, path: &Path, tolerance: Option<f64>) {
    out.clear();
    let tolerance = tolerance.unwrap_or(0.25);
    let mut contours = Vec::new();
    flatten_path(&mut contours, path, Some(tolerance));
    for ci in 0..contours.len() {
        out.push(contour_length(&contours[ci]));
    }
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn contour_lengths(&self, out: &mut Vec<f64>, tolerance: Option<f64>) {
        get_path_contour_lengths(out, self, tolerance);
    }
}
