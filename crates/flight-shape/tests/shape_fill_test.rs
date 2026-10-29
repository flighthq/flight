use flight_path::create_path;
use flight_shape::contract::*;

use crate::support::*;

mod append_shape_geometry_command {
    use super::*;

    #[test]
    fn appends_move_and_line_verbs() {
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        let commands = vec![number(3.0), number(4.0)];
        append_shape_geometry_command(&mut path, "moveTo", &commands, 0);
        assert_eq!(path.commands.len(), 1);
        assert_eq!(path.data, vec![3.0, 4.0]);
    }
}

mod fill_source_parity {
    use super::*;
    use flight_path::PathCommand;

    #[test]
    fn append_geometry_appends_polyline_verbs_and_expands_primitives_ignoring_non_geometry_names() {
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        append_shape_geometry_command(&mut path, "moveTo", &[number(5.0), number(6.0)], 0);
        append_shape_geometry_command(&mut path, "lineTo", &[number(7.0), number(8.0)], 0);
        assert_eq!(
            path.commands,
            vec![PathCommand::MOVE_TO as u8, PathCommand::LINE_TO as u8]
        );
        assert_eq!(path.data, vec![5.0, 6.0, 7.0, 8.0]);

        let mut rectangle = create_path(Some(flight_path::PathWinding::NonZero));
        append_shape_geometry_command(
            &mut rectangle,
            "drawRectangle",
            &[number(0.0), number(0.0), number(10.0), number(10.0)],
            0,
        );
        assert_eq!(
            rectangle.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8
            ]
        );

