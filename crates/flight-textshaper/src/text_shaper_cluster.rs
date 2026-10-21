use crate::types::*;

/// The run's caret x-positions in pixels, `glyph_count + 1` entries from 0 to the total advance: the
/// pen before each glyph. Drawing offsets do not move the caret; advances do.
pub fn get_caret_positions_for_run(run: &ShapedRun) -> Vec<f32> {
    let mut positions = Vec::with_capacity(run.glyph_count + 1);
    positions.push(0.0);
    let mut x = 0.0;
    for glyph in &run.glyphs[..run.glyph_count] {
        x += glyph.x_advance;
        positions.push(x);
    }
    return positions;
}

/// The cluster (a UTF-16 code-unit offset) of the last glyph whose cluster is at or before
/// `string_index`; -1 for an empty run, a negative index, or no such glyph.
pub fn get_cluster_for_index(run: &ShapedRun, string_index: i32) -> i32 {
    if run.glyph_count == 0 || string_index < 0 {
        return -1;
    }
    let mut best = -1;
    for glyph in &run.glyphs {
        if glyph.cluster <= string_index {
            best = glyph.cluster;
        }
    }
    return best;
}

/// The `[start, end)` code-unit range of `cluster`: up to the next distinct cluster, or for the final
/// cluster `string_length` when given and `cluster + 1` otherwise. `None` for an empty run or an
/// absent cluster.
pub fn get_index_range_for_cluster(
    run: &ShapedRun,
    cluster: i32,
    string_length: Option<i32>,
) -> Option<(i32, i32)> {
    if run.glyph_count == 0 {
        return None;
    }
    let index = run
        .glyphs
        .iter()
        .position(|glyph| glyph.cluster == cluster)?;
    let next = run.glyphs[index + 1..]
        .iter()
        .find(|glyph| glyph.cluster != cluster)
        .map(|glyph| glyph.cluster);
    let end = next.unwrap_or_else(|| string_length.unwrap_or(cluster + 1));
    return Some((cluster, end));
}
