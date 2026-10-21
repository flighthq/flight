use flight_path::{flatten_path, Path};

use crate::boolean_paths::PathBooleanOptions;
use crate::martinez_kernel::{PathBooleanFillRule, PathBooleanKernel};
use crate::resolve_path_regions::resolve_path_regions;

const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

/// Flattens the input path to polygon contours and resolves self-overlaps under the
/// given fill rule. The result is a clean, non-self-intersecting polygon outline. An
/// empty or degenerate input produces an empty output path.
pub fn simplify_path(
    out: &mut Path,
    kernel: &PathBooleanKernel,
    path: &Path,
    options: Option<&PathBooleanOptions>,
) {
    let fill_rule = options
        .and_then(|o| o.fill_rule)
        .unwrap_or(PathBooleanFillRule::NonZero);
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let contours = flatten_path(path, Some(tolerance));
    resolve_path_regions(out, kernel, &contours, fill_rule);
}
