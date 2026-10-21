use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_geometry::{acquire_matrix, clear_matrix_pool, release_matrix};
use flight_node::contract::*;
use flight_signals::Signal;

use crate::support::{create_test_node, create_test_node_2d};

struct Fixture {
    container: NodeRef,
    child_a: NodeRef,
    child_b: NodeRef,
    child_c: NodeRef,
}

fn fixture() -> Fixture {
    return Fixture {
        container: create_test_node("Node"),
        child_a: create_test_node("Node"),
        child_b: create_test_node("Node"),
        child_c: create_test_node("Node"),
    };
}

fn record_node_signal(
    signals: &Ref<NodeSignals>,
    pick: fn(&NodeSignals) -> Signal<NodeRef>,
) -> Arc<Mutex<Vec<NodeRef>>> {
    let seen: Arc<Mutex<Vec<NodeRef>>> = Arc::new(Mutex::new(Vec::new()));
    let recorded = seen.clone();
    let signal = {
        let guard = signals.read().unwrap();
        pick(&guard)
    };
    flight_signals::connect_signal(
        &signal,
        Arc::new(move |value: &NodeRef| recorded.lock().unwrap().push(value.clone())),
        None,
    );
    return seen;
}

fn record_unit_signal(
    signals: &Ref<NodeSignals>,
    pick: fn(&NodeSignals) -> Signal<()>,
) -> Arc<Mutex<u32>> {
    let seen: Arc<Mutex<u32>> = Arc::new(Mutex::new(0));
    let recorded = seen.clone();
    let signal = {
        let guard = signals.read().unwrap();
        pick(&guard)
    };
    flight_signals::connect_signal(
        &signal,
        Arc::new(move |_value: &()| *recorded.lock().unwrap() += 1),
        None,
    );
    return seen;
}

fn child_names(node: &NodeRef) -> Vec<String> {
    return get_node_children(node)
        .iter()
        .map(|child| {
            let guard = child.read().unwrap();
            return guard
                .node_fields()
                .name
                .clone()
                .unwrap_or_else(|| String::from("<unnamed>"));
        })
        .collect();
}

fn name_child(child: &NodeRef, name: &str) {
    child.write().unwrap().node_fields_mut().name = Some(String::from(name));
}

