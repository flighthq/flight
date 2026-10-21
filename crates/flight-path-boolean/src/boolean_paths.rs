use flight_path::{flatten_path, Path};

use crate::martinez_kernel::{
    PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation,
};
use crate::write_path_boolean_contours::write_path_boolean_contours;

const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

/// Options controlling the boolean path operations.
#[derive(Debug, Clone)]
pub struct PathBooleanOptions {
    pub fill_rule: Option<PathBooleanFillRule>,
    pub tolerance: Option<f64>,
}

impl Default for PathBooleanOptions {
    fn default() -> Self {
        return PathBooleanOptions {
            fill_rule: None,
            tolerance: None,
        };
    }
}

/// Generic boolean operation on two paths. Flattens both operands to polygon
/// contours, dispatches through the kernel, and writes the result into `out`.
/// Alias-safe: the subject and clip are fully captured (flattened) before any
/// write to `out`, so `out` may alias either input.
pub fn boolean_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    subject: &Path,
    clip: &Path,
    operation: PathBooleanOperation,
    options: Option<&PathBooleanOptions>,
) {
    let fill_rule = options
        .and_then(|o| o.fill_rule)
        .unwrap_or(PathBooleanFillRule::NonZero);
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let subject_contours = flatten_path(subject, Some(tolerance));
    let clip_contours = flatten_path(clip, Some(tolerance));
    let result = (path_boolean_kernel.compute_path_boolean)(&subject_contours, &clip_contours, operation, fill_rule);
    write_path_boolean_contours(out, &result);
}

/// Computes the set difference (subject minus clip) and writes the result into `out`.
pub fn difference_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(out, path_boolean_kernel, a, b, PathBooleanOperation::Difference, options);
}

/// Computes the intersection of subject and clip and writes the result into `out`.
pub fn intersect_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(out, path_boolean_kernel, a, b, PathBooleanOperation::Intersection, options);
}

/// Computes the union of subject and clip and writes the result into `out`.
pub fn union_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(out, path_boolean_kernel, a, b, PathBooleanOperation::Union, options);
}

/// Computes the symmetric difference (XOR) of subject and clip and writes the
/// result into `out`.
pub fn xor_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(out, path_boolean_kernel, a, b, PathBooleanOperation::Xor, options);
}
