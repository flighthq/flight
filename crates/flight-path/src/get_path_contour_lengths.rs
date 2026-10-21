use crate::path::Path;
use crate::flatten_path::flatten_path;

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

/// Returns an array of arc lengths, one per contour in the path.
pub fn get_path_contour_lengths(path: &Path, tolerance: f64) -> Vec<f64> {
    let contours = flatten_path(path, tolerance);
    let mut lengths: Vec<f64> = Vec::new();
    for ci in 0..contours.len() {
        lengths.push(contour_length(&contours[ci]));
    }
    return lengths;
}