fn edit_transform(node: &NodeRef, apply: impl FnOnce(Transform2DMut<'_>)) {
    {
        let mut guard = node.write().unwrap();
        apply(
            guard
                .as_transform2d_node_mut()
                .expect("test node has a transform")
                .transform2d_mut(),
        );
    }
    invalidate_node_local_transform(node);
}

fn assert_world_close(actual: &flight_geometry::Matrix, expected: &flight_geometry::Matrix) {
    let close = |left: f32, right: f32| (left - right).abs() <= 1e-3;
    assert!(
        close(actual.a, expected.a)
            && close(actual.b, expected.b)
            && close(actual.c, expected.c)
            && close(actual.d, expected.d)
            && close(actual.tx, expected.tx)
            && close(actual.ty, expected.ty),
        "world matrix differs: {actual:?} vs {expected:?}"
    );
}

fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

mod add_node_child {
    use super::*;

    #[test]
    fn adds_a_child_to_the_end_of_the_list() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
    }

    #[test]
    #[should_panic(expected = "An object cannot be added as a child of itself")]
    fn throws_if_the_child_is_the_target() {
        let f = fixture();
        add_node_child(&f.container, &f.container);
    }

    #[test]
    #[should_panic(expected = "An ancestor cannot be added as a child of its descendant")]
    fn throws_rather_than_creating_a_cycle() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.child_a, &f.child_b);
        add_node_child(&f.child_b, &f.container);
    }

    #[test]
    #[should_panic(expected = "The specified parent object cannot add this child")]
    fn rejects_a_child_disallowed_by_the_parent_runtime() {
        let f = fixture();
        f.container
            .write()
            .unwrap()
            .node_runtime_mut()
            .can_add_child = Arc::new(|_target: &dyn Node, _child: &dyn Node| false);
        add_node_child(&f.container, &f.child_a);
    }

    #[test]
    fn a_child_never_has_more_than_one_parent() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_child(&f.container, &f.child_a);
        add_node_child(&other, &f.child_a);
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &other));
        assert_eq!(get_node_child_count(&f.container), 0);
        assert_eq!(get_node_child_count(&other), 1);
    }

    #[test]
    fn removes_the_child_from_its_previous_parent_before_adding() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_child(&other, &f.child_a);
        add_node_child(&f.container, &f.child_a);
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
        assert_eq!(get_node_child_count(&other), 0);
        assert_eq!(get_node_child_count(&f.container), 1);
    }

    #[test]
    fn emits_parent_changed_children_changed_and_child_added() {
        let f = fixture();
        let child_signals = enable_node_signals(&f.child_a);
        let parent_signals = enable_node_signals(&f.container);
        let parent_changed =
            record_unit_signal(&child_signals, |signals| signals.on_parent_changed.clone());
        let children_changed = record_unit_signal(&parent_signals, |signals| {
            signals.on_children_changed.clone()
        });
        let added = record_node_signal(&parent_signals, |signals| signals.on_child_added.clone());
        add_node_child(&f.container, &f.child_a);
        assert_eq!(*parent_changed.lock().unwrap(), 1);
        assert_eq!(*children_changed.lock().unwrap(), 1);
        assert!(node_eq(&added.lock().unwrap()[0], &f.child_a));
    }

    #[test]
    fn does_not_emit_child_added_when_reordering_within_the_same_parent() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.container, &f.child_b);
        let signals = enable_node_signals(&f.container);
        let added = record_node_signal(&signals, |signals| signals.on_child_added.clone());
        add_node_child_at(&f.container, &f.child_a, 1);
        assert!(added.lock().unwrap().is_empty());
    }
}

fn node_eq(left: &NodeRef, right: &NodeRef) -> bool {
    return Arc::ptr_eq(left, right);
}

mod add_node_child_at {
    use super::*;

    #[test]
    fn inserts_at_the_given_index_and_allows_the_end() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        add_node_child_at(&f.container, &f.child_b, 0);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_b
        ));
        add_node_child_at(&f.container, &f.child_c, 2);
        assert_eq!(get_node_child_count(&f.container), 3);
    }

    #[test]
    fn advances_structural_revisions_when_attaching() {
        let f = fixture();
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        let parent_before = get_node_parent_reference_revision(&*f.child_a.read().unwrap());
        add_node_child_at(&f.container, &f.child_a, 0);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
        assert_eq!(
            get_node_parent_reference_revision(&*f.child_a.read().unwrap()),
            parent_before + 1
        );
    }

    #[test]
    #[should_panic(expected = "The supplied index is out of bounds.")]
    fn throws_if_the_index_is_negative() {
        let f = fixture();
        add_node_child_at(&f.container, &f.child_a, -1);
    }

    #[test]
    #[should_panic(expected = "The supplied index is out of bounds.")]
    fn throws_if_the_index_is_out_of_bounds() {
        let f = fixture();
        add_node_child_at(&f.container, &f.child_a, 1);
    }

    #[test]
    fn reorders_a_child_and_advances_only_the_child_list_revision() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.container, &f.child_b);
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        let parent_before = get_node_parent_reference_revision(&*f.child_a.read().unwrap());
        add_node_child_at(&f.container, &f.child_a, 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 1).unwrap(),
            &f.child_a
        ));
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
        assert_eq!(
            get_node_parent_reference_revision(&*f.child_a.read().unwrap()),
            parent_before
        );
    }

    #[test]
    fn does_not_advance_revisions_for_an_unchanged_index() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        let parent_before = get_node_parent_reference_revision(&*f.child_a.read().unwrap());
        add_node_child_at(&f.container, &f.child_a, 0);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before
        );
        assert_eq!(
            get_node_parent_reference_revision(&*f.child_a.read().unwrap()),
            parent_before
        );
    }

    #[test]
    fn emits_parent_changed_children_changed_and_child_added() {
        let f = fixture();
        let child_signals = enable_node_signals(&f.child_a);
        let parent_signals = enable_node_signals(&f.container);
        let parent_changed =
            record_unit_signal(&child_signals, |signals| signals.on_parent_changed.clone());
        let children_changed = record_unit_signal(&parent_signals, |signals| {
            signals.on_children_changed.clone()
        });
        let added = record_node_signal(&parent_signals, |signals| signals.on_child_added.clone());
        add_node_child_at(&f.container, &f.child_a, 0);
        assert_eq!(*parent_changed.lock().unwrap(), 1);
        assert_eq!(*children_changed.lock().unwrap(), 1);
        assert!(node_eq(&added.lock().unwrap()[0], &f.child_a));
    }

    #[test]
    fn repairs_a_stale_parent_reference_whose_child_list_entry_is_absent() {
        let f = fixture();
        f.child_a.write().unwrap().node_runtime_mut().parent = Some(Arc::downgrade(&f.container));
        add_node_child_at(&f.container, &f.child_a, 0);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
    }
}

