use flight_path::contract::*;

mod create_path_morph {
    use super::*;

    #[test]
    fn normalizes_different_line_and_quadratic_verbs_to_cubic() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 6.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 2.0, 2.0);
        append_path_quadratic_curve_to(&mut end, 5.0, 8.0, 8.0, 2.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(
            morph.commands,
            vec![PathCommand::MoveTo as u8, PathCommand::CubicCurveTo as u8]
        );
        assert_eq!(
            morph.start_data,
            vec![0.0, 0.0, 2.0, 0.0, 4.0, 0.0, 6.0, 0.0]
        );
        assert_eq!(morph.end_data, vec![2.0, 2.0, 4.0, 6.0, 6.0, 6.0, 8.0, 2.0]);
    }

    #[test]
    fn preserves_authored_cubic_control_points() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 9.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 1.0, 2.0);
        append_path_cubic_curve_to(&mut end, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(
            morph.end_data,
            vec![1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0]
        );
    }

    #[test]
    fn aligns_equivalent_closed_contours_from_different_starting_vertices() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, 0.0, 0.0, 10.0, 10.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 10.0, 0.0);
        append_path_line_to(&mut end, 10.0, 10.0);
        append_path_line_to(&mut end, 0.0, 10.0);
        append_path_line_to(&mut end, 0.0, 0.0);
        append_path_close(&mut end);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(morph.start_data, morph.end_data);
        assert_eq!(*morph.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn does_not_mutate_either_endpoint() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 10.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 5.0, 5.0);
        append_path_line_to(&mut end, 10.0, 0.0);
        let start_cmds = start.commands.clone();
        let start_data = start.data.clone();
        let end_cmds = end.commands.clone();
        let end_data = end.data.clone();
        create_path_morph(&start, &end);
        assert_eq!(start.commands, start_cmds);
        assert_eq!(start.data, start_data);
        assert_eq!(end.commands, end_cmds);
        assert_eq!(end.data, end_data);
    }

    #[test]
    fn returns_none_for_incompatible_topology() {
        let start = create_path(Some(PathWinding::NonZero));
        let end = create_path(Some(PathWinding::EvenOdd));
        assert!(create_path_morph(&start, &end).is_none());
    }

    #[test]
    fn returns_some_for_compatible_rectangles() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        assert!(create_path_morph(&start, &end).is_some());
    }

    #[test]
    fn returns_none_for_contour_count_mismatch() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        append_path_rectangle(&mut end, 200.0, 200.0, 50.0, 50.0);
        assert!(create_path_morph(&start, &end).is_none());
    }

    #[test]
    fn expands_closed_point_contour_without_inventing_orientation() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 3.0, 4.0);
        append_path_close(&mut start);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut end, 0.0, 0.0, 10.0, 10.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(morph.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*morph.commands.last().unwrap(), PathCommand::Close as u8);
        assert!(morph.start_data.iter().enumerate().all(|(i, &v)| {
            return if i % 2 == 0 { v == 3.0 } else { v == 4.0 };
        }));
    }

    #[test]
    fn expands_point_contour_into_degenerate_cubics() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 3.0, 4.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 10.0, 0.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(
            morph.start_data,
            vec![3.0, 4.0, 3.0, 4.0, 3.0, 4.0, 3.0, 4.0]
        );
    }

    #[test]
    fn normalizes_consistently_reversed_closed_endpoint() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, 0.0, 0.0, 10.0, 10.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 0.0, 10.0);
        append_path_line_to(&mut end, 10.0, 10.0);
        append_path_line_to(&mut end, 10.0, 0.0);
        append_path_close(&mut end);
        let morph = create_path_morph(&start, &end).unwrap();
        for i in 0..morph.start_data.len() {
            assert!((morph.start_data[i] - morph.end_data[i]).abs() < 0.005);
        }
    }

    #[test]
    fn normalizes_opposing_contours_independently_under_even_odd() {
        let mut start = create_path(Some(PathWinding::EvenOdd));
        append_path_rectangle(&mut start, 0.0, 0.0, 20.0, 20.0);
        append_path_rectangle(&mut start, 5.0, 5.0, 10.0, 10.0);
        let mut end = create_path(Some(PathWinding::EvenOdd));
        append_path_rectangle(&mut end, 0.0, 0.0, 20.0, 20.0);
        append_path_move_to(&mut end, 5.0, 5.0);
        append_path_line_to(&mut end, 5.0, 15.0);
        append_path_line_to(&mut end, 15.0, 15.0);
        append_path_line_to(&mut end, 15.0, 5.0);
        append_path_close(&mut end);
        let morph = create_path_morph(&start, &end).unwrap();
        for i in 0..morph.start_data.len() {
            assert!((morph.start_data[i] - morph.end_data[i]).abs() < 0.005);
        }
    }

    #[test]
    fn normalizes_wide_move_and_line_commands() {
        let mut start = create_path(Some(PathWinding::NonZero));
        start.commands.push(PathCommand::WideMoveTo as u8);
        start.data.extend_from_slice(&[99.0, 98.0, 1.0, 2.0]);
        start.commands.push(PathCommand::WideLineTo as u8);
        start.data.extend_from_slice(&[97.0, 96.0, 7.0, 8.0]);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 1.0, 2.0);
        append_path_line_to(&mut end, 7.0, 8.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(morph.start_data, morph.end_data);
        assert_eq!(
            morph.start_data,
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
        );
    }

    #[test]
    fn prepares_closed_rectangle_against_closed_circle() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, -10.0, -10.0, 20.0, 20.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_circle(&mut end, 0.0, 0.0, 10.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(morph.commands[0], PathCommand::MoveTo as u8);
        assert_eq!(*morph.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn subdivides_lower_segment_count_without_changing_endpoint_geometry() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 10.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 5.0, 0.0);
        append_path_line_to(&mut end, 10.0, 0.0);
        let morph = create_path_morph(&start, &end).unwrap();
        assert_eq!(
            morph.commands,
            vec![
                PathCommand::MoveTo as u8,
                PathCommand::CubicCurveTo as u8,
                PathCommand::CubicCurveTo as u8,
            ]
        );
        for i in 0..morph.start_data.len() {
            assert!((morph.start_data[i] - morph.end_data[i]).abs() < 0.005);
        }
        let last_two = &morph.start_data[morph.start_data.len() - 2..];
        assert_eq!(last_two, &[10.0, 0.0]);
    }
}

