use flight_path::*;
use flight_path_boolean::contract::*;

fn flattened_path(path: &Path, tolerance: Option<f64>) -> Vec<Vec<f64>> {
    let out = flatten_path(path, tolerance);
    return out;
}

fn polygon_path(vertices: &[f64]) -> Path {
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    append_path_move_to(&mut path, vertices[0], vertices[1]);
    let mut i = 2;
    while i < vertices.len() {
        append_path_line_to(&mut path, vertices[i], vertices[i + 1]);
        i += 2;
    }
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

fn path_bounds(path: &Path) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for ring in flattened_path(path, Some(0.25)) {
        let mut i = 0;
        while i < ring.len() {
            if ring[i] < min_x {
                min_x = ring[i];
            }
            if ring[i + 1] < min_y {
                min_y = ring[i + 1];
            }
            if ring[i] > max_x {
                max_x = ring[i];
            }
            if ring[i + 1] > max_y {
                max_y = ring[i + 1];
            }
            i += 2;
        }
    }
    return (min_x, min_y, max_x, max_y);
}

fn ring_count(path: &Path) -> usize {
    return flattened_path(path, Some(0.25)).len();
}

fn pentagram_path(radius: f64) -> Path {
    let order = [0, 2, 4, 1, 3];
    let mut vertices: Vec<f64> = Vec::new();
    for &k in &order {
        let angle = -(std::f64::consts::PI / 2.0) + (k as f64 * 2.0 * std::f64::consts::PI) / 5.0;
        vertices.push(radius * angle.cos());
        vertices.push(radius * angle.sin());
    }
    return polygon_path(&vertices);
}

const BOWTIE: [f64; 8] = [0.0, 0.0, 2.0, 2.0, 2.0, 0.0, 0.0, 2.0];
const UNIT_SQUARE: [f64; 8] = [0.0, 0.0, 3.0, 0.0, 3.0, 3.0, 0.0, 3.0];

mod simplify_path {
    use super::*;

    #[test]
    fn writes_into_an_existing_output_using_a_distinct_source_snapshot() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut path = polygon_path(&BOWTIE);
        let path_clone = path.clone();
        simplify_path(&mut path, &kernel, &path_clone, None);
        assert_eq!(ring_count(&path), 2);
        assert!((path_area(&path) - 2.0).abs() < 5e-7);
    }

    #[test]
    fn resolves_a_self_intersecting_bowtie_into_two_triangles() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(&mut out, &kernel, &polygon_path(&BOWTIE), None);
        assert_eq!(ring_count(&out), 2);
        assert!((path_area(&out) - 2.0).abs() < 5e-7);
    }

    #[test]
    fn fills_a_self_overlapping_region_solid_under_non_zero() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 4.0, 0.0);
        append_path_line_to(&mut path, 4.0, 4.0);
        append_path_line_to(&mut path, 0.0, 4.0);
        append_path_close(&mut path);
        append_path_move_to(&mut path, 2.0, 2.0);
        append_path_line_to(&mut path, 6.0, 2.0);
        append_path_line_to(&mut path, 6.0, 6.0);
        append_path_line_to(&mut path, 2.0, 6.0);
        append_path_close(&mut path);
        let opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::NonZero),
            tolerance: None,
        };
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(&mut out, &kernel, &path, Some(&opts));
        assert_eq!(ring_count(&out), 1);
        assert!((path_area(&out) - 28.0).abs() < 5e-7);
    }

    #[test]
    fn punches_an_even_odd_hole_through_a_self_overlapping_region() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 4.0, 0.0);
        append_path_line_to(&mut path, 4.0, 4.0);
        append_path_line_to(&mut path, 0.0, 4.0);
        append_path_close(&mut path);
        append_path_move_to(&mut path, 2.0, 2.0);
        append_path_line_to(&mut path, 6.0, 2.0);
        append_path_line_to(&mut path, 6.0, 6.0);
        append_path_line_to(&mut path, 2.0, 6.0);
        append_path_close(&mut path);
        let opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::EvenOdd),
            tolerance: None,
        };
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(&mut out, &kernel, &path, Some(&opts));
        assert!((path_area(&out) - 24.0).abs() < 5e-7);
        assert!(ring_count(&out) > 1);
    }

    #[test]
    fn fills_a_pentagram_solid_under_non_zero_but_hollow_under_even_odd() {
        let kernel = create_martinez_path_boolean_kernel();
        let nz_opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::NonZero),
            tolerance: None,
        };
        let eo_opts = PathBooleanOptions {
            fill_rule: Some(PathWinding::EvenOdd),
            tolerance: None,
        };
        let mut solid = create_path(Some(flight_path::PathWinding::NonZero));
        let mut hollow = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(&mut solid, &kernel, &pentagram_path(10.0), Some(&nz_opts));
        simplify_path(&mut hollow, &kernel, &pentagram_path(10.0), Some(&eo_opts));
        assert_eq!(ring_count(&solid), 1);
        assert!((path_area(&solid) - 112.257).abs() < 0.005);
        assert!(ring_count(&hollow) > 1);
        assert!((path_area(&hollow) - 77.568).abs() < 0.005);
        assert!(path_area(&hollow) < path_area(&solid));
    }

    #[test]
    fn passes_an_already_simple_convex_path_through_unchanged() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE), None);
        assert_eq!(ring_count(&out), 1);
        assert!((path_area(&out) - 9.0).abs() < 5e-7);
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - 0.0).abs() < 5e-7);
        assert!((min_y - 0.0).abs() < 5e-7);
        assert!((max_x - 3.0).abs() < 5e-7);
        assert!((max_y - 3.0).abs() < 5e-7);
    }

    #[test]
    fn returns_an_empty_path_for_empty_input() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(
            &mut out,
            &kernel,
            &create_path(Some(flight_path::PathWinding::NonZero)),
            None,
        );
        assert_eq!(out.commands.len(), 0);
        assert_eq!(out.data.len(), 0);
    }

    #[test]
    fn returns_an_empty_path_for_a_degenerate_zero_area_contour() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(flight_path::PathWinding::NonZero));
        simplify_path(
            &mut out,
            &kernel,
            &polygon_path(&[0.0, 0.0, 5.0, 0.0, 10.0, 0.0]),
            None,
        );
        assert_eq!(out.commands.len(), 0);
        assert_eq!(out.data.len(), 0);
    }
}