mod add_node_children {
    use super::*;

    #[test]
    fn adds_multiple_children_in_order_and_sets_each_parent() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        assert_eq!(get_node_child_count(&f.container), 2);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        assert!(node_eq(
            &get_node_child_at(&f.container, 1).unwrap(),
            &f.child_b
        ));
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
        assert!(node_eq(&get_node_parent(&f.child_b).unwrap(), &f.container));
    }

    #[test]
    fn is_a_no_op_with_no_children() {
        let f = fixture();
        add_node_children(&f.container, &[]);
        assert_eq!(get_node_child_count(&f.container), 0);
    }
}

mod contains_node_child {
    use super::*;

    #[test]
    fn is_true_for_direct_and_deep_descendants_and_false_otherwise() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.child_a, &f.child_b);
        assert!(contains_node_child(&f.container, &f.child_a));
        assert!(contains_node_child(&f.container, &f.child_b));
        assert!(!contains_node_child(&f.container, &other));
        assert!(contains_node_child(&f.container, &f.container));
    }
}

mod for_each_node_child {
    use super::*;

    #[test]
    fn visits_each_child_with_its_index_and_stops_early_on_false() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.container, &f.child_b);
        let mut visited: Vec<usize> = Vec::new();
        for_each_node_child(&f.container, &mut |_child: &NodeRef, index: usize| {
            visited.push(index);
            return true;
        });
        assert_eq!(visited, vec![0, 1]);
        let mut count = 0;
        for_each_node_child(&f.container, &mut |_child: &NodeRef, _index: usize| {
            count += 1;
            return false;
        });
        assert_eq!(count, 1);
    }

    #[test]
    fn does_not_call_the_callback_without_children() {
        let f = fixture();
        let mut called = false;
        for_each_node_child(&f.container, &mut |_child: &NodeRef, _index: usize| {
            called = true;
            return true;
        });
        assert!(!called);
    }
}

mod get_node_ancestors {
    use super::*;

    #[test]
    fn returns_ancestors_from_parent_toward_root() {
        let f = fixture();
        let grandchild = create_test_node("Node");
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.child_a, &grandchild);
        let ancestors = get_node_ancestors(&grandchild);
        assert_eq!(ancestors.len(), 2);
        assert!(node_eq(&ancestors[0], &f.child_a));
        assert!(node_eq(&ancestors[1], &f.container));
        assert!(get_node_ancestors(&f.container).is_empty());
    }
}

mod get_node_child_at {
    use super::*;

    #[test]
    fn returns_the_child_or_none_for_absent_children_and_indices() {
        let f = fixture();
        assert!(get_node_child_at(&f.container, 0).is_none());
        add_node_child(&f.container, &f.child_a);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        assert!(get_node_child_at(&f.container, 1).is_none());
    }
}

