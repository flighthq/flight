//! Total arc-length measurement of a [`Path`].
//!
//! Curves are adaptively flattened via [`flatten_path`] before measurement. The
//! returned value is the sum of all contour lengths.

use flighthq_types::Path;

use crate::flatten_path::flatten_path;

/// Returns the total arc length of `path` by summing the Euclidean lengths of
/// all flattened segments. Curves are adaptively approximated to `tolerance`
/// path units before measurement. An empty path returns `0.0`.
pub fn get_path_length(path: &Path, tolerance: f32) -> f32 {
    let contours = flatten_path(path, tolerance);
    let mut total: f32 = 0.0;
    for contour in &contours {
        total += contour_length(contour);
    }
    total
}

/// Summed Euclidean length of the polyline segments in one flat contour.
fn contour_length(contour: &[f32]) -> f32 {
    let mut len: f32 = 0.0;
    let mut i = 2;
    while i < contour.len() {
        let dx = contour[i] - contour[i - 2];
        let dy = contour[i + 1] - contour[i - 1];
        len += (dx * dx + dy * dy).sqrt();
        i += 2;
    }
    len
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path::{append_path_line_to, append_path_move_to, create_path};
    use flighthq_types::PathWinding;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    // get_path_length
    #[test]
    fn get_path_length_empty() {
        let p = create_path(PathWinding::NonZero);
        assert_eq!(get_path_length(&p, 0.25), 0.0);
    }

    #[test]
    fn get_path_length_single_segment() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 3.0, 4.0);
        assert!(approx_eq(get_path_length(&p, 0.25), 5.0));
    }

    #[test]
    fn get_path_length_two_contours() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 0.0, 5.0);
        assert!(approx_eq(get_path_length(&p, 0.25), 15.0));
    }
}
