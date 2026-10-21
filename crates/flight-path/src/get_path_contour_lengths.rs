use crate::path::Path;
use crate::flatten_path::flatten_path;

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
        let ra = s.contour_lengths(Some(0.5));
        let rb = get_path_contour_lengths(&s, Some(0.5));
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
pub fn get_path_contour_lengths(path: &Path, tolerance: Option<f64>) -> Vec<f64> {
    let tolerance = tolerance.unwrap_or(0.25);
    let contours = flatten_path(path, Some(tolerance));
    let mut lengths: Vec<f64> = Vec::new();
    for ci in 0..contours.len() {
        lengths.push(contour_length(&contours[ci]));
    }
    return lengths;
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn contour_lengths(&self, tolerance: Option<f64>) -> Vec<f64> {
        return get_path_contour_lengths(self, tolerance);
    }
}
