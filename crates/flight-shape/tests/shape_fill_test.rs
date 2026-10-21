use flight_path::{PathWinding, create_path};
use flight_shape::contract::*;

use crate::support::*;

mod append_shape_geometry_command {
    use super::*;

    #[test]
    fn appends_move_and_line_verbs() {
        let mut path = create_path(Some(PathWinding::NonZero));
        let commands = vec![number(3.0), number(4.0)];
        append_shape_geometry_command(&mut path, "moveTo", &commands, 0);
        assert_eq!(path.commands.len(), 1);
        assert_eq!(path.data, vec![3.0, 4.0]);
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
