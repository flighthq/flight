use flight_path::Path;

use crate::martinez_kernel::{PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation};
use crate::write_path_boolean_contours::write_path_boolean_contours;

#[cfg(test)]
mod sugar_tests {
    use flight_path::create_path;

    use crate::contract::*;

    #[test]
    fn kernel_resolve_path_regions_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path(Some(flight_path::PathWinding::NonZero));
        let mut ob = create_path(Some(flight_path::PathWinding::NonZero));
        k.resolve_path_regions(
            &mut oa,
            &[
                vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
                vec![5.0, 5.0, 15.0, 5.0, 15.0, 15.0, 5.0, 15.0],
            ],
            PathBooleanFillRule::EvenOdd,
        );
        resolve_path_regions(
            &mut ob,
            &k,
            &[
                vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
                vec![5.0, 5.0, 15.0, 5.0, 15.0, 15.0, 5.0, 15.0],
            ],
            PathBooleanFillRule::EvenOdd,
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }
}

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
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

impl PathBooleanKernel {
    // flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
    pub fn resolve_path_regions(
        &self,
        out: &mut Path,
        rings: &[Vec<f64>],
        fill_rule: PathBooleanFillRule,
    ) {
        return resolve_path_regions(out, self, rings, fill_rule);
    }
}
