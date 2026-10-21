use std::sync::Arc;

use flight_node::contract::*;

use crate::support::{create_test_node, create_test_node_2d};

fn nodes() -> (NodeRef, NodeRef, NodeRef, NodeRef) {
    return (
        create_test_node("Test"),
        create_test_node("Test"),
        create_test_node("Test"),
        create_test_node("Test"),
    );
}

fn children(source: &NodeRef) -> Vec<NodeRef> {
    return source
        .read()
        .unwrap()
        .node_runtime()
        .children
        .clone()
        .unwrap_or_default();
}

fn expect_children(source: &NodeRef, expected: &[&NodeRef]) {
    let actual = children(source);
    assert_eq!(actual.len(), expected.len());
    for (index, item) in expected.iter().enumerate() {
        assert!(Arc::ptr_eq(&actual[index], item), "child {index} differs");
    }
}

mod add_node_order_list_entry {
    use super::*;

    #[test]
    fn appends_entries_into_the_valid_window() {
        let (_, a, b, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 5.0);
        add_node_order_list_entry(&mut list, &b, 2.0);
        assert_eq!(list.entry_count, 2);
        assert!(Arc::ptr_eq(&list.nodes[0], &a));
        assert_eq!(list.sort_keys[0], 5.0);
        assert!(Arc::ptr_eq(&list.nodes[1], &b));
        assert_eq!(list.sort_keys[1], 2.0);
    }

    #[test]
    fn reuses_capacity_after_a_clear() {
        let (_, a, b, c) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        add_node_order_list_entry(&mut list, &b, 2.0);
        clear_node_order_list(&mut list);
        add_node_order_list_entry(&mut list, &c, 3.0);
        assert_eq!(list.entry_count, 1);
        assert_eq!(list.nodes.len(), 2);
        assert!(Arc::ptr_eq(&list.nodes[0], &c));
    }

    #[test]
    fn allows_a_node_to_be_entered_twice() {
        let (_, a, _, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        add_node_order_list_entry(&mut list, &a, 2.0);
        assert_eq!(list.entry_count, 2);
        assert_eq!(get_node_order_list_entry_sort_key(&list, &a), Some(2.0));
    }
}

mod apply_node_order_list {
    use super::*;

