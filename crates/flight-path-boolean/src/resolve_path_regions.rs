use flight_path::Path;

use crate::martinez_kernel::{
    compute_path_boolean, PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation,
};
use crate::write_path_boolean_contours::write_path_boolean_contours;

/// Resolves a set of polygon contour rings under the given fill rule by self-unioning
/// them through the boolean kernel. The result is a clean, hole-correct polygon outline
/// written into `out`.
pub fn resolve_path_regions(
    out: &mut Path,
    kernel: &PathBooleanKernel,
    rings: &[Vec<f64>],
    fill_rule: PathBooleanFillRule,
) {
    if rings.is_empty() {
        let empty: Vec<Vec<f64>> = Vec::new();
        write_path_boolean_contours(out, &empty);
        return;
    }
    let empty: Vec<Vec<f64>> = Vec::new();
    let resolved = compute_path_boolean(
        kernel,
        rings,
        &empty,
        PathBooleanOperation::Union,
        fill_rule,
    );
    write_path_boolean_contours(out, &resolved);
}
