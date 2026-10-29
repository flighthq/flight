use flight_path::{Path, PathWinding, flatten_path};

use crate::boolean_paths::{PathBooleanOptions, get_path_boolean_fill_rule_for_winding};
use crate::martinez_kernel::{PathBooleanKernel, PathBooleanOperation};
use crate::write_path_boolean_contours::write_path_boolean_contours;

#[cfg(test)]
mod sugar_tests {
    use flight_path::{Path, PathWinding, append_path_rectangle, create_path};

    use crate::contract::*;

    fn square(x: f64, y: f64, size: f64) -> Path {
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        append_path_rectangle(&mut out, x, y, size, size);
        return out;
    }

    #[test]
    fn kernel_union_all_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path(Some(flight_path::PathWinding::NonZero));
        let mut ob = create_path(Some(flight_path::PathWinding::NonZero));
        k.union_all_paths(
            &mut oa,
            &[&square(0.0, 0.0, 10.0), &square(5.0, 5.0, 10.0)],
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        union_all_paths(
            &mut ob,
            &k,
            &[&square(0.0, 0.0, 10.0), &square(5.0, 5.0, 10.0)],
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }
}

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
const DEFAULT_FLATTEN_TOLERANCE: f64 = 0.25;

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
/// Gathers every contour from every path in the list and unions them all together
/// under the given fill rule. The result is a merged polygon outline written into
/// `out`.
pub fn union_all_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    paths: &[&Path],
    options: Option<&PathBooleanOptions>,
) {
    let fill_rule = get_path_boolean_fill_rule_for_winding(
        options
            .and_then(|o| o.fill_rule)
            .unwrap_or(PathWinding::NonZero),
    );
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let mut contours: Vec<Vec<f64>> = Vec::new();
    for path in paths {
        contours.extend(flatten_path(path, Some(tolerance)));
    }
    if contours.is_empty() {
        let empty: Vec<Vec<f64>> = Vec::new();
        write_path_boolean_contours(out, &empty);
        return;
    }
    let empty: Vec<Vec<f64>> = Vec::new();
    let result = (path_boolean_kernel.compute_path_boolean)(
        &contours,
        &empty,
        PathBooleanOperation::Union,
        fill_rule,
    );
    write_path_boolean_contours(out, &result);
}

impl PathBooleanKernel {
    pub fn union_all_paths(
        &self,
        out: &mut Path,
        paths: &[&Path],
        options: Option<&PathBooleanOptions>,
    ) {
        return union_all_paths(out, self, paths, options);
    }
}