mod get_node_child_by_name {
    use super::*;

    #[test]
    fn returns_the_first_direct_child_with_the_name_and_does_not_search_descendants() {
        let f = fixture();
        assert!(get_node_child_by_name(&f.container, "a").is_none());
        name_child(&f.child_a, "a");
        name_child(&f.child_b, "a");
        let grandchild = create_test_node("Node");
        name_child(&grandchild, "deep");
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.container, &f.child_b);
        add_node_child(&f.child_a, &grandchild);
        assert!(node_eq(
            &get_node_child_by_name(&f.container, "a").unwrap(),
            &f.child_a
        ));
        assert!(get_node_child_by_name(&f.container, "deep").is_none());
    }
}

mod get_node_child_count {
    use super::*;

    #[test]
    fn returns_zero_without_children_and_the_length_otherwise() {
        let f = fixture();
        assert_eq!(get_node_child_count(&f.container), 0);
        add_node_children(
            &f.container,
            &[f.child_a.clone(), f.child_b.clone(), f.child_c.clone()],
        );
        assert_eq!(get_node_child_count(&f.container), 3);
    }
}

mod get_node_child_index {
    use super::*;

    #[test]
    fn returns_minus_one_for_non_children_and_the_index_for_children() {
        let f = fixture();
        assert_eq!(get_node_child_index(&f.container, &f.child_a), -1);
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.container, &f.child_b);
        assert_eq!(get_node_child_index(&f.container, &f.child_b), 1);
        let grandchild = create_test_node("Node");
        add_node_child(&f.child_a, &grandchild);
        assert_eq!(get_node_child_index(&f.container, &grandchild), -1);
    }
}

mod get_node_common_ancestor {
    use super::*;

    #[test]
    fn returns_the_lowest_common_ancestor_or_none() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        assert!(node_eq(
            &get_node_common_ancestor(&f.child_a, &f.child_b).unwrap(),
            &f.container
        ));
        assert!(get_node_common_ancestor(&f.child_a, &other).is_none());
        assert!(node_eq(
            &get_node_common_ancestor(&f.container, &f.child_a).unwrap(),
            &f.container
        ));
        assert!(node_eq(
            &get_node_common_ancestor(&f.child_a, &f.child_a).unwrap(),
            &f.child_a
        ));
    }
}

mod get_node_parent {
    use super::*;

    #[test]
    fn returns_the_runtime_parent_reference() {
        let f = fixture();
        assert!(get_node_parent(&f.child_a).is_none());
        add_node_child(&f.container, &f.child_a);
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
    }
}

mod get_node_root {
    use super::*;

    #[test]
    fn returns_the_topmost_ancestor_or_the_node_itself() {
        let f = fixture();
        assert!(node_eq(&get_node_root(&f.container), &f.container));
        add_node_child(&f.container, &f.child_a);
        add_node_child(&f.child_a, &f.child_b);
        assert!(node_eq(&get_node_root(&f.child_b), &f.container));
    }
}

mod is_node_ancestor_of {
    use super::*;

    #[test]
    fn is_true_for_ancestors_and_self_and_false_otherwise() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_child(&f.container, &f.child_a);
        assert!(is_node_ancestor_of(&f.container, &f.child_a));
        assert!(is_node_ancestor_of(&f.container, &f.container));
        assert!(!is_node_ancestor_of(&f.child_a, &f.container));
        assert!(!is_node_ancestor_of(&f.container, &other));
    }
}

mod remove_node_child {
    use super::*;

