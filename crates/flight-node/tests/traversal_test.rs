use std::sync::Arc;

use flight_node::contract::*;

use crate::support::create_test_node;

struct Fixture {
    root: NodeRef,
    left: NodeRef,
    right: NodeRef,
    leaf: NodeRef,
}

fn fixture() -> Fixture {
    let root = create_test_node("Root");
    let left = create_test_node("Left");
    let right = create_test_node("Right");
    let leaf = create_test_node("Leaf");
    add_node_child(&root, &left);
    add_node_child(&root, &right);
    add_node_child(&left, &leaf);
    return Fixture {
        root,
        left,
        right,
        leaf,
    };
}

fn node_eq(left: &NodeRef, right: &NodeRef) -> bool {
    return Arc::ptr_eq(left, right);
}

mod find_node {
    use super::*;

    #[test]
    fn finds_the_first_matching_descendant_depth_first_pre_order() {
        let f = fixture();
        let found = find_node(&f.root, &mut |node: &NodeRef| {
            return node.read().unwrap().node_fields().kind == "Leaf";
        });
        assert!(node_eq(&found.unwrap(), &f.leaf));
        assert!(find_node(&f.root, &mut |_node: &NodeRef| false).is_none());
    }

    #[test]
    fn returns_none_for_a_leaf_with_no_children() {
        let f = fixture();
        assert!(find_node(&f.leaf, &mut |_node: &NodeRef| true).is_none());
    }

    #[test]
    fn finds_the_first_match_in_depth_first_order() {
        let f = fixture();
        f.left.write().unwrap().node_fields_mut().name = Some(String::from("Left"));
        f.right.write().unwrap().node_fields_mut().name = Some(String::from("Left"));
        let found = find_node(&f.root, &mut |node: &NodeRef| {
            return node.read().unwrap().node_fields().name.as_deref() == Some("Left");
        });
        assert!(node_eq(&found.unwrap(), &f.left));
    }

    #[test]
    fn does_not_include_the_source_node_itself() {
        let f = fixture();
        let source = f.root.clone();
        assert!(find_node(&f.root, &mut move |node: &NodeRef| node_eq(node, &source)).is_none());
    }
}

mod find_node_by_name {
    use super::*;

    #[test]
    fn searches_the_full_subtree_by_name() {
        let f = fixture();
        f.leaf.write().unwrap().node_fields_mut().name = Some(String::from("needle"));
        assert!(node_eq(
            &find_node_by_name(&f.root, "needle").unwrap(),
            &f.leaf
        ));
        assert!(find_node_by_name(&f.root, "absent").is_none());
    }

    #[test]
    fn finds_a_direct_child_by_name_and_never_the_source() {
        let f = fixture();
        f.left.write().unwrap().node_fields_mut().name = Some(String::from("direct"));
        f.root.write().unwrap().node_fields_mut().name = Some(String::from("source"));
        assert!(node_eq(
            &find_node_by_name(&f.root, "direct").unwrap(),
            &f.left
        ));
        assert!(find_node_by_name(&f.root, "source").is_none());
    }
}

mod for_each_node_ancestor {
    use super::*;

    #[test]
    fn walks_upward_and_stops_when_the_callback_returns_false() {
        let f = fixture();
        let mut seen: Vec<String> = Vec::new();
        for_each_node_ancestor(&f.leaf, &mut |node: &NodeRef| {
            seen.push(node.read().unwrap().node_fields().kind.clone());
            return true;
        });
        assert_eq!(seen, vec![String::from("Left"), String::from("Root")]);
        let mut stops = 0;
        for_each_node_ancestor(&f.leaf, &mut |_node: &NodeRef| {
            stops += 1;
            return false;
        });
        assert_eq!(stops, 1);
    }

    #[test]
    fn does_not_visit_a_root_node_itself() {
        let f = fixture();
        let mut visited = false;
        for_each_node_ancestor(&f.root, &mut |_node: &NodeRef| {
            visited = true;
            return true;
        });
        assert!(!visited);
    }
}

mod for_each_node_descendant {
    use super::*;

    #[test]
    fn visits_every_descendant_depth_first_pre_order() {
        let f = fixture();
        let mut seen: Vec<String> = Vec::new();
        for_each_node_descendant(&f.root, &mut |node: &NodeRef| {
            seen.push(node.read().unwrap().node_fields().kind.clone());
        });
        assert_eq!(
            seen,
            vec![
                String::from("Left"),
                String::from("Leaf"),
                String::from("Right")
            ]
        );
    }

    #[test]
    fn does_not_call_the_callback_for_a_leaf_or_with_the_source() {
        let f = fixture();
        let mut visited = 0;
        for_each_node_descendant(&f.leaf, &mut |_node: &NodeRef| {
            visited += 1;
        });
        assert_eq!(visited, 0);
        let source = f.root.clone();
        let mut saw_source = false;
        for_each_node_descendant(&f.root, &mut |node: &NodeRef| {
            if node_eq(node, &source) {
                saw_source = true;
            }
        });
        assert!(!saw_source);
    }
}

