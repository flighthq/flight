use flight_path::*;
use flight_path_boolean::contract::*;

fn flattened_path(path: &Path, tolerance: Option<f64>) -> Vec<Vec<f64>> {
    let mut out = Vec::new();
    flatten_path(&mut out, path, tolerance);
    return out;
}

fn rectangle_path(x: f64, y: f64, w: f64, h: f64) -> Path {
    let mut path = create_path();
    append_path_rectangle(&mut path, x, y, w, h);
    return path;
}

fn path_filled_area(path: &Path) -> f64 {
    let mut total: f64 = 0.0;
    for ring in flattened_path(path, Some(0.25)) {
        let mut area: f64 = 0.0;
        let n = ring.len() >> 1;
        let mut j = n - 1;
        for i in 0..n {
            area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
            j = i;
        }
        total += area / 2.0;
    }
    return total.abs();
}

fn path_fill_contains(path: &Path, x: f64, y: f64) -> bool {
    let mut winding: i32 = 0;
    for ring in flattened_path(path, Some(0.25)) {
        let n = ring.len() >> 1;
        let mut j = n - 1;
        for i in 0..n {
            let xi = ring[i * 2];
            let yi = ring[i * 2 + 1];
            let xj = ring[j * 2];
            let yj = ring[j * 2 + 1];
            if if yi <= y { yj > y } else { yj <= y } {
                let t = (y - yi) / (yj - yi);
                if x < xi + t * (xj - xi) {
                    winding += if yj > yi { 1 } else { -1 };
                }
            }
            j = i;
        }
    }
    return winding != 0;
}

mod boolean_paths {
    use super::*;

    #[test]
    fn dispatches_to_the_operation_named_in_the_argument() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let mut out = create_path();
        boolean_paths(&mut out, &kernel, &a, &b, PathBooleanOperation::Union, None);
        assert!((path_filled_area(&out) - 175.0).abs() < 5e-5);
        boolean_paths(
            &mut out,
            &kernel,
            &a,
            &b,
            PathBooleanOperation::Intersection,
            None,
        );
        assert!((path_filled_area(&out) - 25.0).abs() < 5e-5);
        boolean_paths(
            &mut out,
            &kernel,
            &a,
            &b,
            PathBooleanOperation::Difference,
            None,
        );
        assert!((path_filled_area(&out) - 75.0).abs() < 5e-5);
        boolean_paths(&mut out, &kernel, &a, &b, PathBooleanOperation::Xor, None);
        assert!((path_filled_area(&out) - 150.0).abs() < 5e-5);
    }

    #[test]
    fn returns_a_non_zero_winding_path() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        boolean_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(20.0, 20.0, 5.0, 5.0),
            PathBooleanOperation::Union,
            None,
        );
        assert_eq!(out.winding, PathWinding::NonZero);
        assert!(out.commands.len() > 0);
    }

    #[test]
    fn writes_into_the_provided_out_path() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        boolean_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(5.0, 5.0, 10.0, 10.0),
            PathBooleanOperation::Union,
            None,
        );
        assert!((path_filled_area(&out) - 175.0).abs() < 5e-5);
    }

    #[test]
    fn reuses_subject_destination_with_a_distinct_source_snapshot() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let a_clone = a.clone();
        boolean_paths(
            &mut a,
            &kernel,
            &a_clone,
            &b,
            PathBooleanOperation::Union,
            None,
        );
        assert!((path_filled_area(&a) - 175.0).abs() < 0.1);
    }

    #[test]
    fn reuses_clip_destination_with_a_distinct_source_snapshot() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let b_clone = b.clone();
        boolean_paths(
            &mut b,
            &kernel,
            &a,
            &b_clone,
            PathBooleanOperation::Intersection,
            None,
        );
        assert!((path_filled_area(&b) - 25.0).abs() < 0.1);
    }

    #[test]
    fn honors_the_even_odd_fill_rule_option() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = create_path();
        append_path_rectangle(&mut a, 0.0, 0.0, 10.0, 10.0);
        append_path_rectangle(&mut a, 5.0, 5.0, 10.0, 10.0);
        let empty = create_path();
        let nz_opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::NonZero),
            tolerance: None,
        };
        let eo_opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::EvenOdd),
            tolerance: None,
        };
        let mut out = create_path();
        boolean_paths(
            &mut out,
            &kernel,
            &a,
            &empty,
            PathBooleanOperation::Union,
            Some(&nz_opts),
        );
        assert!((path_filled_area(&out) - 175.0).abs() < 5e-5);
        boolean_paths(
            &mut out,
            &kernel,
            &a,
            &empty,
            PathBooleanOperation::Union,
            Some(&eo_opts),
        );
        assert!((path_filled_area(&out) - 150.0).abs() < 5e-5);
    }

    #[test]
    fn accepts_a_coarser_tolerance_option_without_error() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let opts = PathBooleanOptions {
            fill_rule: None,
            tolerance: Some(2.0),
        };
        let mut out = create_path();
        boolean_paths(
            &mut out,
            &kernel,
            &a,
            &b,
            PathBooleanOperation::Union,
            Some(&opts),
        );
        assert!((path_filled_area(&out) - 175.0).abs() < 5e-5);
    }
}

