use flight_path::{flatten_path, Path};

use crate::boolean_paths::PathBooleanOptions;
use crate::martinez_kernel::PathBooleanKernel;
use crate::offset_path::{offset_path, PathOffsetOptions};
use crate::simplify_path::simplify_path;

const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

/// The kind of boolean operation that was attempted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanExplanationOperation {
    Offset,
    Simplify,
}

/// The reason the operation produced a degenerate or empty result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanExplanationReason {
    CollapsedOrDegenerate,
    EmptyInput,
    NonFiniteDelta,
}

/// Explains why a boolean path operation (offset or simplify) produced a
/// degenerate or empty result. `None` means the operation succeeded normally.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PathBooleanExplanation {
    pub operation: PathBooleanExplanationOperation,
    pub reason: PathBooleanExplanationReason,
}

/// Checks whether `offset_path` would produce a meaningful result for the given
/// path and delta. Returns `Some(explanation)` when the result is degenerate or
/// empty, `None` when the offset succeeds normally.
pub fn explain_offset_path(
    kernel: &PathBooleanKernel,
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
    if flatten_path(path, Some(tolerance)).is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Offset,
            reason: PathBooleanExplanationReason::EmptyInput,
        });
    }
    let mut result = Path::default();
    offset_path(&mut result, kernel, path, delta, options);
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
    kernel: &PathBooleanKernel,
    path: &Path,
    options: Option<&PathBooleanOptions>,
) -> Option<PathBooleanExplanation> {
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    if flatten_path(path, Some(tolerance)).is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Simplify,
            reason: PathBooleanExplanationReason::EmptyInput,
        });
    }
    let mut result = Path::default();
    simplify_path(
        &mut result,
        kernel,
        path,
        options,
    );
    if result.commands.is_empty() {
        return Some(PathBooleanExplanation {
            operation: PathBooleanExplanationOperation::Simplify,
            reason: PathBooleanExplanationReason::CollapsedOrDegenerate,
        });
    }
    return None;
}
