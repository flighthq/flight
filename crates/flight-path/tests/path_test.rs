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

mod create_path_test {
    use super::*;

    #[test]
    fn returns_empty_path_with_given_winding() {
        let path = create_path(PathWinding::EvenOdd);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert_eq!(path.winding, PathWinding::EvenOdd);
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
