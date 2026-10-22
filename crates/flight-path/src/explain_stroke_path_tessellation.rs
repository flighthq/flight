use crate::path::{
    Path, StrokePathTessellationExplanation, StrokePathTessellationReason, StrokeStyle,
};
use crate::stroke_path_geometry::build_stroke_path_geometry;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path();
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    fn test_style() -> StrokeStyle {
        return StrokeStyle {
            width: 2.0,
            cap: StrokeCap::Round,
            join: StrokeJoin::Round,
            miter_limit: 4.0,
            dash: Vec::new(),
            dash_offset: 0.0,
        };
    }

    #[test]
    fn path_explain_stroke_tessellation_matches_explain_stroke_path_tessellation() {
        let s = test_path();
        let ra = s.explain_stroke_tessellation(&test_style(), Some(0.5));
        let rb = explain_stroke_path_tessellation(&s, &test_style(), Some(0.5));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

// flight-lint: allow(f64) orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured
/// Pure diagnostic twin of tessellate_stroke_path. Re-runs the shared validation, retains
/// and mutates nothing, and returns detached plain data explaining a null mesh.
pub fn explain_stroke_path_tessellation(
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f64>,
) -> StrokePathTessellationExplanation {
    let tolerance = tolerance.unwrap_or(0.25);
    let geometry = build_stroke_path_geometry(path, style, tolerance);
    return StrokePathTessellationExplanation {
        supported: geometry.issue == StrokePathTessellationReason::Ok,
        reason: geometry.issue,
        subpath: geometry.issue_subpath,
    };
}

impl Path {
    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn explain_stroke_tessellation(
        &self,
        style: &StrokeStyle,
        tolerance: Option<f64>,
    ) -> StrokePathTessellationExplanation {
        return explain_stroke_path_tessellation(self, style, tolerance);
    }
}
