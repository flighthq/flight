use flight_path::*;
use flight_path_boolean::*;

fn polygon_path(vertices: &[f64], closed: bool) -> Path {
    let mut path = create_path(Some(PathWinding::NonZero));
    append_path_move_to(&mut path, vertices[0], vertices[1]);
    let mut i = 2;
    while i < vertices.len() {
        append_path_line_to(&mut path, vertices[i], vertices[i + 1]);
        i += 2;
    }
    if closed {
        append_path_close(&mut path);
    }
    return path;
}

fn path_bounds(path: &Path) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for ring in flatten_path(path, 0.25) {
        let mut i = 0;
        while i < ring.len() {
            if ring[i] < min_x { min_x = ring[i]; }
            if ring[i + 1] < min_y { min_y = ring[i + 1]; }
            if ring[i] > max_x { max_x = ring[i]; }
            if ring[i + 1] > max_y { max_y = ring[i + 1]; }
            i += 2;
        }
    }
    return (min_x, min_y, max_x, max_y);
}

fn path_area(path: &Path) -> f64 {
    let mut total: f64 = 0.0;
    for ring in flatten_path(path, 0.25) {
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

fn path_vertex_count(path: &Path) -> usize {
    let mut count: usize = 0;
    for ring in flatten_path(path, 0.25) {
        count += ring.len() / 2;
    }
    return count;
}

fn ring_count(path: &Path) -> usize {
    return flatten_path(path, 0.25).len();
}

const UNIT_SQUARE: [f64; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];

mod offset_path {
    use super::*;

    #[test]
    fn writes_into_an_existing_output_and_is_alias_safe() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut path = polygon_path(&[0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], true);
        let path_clone = path.clone();
        offset_path(&mut path, &kernel, &path_clone, 1.0, None);
        let (min_x, min_y, max_x, max_y) = path_bounds(&path);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((min_y - (-1.0)).abs() < 1e-6);
        assert!((max_x - 5.0).abs() < 1e-6);
        assert!((max_y - 5.0).abs() < 1e-6);
    }

    #[test]
    fn inflates_a_closed_square_by_delta_on_every_side_with_a_miter_join() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, None);
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((min_y - (-1.0)).abs() < 1e-6);
        assert!((max_x - 2.0).abs() < 1e-6);
        assert!((max_y - 2.0).abs() < 1e-6);
        assert!((path_area(&out) - 9.0).abs() < 0.1);
    }

    #[test]
    fn deflates_a_closed_square_on_a_negative_delta() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&[0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], true), -1.0, None);
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - 1.0).abs() < 1e-6);
        assert!((min_y - 1.0).abs() < 1e-6);
        assert!((max_x - 3.0).abs() < 1e-6);
        assert!((max_y - 3.0).abs() < 1e-6);
        assert!((path_area(&out) - 4.0).abs() < 0.1);
    }

    #[test]
    fn emits_an_empty_path_when_deflation_collapses_the_region() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE, true), -1.0, None);
        assert_eq!(out.commands.len(), 0);
        assert!((path_area(&out) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn chamfers_corners_with_a_bevel_join() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: Some(PathOffsetJoin::Bevel), end: None, miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, Some(&opts));
        let (min_x, _, max_x, _) = path_bounds(&out);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((max_x - 2.0).abs() < 1e-6);
        assert!((path_area(&out) - 7.0).abs() < 0.1);
    }

    #[test]
    fn rounds_corners_with_a_round_join() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: Some(PathOffsetJoin::Round), end: None, miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, Some(&opts));
        let (min_x, _, max_x, _) = path_bounds(&out);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((max_x - 2.0).abs() < 1e-6);
        let fine_opts = PathOffsetOptions { join: Some(PathOffsetJoin::Round), end: None, miter_limit: None, tolerance: None, arc_tolerance: Some(0.001) };
        let mut fine = create_path(Some(PathWinding::NonZero));
        offset_path(&mut fine, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, Some(&fine_opts));
        let fine_area = path_area(&fine);
        assert!((fine_area - (5.0 + std::f64::consts::PI)).abs() < 0.2);
    }

    #[test]
    fn falls_back_to_a_bevel_when_a_sharp_miter_exceeds_the_miter_limit() {
        let kernel = create_martinez_path_boolean_kernel();
        let wedge = [0.0, 0.0, 4.0, 0.5, 4.0, -0.5];
        let clipped_opts = PathOffsetOptions { join: None, end: None, miter_limit: Some(2.0), tolerance: None, arc_tolerance: None };
        let sharp_opts = PathOffsetOptions { join: None, end: None, miter_limit: Some(50.0), tolerance: None, arc_tolerance: None };
        let mut clipped = create_path(Some(PathWinding::NonZero));
        let mut sharp = create_path(Some(PathWinding::NonZero));
        offset_path(&mut clipped, &kernel, &polygon_path(&wedge, true), 1.0, Some(&clipped_opts));
        offset_path(&mut sharp, &kernel, &polygon_path(&wedge, true), 1.0, Some(&sharp_opts));
        let (clipped_min_x, _, _, _) = path_bounds(&clipped);
        let (sharp_min_x, _, _, _) = path_bounds(&sharp);
        assert!(clipped_min_x > sharp_min_x + 3.0);
        assert!(sharp_min_x < -5.0);
    }

    #[test]
    fn squares_corners_with_a_square_join() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: Some(PathOffsetJoin::Square), end: None, miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, Some(&opts));
        let (min_x, _, max_x, _) = path_bounds(&out);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((max_x - 2.0).abs() < 1e-6);
        assert!((path_area(&out) - 9.0).abs() < 0.1);
        let bevel_opts = PathOffsetOptions { join: Some(PathOffsetJoin::Bevel), end: None, miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut bevel = create_path(Some(PathWinding::NonZero));
        offset_path(&mut bevel, &kernel, &polygon_path(&UNIT_SQUARE, true), 1.0, Some(&bevel_opts));
        assert!(path_area(&out) > path_area(&bevel));
    }

    #[test]
    fn cleans_a_concave_corner_into_a_single_valid_outline() {
        let kernel = create_martinez_path_boolean_kernel();
        let l_shape = [0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 1.0, 2.0, 1.0, 1.0, 0.0, 1.0];
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&l_shape, true), 0.25, None);
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - (-0.25)).abs() < 1e-6);
        assert!((min_y - (-0.25)).abs() < 1e-6);
        assert!((max_x - 2.25).abs() < 1e-6);
        assert!((max_y - 2.25).abs() < 1e-6);
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        assert_eq!(move_count, 1);
        assert!(path_area(&out) > 3.0);
    }

    #[test]
    fn closes_a_concave_slot_narrower_than_two_delta_into_a_valid_outline() {
        let kernel = create_martinez_path_boolean_kernel();
        let u_shape = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 5.5, 10.0, 5.5, 3.0, 4.5, 3.0, 4.5, 10.0, 0.0, 10.0];
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&u_shape, true), 1.0, None);
        assert_eq!(ring_count(&out), 1);
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - (-1.0)).abs() < 1e-6);
        assert!((max_x - 11.0).abs() < 1e-6);
        assert!((min_y - (-1.0)).abs() < 1e-6);
        assert!((max_y - 11.0).abs() < 1e-6);
        let mut simplified = create_path(Some(PathWinding::NonZero));
        let simplify_opts = PathBooleanOptions { fill_rule: Some(PathBooleanFillRule::NonZero), tolerance: None };
        simplify_path(&mut simplified, &kernel, &out, Some(&simplify_opts));
        assert_eq!(ring_count(&simplified), ring_count(&out));
        assert!((path_area(&simplified) - path_area(&out)).abs() < 1e-4);
    }

    #[test]
    fn strokes_an_open_path_into_a_butt_capped_rectangle() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: None, end: Some(PathOffsetEnd::Butt), miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&[0.0, 0.0, 2.0, 0.0], false), 0.5, Some(&opts));
        let (min_x, min_y, max_x, max_y) = path_bounds(&out);
        assert!((min_x - 0.0).abs() < 1e-6);
        assert!((max_x - 2.0).abs() < 1e-6);
        assert!((min_y - (-0.5)).abs() < 1e-6);
        assert!((max_y - 0.5).abs() < 1e-6);
        assert!((path_area(&out) - 2.0).abs() < 0.1);
    }

    #[test]
    fn extends_an_open_path_past_its_ends_with_a_square_cap() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: None, end: Some(PathOffsetEnd::Square), miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&[0.0, 0.0, 2.0, 0.0], false), 0.5, Some(&opts));
        let (min_x, _, max_x, _) = path_bounds(&out);
        assert!((min_x - (-0.5)).abs() < 1e-6);
        assert!((max_x - 2.5).abs() < 1e-6);
        assert!((path_area(&out) - 3.0).abs() < 0.1);
    }

    #[test]
    fn caps_an_open_path_with_half_circles_on_a_round_end() {
        let kernel = create_martinez_path_boolean_kernel();
        let opts = PathOffsetOptions { join: None, end: Some(PathOffsetEnd::Round), miter_limit: None, tolerance: None, arc_tolerance: Some(0.001) };
        let mut out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut out, &kernel, &polygon_path(&[0.0, 0.0, 2.0, 0.0], false), 0.5, Some(&opts));
        let (min_x, _, max_x, _) = path_bounds(&out);
        assert!((min_x - (-0.5)).abs() < 0.01);
        assert!((max_x - 2.5).abs() < 0.01);
        assert!((path_area(&out) - (2.0 + std::f64::consts::PI * 0.25)).abs() < 0.05);
    }

    #[test]
    fn offsets_the_same_vertices_differently_as_open_vs_closed() {
        let kernel = create_martinez_path_boolean_kernel();
        let vertices = [0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 0.0, 2.0];
        let mut closed_out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut closed_out, &kernel, &polygon_path(&vertices, true), 0.5, None);
        let butt_opts = PathOffsetOptions { join: None, end: Some(PathOffsetEnd::Butt), miter_limit: None, tolerance: None, arc_tolerance: None };
        let mut open_out = create_path(Some(PathWinding::NonZero));
        offset_path(&mut open_out, &kernel, &polygon_path(&vertices, false), 0.5, Some(&butt_opts));
        assert!((path_area(&closed_out) - 9.0).abs() < 0.1);
        assert!(path_area(&open_out) < path_area(&closed_out));
    }

    #[test]
    fn offsets_consistently_across_coordinate_scales() {
        let kernel = create_martinez_path_boolean_kernel();
        fn l_shape(s: f64) -> Vec<f64> {
            return vec![0.0, 0.0, 2.0 * s, 0.0, 2.0 * s, 2.0 * s, s, 2.0 * s, s, s, 0.0, s];
        }
        let mut small = create_path(Some(PathWinding::NonZero));
        let mut mid = create_path(Some(PathWinding::NonZero));
        let mut large = create_path(Some(PathWinding::NonZero));
        offset_path(&mut small, &kernel, &polygon_path(&l_shape(1e-3), true), 0.25e-3, None);
        offset_path(&mut mid, &kernel, &polygon_path(&l_shape(1.0), true), 0.25, None);
        offset_path(&mut large, &kernel, &polygon_path(&l_shape(1e6), true), 0.25e6, None);
        assert_eq!(ring_count(&small), ring_count(&mid));
        assert_eq!(ring_count(&large), ring_count(&mid));
        assert!((path_area(&small) / 1e-6 - path_area(&mid)).abs() < 0.1);
        assert!((path_area(&large) / 1e12 - path_area(&mid)).abs() < 0.1);
    }
}