mod difference_paths {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_for_first_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&a);
        difference_paths(&mut a, &kernel, &snapshot, &b, None);
        assert!((path_filled_area(&a) - 75.0).abs() < 0.1);
        assert!(!path_fill_contains(&a, 7.0, 7.0));
        assert!(path_fill_contains(&a, 2.0, 2.0));
    }

    #[test]
    fn supports_geometry_clone_form_for_second_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&b);
        difference_paths(&mut b, &kernel, &a, &snapshot, None);
        assert!((path_filled_area(&b) - 75.0).abs() < 0.1);
        assert!(!path_fill_contains(&b, 7.0, 7.0));
        assert!(path_fill_contains(&b, 2.0, 2.0));
    }

    #[test]
    fn cuts_a_contained_hole() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        difference_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 30.0, 30.0),
            &rectangle_path(10.0, 10.0, 10.0, 10.0),
            None,
        );
        assert!((path_filled_area(&out) - 800.0).abs() < 5e-5);
        assert!(!path_fill_contains(&out, 15.0, 15.0));
        assert!(path_fill_contains(&out, 2.0, 2.0));
    }

    #[test]
    fn is_empty_for_a_path_differenced_against_itself() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut out = create_path();
        difference_paths(&mut out, &kernel, &a, &b, None);
        assert!(path_filled_area(&out) < 0.1);
    }
}

mod intersect_paths {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_for_first_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&a);
        intersect_paths(&mut a, &kernel, &snapshot, &b, None);
        assert!((path_filled_area(&a) - 25.0).abs() < 0.1);
        assert!(path_fill_contains(&a, 7.0, 7.0));
        assert!(!path_fill_contains(&a, 2.0, 2.0));
    }

    #[test]
    fn supports_geometry_clone_form_for_second_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&b);
        intersect_paths(&mut b, &kernel, &a, &snapshot, None);
        assert!((path_filled_area(&b) - 25.0).abs() < 0.1);
        assert!(path_fill_contains(&b, 7.0, 7.0));
        assert!(!path_fill_contains(&b, 2.0, 2.0));
    }

    #[test]
    fn keeps_the_overlap() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        intersect_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(5.0, 5.0, 10.0, 10.0),
            None,
        );
        assert!((path_filled_area(&out) - 25.0).abs() < 5e-5);
    }

    #[test]
    fn is_empty_for_disjoint_inputs() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        intersect_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(20.0, 20.0, 10.0, 10.0),
            None,
        );
        assert!(path_filled_area(&out) < 0.1);
    }
}

mod union_paths {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_for_first_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&a);
        union_paths(&mut a, &kernel, &snapshot, &b, None);
        assert!((path_filled_area(&a) - 175.0).abs() < 0.1);
        assert!(path_fill_contains(&a, 2.0, 2.0));
        assert!(path_fill_contains(&a, 12.0, 12.0));
    }

    #[test]
    fn supports_geometry_clone_form_for_second_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&b);
        union_paths(&mut b, &kernel, &a, &snapshot, None);
        assert!((path_filled_area(&b) - 175.0).abs() < 0.1);
        assert!(path_fill_contains(&b, 2.0, 2.0));
        assert!(path_fill_contains(&b, 12.0, 12.0));
    }

    static CUSTOM_KERNEL_SEEN: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);

    fn compute_seen_path_boolean(
        _subject: &[PathBooleanContour],
        _clip: &[PathBooleanContour],
        _operation: PathBooleanOperation,
        _fill_rule: PathBooleanFillRule,
    ) -> Vec<PathBooleanContour> {
        CUSTOM_KERNEL_SEEN.store(true, std::sync::atomic::Ordering::SeqCst);
        return Vec::new();
    }

    #[test]
    fn routes_through_a_provided_kernel() {
        let mut custom: PathBooleanKernel = flight_entity::allocate_entity();
        custom.compute_path_boolean = compute_seen_path_boolean;
        let mut out = create_path();
        union_paths(
            &mut out,
            &custom,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(5.0, 5.0, 10.0, 10.0),
            None,
        );
        assert!(CUSTOM_KERNEL_SEEN.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(out.commands.len(), 0);
    }

    #[test]
    fn merges_overlapping_rectangles() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        union_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(5.0, 5.0, 10.0, 10.0),
            None,
        );
        assert!((path_filled_area(&out) - 175.0).abs() < 5e-5);
    }

    #[test]
    fn commutes() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(4.0, 4.0, 10.0, 10.0);
        let mut out1 = create_path();
        let mut out2 = create_path();
        union_paths(&mut out1, &kernel, &a, &b, None);
        union_paths(&mut out2, &kernel, &b, &a, None);
        assert!((path_filled_area(&out1) - path_filled_area(&out2)).abs() < 5e-5);
    }
}

mod xor_paths {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_for_first_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&a);
        xor_paths(&mut a, &kernel, &snapshot, &b, None);
        assert!((path_filled_area(&a) - 150.0).abs() < 0.1);
        assert!(!path_fill_contains(&a, 7.0, 7.0));
        assert!(path_fill_contains(&a, 2.0, 2.0));
    }

    #[test]
    fn supports_geometry_clone_form_for_second_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = rectangle_path(0.0, 0.0, 10.0, 10.0);
        let mut b = rectangle_path(5.0, 5.0, 10.0, 10.0);
        let snapshot = clone_path(&b);
        xor_paths(&mut b, &kernel, &a, &snapshot, None);
        assert!((path_filled_area(&b) - 150.0).abs() < 0.1);
        assert!(!path_fill_contains(&b, 7.0, 7.0));
        assert!(path_fill_contains(&b, 2.0, 2.0));
    }

    #[test]
    fn keeps_the_symmetric_difference() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path();
        xor_paths(
            &mut out,
            &kernel,
            &rectangle_path(0.0, 0.0, 10.0, 10.0),
            &rectangle_path(5.0, 5.0, 10.0, 10.0),
            None,
        );
        assert!((path_filled_area(&out) - 150.0).abs() < 5e-5);
    }
}
