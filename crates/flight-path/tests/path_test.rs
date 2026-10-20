use flight_path::*;

mod append_path_arc {
    use super::*;

    #[test]
    fn produces_move_to_and_cubic_curves_for_non_zero_arc() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_arc(&mut path, 0.0, 0.0, 50.0, 0.0, std::f64::consts::FRAC_PI_2, false, false);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert!(path.commands.contains(&(PathCommand::CubicCurveTo as u8)));
    }

    #[test]
    fn starts_at_correct_point_on_circle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_arc(&mut path, 10.0, 20.0, 30.0, 0.0, std::f64::consts::FRAC_PI_2, false, false);
        assert!((path.data[0] - 40.0).abs() < 0.01);
        assert!((path.data[1] - 20.0).abs() < 0.01);
    }

    #[test]
    fn appends_nothing_for_zero_radius() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_arc(&mut path, 0.0, 0.0, 0.0, 0.0, std::f64::consts::PI, false, false);
        assert_eq!(path.commands.len(), 0);
    }

    #[test]
    fn ends_at_correct_point_for_a_quarter_circle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_arc(&mut path, 0.0, 0.0, 100.0, 0.0, std::f64::consts::FRAC_PI_2, false, false);
        let data = &path.data;
        assert!((data[data.len() - 2] - 0.0).abs() < 0.1);
        assert!((data[data.len() - 1] - 100.0).abs() < 0.1);
    }

    #[test]
    fn supports_anticlockwise_arcs() {
        let mut path_cw = create_path(PathWinding::NonZero);
        append_path_arc(&mut path_cw, 0.0, 0.0, 50.0, 0.0, std::f64::consts::PI, false, false);
        let mut path_ccw = create_path(PathWinding::NonZero);
        append_path_arc(&mut path_ccw, 0.0, 0.0, 50.0, 0.0, std::f64::consts::PI, true, false);
        assert!(path_cw.commands.contains(&(PathCommand::CubicCurveTo as u8)));
        assert!(path_ccw.commands.contains(&(PathCommand::CubicCurveTo as u8)));
        let cw_max_y: f64 = path_cw.data.iter().enumerate()
            .filter(|(i, _)| i % 2 == 1)
            .map(|(_, v)| *v)
            .fold(f64::NEG_INFINITY, f64::max);
        let ccw_min_y: f64 = path_ccw.data.iter().enumerate()
            .filter(|(i, _)| i % 2 == 1)
            .map(|(_, v)| *v)
            .fold(f64::INFINITY, f64::min);
        assert!(cw_max_y > 0.0);
        assert!(ccw_min_y < 0.0);
    }

    #[test]
    fn connect_to_current_appends_line_to_instead_of_move_to() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_arc(&mut path, 100.0, 0.0, 50.0, std::f64::consts::PI, 0.0, false, true);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(path.commands[1], PathCommand::LineTo as u8);
    }
}

mod append_path_circle {
    use super::*;

    #[test]
    fn produces_closed_path_with_four_cubic_curves() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_circle(&mut path, 0.0, 0.0, 50.0);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
        let cubic_count = path.commands.iter().filter(|&&c| c == PathCommand::CubicCurveTo as u8).count();
        assert_eq!(cubic_count, 4);
    }

    #[test]
    fn starts_at_rightmost_point() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_circle(&mut path, 10.0, 20.0, 30.0);
        assert!((path.data[0] - 40.0).abs() < 0.01);
        assert!((path.data[1] - 20.0).abs() < 0.01);
    }
}

mod append_path_ellipse {
    use super::*;

    #[test]
    fn produces_a_closed_path_with_four_cubic_segments() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_ellipse(&mut path, 0.0, 0.0, 100.0, 50.0);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
        let cubic_count = path.commands.iter().filter(|&&c| c == PathCommand::CubicCurveTo as u8).count();
        assert_eq!(cubic_count, 4);
    }

    #[test]
    fn starts_at_cx_plus_radius_x_cy() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_ellipse(&mut path, 10.0, 20.0, 100.0, 50.0);
        assert!((path.data[0] - 110.0).abs() < 0.01);
        assert!((path.data[1] - 20.0).abs() < 0.01);
    }
}

mod append_path_elliptical_arc_to {
    use super::*;

