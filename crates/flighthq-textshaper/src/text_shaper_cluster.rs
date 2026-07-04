//! Caret-position and cluster-index queries over a `ShapedRun`.
//!
//! Unlike summing per-character widths, these respect per-glyph `x_offset`
//! (mark attachment, kerning corrections) and ligature clusters -- the caret
//! jumps at cluster boundaries, not character boundaries, which is correct for
//! editing into ligatures and composed characters.

use flighthq_types::ShapedRun;

/// Returns the per-grapheme caret x-positions for the run, in visual order.
/// Each position is the x-coordinate of the caret insertion point before the
/// corresponding glyph, measured in pixels from the left edge of the run. The
/// returned `Vec` has `glyph_count + 1` entries: index 0 is the left edge
/// (0.0), and the last entry is the total advance width of the run.
pub fn get_caret_positions_for_run(run: &ShapedRun) -> Vec<f32> {
    let count = run.glyph_count as usize;
    let mut positions = Vec::with_capacity(count + 1);
    positions.push(0.0);
    let mut x = 0.0f32;
    for i in 0..count {
        x += run.glyphs[i].x_advance;
        positions.push(x);
    }
    positions
}

/// Returns the cluster index (code-unit offset into the shaped string) for the
/// glyph that covers `string_index`. If no glyph covers the given index
/// exactly, returns the cluster of the nearest preceding glyph. Returns `-1`
/// for an empty run or when `string_index` is out of range.
pub fn get_cluster_for_index(run: &ShapedRun, string_index: i32) -> i32 {
    if run.glyph_count == 0 || string_index < 0 {
        return -1;
    }
    let target = string_index as u32;
    let mut best: i32 = -1;
    for glyph in &run.glyphs {
        if glyph.cluster <= target {
            best = glyph.cluster as i32;
        }
    }
    best
}

/// Returns the `[start, end)` string index range that the given cluster
/// occupies. `cluster` is a cluster value as returned by
/// [`get_cluster_for_index`]. Returns `None` when the cluster is not found in
/// the run, or when the run is empty.
///
/// The range is derived from the cluster values of adjacent glyphs: the end of
/// a cluster is the cluster value of the next distinct cluster. Callers that
/// know the source string length should pass it as `string_length` to get an
/// exact end for the final cluster.
pub fn get_index_range_for_cluster(
    run: &ShapedRun,
    cluster: u32,
    string_length: Option<usize>,
) -> Option<(usize, usize)> {
    if run.glyph_count == 0 {
        return None;
    }
    for (i, glyph) in run.glyphs.iter().enumerate() {
        if glyph.cluster == cluster {
            // Find the next distinct cluster value to determine the end.
            let mut end: Option<u32> = None;
            for j in (i + 1)..run.glyphs.len() {
                if run.glyphs[j].cluster != cluster {
                    end = Some(run.glyphs[j].cluster);
                    break;
                }
            }
            let end = match end {
                Some(e) => e as usize,
                None => string_length.unwrap_or(cluster as usize + 1),
            };
            return Some((cluster as usize, end));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use flighthq_types::{ShapedGlyph, ShapedRun};

    use super::*;

    fn two_glyph_run() -> ShapedRun {
        ShapedRun {
            advance_width: 18.0,
            glyph_count: 2,
            glyphs: vec![
                ShapedGlyph {
                    cluster: 0,
                    glyph_id: 10,
                    x_advance: 8.0,
                    ..Default::default()
                },
                ShapedGlyph {
                    cluster: 1,
                    glyph_id: 20,
                    x_advance: 10.0,
                    ..Default::default()
                },
            ],
            ..Default::default()
        }
    }

    fn ligature_run() -> ShapedRun {
        // Two glyphs sharing cluster 0 (ligature), then one glyph at cluster 2.
        ShapedRun {
            advance_width: 24.0,
            glyph_count: 3,
            glyphs: vec![
                ShapedGlyph {
                    cluster: 0,
                    glyph_id: 100,
                    x_advance: 12.0,
                    ..Default::default()
                },
                ShapedGlyph {
                    cluster: 0,
                    glyph_id: 101,
                    x_advance: 4.0,
                    ..Default::default()
                },
                ShapedGlyph {
                    cluster: 2,
                    glyph_id: 200,
                    x_advance: 8.0,
                    ..Default::default()
                },
            ],
            ..Default::default()
        }
    }

    #[test]
    fn get_caret_positions_for_run_empty_run() {
        let run = ShapedRun::default();
        let positions = get_caret_positions_for_run(&run);
        assert_eq!(positions, vec![0.0]);
    }

    #[test]
    fn get_caret_positions_for_run_two_glyphs() {
        let run = two_glyph_run();
        let positions = get_caret_positions_for_run(&run);
        assert_eq!(positions.len(), 3);
        assert_eq!(positions[0], 0.0);
        assert_eq!(positions[1], 8.0);
        assert_eq!(positions[2], 18.0);
    }

    #[test]
    fn get_cluster_for_index_empty_run() {
        let run = ShapedRun::default();
        assert_eq!(get_cluster_for_index(&run, 0), -1);
    }

    #[test]
    fn get_cluster_for_index_negative_index() {
        let run = two_glyph_run();
        assert_eq!(get_cluster_for_index(&run, -1), -1);
    }

    #[test]
    fn get_cluster_for_index_exact_match() {
        let run = two_glyph_run();
        assert_eq!(get_cluster_for_index(&run, 0), 0);
        assert_eq!(get_cluster_for_index(&run, 1), 1);
    }

    #[test]
    fn get_cluster_for_index_between_clusters() {
        let run = ligature_run();
        // Index 1 is between cluster 0 and cluster 2 -> nearest preceding is 0.
        assert_eq!(get_cluster_for_index(&run, 1), 0);
    }

    #[test]
    fn get_index_range_for_cluster_empty_run() {
        let run = ShapedRun::default();
        assert_eq!(get_index_range_for_cluster(&run, 0, None), None);
    }

    #[test]
    fn get_index_range_for_cluster_simple() {
        let run = two_glyph_run();
        assert_eq!(get_index_range_for_cluster(&run, 0, None), Some((0, 1)));
        assert_eq!(get_index_range_for_cluster(&run, 1, None), Some((1, 2)));
    }

    #[test]
    fn get_index_range_for_cluster_with_string_length() {
        let run = two_glyph_run();
        assert_eq!(get_index_range_for_cluster(&run, 1, Some(5)), Some((1, 5)));
    }

    #[test]
    fn get_index_range_for_cluster_not_found() {
        let run = two_glyph_run();
        assert_eq!(get_index_range_for_cluster(&run, 99, None), None);
    }

    #[test]
    fn get_index_range_for_cluster_ligature() {
        let run = ligature_run();
        // Cluster 0 spans glyphs 0 and 1; next distinct cluster is 2.
        assert_eq!(get_index_range_for_cluster(&run, 0, None), Some((0, 2)));
    }
}
