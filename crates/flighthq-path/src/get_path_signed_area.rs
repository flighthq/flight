//! Signed area and contour orientation of a [`Path`].
//!
//! Uses the shoelace (Gauss) formula on the flattened contour polylines. Positive
//! signed area indicates counter-clockwise winding (in a y-up coordinate system);
//! negative indicates clockwise.

use flighthq_types::{ContourOrientation, Path};

use crate::flatten_path::flatten_path;

/// Returns the orientation of the path's primary (first) contour.
///
/// - `Ccw` if the first contour has positive signed area.
/// - `Cw` if the first contour has negative signed area.
/// - `Degenerate` if the path is empty or the first contour has zero area.
pub fn get_path_contour_orientation(path: &Path, tolerance: f32) -> ContourOrientation {
    let contours = flatten_path(path, tolerance);
    if contours.is_empty() {
        return ContourOrientation::Degenerate;
    }
    let area = shoelace_area(&contours[0]);
    if area > 0.0 {
        ContourOrientation::Ccw
    } else if area < 0.0 {
        ContourOrientation::Cw
    } else {
        ContourOrientation::Degenerate
    }
}

/// Returns the signed area of `path` (summed across all contours) by applying
/// the shoelace formula to the flattened contours.
///
/// Positive values indicate CCW winding (in a y-up coordinate system); negative
/// values indicate CW winding (in y-down screen space). An empty path returns `0.0`.
pub fn get_path_signed_area(path: &Path, tolerance: f32) -> f32 {
    let contours = flatten_path(path, tolerance);
    let mut total: f32 = 0.0;
    for contour in &contours {
        total += shoelace_area(contour);
    }
    total
}

/// Shoelace (Gauss) formula for the signed area of a polygon given as a flat
/// `[x0, y0, x1, y1, ...]` coordinate array.
fn shoelace_area(contour: &[f32]) -> f32 {
    let n = contour.len() / 2;
    if n < 3 {
        return 0.0;
    }
    let mut area: f32 = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += contour[i * 2] * contour[j * 2 + 1];
        area -= contour[j * 2] * contour[i * 2 + 1];
    }
    area / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_close, append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    // get_path_contour_orientation
    #[test]
    fn get_path_contour_orientation_ccw() {
        // CCW triangle (in y-up: vertices listed counter-clockwise).
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 0.0, 10.0);
        append_path_close(&mut p);
        assert_eq!(
            get_path_contour_orientation(&p, 0.25),
            ContourOrientation::Ccw
        );
    }

    #[test]
    fn get_path_contour_orientation_cw() {
        // CW triangle.
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 0.0, 10.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_close(&mut p);
        assert_eq!(
            get_path_contour_orientation(&p, 0.25),
            ContourOrientation::Cw
        );
    }

    #[test]
    fn get_path_contour_orientation_degenerate() {
        let p = create_path(PathWinding::NonZero);
        assert_eq!(
            get_path_contour_orientation(&p, 0.25),
            ContourOrientation::Degenerate
        );
    }

    // get_path_signed_area
    #[test]
    fn get_path_signed_area_empty() {
        let p = create_path(PathWinding::NonZero);
        assert_eq!(get_path_signed_area(&p, 0.25), 0.0);
    }

    #[test]
    fn get_path_signed_area_unit_square() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_line_to(&mut p, 10.0, 10.0);
        append_path_line_to(&mut p, 0.0, 10.0);
        append_path_close(&mut p);
        let area = get_path_signed_area(&p, 0.25);
        assert!(approx_eq(area.abs(), 100.0));
    }
}
