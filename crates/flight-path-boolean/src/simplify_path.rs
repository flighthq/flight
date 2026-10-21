use flight_path::{flatten_path, Path};

use crate::boolean_paths::PathBooleanOptions;
use crate::martinez_kernel::{PathBooleanFillRule, PathBooleanKernel};
use crate::resolve_path_regions::resolve_path_regions;

#[cfg(test)]
mod sugar_tests {
    use flight_path::{append_path_rectangle, create_path, Path};

    use crate::contract::*;

    fn square(x: f64, y: f64, size: f64) -> Path {
        let mut out = create_path(None);
        append_path_rectangle(&mut out, x, y, size, size);
        return out;
    }

    #[test]
    fn kernel_simplify_path_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path(None);
        let mut ob = create_path(None);
        k.simplify_path(&mut oa, &square(0.0, 0.0, 10.0), Some(&PathBooleanOptions { fill_rule: Some(PathBooleanFillRule::EvenOdd), tolerance: Some(0.5) }));
        simplify_path(&mut ob, &k, &square(0.0, 0.0, 10.0), Some(&PathBooleanOptions { fill_rule: Some(PathBooleanFillRule::EvenOdd), tolerance: Some(0.5) }));
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }
}

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

// flight-lint: allow(conform-params) D9b: TS takes an optional trailing `out` and returns it; Rust takes `out` first and returns nothing (the caller allocates it, e.g. with `create_path`)
/// Flattens the input path to polygon contours and resolves self-overlaps under the
/// given fill rule. The result is a clean, non-self-intersecting polygon outline. An
/// empty or degenerate input produces an empty output path.
pub fn simplify_path(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
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
    resolve_path_regions(out, path_boolean_kernel, &contours, fill_rule);
}

impl PathBooleanKernel {
    pub fn simplify_path(&self, out: &mut Path, path: &Path, options: Option<&PathBooleanOptions>) {
        return simplify_path(out, self, path, options);
    }
}
