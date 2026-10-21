use flight_node::contract::Node;
use flight_shape::contract::*;

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

mod is_shape_empty {
    use super::*;

    #[test]
    fn is_true_before_any_command() {
        let shape = create_shape(None);
        let guard = shape.read().unwrap();
        assert!(is_shape_empty(&*guard));
    }
}