    #[test]
    fn permutes_members_into_ascending_sort_key_order() {
        let (container, a, b, c) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        add_node_child(&container, &c);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 30.0);
        add_node_order_list_entry(&mut list, &b, 20.0);
        add_node_order_list_entry(&mut list, &c, 10.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&c, &b, &a]);
    }

    #[test]
    fn never_moves_a_child_the_list_does_not_name() {
        let (container, a, b, foreign) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &foreign);
        add_node_child(&container, &b);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 20.0);
        add_node_order_list_entry(&mut list, &b, 10.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&b, &foreign, &a]);
    }

    #[test]
    fn ignores_entries_that_are_not_children_of_the_target() {
        let (container, a, b, stranger) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 30.0);
        add_node_order_list_entry(&mut list, &stranger, 20.0);
        add_node_order_list_entry(&mut list, &b, 10.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&b, &a]);
    }

    #[test]
    fn ignores_entries_attached_to_a_different_parent() {
        let (container, a, b, c) = nodes();
        let other = create_test_node("Test");
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        add_node_child(&other, &c);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 30.0);
        add_node_order_list_entry(&mut list, &c, 20.0);
        add_node_order_list_entry(&mut list, &b, 10.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&b, &a]);
        expect_children(&other, &[&c]);
    }

    #[test]
    fn is_a_no_op_once_every_member_has_been_removed() {
        let (container, a, b, _) = nodes();
        let foreign = create_test_node("Test");
        add_node_child(&container, &a);
        add_node_child(&container, &foreign);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 20.0);
        add_node_order_list_entry(&mut list, &b, 10.0);
        remove_node_child(&container, &a);
        let revision = get_node_children_revision(&*container.read().unwrap());
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&foreign]);
        assert_eq!(
            get_node_children_revision(&*container.read().unwrap()),
            revision
        );
    }

    #[test]
    fn breaks_equal_sort_keys_by_entry_order() {
        let (container, a, b, c) = nodes();
        add_node_child(&container, &c);
        add_node_child(&container, &b);
        add_node_child(&container, &a);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 7.0);
        add_node_order_list_entry(&mut list, &b, 7.0);
        add_node_order_list_entry(&mut list, &c, 7.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&a, &b, &c]);
    }

    #[test]
    fn resolves_a_node_entered_twice_to_its_last_entry() {
        let (container, a, b, _) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 30.0);
        add_node_order_list_entry(&mut list, &b, 20.0);
        add_node_order_list_entry(&mut list, &a, 10.0);
        apply_node_order_list(&container, &list);
        expect_children(&container, &[&a, &b]);
    }

    #[test]
    fn emits_the_order_changed_signal_once_when_children_move() {
        let (container, a, b, _) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        let signals = enable_node_signals(&container);
        let calls = Arc::new(std::sync::Mutex::new(0u32));
        let counter = calls.clone();
        {
            let signal = signals.read().unwrap().on_children_order_changed.clone();
            let slot: flight_signals::SignalSlot<()> =
                Arc::new(move |_| *counter.lock().unwrap() += 1);
            flight_signals::connect_signal(&signal, slot, None);
        }
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 20.0);
        add_node_order_list_entry(&mut list, &b, 10.0);
        apply_node_order_list(&container, &list);
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod clear_node_order_list {
    use super::*;

    #[test]
    fn empties_the_window_but_keeps_capacity_and_references() {
        let (_, a, _, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        clear_node_order_list(&mut list);
        assert_eq!(list.entry_count, 0);
        assert_eq!(list.nodes.len(), 1);
    }
}

mod create_node_order_list {
    use super::*;

    #[test]
    fn allocates_an_empty_list() {
        let list = create_node_order_list();
        assert_eq!(list.entry_count, 0);
        assert!(list.nodes.is_empty());
        assert!(list.sort_keys.is_empty());
    }
}

mod dispose_node_order_list {
    use super::*;

    #[test]
    fn empties_the_list_and_releases_its_node_references() {
        let (_, a, _, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        dispose_node_order_list(&mut list);
        assert_eq!(list.entry_count, 0);
        assert!(list.nodes.is_empty());
        assert!(list.sort_keys.is_empty());
    }
}

mod for_each_node_order_list_entry {
    use super::*;

    #[test]
    fn visits_entries_in_entry_order_and_stops_on_false() {
        let (_, a, b, c) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        add_node_order_list_entry(&mut list, &b, 2.0);
        add_node_order_list_entry(&mut list, &c, 3.0);
        let mut seen: Vec<usize> = Vec::new();
        for_each_node_order_list_entry(&list, &mut |_node, _key, index| {
            seen.push(index);
            return index < 1;
        });
        assert_eq!(seen, vec![0, 1]);
    }
}

mod get_node_order_list_entry_sort_key {
    use super::*;

    #[test]
    fn returns_none_when_the_node_has_no_entry() {
        let (_, a, _, _) = nodes();
        let list = create_node_order_list();
        assert_eq!(get_node_order_list_entry_sort_key(&list, &a), None);
    }
}

mod has_node_order_list_entry {
    use super::*;

    #[test]
    fn reports_membership() {
        let (_, a, b, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        assert!(has_node_order_list_entry(&list, &a));
        assert!(!has_node_order_list_entry(&list, &b));
    }
}

mod initialize_node_order_list {
    use super::*;

    #[test]
    fn resets_the_valid_window_and_arrays() {
        let (_, a, _, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        initialize_node_order_list(&mut list);
        assert_eq!(list.entry_count, 0);
        assert!(list.nodes.is_empty());
    }
}

#[test]
fn detached_member_list_apply_is_a_no_op() {
    let (container, a, _, _) = nodes();
    let list_node = create_test_node_2d("Test");
    let mut list = create_node_order_list();
    add_node_order_list_entry(&mut list, &a, 1.0);
    add_node_order_list_entry(&mut list, &list_node, 2.0);
    apply_node_order_list(&container, &list);
    assert!(children(&container).is_empty());
}

mod remove_node_order_list_entry {
    use super::*;

    #[test]
    fn shifts_later_entries_down_to_preserve_tie_order() {
        let (_, a, b, c) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        add_node_order_list_entry(&mut list, &b, 2.0);
        add_node_order_list_entry(&mut list, &c, 3.0);
        assert!(remove_node_order_list_entry(&mut list, &b));
        assert_eq!(list.entry_count, 2);
        assert!(Arc::ptr_eq(&list.nodes[1], &c));
        assert!(!remove_node_order_list_entry(&mut list, &b));
    }
}

mod set_node_order_list_entry {
    use super::*;

    #[test]
    fn creates_an_entry_or_rekeys_it_in_place() {
        let (_, a, b, _) = nodes();
        let mut list = create_node_order_list();
        set_node_order_list_entry(&mut list, &a, 1.0);
        set_node_order_list_entry(&mut list, &b, 2.0);
        set_node_order_list_entry(&mut list, &a, 9.0);
        assert_eq!(list.entry_count, 2);
        assert_eq!(get_node_order_list_entry_sort_key(&list, &a), Some(9.0));
    }
}

mod set_node_order_list_entry_above {
    use super::*;

    #[test]
    fn places_the_node_directly_after_the_target_at_the_same_key() {
        let (_, a, b, c) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 5.0);
        add_node_order_list_entry(&mut list, &c, 9.0);
        set_node_order_list_entry_above(&mut list, &b, &a);
        assert_eq!(list.entry_count, 3);
        assert!(Arc::ptr_eq(&list.nodes[0], &a));
        assert!(Arc::ptr_eq(&list.nodes[1], &b));
        assert_eq!(list.sort_keys[1], 5.0);
    }

    #[test]
    fn does_nothing_when_the_target_has_no_entry() {
        let (_, a, b, _) = nodes();
        let mut list = create_node_order_list();
        set_node_order_list_entry_above(&mut list, &b, &a);
        assert_eq!(list.entry_count, 0);
    }
}

mod set_node_order_list_entry_below {
    use super::*;

    #[test]
    fn places_the_node_directly_before_the_target_at_the_same_key() {
        let (_, a, b, c) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &c, 9.0);
        set_node_order_list_entry_below(&mut list, &b, &c);
        assert!(Arc::ptr_eq(&list.nodes[0], &b));
        assert!(Arc::ptr_eq(&list.nodes[1], &c));
        assert_eq!(list.sort_keys[0], 9.0);
        let _ = a;
    }
}

mod set_node_order_list_from_node_children {
    use super::*;

    #[test]
    fn refills_the_list_from_current_children_in_child_order() {
        let (container, a, b, c) = nodes();
        add_node_child(&container, &a);
        add_node_child(&container, &b);
        add_node_child(&container, &c);
        let mut list = create_node_order_list();
        set_node_order_list_from_node_children(&mut list, &container);
        assert_eq!(list.entry_count, 3);
        assert!(Arc::ptr_eq(&list.nodes[0], &a));
        assert_eq!(list.sort_keys[2], 2.0);
    }
}

mod swap_node_order_list_entries {
    use super::*;

    #[test]
    fn exchanges_keys_without_moving_entry_positions() {
        let (_, a, b, _) = nodes();
        let mut list = create_node_order_list();
        add_node_order_list_entry(&mut list, &a, 1.0);
        add_node_order_list_entry(&mut list, &b, 2.0);
        swap_node_order_list_entries(&mut list, &a, &b);
        assert_eq!(get_node_order_list_entry_sort_key(&list, &a), Some(2.0));
        assert_eq!(get_node_order_list_entry_sort_key(&list, &b), Some(1.0));
        assert!(Arc::ptr_eq(&list.nodes[0], &a));
    }
}
