use flight_path_boolean::*;

fn square(x: f64, y: f64, s: f64) -> Vec<f64> {
    return vec![x, y, x + s, y, x + s, y + s, x, y + s];
}

fn donut(x: f64, y: f64, outer: f64, inset: f64, inner: f64) -> Vec<Vec<f64>> {
    let ix = x + inset;
    let iy = y + inset;
    return vec![
        square(x, y, outer),
        vec![ix, iy, ix, iy + inner, ix + inner, iy + inner, ix + inner, iy],
    ];
}

fn net_area(rings: &[Vec<f64>]) -> f64 {
    let mut total: f64 = 0.0;
    for ring in rings {
        total += signed_area_ring(ring);
    }
    return total.abs();
}

fn signed_area_ring(ring: &[f64]) -> f64 {
    let mut area: f64 = 0.0;
    let n = ring.len() >> 1;
    let mut j = n - 1;
    for i in 0..n {
        area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
        j = i;
    }
    return area / 2.0;
}

fn bounds_of(rings: &[Vec<f64>]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for ring in rings {
        let mut i = 0;
        while i < ring.len() {
            if ring[i] < min_x { min_x = ring[i]; }
            if ring[i] > max_x { max_x = ring[i]; }
            if ring[i + 1] < min_y { min_y = ring[i + 1]; }
            if ring[i + 1] > max_y { max_y = ring[i + 1]; }
            i += 2;
        }
    }
    return (min_x, min_y, max_x, max_y);
}

