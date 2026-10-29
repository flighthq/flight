use flight_path::{Path, create_path, flatten_path};

use crate::martinez_kernel::PathBooleanKernel;
use crate::offset_path::offset_path;
use crate::path_boolean::{
    PathBooleanExplanation, PathBooleanExplanationOperation, PathBooleanExplanationReason,
    PathBooleanOptions, PathOffsetOptions,
};
use crate::simplify_path::simplify_path;

#[cfg(test)]
mod sugar_tests {
    use flight_path::{PathWinding, create_path};

    use crate::contract::*;

    #[test]
    fn kernel_explain_offset_path_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let ra = k.explain_offset_path(
            &create_path(Some(flight_path::PathWinding::NonZero)),
            2.0,
            Some(&PathOffsetOptions {
                join: Some(PathOffsetJoin::Round),
                end: None,
                miter_limit: None,
                tolerance: None,
                arc_tolerance: Some(0.5),
            }),
        );
        let rb = explain_offset_path(
            &k,
            &create_path(Some(flight_path::PathWinding::NonZero)),
            2.0,
            Some(&PathOffsetOptions {
                join: Some(PathOffsetJoin::Round),
                end: None,
                miter_limit: None,
                tolerance: None,
                arc_tolerance: Some(0.5),
            }),
        );
        assert_eq!(ra, rb);
        assert_eq!(
            ra.map(|e| e.reason),
            Some(PathBooleanExplanationReason::EmptyInput)
        );
    }

    #[test]
    fn kernel_explain_simplify_path_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let ra = k.explain_simplify_path(
            &create_path(Some(flight_path::PathWinding::NonZero)),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        let rb = explain_simplify_path(
            &k,
            &create_path(Some(flight_path::PathWinding::NonZero)),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(ra, rb);
        assert_eq!(
            ra.map(|e| e.reason),
            Some(PathBooleanExplanationReason::EmptyInput)
        );
    }
}

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
/// Checks whether `offset_path` would produce a meaningful result for the given
/// path and delta. Returns `Some(explanation)` when the result is degenerate or
/// empty, `None` when the offset succeeds normally.
pub fn explain_offset_path(
    path_boolean_kernel: &PathBooleanKernel,
    path: &Path,
    delta: f64,
    options: Option<&PathOffsetOptions>,
) -> Option<PathBooleanExplanation> {
    if !delta.is_finite() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Offset,
            reason: PathBooleanExplanationReason::NonFiniteDelta,
        });
    }
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let contours = flatten_path(path, Some(tolerance));
    if contours.is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Offset,
            reason: PathBooleanExplanationReason::EmptyInput,
        });
    }
    let mut result = create_path(Some(flight_path::PathWinding::NonZero));
    offset_path(&mut result, path_boolean_kernel, path, delta, options);
    if result.commands.is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Offset,
            reason: PathBooleanExplanationReason::CollapsedOrDegenerate,
        });
    }
    return None;
}

/// Checks whether `simplify_path` would produce a meaningful result for the
/// given path. Returns `Some(explanation)` when the result is degenerate or
/// empty, `None` when simplification succeeds normally.
pub fn explain_simplify_path(
    path_boolean_kernel: &PathBooleanKernel,
    path: &Path,
    options: Option<&PathBooleanOptions>,
) -> Option<PathBooleanExplanation> {
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let contours = flatten_path(path, Some(tolerance));
    if contours.is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Simplify,
            reason: PathBooleanExplanationReason::EmptyInput,
        });
    }
    let mut result = create_path(Some(flight_path::PathWinding::NonZero));
    simplify_path(&mut result, path_boolean_kernel, path, options);
    if result.commands.is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Simplify,
            reason: PathBooleanExplanationReason::CollapsedOrDegenerate,
        });
    }
    return None;
}

impl PathBooleanKernel {
    // flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
    pub fn explain_offset_path(
        &self,
        path: &Path,
        delta: f64,
        options: Option<&PathOffsetOptions>,
    ) -> Option<PathBooleanExplanation> {
        return explain_offset_path(self, path, delta, options);
    }

    pub fn explain_simplify_path(
        &self,
        path: &Path,
        options: Option<&PathBooleanOptions>,
    ) -> Option<PathBooleanExplanation> {
        return explain_simplify_path(self, path, options);
    }
}