        let mut noop = create_path(Some(flight_path::PathWinding::NonZero));
        append_shape_geometry_command(&mut noop, "beginFill", &[number(0.0), number(1.0)], 0);
        assert!(noop.commands.is_empty());
    }

    #[test]
    fn append_geometry_keeps_the_data_cursor_aligned_across_a_raw_close() {
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        let verbs = [
            PathCommand::MOVE_TO as u8,
            PathCommand::LINE_TO as u8,
            PathCommand::CLOSE as u8,
            PathCommand::MOVE_TO as u8,
            PathCommand::LINE_TO as u8,
        ];
        append_shape_geometry_command(
            &mut path,
            "drawPath",
            &[
                numbers(&verbs.iter().map(|v| *v as f64).collect::<Vec<f64>>()),
                numbers(&[0.0, 0.0, 10.0, 0.0, 20.0, 20.0, 30.0, 20.0]),
                string("nonZero"),
            ],
            0,
        );
        assert_eq!(path.commands, verbs);
        assert_eq!(path.data, vec![0.0, 0.0, 10.0, 0.0, 20.0, 20.0, 30.0, 20.0]);
    }

    #[test]
    fn operand_count_reports_width_per_verb() {
        assert_eq!(get_path_command_operand_count(PathCommand::MOVE_TO as u8), 2);
        assert_eq!(get_path_command_operand_count(PathCommand::LINE_TO as u8), 2);
        assert_eq!(
            get_path_command_operand_count(PathCommand::QUADRATIC_CURVE_TO as u8),
            4
        );
        assert_eq!(
            get_path_command_operand_count(PathCommand::WIDE_MOVE_TO as u8),
            4
        );
        assert_eq!(
            get_path_command_operand_count(PathCommand::WIDE_LINE_TO as u8),
            4
        );
        assert_eq!(
            get_path_command_operand_count(PathCommand::CUBIC_CURVE_TO as u8),
            6
        );
        assert_eq!(get_path_command_operand_count(PathCommand::CLOSE as u8), 0);
        assert_eq!(get_path_command_operand_count(PathCommand::NO_OP as u8), 0);
    }

    #[test]
    fn fill_regions_resolve_a_solid_rectangle_into_one_closed_outline() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0xff0000ff, Some(1.0));
        append_shape_rectangle(&shape, 10.0, 20.0, 100.0, 50.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0xff0000ff);
        assert_eq!(regions[0].alpha, 1.0);
        let path = regions[0].path.read().unwrap();
        assert_eq!(
            path.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8
            ]
        );
        assert_eq!(&path.data[..4], &[10.0, 20.0, 110.0, 20.0]);
    }

    #[test]
    fn fill_regions_expand_a_circle_into_four_cubic_curves() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x00ff00ff, None);
        append_shape_circle(&shape, 50.0, 50.0, 20.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert_eq!(
            path.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8
            ]
        );
        assert_eq!(&path.data[..2], &[70.0, 50.0]);
    }

    #[test]
    fn fill_regions_expand_ellipse_center_and_radii_into_four_cubic_curves() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x00ff00ff, None);
        append_shape_ellipse(&shape, 50.0, 25.0, 40.0, 10.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert_eq!(
            path.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8
            ]
        );
        assert_eq!(&path.data[..2], &[90.0, 25.0]);
    }

    #[test]
    fn fill_regions_expand_elliptical_and_tangent_arcs_into_path_curves() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x00ff00ff, None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_elliptical_arc_to(&shape, 50.0, 25.0, 0.0, false, true, 100.0, 0.0);
        append_shape_tangent_arc_to(&shape, 150.0, 0.0, 150.0, 50.0, 10.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert!(
            path.commands
                .iter()
                .filter(|verb| **verb == PathCommand::CUBIC_CURVE_TO as u8)
                .count()
                >= 3
        );
        let len = path.data.len();
        assert!((path.data[len - 2] - 150.0).abs() < 1e-4);
        assert!((path.data[len - 1] - 10.0).abs() < 1e-4);
    }

    #[test]
    fn fill_regions_expand_a_rounded_rectangle_using_the_authored_radius_without_halving_it() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x00ff00ff, None);
        append_shape_rounded_rectangle(&shape, 0.0, 0.0, 100.0, 50.0, 20.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert_eq!(
            path.commands
                .iter()
                .filter(|verb| **verb == PathCommand::CUBIC_CURVE_TO as u8)
                .count(),
            4
        );
        assert_eq!(&path.data[..2], &[20.0, 0.0]);
        let len = path.data.len();
        assert_eq!(&path.data[len - 2..], &[20.0, 0.0]);
    }

    #[test]
    fn fill_regions_resolve_a_move_to_line_to_polygon_fill() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x0000ffff, None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 100.0, 0.0);
        append_shape_line_to(&shape, 50.0, 80.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(
            regions[0].path.read().unwrap().commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8
            ]
        );
    }

    #[test]
    fn fill_regions_return_one_region_per_fill_span_when_fills_are_not_explicitly_ended() {
        let shape = registered_shape(None);
        append_shape_begin_fill(&shape, 0x111111ff, None);
        append_shape_rectangle(&shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_begin_fill(&shape, 0x222222ff, None);
        append_shape_rectangle(&shape, 20.0, 20.0, 10.0, 10.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        assert_eq!(
            regions
                .iter()
                .map(|region| region.color)
                .collect::<Vec<u32>>(),
            vec![0x111111ff, 0x222222ff]
        );
    }

    #[test]
    fn fill_regions_return_null_for_a_gradient_fill() {
        let shape = registered_shape(None);
        append_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &[0xff0000ff, 0x0000ffff],
            &[1.0, 1.0],
            &[0.0, 255.0],
            None,
            None,
            None,
            None,
        );
        append_shape_rectangle(&shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&shape);
        assert!(get_shape_fill_regions(&tokens(&shape)).is_none());
    }

    #[test]
    fn fill_regions_resolve_solid_fills_independently_of_a_solid_stroke() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(2.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        append_shape_rectangle(&shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&shape);
        let regions = get_shape_fill_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0xff0000ff);
    }

    #[test]
    fn non_solid_fill_is_false_for_solid_fills_and_solid_strokes_and_true_for_a_gradient() {
        let solid = registered_shape(None);
        append_shape_begin_fill(&solid, 0xff0000ff, None);
        append_shape_rectangle(&solid, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&solid);
        assert!(!has_non_solid_shape_fill(&tokens(&solid)));
        let stroke = registered_shape(None);
        append_shape_line_style(
            &stroke,
            Some(1.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(!has_non_solid_shape_fill(&tokens(&stroke)));
        append_shape_begin_gradient_fill(
            &stroke,
            GradientType::Linear,
            &[0xff0000ff, 0x0000ffff],
            &[1.0, 1.0],
            &[0.0, 255.0],
            None,
            None,
            None,
            None,
        );
        assert!(has_non_solid_shape_fill(&tokens(&stroke)));
    }

    #[test]
    fn has_shape_fill_is_true_when_declared_and_false_for_a_stroke_only_shape() {
        let filled = registered_shape(None);
        append_shape_begin_fill(&filled, 0xff0000ff, None);
        append_shape_rectangle(&filled, 0.0, 0.0, 10.0, 10.0);
        assert!(has_shape_fill(&tokens(&filled)));
        let stroke_only = registered_shape(None);
        append_shape_line_style(
            &stroke_only,
            Some(2.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_move_to(&stroke_only, 0.0, 0.0);
        append_shape_line_to(&stroke_only, 10.0, 0.0);
        assert!(!has_shape_fill(&tokens(&stroke_only)));
    }
}

mod get_path_command_operand_count {
    use super::*;

    #[test]
    fn maps_verbs_to_their_operand_counts() {
        assert_eq!(get_path_command_operand_count(1), 2);
        assert_eq!(get_path_command_operand_count(3), 4);
        assert_eq!(get_path_command_operand_count(6), 6);
        assert_eq!(get_path_command_operand_count(0), 0);
    }
}

mod get_shape_fill_regions {
    use super::*;

    #[test]
    fn resolves_a_solid_fill_span() {
        let commands = stream(&[
            ("beginFill", vec![number(0xff0000ffu32 as f64), number(1.0)]),
            ("moveTo", vec![number(0.0), number(0.0)]),
            ("lineTo", vec![number(4.0), number(0.0)]),
            ("endFill", vec![]),
        ]);
        let regions = get_shape_fill_regions(&commands).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0xff0000ff);
    }
}

mod has_non_solid_shape_fill {
    use super::*;

    #[test]
    fn detects_gradient_fills() {
        let commands = stream(&[("beginGradientFill", vec![])]);
        assert!(has_non_solid_shape_fill(&commands));
        assert!(!has_non_solid_shape_fill(&stream(&[(
            "beginFill",
            vec![number(0.0), number(1.0)]
        )])));
    }
}

mod has_shape_fill {
    use super::*;

    #[test]
    fn detects_any_fill_kind() {
        assert!(has_shape_fill(&stream(&[(
            "beginFill",
            vec![number(0.0), number(1.0)]
        )])));
        assert!(!has_shape_fill(&stream(&[(
            "moveTo",
            vec![number(0.0), number(0.0)]
        )])));
    }
}