fn fill_contains(rings: &[Vec<f64>], x: f64, y: f64) -> bool {
    let mut winding: i32 = 0;
    for ring in rings {
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

fn run(
    subject: &[Vec<f64>],
    clip: &[Vec<f64>],
    operation: PathBooleanOperation,
    fill_rule: PathBooleanFillRule,
) -> Vec<Vec<f64>> {
    let kernel = create_martinez_path_boolean_kernel();
    return (kernel.compute_path_boolean)(subject, clip, operation, fill_rule);
}

mod compute_path_boolean {
    use super::*;

    #[test]
    fn unions_two_squares_sharing_a_full_edge_into_one_rectangle() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(10.0, 0.0, 10.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 200.0).abs() < 1e-6);
        let (min_x, min_y, max_x, max_y) = bounds_of(&result);
        assert!((min_x - 0.0).abs() < 1e-6);
        assert!((max_x - 20.0).abs() < 1e-6);
        assert!((min_y - 0.0).abs() < 1e-6);
        assert!((max_y - 10.0).abs() < 1e-6);
        assert!(fill_contains(&result, 10.0, 5.0));
    }

    #[test]
    fn intersects_two_squares_sharing_an_edge_to_nothing() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(10.0, 0.0, 10.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn handles_a_partially_overlapping_shared_edge() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[vec![10.0, 5.0, 20.0, 5.0, 20.0, 15.0, 10.0, 15.0]], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 200.0).abs() < 1e-6);
        assert!(fill_contains(&result, 10.0, 7.0));
    }

    #[test]
    fn collapses_two_identical_squares_under_union_to_a_single_square() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(0.0, 0.0, 10.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn collapses_two_identical_squares_under_intersection_to_the_same_square() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(0.0, 0.0, 10.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn empties_two_identical_squares_under_xor() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(0.0, 0.0, 10.0)], PathBooleanOperation::Xor, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn empties_a_square_differenced_against_an_identical_square() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(0.0, 0.0, 10.0)], PathBooleanOperation::Difference, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn cuts_a_hole_when_the_clip_is_fully_contained() {
        let result = run(&[square(0.0, 0.0, 30.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Difference, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 800.0).abs() < 1e-6);
        assert_eq!(result.len(), 2);
        assert!(fill_contains(&result, 2.0, 2.0));
        assert!(!fill_contains(&result, 15.0, 15.0));
    }

    #[test]
    fn subtracts_a_partial_overlap() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(5.0, 5.0, 10.0)], PathBooleanOperation::Difference, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 75.0).abs() < 1e-6);
        assert!(fill_contains(&result, 2.0, 2.0));
        assert!(!fill_contains(&result, 7.0, 7.0));
    }

    #[test]
    fn is_empty_when_subtracting_a_superset() {
        let result = run(&[square(10.0, 10.0, 10.0)], &[square(0.0, 0.0, 30.0)], PathBooleanOperation::Difference, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn unions_disjoint_squares_into_two_rings() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(20.0, 20.0, 10.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 200.0).abs() < 1e-6);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn intersects_disjoint_squares_to_nothing() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(20.0, 20.0, 10.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn xors_disjoint_squares_to_both_squares() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(20.0, 20.0, 10.0)], PathBooleanOperation::Xor, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 200.0).abs() < 1e-6);
    }

    #[test]
    fn returns_empty_for_two_empty_operands() {
        let result = run(&[], &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!(result.is_empty());
    }

    #[test]
    fn passes_the_subject_through_union_with_an_empty_clip() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn empties_intersection_with_an_empty_clip() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn ignores_a_zero_area_collinear_contour() {
        let degenerate = vec![0.0, 0.0, 10.0, 0.0, 5.0, 0.0];
        let result = run(&[square(0.0, 0.0, 10.0)], &[degenerate], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn ignores_a_single_point_contour() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[vec![5.0, 5.0, 5.0, 5.0, 5.0, 5.0]], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn ignores_a_contour_with_too_few_points() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[vec![1.0, 1.0, 2.0, 2.0]], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn unions_a_donut_with_an_overlapping_square_filling_part_of_the_hole() {
        let result = run(&donut(0.0, 0.0, 30.0, 10.0, 10.0), &[square(12.0, 12.0, 20.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!(fill_contains(&result, 15.0, 15.0));
        assert!(!fill_contains(&result, 11.0, 11.0));
    }

    #[test]
    fn intersects_a_donut_with_a_square_covering_its_hole_to_a_frame() {
        let result = run(&donut(0.0, 0.0, 30.0, 10.0, 10.0), &[square(5.0, 5.0, 20.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(!fill_contains(&result, 15.0, 15.0));
        assert!(fill_contains(&result, 8.0, 8.0));
    }

    #[test]
    fn differences_a_square_from_a_donut_deepening_the_hole() {
        let result = run(&donut(0.0, 0.0, 30.0, 5.0, 20.0), &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Difference, PathBooleanFillRule::NonZero);
        assert!(!fill_contains(&result, 15.0, 15.0));
        assert!(fill_contains(&result, 2.0, 2.0));
    }

    #[test]
    fn fills_the_overlap_of_two_same_wound_squares_under_non_zero() {
        let result = run(&[square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 175.0).abs() < 1e-6);
        assert!(fill_contains(&result, 7.0, 7.0));
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn holes_out_the_overlap_of_two_same_wound_squares_under_even_odd() {
        let result = run(&[square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], &[], PathBooleanOperation::Union, PathBooleanFillRule::EvenOdd);
        assert!((net_area(&result) - 150.0).abs() < 1e-6);
        assert!(!fill_contains(&result, 7.0, 7.0));
        assert!(fill_contains(&result, 2.0, 2.0));
    }

    #[test]
    fn treats_a_bowtie_contour_under_non_zero_as_its_two_filled_lobes() {
        let bowtie = vec![0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 10.0, 10.0];
        let result = run(&[bowtie], &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!(fill_contains(&result, 5.0, 1.0));
        assert!(fill_contains(&result, 5.0, 9.0));
        assert!(!fill_contains(&result, 1.0, 5.0));
    }

    #[test]
    fn keeps_a_counter_clockwise_region_under_positive_fill_drops_it_under_negative() {
        let ccw = square(0.0, 0.0, 10.0);
        assert!((net_area(&run(&[ccw.clone()], &[], PathBooleanOperation::Union, PathBooleanFillRule::Positive)) - 100.0).abs() < 1e-6);
        assert!(net_area(&run(&[ccw], &[], PathBooleanOperation::Union, PathBooleanFillRule::Negative)) < 1e-6);
    }

    #[test]
    fn mirrors_that_for_a_clockwise_region() {
        let cw = vec![0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0];
        assert!((net_area(&run(&[cw.clone()], &[], PathBooleanOperation::Union, PathBooleanFillRule::Negative)) - 100.0).abs() < 1e-6);
        assert!(net_area(&run(&[cw], &[], PathBooleanOperation::Union, PathBooleanFillRule::Positive)) < 1e-6);
    }

    #[test]
    fn dissolves_a_same_wound_self_overlap_under_positive_fill() {
        let result = run(&[square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], &[], PathBooleanOperation::Union, PathBooleanFillRule::Positive);
        assert!((net_area(&result) - 175.0).abs() < 1e-6);
        assert_eq!(result.len(), 1);
        assert!(fill_contains(&result, 7.0, 7.0));
    }

    #[test]
    fn resolves_the_same_topology_across_coordinate_scales() {
        fn overlap(s: f64) -> Vec<Vec<f64>> {
            return vec![square(0.0, 0.0, 10.0 * s), square(5.0 * s, 5.0 * s, 10.0 * s)];
        }
        let small = run(&overlap(1e-3), &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        let mid = run(&overlap(1.0), &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        let large = run(&overlap(1e6), &[], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert_eq!(small.len(), mid.len());
        assert_eq!(large.len(), mid.len());
        assert!((net_area(&mid) - 175.0).abs() < 1e-6);
        assert!((net_area(&small) / 1e-6 - 175.0).abs() < 0.1);
        assert!((net_area(&large) / 1e12 - 175.0).abs() < 0.1);
    }

    #[test]
    fn unions_two_corner_touching_squares_to_their_combined_area() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 200.0).abs() < 1e-6);
        assert!(fill_contains(&result, 5.0, 5.0));
        assert!(fill_contains(&result, 15.0, 15.0));
    }

    #[test]
    fn intersects_two_corner_touching_squares_to_nothing() {
        let result = run(&[square(0.0, 0.0, 10.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn unions_commute() {
        let a = square(0.0, 0.0, 10.0);
        let b = square(5.0, 5.0, 10.0);
        let ab = net_area(&run(&[a.clone()], &[b.clone()], PathBooleanOperation::Union, PathBooleanFillRule::NonZero));
        let ba = net_area(&run(&[b], &[a], PathBooleanOperation::Union, PathBooleanFillRule::NonZero));
        assert!((ab - ba).abs() < 1e-6);
    }

    #[test]
    fn intersections_commute() {
        let a = square(0.0, 0.0, 10.0);
        let b = square(3.0, 4.0, 10.0);
        let ab = net_area(&run(&[a.clone()], &[b.clone()], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero));
        let ba = net_area(&run(&[b], &[a], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero));
        assert!((ab - ba).abs() < 1e-6);
    }

    #[test]
    fn xor_is_symmetric() {
        let a = square(0.0, 0.0, 10.0);
        let b = square(4.0, 4.0, 10.0);
        let ab = net_area(&run(&[a.clone()], &[b.clone()], PathBooleanOperation::Xor, PathBooleanFillRule::NonZero));
        let ba = net_area(&run(&[b], &[a], PathBooleanOperation::Xor, PathBooleanFillRule::NonZero));
        assert!((ab - ba).abs() < 1e-6);
    }

    #[test]
    fn unions_contained_to_the_outer_square() {
        let result = run(&[square(0.0, 0.0, 30.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 900.0).abs() < 1e-6);
    }

    #[test]
    fn intersects_contained_to_the_inner_square() {
        let result = run(&[square(0.0, 0.0, 30.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
    }

    #[test]
    fn xors_contained_to_the_outer_with_hole_frame() {
        let result = run(&[square(0.0, 0.0, 30.0)], &[square(10.0, 10.0, 10.0)], PathBooleanOperation::Xor, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 800.0).abs() < 1e-6);
        assert!(!fill_contains(&result, 15.0, 15.0));
        assert!(fill_contains(&result, 2.0, 2.0));
    }

    #[test]
    fn unions_two_triangles_sharing_a_diagonal_into_a_square() {
        let lower = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0];
        let upper = vec![0.0, 0.0, 10.0, 10.0, 0.0, 10.0];
        let result = run(&[lower], &[upper], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 100.0).abs() < 1e-6);
        assert!(fill_contains(&result, 5.0, 5.0));
    }

    #[test]
    fn intersects_two_diagonal_sharing_triangles_to_nothing() {
        let lower = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0];
        let upper = vec![0.0, 0.0, 10.0, 10.0, 0.0, 10.0];
        let result = run(&[lower], &[upper], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!(net_area(&result) < 1e-6);
    }

    #[test]
    fn intersects_a_diamond_overlapping_a_square() {
        let diamond = vec![5.0, 5.0, 10.0, 0.0, 15.0, 5.0, 10.0, 10.0];
        let result = run(&[square(0.0, 0.0, 10.0)], &[diamond], PathBooleanOperation::Intersection, PathBooleanFillRule::NonZero);
        assert!((net_area(&result) - 25.0).abs() < 1e-6);
        assert!(fill_contains(&result, 8.0, 5.0));
        assert!(!fill_contains(&result, 12.0, 5.0));
    }

    #[test]
    fn unions_a_rotated_square_with_an_overlapping_axis_square() {
        let diamond = vec![0.0, 10.0, 10.0, 0.0, 20.0, 10.0, 10.0, 20.0];
        let result = run(&[square(0.0, 0.0, 12.0)], &[diamond], PathBooleanOperation::Union, PathBooleanFillRule::NonZero);
        assert!(fill_contains(&result, 2.0, 2.0));
        assert!(fill_contains(&result, 18.0, 10.0));
        assert!(!fill_contains(&result, 19.0, 19.0));
    }
}

mod create_martinez_path_boolean_kernel {
    use super::*;

    #[test]
    fn creates_a_kernel_that_computes_boolean_operations() {
        let kernel = create_martinez_path_boolean_kernel();
        let result = (kernel.compute_path_boolean)(
            &[square(0.0, 0.0, 10.0)],
            &[square(5.0, 5.0, 10.0)],
            PathBooleanOperation::Union,
            PathBooleanFillRule::NonZero,
        );
        assert!((net_area(&result) - 175.0).abs() < 0.1);
    }
}

mod initialize_martinez_path_boolean_kernel {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_martinez_path_boolean_kernel() {
        let mut kernel: PathBooleanKernel = flight_entity::allocate_entity();
        initialize_martinez_path_boolean_kernel(&mut kernel);
        assert_eq!(kernel, create_martinez_path_boolean_kernel());
        let result = (kernel.compute_path_boolean)(
            &[square(0.0, 0.0, 10.0)],
            &[square(5.0, 5.0, 10.0)],
            PathBooleanOperation::Intersection,
            PathBooleanFillRule::NonZero,
        );
        assert!((net_area(&result) - 25.0).abs() < 0.1);
    }
}