    #[test]
    fn removes_the_child_clears_its_parent_and_advances_revisions() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        let parent_before = get_node_parent_reference_revision(&*f.child_a.read().unwrap());
        remove_node_child(&f.container, &f.child_a);
        assert_eq!(get_node_child_count(&f.container), 0);
        assert!(get_node_parent(&f.child_a).is_none());
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
        assert_eq!(
            get_node_parent_reference_revision(&*f.child_a.read().unwrap()),
            parent_before + 1
        );
    }

    #[test]
    fn does_nothing_when_the_child_belongs_to_another_parent() {
        let f = fixture();
        let other = create_test_node("Node");
        add_node_child(&f.container, &f.child_a);
        remove_node_child(&other, &f.child_a);
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(node_eq(&get_node_parent(&f.child_a).unwrap(), &f.container));
    }

    #[test]
    fn clears_a_stale_parent_reference_when_the_child_list_entry_is_absent() {
        let f = fixture();
        f.container.write().unwrap().node_runtime_mut().children = Some(Vec::new());
        f.child_a.write().unwrap().node_runtime_mut().parent = Some(Arc::downgrade(&f.container));
        remove_node_child(&f.container, &f.child_a);
        assert!(get_node_parent(&f.child_a).is_none());
        assert_eq!(get_node_child_count(&f.container), 0);
    }

    #[test]
    fn emits_parent_changed_children_changed_and_child_removed() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        let child_signals = enable_node_signals(&f.child_a);
        let parent_signals = enable_node_signals(&f.container);
        let parent_changed =
            record_unit_signal(&child_signals, |signals| signals.on_parent_changed.clone());
        let children_changed = record_unit_signal(&parent_signals, |signals| {
            signals.on_children_changed.clone()
        });
        let removed =
            record_node_signal(&parent_signals, |signals| signals.on_child_removed.clone());
        remove_node_child(&f.container, &f.child_a);
        assert_eq!(*parent_changed.lock().unwrap(), 1);
        assert_eq!(*children_changed.lock().unwrap(), 1);
        assert!(node_eq(&removed.lock().unwrap()[0], &f.child_a));
    }
}

mod remove_node_child_at {
    use super::*;

    #[test]
    fn removes_and_returns_the_child_at_the_index_or_none() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        assert!(node_eq(
            &remove_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(remove_node_child_at(&f.container, 5).is_none());
    }

    #[test]
    fn emits_parent_changed_and_children_changed() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let child_signals = enable_node_signals(&f.child_a);
        let parent_signals = enable_node_signals(&f.container);
        let parent_changed =
            record_unit_signal(&child_signals, |signals| signals.on_parent_changed.clone());
        let children_changed = record_unit_signal(&parent_signals, |signals| {
            signals.on_children_changed.clone()
        });
        remove_node_child_at(&f.container, 0);
        assert_eq!(*parent_changed.lock().unwrap(), 1);
        assert_eq!(*children_changed.lock().unwrap(), 1);
    }
}

mod remove_node_children {
    use super::*;

    #[test]
    fn removes_all_children_by_default_and_a_range_when_given() {
        let f = fixture();
        remove_node_children(&f.container, None, None);
        add_node_children(
            &f.container,
            &[f.child_a.clone(), f.child_b.clone(), f.child_c.clone()],
        );
        remove_node_children(&f.container, Some(1), None);
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        remove_node_children(&f.container, None, None);
        assert_eq!(get_node_child_count(&f.container), 0);
    }

    #[test]
    fn does_nothing_when_the_begin_index_is_out_of_range() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        remove_node_children(&f.container, Some(5), None);
        assert_eq!(get_node_child_count(&f.container), 1);
    }

    #[test]
    fn emits_parent_changed_and_children_changed() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        let child_signals = enable_node_signals(&f.child_a);
        let parent_signals = enable_node_signals(&f.container);
        let parent_changed =
            record_unit_signal(&child_signals, |signals| signals.on_parent_changed.clone());
        let children_changed = record_unit_signal(&parent_signals, |signals| {
            signals.on_children_changed.clone()
        });
        remove_node_children(&f.container, None, None);
        assert_eq!(*parent_changed.lock().unwrap(), 1);
        assert_eq!(*children_changed.lock().unwrap(), 1);
    }

    #[test]
    #[should_panic(expected = "The supplied index is out of bounds.")]
    fn throws_if_the_indices_are_invalid() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        remove_node_children(&f.container, Some(1), Some(0));
    }
}

