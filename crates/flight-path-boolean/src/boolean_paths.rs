use flight_path::{Path, PathWinding, flatten_path};

use crate::martinez_kernel::{PathBooleanFillRule, PathBooleanKernel, PathBooleanOperation};
use crate::write_path_boolean_contours::write_path_boolean_contours;

#[cfg(test)]
mod sugar_tests {
    use flight_path::{Path, PathWinding, append_path_rectangle, create_path};

    use crate::contract::*;

    fn square(x: f64, y: f64, size: f64) -> Path {
        let mut out = create_path();
        append_path_rectangle(&mut out, x, y, size, size);
        return out;
    }

    #[test]
    fn kernel_boolean_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path();
        let mut ob = create_path();
        k.boolean_paths(
            &mut oa,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            PathBooleanOperation::Xor,
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        boolean_paths(
            &mut ob,
            &k,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            PathBooleanOperation::Xor,
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }

    #[test]
    fn kernel_difference_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path();
        let mut ob = create_path();
        k.difference_paths(
            &mut oa,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        difference_paths(
            &mut ob,
            &k,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }

    #[test]
    fn kernel_intersect_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path();
        let mut ob = create_path();
        k.intersect_paths(
            &mut oa,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        intersect_paths(
            &mut ob,
            &k,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }

    #[test]
    fn kernel_union_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path();
        let mut ob = create_path();
        k.union_paths(
            &mut oa,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        union_paths(
            &mut ob,
            &k,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        assert_eq!(oa, ob);
        assert!(!oa.commands.is_empty());
    }

    #[test]
    fn kernel_xor_paths_matches_free_function() {
        let k = create_martinez_path_boolean_kernel();
        let mut oa = create_path();
        let mut ob = create_path();
        k.xor_paths(
            &mut oa,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
            Some(&PathBooleanOptions {
                fill_rule: Some(PathWinding::EvenOdd),
                tolerance: Some(0.5),
            }),
        );
        xor_paths(
            &mut ob,
            &k,
            &square(0.0, 0.0, 10.0),
            &square(5.0, 5.0, 10.0),
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
/// Options controlling the boolean path operations (TS `PathBooleanOptions`). `fill_rule` is a
/// `PathWinding`, exactly TS (`fillRule?: PathWinding`): only even-odd and non-zero are public
/// options. The positive/negative rules of `PathBooleanFillRule` stay kernel/offset conventions.
#[derive(Debug, Clone)]
pub struct PathBooleanOptions {
    pub fill_rule: Option<PathWinding>,
    pub tolerance: Option<f64>,
}

// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
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
    let fill_rule = get_path_boolean_fill_rule_for_winding(
        options
            .and_then(|o| o.fill_rule)
            .unwrap_or(PathWinding::NonZero),
    );
    let tolerance = options
        .and_then(|o| o.tolerance)
        .unwrap_or(DEFAULT_FLATTEN_TOLERANCE);
    let mut subject_contours = Vec::new();
    let mut clip_contours = Vec::new();
    flatten_path(&mut subject_contours, subject, Some(tolerance));
    flatten_path(&mut clip_contours, clip, Some(tolerance));
    let result = (path_boolean_kernel.compute_path_boolean)(
        &subject_contours,
        &clip_contours,
        operation,
        fill_rule,
    );
    write_path_boolean_contours(out, &result);
}

// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
/// Computes the set difference (subject minus clip) and writes the result into `out`.
pub fn difference_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(
        out,
        path_boolean_kernel,
        a,
        b,
        PathBooleanOperation::Difference,
        options,
    );
}

/// The kernel fill rule for a public `PathWinding` option (TS passes the winding string straight
/// through, since `PathBooleanFillRule` includes `PathWinding`).
pub(crate) fn get_path_boolean_fill_rule_for_winding(winding: PathWinding) -> PathBooleanFillRule {
    return match winding {
        PathWinding::EvenOdd => PathBooleanFillRule::EvenOdd,
        PathWinding::NonZero => PathBooleanFillRule::NonZero,
    };
}

// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
/// Computes the intersection of subject and clip and writes the result into `out`.
pub fn intersect_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(
        out,
        path_boolean_kernel,
        a,
        b,
        PathBooleanOperation::Intersection,
        options,
    );
}

// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
/// Computes the union of subject and clip and writes the result into `out`.
pub fn union_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(
        out,
        path_boolean_kernel,
        a,
        b,
        PathBooleanOperation::Union,
        options,
    );
}

// flight-lint: allow(conform-params) D24: user-approved required out-first writer returning unit; pinned TS still takes optional trailing out and may allocate
/// Computes the symmetric difference (XOR) of subject and clip and writes the
/// result into `out`.
pub fn xor_paths(
    out: &mut Path,
    path_boolean_kernel: &PathBooleanKernel,
    a: &Path,
    b: &Path,
    options: Option<&PathBooleanOptions>,
) {
    boolean_paths(
        out,
        path_boolean_kernel,
        a,
        b,
        PathBooleanOperation::Xor,
        options,
    );
}

impl Default for PathBooleanOptions {
    fn default() -> Self {
        return PathBooleanOptions {
            fill_rule: None,
            tolerance: None,
        };
    }
}

impl PathBooleanKernel {
    pub fn boolean_paths(
        &self,
        out: &mut Path,
        subject: &Path,
        clip: &Path,
        operation: PathBooleanOperation,
        options: Option<&PathBooleanOptions>,
    ) {
        return boolean_paths(out, self, subject, clip, operation, options);
    }

    pub fn difference_paths(
        &self,
        out: &mut Path,
        a: &Path,
        b: &Path,
        options: Option<&PathBooleanOptions>,
    ) {
        return difference_paths(out, self, a, b, options);
    }

    pub fn intersect_paths(
        &self,
        out: &mut Path,
        a: &Path,
        b: &Path,
        options: Option<&PathBooleanOptions>,
    ) {
        return intersect_paths(out, self, a, b, options);
    }

    pub fn union_paths(
        &self,
        out: &mut Path,
        a: &Path,
        b: &Path,
        options: Option<&PathBooleanOptions>,
    ) {
        return union_paths(out, self, a, b, options);
    }

    pub fn xor_paths(
        &self,
        out: &mut Path,
        a: &Path,
        b: &Path,
        options: Option<&PathBooleanOptions>,
    ) {
        return xor_paths(out, self, a, b, options);
    }
}