mod sample_path_morph {
    use super::*;

    #[test]
    fn samples_at_zero_and_one() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 2.0);
        append_path_line_to(&mut start, 6.0, 8.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 10.0, 12.0);
        append_path_quadratic_curve_to(&mut end, 14.0, 20.0, 18.0, 16.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 0.0);
        assert_eq!(out.data, morph.start_data);
        sample_path_morph(&mut out, &morph, 1.0);
        assert_eq!(out.data, morph.end_data);
    }

    #[test]
    fn copies_endpoint_coordinates_exactly() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, -255_815_156_688.713_68, 12.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 0.000_030_389_885_488_608_44, -24.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 0.0);
        assert_eq!(out.data, morph.start_data);
        sample_path_morph(&mut out, &morph, 1.0);
        assert_eq!(out.data, morph.end_data);
    }

    #[test]
    fn writes_midpoint_and_winding_into_existing_path() {
        let mut start = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 6.0, 0.0);
        let mut end = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut end, 2.0, 2.0);
        append_path_quadratic_curve_to(&mut end, 5.0, 8.0, 8.0, 2.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 0.5);
        assert_eq!(
            out.commands,
            vec![PathCommand::MoveTo as u8, PathCommand::CubicCurveTo as u8]
        );
        assert_eq!(out.data, vec![1.0, 1.0, 3.0, 3.0, 5.0, 3.0, 7.0, 1.0]);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn reuses_output_command_and_data_storage_across_samples() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 10.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 10.0, 10.0);
        append_path_line_to(&mut end, 20.0, 10.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));

        sample_path_morph(&mut out, &morph, 0.25);
        let commands_ptr = out.commands.as_ptr();
        let commands_capacity = out.commands.capacity();
        let data_ptr = out.data.as_ptr();
        let data_capacity = out.data.capacity();
        sample_path_morph(&mut out, &morph, 0.75);

        assert_eq!(out.commands.as_ptr(), commands_ptr);
        assert_eq!(out.commands.capacity(), commands_capacity);
        assert_eq!(out.data.as_ptr(), data_ptr);
        assert_eq!(out.data.capacity(), data_capacity);
    }

    #[test]
    fn permits_progress_outside_zero_to_one_for_easing_overshoot() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut start, 0.0, 0.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut end, 10.0, 20.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 1.5);
        assert_eq!(out.data, vec![15.0, 30.0]);
    }

    #[test]
    fn samples_empty_path_pair() {
        let start = create_path(Some(PathWinding::NonZero));
        let end = create_path(Some(PathWinding::NonZero));
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 0.5);
        assert!(out.commands.is_empty());
        assert!(out.data.is_empty());
    }

    #[test]
    fn interpolates_at_half() {
        let mut start = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut end, 100.0, 100.0, 100.0, 100.0);
        let morph = create_path_morph(&start, &end).unwrap();
        let mut out = create_path(Some(PathWinding::NonZero));
        sample_path_morph(&mut out, &morph, 0.5);
        for i in 0..out.data.len() {
            let expected = morph.start_data[i] + (morph.end_data[i] - morph.start_data[i]) * 0.5;
            assert!((out.data[i] - expected).abs() < 0.001);
        }
    }
}
