use crate::path::Path;
use crate::flatten_path::flatten_path;

/// Returns the total arc length of `path` by summing the Euclidean lengths of all flattened segments.
pub fn get_path_length(path: &Path, tolerance: f64) -> f64 {
    let contours = flatten_path(path, tolerance);
    let mut total: f64 = 0.0;
    for ci in 0..contours.len() {
        total += contour_length(&contours[ci]);
    }
    return total;
}

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