mod get_node_children {
    use super::*;

    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let leaf = create_test_node("Node");
        let mut out = Vec::with_capacity(8);
        out.push(create_test_node("Node"));

        get_node_children(&mut out, &leaf);

        assert!(out.is_empty());
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn returns_a_snapshot_copy_of_the_direct_children() {
        let f = fixture();
        let snapshot = {
            let mut collected = Vec::new();
            get_node_children(&mut collected, &f.root);
            collected
        };
        assert_eq!(snapshot.len(), 2);
        remove_node_child(&f.root, &f.left);
        assert_eq!(snapshot.len(), 2);
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_node_children(&mut collected, &f.root);
                collected
            }
            .len(),
            1
        );
        assert!(
            {
                let mut collected = Vec::new();
                get_node_children(&mut collected, &f.leaf);
                collected
            }
            .is_empty()
        );
    }
}

mod get_node_depth {
    use super::*;

    #[test]
    fn returns_zero_for_a_root_and_an_increasing_depth_downward() {
        let f = fixture();
        assert_eq!(get_node_depth(&f.root), 0);
        assert_eq!(get_node_depth(&f.left), 1);
        assert_eq!(get_node_depth(&f.leaf), 2);
    }
}

mod get_node_next_sibling {
    use super::*;

    #[test]
    fn returns_the_next_sibling_or_none() {
        let f = fixture();
        assert!(node_eq(&get_node_next_sibling(&f.left).unwrap(), &f.right));
        assert!(get_node_next_sibling(&f.right).is_none());
        assert!(get_node_next_sibling(&f.root).is_none());
    }

    #[test]
    fn returns_none_for_a_stale_parent_whose_child_list_is_absent() {
        let f = fixture();
        f.root.write().unwrap().node_runtime_mut().children = None;
        assert!(get_node_next_sibling(&f.left).is_none());
    }

    #[test]
    fn returns_none_for_a_stale_parent_whose_child_list_omits_the_source() {
        let f = fixture();
        f.root.write().unwrap().node_runtime_mut().children = Some(vec![f.right.clone()]);
        assert!(get_node_next_sibling(&f.left).is_none());
    }
}

mod get_node_previous_sibling {
    use super::*;

    #[test]
    fn returns_the_previous_sibling_or_none() {
        let f = fixture();
        assert!(node_eq(
            &get_node_previous_sibling(&f.right).unwrap(),
            &f.left
        ));
        assert!(get_node_previous_sibling(&f.left).is_none());
        assert!(get_node_previous_sibling(&f.root).is_none());
    }

    #[test]
    fn returns_none_for_a_stale_parent_whose_child_list_is_absent() {
        let f = fixture();
        f.root.write().unwrap().node_runtime_mut().children = None;
        assert!(get_node_previous_sibling(&f.right).is_none());
    }
}

mod walk_node_descendants {
    use super::*;

    #[test]
    fn walks_depth_first_and_stops_early_on_false() {
        let f = fixture();
        let mut seen: Vec<String> = Vec::new();
        let completed = walk_node_descendants(&f.root, &mut |node: &NodeRef| {
            seen.push(node.read().unwrap().node_fields().kind.clone());
            return true;
        });
        assert!(completed);
        assert_eq!(
            seen,
            vec![
                String::from("Left"),
                String::from("Leaf"),
                String::from("Right")
            ]
        );
        let mut visited = 0;
        let completed = walk_node_descendants(&f.root, &mut |_node: &NodeRef| {
            visited += 1;
            return false;
        });
        assert!(!completed);
        assert_eq!(visited, 1);
    }

    #[test]
    fn returns_true_when_no_children_are_present() {
        let f = fixture();
        assert!(walk_node_descendants(&f.leaf, &mut |_node: &NodeRef| true));
    }

    #[test]
    fn does_not_visit_a_subtree_when_the_visitor_rejects_its_parent() {
        let f = fixture();
        let mut seen_kinds: Vec<String> = Vec::new();
        let stop_at = f.left.clone();
        walk_node_descendants(&f.root, &mut |node: &NodeRef| {
            seen_kinds.push(node.read().unwrap().node_fields().kind.clone());
            return !node_eq(node, &stop_at);
        });
        assert!(!seen_kinds.iter().any(|kind| kind == "Leaf"));
        assert!(!seen_kinds.iter().any(|kind| kind == "Right"));
    }

    #[test]
    fn propagates_an_early_stop_from_a_nested_descendant() {
        let f = fixture();
        let mut seen_kinds: Vec<String> = Vec::new();
        let stop_at = f.leaf.clone();
        let completed = walk_node_descendants(&f.root, &mut |node: &NodeRef| {
            seen_kinds.push(node.read().unwrap().node_fields().kind.clone());
            return !node_eq(node, &stop_at);
        });
        assert!(!completed);
        assert_eq!(seen_kinds, vec![String::from("Left"), String::from("Leaf")]);
    }
}
