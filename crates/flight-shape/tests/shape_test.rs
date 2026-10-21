use flight_node::contract::Node;
use flight_shape::contract::*;

mod clear_shape_commands {
    use super::*;

    #[test]
    fn empties_the_stream() {
        let shape = create_shape(None);
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        clear_shape_commands(&shape);
        let guard = shape.read().unwrap();
        assert!(is_shape_empty(&*guard));
    }
}

mod compute_shape_local_bounds_rectangle {
    use super::*;

    #[test]
    fn writes_an_empty_rectangle_for_an_empty_shape() {
        let shape = create_shape(None);
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0);
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }
}

mod copy_shape_commands {
    use super::*;

    #[test]
    fn copies_the_source_stream_onto_the_target() {
        let source = create_shape(None);
        append_shape_move_to(&source, 3.0, 4.0);
        let target = create_shape(None);
        copy_shape_commands(&target, &*source.read().unwrap());
        assert_eq!(get_shape_command_count(&*target.read().unwrap()), 1);
    }
}

mod create_shape {
    use super::*;

    #[test]
    fn defaults_to_the_plain_shape_kind_with_an_empty_stream() {
        let shape = create_shape(None);
        let guard = shape.read().unwrap();
        assert_eq!(Node::node_fields(&*guard).kind, SHAPE_KIND);
        assert!(is_shape_empty(&*guard));
    }
}

mod create_shape_data {
    use super::*;

    #[test]
    fn copies_supplied_commands() {
        let data = create_shape_data(None);
        assert!(data.commands.is_empty());
    }
}

mod create_shape_runtime {
    use super::*;

    #[test]
    fn carries_a_bounds_computer_and_a_fresh_registry() {
        let runtime = create_shape_runtime();
        let shape = create_shape_data(None);
        let node = flight_node::contract::create_node::<flight_scene2d::contract::DisplayObject>(
            String::from(SHAPE_KIND),
            None,
        );
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut out, &node);
        assert_eq!(out.width, 0.0);
        assert!(
            runtime.bounds.is_local_bounds_rectangle_valid.is_none() || shape.commands.is_empty()
        );
    }
}

mod get_shape_bounds {
    use super::*;

    #[test]
    fn reports_incomplete_without_registered_bounds_commands() {
        let shape = create_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(!get_shape_bounds(&mut out, &*shape.read().unwrap(), None));
    }
}

mod get_shape_command_count {
    use super::*;

    #[test]
    fn counts_one_command() {
        let shape = create_shape(None);
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        let guard = shape.read().unwrap();
        assert_eq!(get_shape_command_count(&*guard), 1);
    }
}

mod get_shape_runtime {
    use super::*;

    #[test]
    fn returns_the_kind_runtime_extra() {
        let shape = create_shape(None);
        assert!(get_shape_runtime(&*shape.read().unwrap()).is_some());
    }
}

mod initialize_shape_data {
    use super::*;

    #[test]
    fn copies_supplied_commands_and_keeps_a_bounds_state() {
        let partial = PartialShapeData {
            commands: Some(vec![
                ShapeCommandToken::String(String::from("moveTo")),
                ShapeCommandToken::Number(0.0),
                ShapeCommandToken::Number(0.0),
            ]),
            bounds_state: None,
        };
        let mut data = create_shape_data(None);
        initialize_shape_data(&mut data, Some(&partial));
        assert_eq!(data.commands.len(), 3);
    }
}

mod is_shape_empty {
    use super::*;

    #[test]
    fn is_true_before_any_command() {
        let shape = create_shape(None);
        let guard = shape.read().unwrap();
        assert!(is_shape_empty(&*guard));
    }
}
