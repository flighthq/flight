use crate::path::{Path, StrokeStyle, StrokePathTessellationExplanation, StrokePathTessellationReason};
use crate::stroke_path_geometry::build_stroke_path_geometry;

/// Pure diagnostic twin of tessellate_stroke_path. Re-runs the shared validation, retains
/// and mutates nothing, and returns detached plain data explaining a null mesh.
pub fn explain_stroke_path_tessellation(
    path: &Path,
    style: &StrokeStyle,
    tolerance: f64,
) -> StrokePathTessellationExplanation {
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    return StrokePathTessellationExplanation {
        supported: geometry.issue == StrokePathTessellationReason::Ok,
        reason: geometry.issue,
        subpath: geometry.issue_subpath,
    };
}