    #[test]
    fn starts_after_close_from_the_subpath_origin() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 10.0, 20.0);
        append_path_line_to(&mut path, 30.0, 40.0);
        append_path_close(&mut path);
        append_path_elliptical_arc_to(&mut path, 10.0, 10.0, 0.0, false, true, 30.0, 20.0);

        let mut expected = create_path(PathWinding::NonZero);
        append_path_move_to(&mut expected, 10.0, 20.0);
        append_path_elliptical_arc_to(&mut expected, 10.0, 10.0, 0.0, false, true, 30.0, 20.0);

        assert_eq!(&path.data[4..], &expected.data[2..]);
    }

    #[test]
    fn appends_a_line_to_when_radius_x_is_zero() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_elliptical_arc_to(&mut path, 0.0, 10.0, 0.0, false, false, 50.0, 50.0);
        assert_eq!(path.commands[1], PathCommand::LineTo as u8);
        assert!((path.data[path.data.len() - 2] - 50.0).abs() < 0.01);
        assert!((path.data[path.data.len() - 1] - 50.0).abs() < 0.01);
    }

    #[test]
    fn does_nothing_when_start_equals_end() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 10.0, 10.0);
        let before_len = path.commands.len();
        append_path_elliptical_arc_to(&mut path, 50.0, 50.0, 0.0, false, false, 10.0, 10.0);
        assert_eq!(path.commands.len(), before_len);
    }

    #[test]
    fn produces_cubic_curves_for_a_non_degenerate_arc() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 100.0, 0.0);
        append_path_elliptical_arc_to(&mut path, 50.0, 50.0, 0.0, true, false, 100.0, 1.0);
        assert!(path.commands.contains(&(PathCommand::CubicCurveTo as u8)));
    }

    #[test]
    fn ends_at_the_specified_endpoint() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 1.0, 0.0);
        append_path_elliptical_arc_to(&mut path, 1.0, 1.0, 0.0, false, true, 0.0, 1.0);
        let data = &path.data;
        assert!((data[data.len() - 2] - 0.0).abs() < 0.1);
        assert!((data[data.len() - 1] - 1.0).abs() < 0.1);
    }
}

mod append_path_close {
    use super::*;

    #[test]
    fn appends_close_command_and_no_data() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        let data_before = path.data.len();
        append_path_close(&mut path);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
        assert_eq!(path.data.len(), data_before);
    }
}

mod append_path_cubic_curve_to {
    use super::*;

    #[test]
    fn appends_command_and_six_data_values() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 10.0, 20.0, 30.0, 40.0, 50.0, 0.0);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::CubicCurveTo as u8);
        assert_eq!(path.data.len(), 8);
    }
}

mod append_path_line_to {
    use super::*;

    #[test]
    fn appends_command_and_two_data_values() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 20.0);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::LineTo as u8);
        assert_eq!(path.data.len(), 4);
    }
}

mod append_path_move_to {
    use super::*;

    #[test]
    fn appends_command_and_two_data_values() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 5.0, 10.0);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(path.data[0], 5.0);
        assert_eq!(path.data[1], 10.0);
    }
}

mod append_path_polygon {
    use super::*;

    #[test]
    fn creates_closed_polygon_from_points() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polygon(&mut path, &[0.0, 0.0, 100.0, 0.0, 50.0, 100.0]);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn ignores_fewer_than_three_points() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polygon(&mut path, &[0.0, 0.0, 10.0, 10.0]);
        assert_eq!(path.commands.len(), 0);
    }
}

mod append_path_polyline {
    use super::*;

    #[test]
    fn appends_an_open_polyline_with_no_close() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polyline(&mut path, &[0.0, 0.0, 10.0, 0.0, 10.0, 10.0]);
        assert_eq!(path.commands, vec![
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
        ]);
        assert!(!path.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn does_nothing_when_fewer_than_two_points_are_provided() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polyline(&mut path, &[0.0, 0.0]);
        assert_eq!(path.commands.len(), 0);
    }
}

mod append_path_quadratic_curve_to {
    use super::*;

    #[test]
    fn pushes_the_quadratic_verb_and_its_four_coordinates() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_quadratic_curve_to(&mut path, 1.0, 2.0, 3.0, 4.0);
        assert_eq!(path.commands, vec![PathCommand::QuadraticCurveTo as u8]);
        assert_eq!(path.data, vec![1.0, 2.0, 3.0, 4.0]);
    }
}

mod append_path_rectangle {
    use super::*;

    #[test]
    fn creates_closed_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
        let line_count = path.commands.iter().filter(|&&c| c == PathCommand::LineTo as u8).count();
        assert_eq!(line_count, 3);
    }
}

