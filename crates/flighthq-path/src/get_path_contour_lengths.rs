//! Per-contour arc-length measurement of a [`Path`].
//!
//! Curves are adaptively flattened via [`flatten_path`] before measurement. Each
//! contour yields one `f32` length entry in the returned vector.

use flighthq_types::Path;

use crate::flatten_path::flatten_path;

/// Returns a `Vec<f32>` of arc lengths, one per contour in `path`. Curves are
/// adaptively flattened to `tolerance` path units before measurement. An empty
/// path returns an empty vector.
pub fn get_path_contour_lengths(path: &Path, tolerance: f32) -> Vec<f32> {
    let contours = flatten_path(path, tolerance);
    let mut lengths = Vec::with_capacity(contours.len());
    for contour in &contours {
        lengths.push(contour_length(contour));
    }
    lengths
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

    // get_path_contour_lengths
    #[test]
    fn get_path_contour_lengths_empty() {
        let p = create_path(PathWinding::NonZero);
        assert!(get_path_contour_lengths(&p, 0.25).is_empty());
    }

    #[test]
    fn get_path_contour_lengths_single_segment() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 3.0, 4.0);
        let lengths = get_path_contour_lengths(&p, 0.25);
        assert_eq!(lengths.len(), 1);
        assert!(approx_eq(lengths[0], 5.0));
    }

    #[test]
    fn get_path_contour_lengths_two_contours() {
        let mut p = create_path(PathWinding::NonZero);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 10.0, 0.0);
        append_path_move_to(&mut p, 0.0, 0.0);
        append_path_line_to(&mut p, 0.0, 5.0);
        let lengths = get_path_contour_lengths(&p, 0.25);
        assert_eq!(lengths.len(), 2);
        assert!(approx_eq(lengths[0], 10.0));
        assert!(approx_eq(lengths[1], 5.0));
    }
}