mod reparent_node {
    use super::*;

    #[test]
    fn declines_whole_when_the_new_parent_has_no_invertible_world_matrix() {
        let parent_a = create_test_node_2d("TransformTest");
        let child = create_test_node_2d("TransformTest");
        {
            let mut guard = child.write().unwrap();
            *guard.as_transform2d_node_mut().unwrap().transform2d_mut().x = 20.0;
            *guard.as_transform2d_node_mut().unwrap().transform2d_mut().y = 10.0;
        }
        invalidate_node_local_transform(&child);
        add_node_child(&parent_a, &child);
        let collapsed = create_test_node_2d("TransformTest");
        *collapsed
            .write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .scale_x = 0.0;
        invalidate_node_local_transform(&collapsed);
        clear_matrix_pool();
        assert!(!reparent_node(&child, &collapsed, &mut revisions(), None));
        let local_scratch = acquire_matrix();
        let old_world_scratch = acquire_matrix();
        assert_eq!(
            (
                local_scratch.a,
                local_scratch.b,
                local_scratch.c,
                local_scratch.d,
            ),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!((old_world_scratch.tx, old_world_scratch.ty), (20.0, 10.0));
        release_matrix(old_world_scratch);
        release_matrix(local_scratch);
        assert!(node_eq(&get_node_parent(&child).unwrap(), &parent_a));
        assert_eq!(get_node_child_count(&collapsed), 0);
        let guard = child.read().unwrap();
        let transform = guard.as_transform2d_node().unwrap().transform2d();
        assert_eq!(*transform.x, 20.0);
        assert_eq!(*transform.y, 10.0);
    }

    #[test]
    fn preserves_world_position_after_reparenting_a_rotated_parent() {
        let parent_a = create_test_node_2d("TransformTest");
        edit_transform(&parent_a, |transform| {
            *transform.x = 100.0;
            *transform.y = 50.0;
            *transform.rotation = 30.0;
        });
        let child = create_test_node_2d("TransformTest");
        edit_transform(&child, |transform| {
            *transform.x = 20.0;
            *transform.y = 10.0;
        });
        add_node_child(&parent_a, &child);
        let before = get_node_world_matrix(&child, &mut revisions());
        let parent_b = create_test_node_2d("TransformTest");
        edit_transform(&parent_b, |transform| {
            *transform.x = 200.0;
            *transform.y = 100.0;
        });
        assert!(reparent_node(&child, &parent_b, &mut revisions(), None));
        let after = get_node_world_matrix(&child, &mut revisions());
        assert_world_close(&after, &before);
    }

    #[test]
    fn preserves_world_position_across_scaled_pivot_reflected_and_identity_parents() {
        let parent_a = create_test_node_2d("TransformTest");
        edit_transform(&parent_a, |transform| {
            *transform.scale_x = 2.0;
            *transform.scale_y = 2.0;
        });
        let child = create_test_node_2d("TransformTest");
        edit_transform(&child, |transform| {
            *transform.x = 10.0;
            *transform.y = 10.0;
            *transform.pivot_x = 5.0;
            *transform.pivot_y = 5.0;
        });
        add_node_child(&parent_a, &child);
        let before = get_node_world_matrix(&child, &mut revisions());
        let identity_parent = create_test_node_2d("TransformTest");
        assert!(reparent_node(
            &child,
            &identity_parent,
            &mut revisions(),
            None
        ));
        let after = get_node_world_matrix(&child, &mut revisions());
        assert_world_close(&after, &before);
    }

    #[test]
    fn preserves_world_position_when_reparenting_a_root_and_with_reflected_scale() {
        let child = create_test_node_2d("TransformTest");
        edit_transform(&child, |transform| {
            *transform.x = 80.0;
            *transform.y = 40.0;
            *transform.rotation = 60.0;
            *transform.scale_x = 1.5;
        });
        let before = get_node_world_matrix(&child, &mut revisions());
        let parent_b = create_test_node_2d("TransformTest");
        edit_transform(&parent_b, |transform| {
            *transform.x = 50.0;
            *transform.y = 25.0;
            *transform.rotation = 10.0;
        });
        assert!(reparent_node(&child, &parent_b, &mut revisions(), None));
        let after = get_node_world_matrix(&child, &mut revisions());
        assert_world_close(&after, &before);
        let reflected_parent = create_test_node_2d("TransformTest");
        edit_transform(&reflected_parent, |transform| *transform.scale_x = -1.0);
        let reflected_child = create_test_node_2d("TransformTest");
        edit_transform(&reflected_child, |transform| {
            *transform.x = 30.0;
            *transform.y = 20.0;
        });
        add_node_child(&reflected_parent, &reflected_child);
        let reflected_before = get_node_world_matrix(&reflected_child, &mut revisions());
        let target = create_test_node_2d("TransformTest");
        edit_transform(&target, |transform| *transform.x = 100.0);
        assert!(reparent_node(
            &reflected_child,
            &target,
            &mut revisions(),
            None
        ));
        let reflected_after = get_node_world_matrix(&reflected_child, &mut revisions());
        assert_world_close(&reflected_after, &reflected_before);
    }

    #[test]
    fn preserves_world_position_for_an_invertible_parent() {
        let parent_a = create_test_node_2d("TransformTest");
        let child = create_test_node_2d("TransformTest");
        *child
            .write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .x = 20.0;
        invalidate_node_local_transform(&child);
        add_node_child(&parent_a, &child);
        let before = get_node_world_matrix(&child, &mut revisions());
        let parent_b = create_test_node_2d("TransformTest");
        *parent_b
            .write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .x = 200.0;
        invalidate_node_local_transform(&parent_b);
        clear_matrix_pool();
        assert!(reparent_node(&child, &parent_b, &mut revisions(), None));
        let local_scratch = acquire_matrix();
        let old_world_scratch = acquire_matrix();
        assert_eq!((local_scratch.tx, local_scratch.ty), (-180.0, 0.0));
        assert_eq!((old_world_scratch.tx, old_world_scratch.ty), (20.0, 0.0));
        release_matrix(old_world_scratch);
        release_matrix(local_scratch);
        assert!(node_eq(&get_node_parent(&child).unwrap(), &parent_b));
        let after = get_node_world_matrix(&child, &mut revisions());
        assert!((after.tx - before.tx).abs() < 1e-3);
        assert!((after.ty - before.ty).abs() < 1e-3);
    }
}

mod replace_node_child {
    use super::*;

