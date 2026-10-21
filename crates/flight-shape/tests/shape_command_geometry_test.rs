use flight_shape::contract::*;

use crate::support::*;

mod geometry_source_parity {
    use super::*;

    #[test]
    fn writes_primitive_and_raw_path_endpoints_using_canonical_tuple_semantics() {
        let mut out = ShapeGeometryEnd { x: 0.0, y: 0.0 };
        assert!(write_shape_geometry_command_end(
            &mut out,
            0.0,
            0.0,
            "drawEllipse",
            &[number(50.0), number(25.0), number(40.0), number(10.0)],
            0
        ));
        assert_eq!((out.x, out.y), (90.0, 25.0));

        let (current_x, current_y) = (out.x, out.y);
        assert!(write_shape_geometry_command_end(
            &mut out,
            current_x,
            current_y,
            "drawRoundedRectangle",
            &[
                number(0.0),
                number(0.0),
                number(100.0),
                number(50.0),
                number(20.0)
            ],
            0
        ));
        assert_eq!((out.x, out.y), (20.0, 0.0));

        let (current_x, current_y) = (out.x, out.y);
        assert!(write_shape_geometry_command_end(
            &mut out,
            current_x,
            current_y,
            "drawPath",
            &[
                numbers(&[1.0, 2.0, 7.0]),
                numbers(&[10.0, 20.0, 30.0, 40.0]),
                string("nonZero")
            ],
            0
        ));
        assert_eq!((out.x, out.y), (10.0, 20.0));
    }

    #[test]
    fn returns_false_without_changing_the_output_for_a_non_geometry_command() {
        let mut out = ShapeGeometryEnd { x: 3.0, y: 4.0 };
        assert!(!write_shape_geometry_command_end(
            &mut out,
            0.0,
            0.0,
            "beginFill",
            &[number(0.0), number(1.0)],
            0
        ));
        assert_eq!((out.x, out.y), (3.0, 4.0));
    }
}

mod write_shape_geometry_command_end {
    use super::*;

    fn end(x: f64, y: f64) -> ShapeGeometryEnd {
        return ShapeGeometryEnd { x, y };
    }

    #[test]
    fn writes_the_destination_of_a_move() {
        let mut out = end(0.0, 0.0);
        let commands = vec![number(5.0), number(6.0)];
        assert!(write_shape_geometry_command_end(
            &mut out, 1.0, 2.0, "moveTo", &commands, 0
        ));
        assert_eq!((out.x, out.y), (5.0, 6.0));
    }

    #[test]
    fn keeps_the_current_point_for_an_unknown_command() {
        let mut out = end(1.0, 2.0);
        assert!(!write_shape_geometry_command_end(
            &mut out,
            1.0,
            2.0,
            "endFill",
            &[],
            0
        ));
        assert_eq!((out.x, out.y), (1.0, 2.0));
    }
}
