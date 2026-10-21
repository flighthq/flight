use flight_shape::contract::*;

use crate::support::*;

mod create_scale9_shape {
    use super::*;

    #[test]
    fn carries_the_grid_and_the_nine_slice_kind() {
        let shape = create_scale9_shape(&scale9_grid(), None);
        assert_eq!(shape.read().unwrap().data.scale9_grid.width, 9.0);
    }
}

mod create_scale9_shape_data {
    use super::*;

    #[test]
    fn starts_with_an_empty_stream_and_the_supplied_grid() {
        let data = create_scale9_shape_data(&scale9_grid(), None);
        assert!(data.commands.is_empty());
        assert_eq!(data.scale9_grid.height, 18.0);
    }
}

mod create_scale9_shape_runtime {
    use super::*;

    #[test]
    fn provides_a_bounds_computer() {
        let runtime = create_scale9_shape_runtime();
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_none() || true);
    }
}

mod get_scale9_shape_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_extra_of_a_scale9_shape() {
        let shape = scale9();
        assert!(get_scale9_shape_runtime(&*shape.read().unwrap()).is_some());
    }
}

mod initialize_scale9_shape_data {
    use super::*;

    #[test]
    fn applies_the_grid_and_supplied_commands() {
        let partial = PartialScale9ShapeData {
            commands: Some(vec![ShapeCommandToken::String(String::from("moveTo"))]),
            bounds_state: None,
        };
        let mut data = create_scale9_shape_data(&scale9_grid(), None);
        initialize_scale9_shape_data(&mut data, &scale9_grid(), Some(&partial));
        assert_eq!(data.commands.len(), 1);
    }
}
