use flight_path::*;
use flight_path_boolean::contract::*;

fn flattened_path(path: &Path, tolerance: Option<f64>) -> Vec<Vec<f64>> {
    let out = flatten_path(path, tolerance);
    return out;
}

fn square_path(x: f64, y: f64, s: f64) -> Path {
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    append_path_move_to(&mut path, x, y);
    append_path_line_to(&mut path, x + s, y);
    append_path_line_to(&mut path, x + s, y + s);
    append_path_line_to(&mut path, x, y + s);
    append_path_close(&mut path);
    return path;
}

fn path_area(path: &Path) -> f64 {
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

fn ring_count(path: &Path) -> usize {
    return flattened_path(path, Some(0.25)).len();
}

mod union_all_paths {
    use super::*;

    #[test]
    fn supports_geometry_clone_form_for_a_later_list_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = square_path(0.0, 0.0, 10.0);
        let mut b = square_path(5.0, 5.0, 10.0);
        let snapshot = clone_path(&b);
        union_all_paths(&mut b, &kernel, &[&a, &snapshot], None);
        assert!((path_area(&b) - 175.0).abs() < 0.1);
    }

    #[test]
    fn returns_an_empty_path_for_an_empty_list() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        union_all_paths(&mut out, &kernel, &[], None);
        assert_eq!(out.commands.len(), 0);
        assert_eq!(out.data.len(), 0);
    }

    #[test]
    fn simplifies_a_single_self_overlapping_path() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut overlap = create_path(Some(flight_path::PathWinding::NonZero));
        append_path_move_to(&mut overlap, 0.0, 0.0);
        append_path_line_to(&mut overlap, 4.0, 0.0);
        append_path_line_to(&mut overlap, 4.0, 4.0);
        append_path_line_to(&mut overlap, 0.0, 4.0);
        append_path_close(&mut overlap);
        append_path_move_to(&mut overlap, 2.0, 2.0);
        append_path_line_to(&mut overlap, 6.0, 2.0);
        append_path_line_to(&mut overlap, 6.0, 6.0);
        append_path_line_to(&mut overlap, 2.0, 6.0);
        append_path_close(&mut overlap);
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        union_all_paths(&mut out, &kernel, &[&overlap], None);
        assert_eq!(ring_count(&out), 1);
        assert!((path_area(&out) - 28.0).abs() < 5e-7);
    }

    #[test]
    fn merges_a_list_of_overlapping_squares_into_one_outline() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = square_path(0.0, 0.0, 10.0);
        let b = square_path(5.0, 5.0, 10.0);
        let c = square_path(8.0, 8.0, 10.0);
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        union_all_paths(&mut out, &kernel, &[&a, &b, &c], None);
        assert_eq!(ring_count(&out), 1);
        assert!(path_area(&out) > 100.0);
        assert!(path_area(&out) < 300.0);
    }

    #[test]
    fn keeps_disjoint_squares_as_separate_rings() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = square_path(0.0, 0.0, 10.0);
        let b = square_path(20.0, 20.0, 10.0);
        let c = square_path(40.0, 0.0, 10.0);
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        union_all_paths(&mut out, &kernel, &[&a, &b, &c], None);
        assert_eq!(ring_count(&out), 3);
        assert!((path_area(&out) - 300.0).abs() < 5e-7);
    }

    #[test]
    fn folds_order_independently() {
        let kernel = create_martinez_path_boolean_kernel();
        let a = square_path(0.0, 0.0, 10.0);
        let b = square_path(5.0, 5.0, 10.0);
        let c = square_path(2.0, 8.0, 10.0);
        let mut forward = create_path(Some(flight_path::PathWinding::NonZero));
        let mut reversed = create_path(Some(flight_path::PathWinding::NonZero));
        union_all_paths(&mut forward, &kernel, &[&a, &b, &c], None);
        union_all_paths(&mut reversed, &kernel, &[&c, &b, &a], None);
        assert!((path_area(&forward) - path_area(&reversed)).abs() < 5e-7);
        assert_eq!(ring_count(&forward), ring_count(&reversed));
    }

    #[test]
    fn writes_into_an_existing_path_using_a_distinct_input_snapshot() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut a = square_path(0.0, 0.0, 10.0);
        let b = square_path(5.0, 5.0, 10.0);
        let a_clone = a.clone();
        union_all_paths(&mut a, &kernel, &[&a_clone, &b], None);
        assert_eq!(ring_count(&a), 1);
        assert!((path_area(&a) - 175.0).abs() < 5e-7);
    }
}
