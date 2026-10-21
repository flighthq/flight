use flight_path::Path;

use crate::martinez_kernel::{
    PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation,
};
use crate::write_path_boolean_contours::write_path_boolean_contours;

// flight-lint: allow(conform-params) D9b: TS takes an optional trailing `out` and returns it; Rust takes `out` first and returns nothing (the caller allocates it, e.g. with `create_path`)
/// Resolves a set of polygon contour rings under the given fill rule by self-unioning
/// them through the boolean kernel. The result is a clean, hole-correct polygon outline
/// written into `out`.
pub fn resolve_path_regions(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    rings: &[Vec<f64>],
    fill_rule: PathBooleanFillRule,
) {
    if rings.is_empty() {
        let empty: Vec<Vec<f64>> = Vec::new();
        write_path_boolean_contours(out, &empty);
        return;
    }
    let empty: Vec<Vec<f64>> = Vec::new();
    let resolved = (path_boolean_kernel.compute_path_boolean)(
        rings,
        &empty,
        PathBooleanOperation::Union,
        fill_rule,
    );
    write_path_boolean_contours(out, &resolved);
}