    #[test]
    fn replaces_at_the_same_index_sets_the_new_parent_and_is_a_no_op_when_absent() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        replace_node_child(&f.container, &f.child_a, &f.child_c);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_c
        ));
        assert!(node_eq(&get_node_parent(&f.child_c).unwrap(), &f.container));
        let other = create_test_node("Node");
        replace_node_child(&f.container, &other, &f.child_a);
        assert_eq!(get_node_child_count(&f.container), 2);
    }
}

mod set_node_child_index {
    use super::*;

    #[test]
    fn moves_an_existing_child_and_advances_only_the_order_revision() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        set_node_child_index(&f.container, &f.child_a, 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 1).unwrap(),
            &f.child_a
        ));
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
        set_node_child_index(&f.container, &f.child_a, 1);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
    }

    #[test]
    fn ignores_a_stale_parent_reference_whose_child_list_entry_is_absent() {
        let f = fixture();
        add_node_child(&f.container, &f.child_b);
        f.child_a.write().unwrap().node_runtime_mut().parent = Some(Arc::downgrade(&f.container));
        set_node_child_index(&f.container, &f.child_a, 0);
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_b
        ));
    }

    #[test]
    fn emits_children_order_changed() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let signals = enable_node_signals(&f.container);
        let calls = record_unit_signal(&signals, |signals| {
            signals.on_children_order_changed.clone()
        });
        set_node_child_index(&f.container, &f.child_a, 1);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn ignores_non_children_and_out_of_range_indices() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        set_node_child_index(&f.container, &f.child_b, 0);
        set_node_child_index(&f.container, &f.child_a, 9);
        assert_eq!(get_node_child_count(&f.container), 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
    }
}

