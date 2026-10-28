use crate::path::{Path, PathMorphCreationExplanation, PathMorphCreationReason};
use crate::path_morph_geometry::build_path_morph;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    fn other_path() -> Path {
        let mut out = create_path(PathWinding::NonZero);
        append_path_move_to(&mut out, 1.0, 1.0);
        append_path_line_to(&mut out, 12.0, 1.0);
        append_path_quadratic_curve_to(&mut out, 15.0, 5.0, 12.0, 12.0);
        append_path_line_to(&mut out, 1.0, 12.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_explain_morph_creation_matches_explain_path_morph_creation() {
        let s = test_path();
        let ra = s.explain_morph_creation(&other_path());
        let rb = explain_path_morph_creation(&s, &other_path());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

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

impl Path {
    pub fn explain_morph_creation(&self, end: &Path) -> PathMorphCreationExplanation {
        return explain_path_morph_creation(self, end);
    }
}
