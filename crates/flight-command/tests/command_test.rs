use flight_command::contract::*;
use flight_entity::allocate_entity;
use flight_node::contract::{add_node_child, get_node_child_index};

use crate::support::*;

mod create_add_node_child_command {
    use super::*;

    #[test]
    fn carries_its_kind_and_appends_by_default() {
        let parent = node();
        let child = node();
        let command = create_add_node_child_command("Add sprite", &parent, &child, None);
        let borrowed = command.read().unwrap();
        assert_eq!(borrowed.kind, ADD_NODE_CHILD_COMMAND_KIND);
        assert_eq!(borrowed.label, "Add sprite");
        assert_eq!(borrowed.index, -1);
        assert!(std::sync::Arc::ptr_eq(&borrowed.parent, &parent));
        assert!(std::sync::Arc::ptr_eq(&borrowed.child, &child));
    }

    #[test]
    fn records_an_explicit_insertion_index() {
        assert_eq!(
            create_add_node_child_command("Add", &node(), &node(), Some(3))
                .read()
                .unwrap()
                .index,
            3
        );
    }
}

mod create_composite_command {
    use super::*;

    #[test]
    fn copies_the_child_list_so_a_later_push_cannot_rewrite_the_entry() {
        let mut children: Vec<CommandRef> = vec![erased(create_add_node_child_command(
            "Add",
            &node(),
            &node(),
            None,
        ))];
        let command = create_composite_command("Align", &children);
        children.push(erased(create_add_node_child_command(
            "Add again",
            &node(),
            &node(),
            None,
        )));
        let borrowed = command.read().unwrap();
        assert_eq!(borrowed.kind, COMPOSITE_COMMAND_KIND);
        assert_eq!(borrowed.children.len(), 1);
    }
}

mod create_remove_node_child_command {
    use super::*;

    #[test]
    fn captures_the_index_the_child_currently_occupies() {
        let parent = node();
        let first = node();
        let second = node();
        add_node_child(&parent, &first);
        add_node_child(&parent, &second);
        let command = create_remove_node_child_command("Delete", &parent, &second);
        let borrowed = command.read().unwrap();
        assert_eq!(borrowed.kind, REMOVE_NODE_CHILD_COMMAND_KIND);
        assert_eq!(borrowed.index, 1);
    }
}

mod create_reorder_node_child_command {
    use super::*;

    #[test]
    fn captures_where_the_child_started_as_well_as_where_it_is_going() {
        let parent = node();
        let first = node();
        let second = node();
        add_node_child(&parent, &first);
        add_node_child(&parent, &second);
        let command = create_reorder_node_child_command("Move to front", &parent, &second, 0);
        let borrowed = command.read().unwrap();
        assert_eq!(borrowed.kind, REORDER_NODE_CHILD_COMMAND_KIND);
        assert_eq!(borrowed.from_index, 1);
        assert_eq!(borrowed.to_index, 0);
        drop(borrowed);
        assert_eq!(get_node_child_index(&parent, &second), 1);
    }
}

mod initialize_add_node_child_command {
    use super::*;

    #[test]
    fn matches_the_factory() {
        let parent = node();
        let child = node();
        let factory = create_add_node_child_command("Add", &parent, &child, Some(2));
        let mut direct: AddNodeChildCommand = allocate_entity();
        initialize_add_node_child_command(&mut direct, "Add", &parent, &child, 2);
        assert_eq!(factory.read().unwrap().index, direct.index);
        assert_eq!(factory.read().unwrap().kind, direct.kind);
    }
}

mod initialize_command_fields {
    use super::*;

    #[test]
    fn initializes_the_shared_fields_of_a_custom_kind() {
        let mut fields: CommandFields = allocate_entity();
        initialize_command_fields(&mut fields, "acme.Custom", "Do it");
        assert_eq!(fields.kind, "acme.Custom");
        assert_eq!(fields.label, "Do it");
    }
}

mod initialize_composite_command {
    use super::*;

    #[test]
    fn matches_the_factory() {
        let children: Vec<CommandRef> = vec![erased(create_add_node_child_command(
            "Add",
            &node(),
            &node(),
            None,
        ))];
        let factory = create_composite_command("Group", &children);
        let mut direct: CompositeCommand = allocate_entity();
        initialize_composite_command(&mut direct, "Group", &children);
        assert_eq!(
            factory.read().unwrap().children.len(),
            direct.children.len()
        );
        assert_eq!(factory.read().unwrap().label, direct.label);
    }
}

mod initialize_remove_node_child_command {
    use super::*;

    #[test]
    fn matches_the_factory() {
        let parent = node();
        let child = node();
        add_node_child(&parent, &child);
        let factory = create_remove_node_child_command("Delete", &parent, &child);
        let mut direct: RemoveNodeChildCommand = allocate_entity();
        initialize_remove_node_child_command(&mut direct, "Delete", &parent, &child);
        assert_eq!(factory.read().unwrap().index, direct.index);
    }
}

mod initialize_reorder_node_child_command {
    use super::*;

    #[test]
    fn matches_the_factory() {
        let parent = node();
        let child = node();
        add_node_child(&parent, &child);
        let factory = create_reorder_node_child_command("Move", &parent, &child, 0);
        let mut direct: ReorderNodeChildCommand = allocate_entity();
        initialize_reorder_node_child_command(&mut direct, "Move", &parent, &child, 0);
        assert_eq!(factory.read().unwrap().from_index, direct.from_index);
    }
}

mod initialize_set_node_property_command {
    use super::*;

    #[test]
    fn records_supplied_entries() {
        let target = node();
        let entries = vec![CommandPropertyEntry {
            after: Some(std::sync::Arc::new(100i32)),
            before: Some(std::sync::Arc::new(5i32)),
            property: String::from("x"),
            target: target.clone(),
        }];
        let mut out: SetNodePropertyCommand = allocate_entity();
        initialize_set_node_property_command(
            &mut out,
            &entries,
            SET_NODE_PROPERTY_COMMAND_KIND,
            "Move",
            300.0,
            10.0,
        );
        assert_eq!(out.entries.len(), 1);
        assert_eq!(out.kind, SET_NODE_PROPERTY_COMMAND_KIND);
        assert_eq!(out.merge_window, 300.0);
        assert_eq!(out.time, 10.0);
        assert!(std::sync::Arc::ptr_eq(&out.entries[0].target, &target));
    }
}
