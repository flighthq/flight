use flight_path::*;
use flight_path_boolean::*;

fn path_area(path: &Path) -> f64 {
    let mut total: f64 = 0.0;
    for ring in flatten_path(path, Some(0.25)) {
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
    return flatten_path(path, Some(0.25)).len();
}

mod resolve_path_regions {
    use super::*;

    #[test]
    fn returns_an_empty_path_for_no_rings() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(PathWinding::NonZero));
        resolve_path_regions(&mut out, &kernel, &[], PathBooleanFillRule::NonZero);
        assert_eq!(out.commands.len(), 0);
        assert_eq!(out.data.len(), 0);
        assert_eq!(out.winding, PathWinding::NonZero);
    }

    #[test]
    fn self_unions_overlapping_rings_into_one_outline_under_non_zero() {
        let kernel = create_martinez_path_boolean_kernel();
        let square_a = vec![0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
        let square_b = vec![2.0, 2.0, 6.0, 2.0, 6.0, 6.0, 2.0, 6.0];
        let mut out = create_path(Some(PathWinding::NonZero));
        resolve_path_regions(&mut out, &kernel, &[square_a, square_b], PathBooleanFillRule::NonZero);
        assert_eq!(ring_count(&out), 1);
        assert!((path_area(&out) - 28.0).abs() < 1e-6);
    }

    #[test]
    fn applies_the_fill_rule_to_self_overlap_under_even_odd() {
        let kernel = create_martinez_path_boolean_kernel();
        let square_a = vec![0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
        let square_b = vec![2.0, 2.0, 6.0, 2.0, 6.0, 6.0, 2.0, 6.0];
        let mut out = create_path(Some(PathWinding::NonZero));
        resolve_path_regions(&mut out, &kernel, &[square_a, square_b], PathBooleanFillRule::EvenOdd);
        assert!((path_area(&out) - 24.0).abs() < 1e-6);
        assert!(ring_count(&out) > 1);
    }
}
