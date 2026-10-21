use crate::path::{Path, StrokeStyle, StrokePathTessellationExplanation, StrokePathTessellationReason};
use crate::stroke_path_geometry::build_stroke_path_geometry;

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Pure diagnostic twin of tessellate_stroke_path. Re-runs the shared validation, retains
/// and mutates nothing, and returns detached plain data explaining a null mesh.
pub fn explain_stroke_path_tessellation(
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f64>) -> StrokePathTessellationExplanation {
    let tolerance = tolerance.unwrap_or(0.25);
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    return StrokePathTessellationExplanation {
        supported: geometry.issue == StrokePathTessellationReason::Ok,
        reason: geometry.issue,
        subpath: geometry.issue_subpath,
    };
}