mod append_path_rounded_rectangle {
    use super::*;

    #[test]
    fn produces_a_closed_path_for_a_uniformly_rounded_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0, 10.0);
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn contains_cubic_curves_for_the_corner_arcs() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0, 10.0);
        assert!(path.commands.contains(&(PathCommand::CubicCurveTo as u8)));
    }

    #[test]
    fn uses_authored_radius_directly() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0, 20.0);
        assert_eq!(&path.data[0..4], &[20.0, 0.0, 80.0, 0.0]);
    }

    #[test]
    fn produces_a_rectangle_when_radius_is_zero() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0, 0.0);
        assert!(!path.commands.contains(&(PathCommand::CubicCurveTo as u8)));
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
        let xs: Vec<f64> = path.data.iter().enumerate().filter(|(i, _)| i % 2 == 0).map(|(_, v)| *v).collect();
        let ys: Vec<f64> = path.data.iter().enumerate().filter(|(i, _)| i % 2 == 1).map(|(_, v)| *v).collect();
        assert!((*xs.iter().min_by(|a, b| a.partial_cmp(b).unwrap()).unwrap() - 0.0).abs() < 0.01);
        assert!((*xs.iter().max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap() - 100.0).abs() < 0.01);
        assert!((*ys.iter().min_by(|a, b| a.partial_cmp(b).unwrap()).unwrap() - 0.0).abs() < 0.01);
        assert!((*ys.iter().max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap() - 50.0).abs() < 0.01);
    }

    #[test]
    fn clamps_oversized_radii_to_half_the_edge_length() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle(&mut path, 0.0, 0.0, 40.0, 20.0, 1000.0);
        assert_eq!(*path.commands.last().unwrap(), PathCommand::Close as u8);
    }
}

mod append_path_rounded_rectangle_with_corner_radii {
    use super::*;

    #[test]
    fn uses_per_corner_radii_in_tl_tr_br_bl_order() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rounded_rectangle_with_corner_radii(&mut path, 0.0, 0.0, 100.0, 100.0, 10.0, 20.0, 30.0, 40.0);
        assert_eq!(path.commands, vec![
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::CubicCurveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::CubicCurveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::CubicCurveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::CubicCurveTo as u8,
            PathCommand::Close as u8,
        ]);
        assert_eq!(&path.data[0..4], &[10.0, 0.0, 80.0, 0.0]);
        assert_eq!(&path.data[8..12], &[100.0, 20.0, 100.0, 70.0]);
        assert_eq!(&path.data[16..20], &[70.0, 100.0, 40.0, 100.0]);
        assert!((path.data[24] - 0.0).abs() < 0.01);
        assert!((path.data[25] - 60.0).abs() < 0.01);
        assert_eq!(&path.data[26..28], &[0.0, 10.0]);
        assert!((path.data[32] - 10.0).abs() < 0.01);
        assert!((path.data[33] - 0.0).abs() < 0.01);
    }
}

mod append_path_tangent_arc_to {
    use super::*;

    #[test]
    fn emits_line_to_and_cubic_curves_for_a_right_angle_corner() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 100.0, 0.0);
        append_path_tangent_arc_to(&mut path, 100.0, 100.0, 0.0, 100.0, 20.0);
        assert!(path.commands.contains(&(PathCommand::LineTo as u8)));
        assert!(path.commands.contains(&(PathCommand::CubicCurveTo as u8)));
    }

    #[test]
    fn selects_the_short_sweep_for_a_clockwise_right_angle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_tangent_arc_to(&mut path, 100.0, 0.0, 100.0, 100.0, 20.0);
        let last = get_path_last_point(&path).unwrap();
        assert!((last.0 - 100.0).abs() < 1e-6);
        assert!((last.1 - 20.0).abs() < 1e-6);
    }

    #[test]
    fn selects_the_short_sweep_for_a_counterclockwise_right_angle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_tangent_arc_to(&mut path, 0.0, 100.0, 100.0, 100.0, 20.0);
        let last = get_path_last_point(&path).unwrap();
        assert!((last.0 - 20.0).abs() < 1e-6);
        assert!((last.1 - 100.0).abs() < 1e-6);
    }

    #[test]
    fn falls_back_to_line_to_when_tangent_has_zero_length() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 100.0, 100.0);
        append_path_tangent_arc_to(&mut path, 100.0, 100.0, 0.0, 100.0, 20.0);
        assert_eq!(path.commands[1], PathCommand::LineTo as u8);
        let cubic_count = path.commands.iter().filter(|&&c| c == PathCommand::CubicCurveTo as u8).count();
        assert_eq!(cubic_count, 0);
    }

    #[test]
    fn handles_collinear_tangent_lines() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_tangent_arc_to(&mut path, 50.0, 0.0, 100.0, 0.0, 20.0);
        assert!(path.commands.len() > 1);
        assert!(path.commands.contains(&(PathCommand::LineTo as u8)));
    }

    #[test]
    fn falls_back_to_line_to_when_radius_is_zero() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_tangent_arc_to(&mut path, 100.0, 0.0, 100.0, 100.0, 0.0);
        assert_eq!(path.commands[1], PathCommand::LineTo as u8);
        let cubic_count = path.commands.iter().filter(|&&c| c == PathCommand::CubicCurveTo as u8).count();
        assert_eq!(cubic_count, 0);
    }

    #[test]
    fn handles_an_obtuse_angle_with_a_short_arc() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_tangent_arc_to(&mut path, 100.0, 0.0, 150.0, 100.0, 20.0);
        assert!(get_path_last_point(&path).is_some());
        let cubic_count = path.commands.iter().filter(|&&c| c == PathCommand::CubicCurveTo as u8).count();
        assert_eq!(cubic_count, 1);
    }
}

