use flight_path::{flatten_path, Path};

use crate::boolean_paths::PathBooleanOptions;
use crate::martinez_kernel::{
    compute_path_boolean, PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation,
};
use crate::write_path_boolean_contours::write_path_boolean_contours;

const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

/// Gathers every contour from every path in the list and unions them all together
/// under the given fill rule. The result is a merged polygon outline written into
/// `out`.
pub fn union_all_paths(
    out: &mut Path,
    kernel: &PathBooleanKernel,
    paths: &[&Path],
    options: Option<&PathBooleanOptions>,
) {
    let fill_rule = options
        .and_then(|o| o.fill_rule)
        .unwrap_or(PathBooleanFillRule::NonZero);
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let mut contours: Vec<Vec<f64>> = Vec::new();
    for path in paths {
        for contour in flatten_path(path, Some(tolerance)) {
            contours.push(contour);
        }
    }
    if contours.is_empty() {
        let empty: Vec<Vec<f64>> = Vec::new();
        write_path_boolean_contours(out, &empty);
        return;
    }
    let empty: Vec<Vec<f64>> = Vec::new();
    let result = compute_path_boolean(
        kernel,
        &contours,
        &empty,
        PathBooleanOperation::Union,
        fill_rule,
    );
    write_path_boolean_contours(out, &result);
}