mod set_reparent_node_guard {
    use super::*;

    #[test]
    fn is_notified_on_the_decline_and_never_on_success() {
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let recorded = seen.clone();
        let mut guards = NodeGuardState {
            enabled: false,
            reparent_node_guard: Some(Arc::new(move |_child: &dyn Node, new_parent: &dyn Node| {
                recorded.lock().unwrap().push(
                    new_parent
                        .node_fields()
                        .name
                        .clone()
                        .unwrap_or_else(|| String::from("<unnamed>")),
                );
            })),
        };
        let child = create_test_node_2d("TransformTest");
        let collapsed = create_test_node_2d("TransformTest");
        name_child(&collapsed, "collapsed");
        *collapsed
            .write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .scale_x = 0.0;
        invalidate_node_local_transform(&collapsed);
        let healthy = create_test_node_2d("TransformTest");
        name_child(&healthy, "healthy");
        reparent_node(&child, &collapsed, &mut revisions(), Some(&guards));
        reparent_node(&child, &healthy, &mut revisions(), Some(&guards));
        assert_eq!(*seen.lock().unwrap(), vec![String::from("collapsed")]);
        set_reparent_node_guard(&mut guards, None);
        assert!(guards.reparent_node_guard.is_none());
    }
}

mod swap_node_children {
    use super::*;

    #[test]
    fn swaps_two_children_and_does_not_advance_for_the_same_child() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let children_before = get_node_children_revision(&*f.container.read().unwrap());
        swap_node_children(&f.container, &f.child_a, &f.child_a);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before
        );
        swap_node_children(&f.container, &f.child_a, &f.child_b);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_b
        ));
        assert!(node_eq(
            &get_node_child_at(&f.container, 1).unwrap(),
            &f.child_a
        ));
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            children_before + 1
        );
    }

    #[test]
    fn emits_children_order_changed() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let signals = enable_node_signals(&f.container);
        let calls = record_unit_signal(&signals, |signals| {
            signals.on_children_order_changed.clone()
        });
        swap_node_children(&f.container, &f.child_a, &f.child_b);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn does_nothing_when_either_child_is_not_in_the_container() {
        let f = fixture();
        add_node_child(&f.container, &f.child_a);
        swap_node_children(&f.container, &f.child_a, &f.child_b);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
    }
}

mod swap_node_children_at {
    use super::*;

    #[test]
    fn swaps_by_index_and_rejects_invalid_indices() {
        let f = fixture();
        swap_node_children_at(&f.container, 0, 1);
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        swap_node_children_at(&f.container, 0, 0);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_a
        ));
        swap_node_children_at(&f.container, 0, 1);
        assert!(node_eq(
            &get_node_child_at(&f.container, 0).unwrap(),
            &f.child_b
        ));
    }

    #[test]
    fn does_not_advance_the_revision_for_equal_indices_and_emits_when_swapped() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        let before = get_node_children_revision(&*f.container.read().unwrap());
        swap_node_children_at(&f.container, 0, 0);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            before
        );
        let signals = enable_node_signals(&f.container);
        let calls = record_unit_signal(&signals, |signals| {
            signals.on_children_order_changed.clone()
        });
        swap_node_children_at(&f.container, 0, 1);
        assert_eq!(*calls.lock().unwrap(), 1);
        assert_eq!(
            get_node_children_revision(&*f.container.read().unwrap()),
            before + 1
        );
    }

    #[test]
    #[should_panic(expected = "The supplied index is out of bounds.")]
    fn throws_for_an_invalid_index() {
        let f = fixture();
        add_node_children(&f.container, &[f.child_a.clone(), f.child_b.clone()]);
        swap_node_children_at(&f.container, 0, 5);
    }
}
