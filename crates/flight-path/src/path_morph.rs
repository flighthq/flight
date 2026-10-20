use crate::path::{Path, PathMorph};
use crate::path_morph_geometry::build_path_morph;

/// Allocates a prepared interpolation between two paths. Returns `None` when the paths
/// are incompatible (different winding, contour count, closedness, or orientation).
pub fn create_path_morph(start: &Path, end: &Path) -> Option<PathMorph> {
    let result = build_path_morph(start, end);
    return result.morph;
}

/// Samples a prepared morph into `out`. Progress is not clamped: 0 and 1 are the endpoints,
/// while values outside that range permit deliberate easing overshoot.
pub fn sample_path_morph(out: &mut Path, morph: &PathMorph, progress: f64) {
    let commands = &morph.commands;
    out.commands.resize(commands.len(), 0);
    for i in 0..commands.len() {
        out.commands[i] = commands[i];
    }

    let start_data = &morph.start_data;
    let end_data = &morph.end_data;
    out.data.resize(start_data.len(), 0.0);
    if progress == 0.0 || progress == 1.0 {
        let endpoint = if progress == 0.0 { start_data } else { end_data };
        for i in 0..endpoint.len() {
            out.data[i] = endpoint[i];
        }
        out.winding = morph.winding;
        return;
    }
    for i in 0..start_data.len() {
        let s = start_data[i];
        let e = end_data[i];
        out.data[i] = s + (e - s) * progress;
    }
    out.winding = morph.winding;
}