mod create_path_test {
    use super::*;

    #[test]
    fn returns_empty_path_with_given_winding() {
        let path = create_path(PathWinding::EvenOdd);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert_eq!(path.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn defaults_to_non_zero_winding() {
        let path = create_path(PathWinding::NonZero);
        assert_eq!(path.winding, PathWinding::NonZero);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
    }
}

mod get_path_last_point {
    use super::*;

    #[test]
    fn returns_none_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        assert!(get_path_last_point(&path).is_none());
    }

    #[test]
    fn returns_last_line_to_point() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 20.0);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 10.0);
        assert_eq!(pt.1, 20.0);
    }

    #[test]
    fn returns_move_to_origin_after_close() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 5.0, 10.0);
        append_path_line_to(&mut path, 20.0, 30.0);
        append_path_close(&mut path);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 5.0);
        assert_eq!(pt.1, 10.0);
    }

    #[test]
    fn returns_the_point_after_move_to() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 10.0, 20.0);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 10.0);
        assert_eq!(pt.1, 20.0);
    }

    #[test]
    fn returns_the_anchor_after_quadratic_curve_to() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 5.0, 5.0, 50.0, 60.0);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 50.0);
        assert_eq!(pt.1, 60.0);
    }

    #[test]
    fn returns_the_anchor_after_cubic_curve_to() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 1.0, 2.0, 3.0, 4.0, 70.0, 80.0);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 70.0);
        assert_eq!(pt.1, 80.0);
    }

    #[test]
    fn returns_the_move_to_origin_after_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 10.0, 20.0, 100.0, 50.0);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 10.0);
        assert_eq!(pt.1, 20.0);
    }

    #[test]
    fn returns_the_endpoint_after_arc() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_arc(&mut path, 0.0, 0.0, 100.0, 0.0, std::f64::consts::FRAC_PI_2, false, false);
        let pt = get_path_last_point(&path).unwrap();
        assert!((pt.0 - 0.0).abs() < 0.1);
        assert!((pt.1 - 100.0).abs() < 0.1);
    }

    #[test]
    fn returns_the_endpoint_after_circle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_circle(&mut path, 10.0, 20.0, 30.0);
        let pt = get_path_last_point(&path).unwrap();
        assert!((pt.0 - 40.0).abs() < 0.01);
        assert!((pt.1 - 20.0).abs() < 0.01);
    }

    #[test]
    fn returns_the_move_to_origin_after_polygon() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polygon(&mut path, &[0.0, 0.0, 100.0, 0.0, 100.0, 100.0]);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 0.0);
        assert_eq!(pt.1, 0.0);
    }

    #[test]
    fn returns_the_last_point_after_polyline() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_polyline(&mut path, &[0.0, 0.0, 50.0, 60.0, 70.0, 80.0]);
        let pt = get_path_last_point(&path).unwrap();
        assert_eq!(pt.0, 70.0);
        assert_eq!(pt.1, 80.0);
    }
}

mod initialize_path {
    use super::*;

    #[test]
    fn clears_existing_data() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 1.0, 2.0);
        initialize_path(&mut path, PathWinding::EvenOdd);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert_eq!(path.winding, PathWinding::EvenOdd);
    }
}
