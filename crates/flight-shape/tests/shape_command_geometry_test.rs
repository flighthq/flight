use flight_shape::contract::*;

use crate::support::*;

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
