use crate::path::{Path, PathMorphCreationExplanation, PathMorphCreationReason};
use crate::path_morph_geometry::build_path_morph;

/// Pure diagnostic twin of create_path_morph. Re-runs preparation, retains and mutates nothing,
/// and returns detached data explaining whether the two paths have compatible morph topology.
pub fn explain_path_morph_creation(start: &Path, end: &Path) -> PathMorphCreationExplanation {
    let result = build_path_morph(start, end);
    return PathMorphCreationExplanation {
        supported: result.issue == PathMorphCreationReason::Ok,
        reason: result.issue,
        contour: result.contour,
    };
}
