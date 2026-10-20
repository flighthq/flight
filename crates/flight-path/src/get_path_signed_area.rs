use crate::path::Path;
use crate::flatten_path::flatten_path;

/// Contour orientation result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContourOrientation {
    Ccw,
    Cw,
    Degenerate,
}

/// Returns the orientation of the path's primary (first) contour.
pub fn get_path_contour_orientation(path: &Path, tolerance: f64) -> ContourOrientation {
    let contours = flatten_path(path, tolerance);
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

/// Returns the signed area of the path (summed across all contours) by applying the shoelace
/// formula to the flattened contours.
pub fn get_path_signed_area(path: &Path, tolerance: f64) -> f64 {
    let contours = flatten_path(path, tolerance);
    let mut total: f64 = 0.0;
    for ci in 0..contours.len() {
        total += shoelace_area(&contours[ci]);
    }
    return total;
}

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
