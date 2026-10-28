use flight_node::contract::*;

use crate::support::create_test_node;

mod compute_node_world_transform_revision {
    use super::*;

    #[test]
    fn updates_world_transform_id_from_local_and_parent_transform_ids() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().local_transform_id = 3;
        let mut guard = node.write().unwrap();
        compute_node_world_transform_revision(&mut *guard, None, None);
        let runtime = guard.node_runtime();
        assert_eq!(runtime.world_transform_using_local_transform_id, 3);
        assert_eq!(runtime.world_transform_using_parent_transform_id, 0);
        assert_ne!(runtime.world_transform_id, 0);
    }

    #[test]
    fn incorporates_the_parent_world_transform_id() {
        let root = create_test_node("Test");
        let node = create_test_node("Test");
        let mut root_guard = root.write().unwrap();
        let mut guard = node.write().unwrap();
        compute_node_world_transform_revision(
            &mut *guard,
            Some(7),
            Some(root_guard.node_runtime_mut()),
        );
        assert_eq!(
            guard
                .node_runtime()
                .world_transform_using_parent_transform_id,
            7
        );
    }

    #[test]
    fn assigns_the_next_monotonic_revision_on_every_recompute() {
        let node = create_test_node("Test");
        let mut guard = node.write().unwrap();
        compute_node_world_transform_revision(&mut *guard, None, None);
        let first = guard.node_runtime().world_transform_id;
        compute_node_world_transform_revision(&mut *guard, None, None);
        let next = first.wrapping_add(1);
        assert_eq!(
            guard.node_runtime().world_transform_id,
            if next == 0 { 1 } else { next }
        );
    }

    #[test]
    fn mints_from_the_root_counter_not_the_target() {
        let root = create_test_node("Test");
        let node = create_test_node("Test");
        let mut root_guard = root.write().unwrap();
        let mut guard = node.write().unwrap();
        compute_node_world_transform_revision(
            &mut *guard,
            Some(1),
            Some(root_guard.node_runtime_mut()),
        );
        assert_eq!(
            root_guard.node_runtime().world_transform_revision_counter,
            1
        );
        assert_eq!(guard.node_runtime().world_transform_revision_counter, 0);
        assert_eq!(guard.node_runtime().world_transform_id, 1);
    }

    #[test]
    fn keeps_independent_roots_on_independent_counters() {
        let first = create_test_node("Test");
        let second = create_test_node("Test");
        let mut first_guard = first.write().unwrap();
        for _ in 0..3 {
            compute_node_world_transform_revision(&mut *first_guard, None, None);
        }
        let mut second_guard = second.write().unwrap();
        compute_node_world_transform_revision(&mut *second_guard, None, None);
        assert_eq!(
            first_guard.node_runtime().world_transform_revision_counter,
            3
        );
        assert_eq!(second_guard.node_runtime().world_transform_id, 1);
    }

    #[test]
    fn steps_past_zero_when_the_root_counter_wraps() {
        let node = create_test_node("Test");
        let mut guard = node.write().unwrap();
        guard.node_runtime_mut().world_transform_revision_counter = u32::MAX;
        compute_node_world_transform_revision(&mut *guard, None, None);
        assert_eq!(guard.node_runtime().world_transform_id, 1);
        assert_eq!(guard.node_runtime().world_transform_revision_counter, 1);
    }
}

mod get_node_appearance_revision {
    use super::*;

    #[test]
    fn returns_the_appearance_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().appearance_id = 100;
        assert_eq!(get_node_appearance_revision(&*node.read().unwrap()), 100);
    }
}

mod get_node_children_revision {
    use super::*;

    #[test]
    fn returns_the_children_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().children_id = 100;
        assert_eq!(get_node_children_revision(&*node.read().unwrap()), 100);
    }
}

mod get_node_local_bounds_revision {
    use super::*;

    #[test]
    fn returns_the_local_bounds_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().local_bounds_id = 100;
        assert_eq!(get_node_local_bounds_revision(&*node.read().unwrap()), 100);
    }
}

mod get_node_local_content_revision {
    use super::*;

    #[test]
    fn returns_the_local_content_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().local_content_id = 100;
        assert_eq!(get_node_local_content_revision(&*node.read().unwrap()), 100);
    }
}

mod get_node_local_transform_revision {
    use super::*;

    #[test]
    fn returns_the_local_transform_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().local_transform_id = 100;
        assert_eq!(
            get_node_local_transform_revision(&*node.read().unwrap()),
            100
        );
    }
}

mod get_node_parent_reference_revision {
    use super::*;

    #[test]
    fn returns_the_parent_reference_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().parent_reference_id = 100;
        assert_eq!(
            get_node_parent_reference_revision(&*node.read().unwrap()),
            100
        );
    }
}

mod get_node_world_transform_revision {
    use super::*;

    #[test]
    fn returns_the_world_transform_id() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().world_transform_id = 100;
        assert_eq!(
            get_node_world_transform_revision(&*node.read().unwrap()),
            100
        );
    }
}

mod invalidate_content {
    use super::*;

    #[test]
    fn increments_local_content_and_local_bounds() {
        let node = create_test_node("Test");
        invalidate_content(&node);
        let guard = node.read().unwrap();
        assert_eq!(guard.node_runtime().local_content_id, 1);
        assert_eq!(guard.node_runtime().local_bounds_id, 1);
    }

    #[test]
    fn does_not_touch_the_transform() {
        let node = create_test_node("Test");
        invalidate_content(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_transform_id, 0);
    }
}

mod invalidate_node {
    use super::*;

    #[test]
    fn increments_appearance_bounds_content_and_transform() {
        let node = create_test_node("Test");
        invalidate_node(&node);
        let guard = node.read().unwrap();
        let runtime = guard.node_runtime();
        assert_eq!(runtime.appearance_id, 1);
        assert_eq!(runtime.local_bounds_id, 1);
        assert_eq!(runtime.local_content_id, 1);
        assert_eq!(runtime.local_transform_id, 1);
    }

    #[test]
    fn invalidates_the_parent_reference_and_world_bounds() {
        let node = create_test_node("Test");
        node.write()
            .unwrap()
            .node_runtime_mut()
            .world_transform_using_parent_transform_id = 1;
        invalidate_node(&node);
        let guard = node.read().unwrap();
        let runtime = guard.node_runtime();
        assert_eq!(runtime.world_transform_using_parent_transform_id, -1);
        assert_eq!(runtime.world_bounds_using_world_transform_id, -1);
        assert_eq!(runtime.world_bounds_using_local_bounds_id, -1);
    }
}

mod invalidate_node_appearance {
    use super::*;

    #[test]
    fn increments_the_appearance_id() {
        let node = create_test_node("Test");
        invalidate_node_appearance(&node);
        assert_eq!(node.read().unwrap().node_runtime().appearance_id, 1);
    }

    #[test]
    fn wraps_like_a_32_bit_unsigned() {
        let node = create_test_node("Test");
        node.write().unwrap().node_runtime_mut().appearance_id = 0xffff_ffff;
        invalidate_node_appearance(&node);
        assert_eq!(node.read().unwrap().node_runtime().appearance_id, 0);
    }
}

mod invalidate_node_local_bounds {
    use super::*;

    #[test]
    fn increments_the_local_bounds_id_and_wraps() {
        let node = create_test_node("Test");
        invalidate_node_local_bounds(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_bounds_id, 1);
        node.write().unwrap().node_runtime_mut().local_bounds_id = 0xffff_ffff;
        invalidate_node_local_bounds(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_bounds_id, 0);
    }
}

mod invalidate_node_local_content {
    use super::*;

    #[test]
    fn increments_the_local_content_id_and_wraps() {
        let node = create_test_node("Test");
        invalidate_node_local_content(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_content_id, 1);
        node.write().unwrap().node_runtime_mut().local_content_id = 0xffff_ffff;
        invalidate_node_local_content(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_content_id, 0);
    }
}

mod invalidate_node_local_transform {
    use super::*;

    #[test]
    fn increments_the_local_transform_id_and_wraps() {
        let node = create_test_node("Test");
        invalidate_node_local_transform(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_transform_id, 1);
        node.write().unwrap().node_runtime_mut().local_transform_id = 0xffff_ffff;
        invalidate_node_local_transform(&node);
        assert_eq!(node.read().unwrap().node_runtime().local_transform_id, 0);
    }
}

mod invalidate_node_parent_reference {
    use super::*;

    #[test]
    fn increments_the_parent_reference_id_and_clears_the_cached_parent_transform() {
        let node = create_test_node("Test");
        node.write()
            .unwrap()
            .node_runtime_mut()
            .world_transform_using_parent_transform_id = 1;
        invalidate_node_parent_reference(&node);
        let guard = node.read().unwrap();
        assert_eq!(guard.node_runtime().parent_reference_id, 1);
        assert_eq!(
            guard
                .node_runtime()
                .world_transform_using_parent_transform_id,
            -1
        );
    }
}

mod invalidate_node_render {
    use super::*;

    #[test]
    fn increments_both_appearance_and_local_transform() {
        let node = create_test_node("Test");
        invalidate_node_render(&node);
        let guard = node.read().unwrap();
        assert_eq!(guard.node_runtime().appearance_id, 1);
        assert_eq!(guard.node_runtime().local_transform_id, 1);
    }
}

mod invalidate_node_world_bounds {
    use super::*;

    #[test]
    fn invalidates_supporting_values_for_world_bounds() {
        let node = create_test_node("Test");
        {
            let mut guard = node.write().unwrap();
            let runtime = guard.node_runtime_mut();
            runtime.world_bounds_using_world_transform_id = 1;
            runtime.world_bounds_using_local_bounds_id = 1;
        }
        invalidate_node_world_bounds(&node);
        let guard = node.read().unwrap();
        assert_eq!(
            guard.node_runtime().world_bounds_using_world_transform_id,
            -1
        );
        assert_eq!(guard.node_runtime().world_bounds_using_local_bounds_id, -1);
    }

    #[test]
    fn invalidates_every_ancestor_whose_aggregate_includes_the_target() {
        let parent = create_test_node("Test");
        let node = create_test_node("Test");
        add_node_child(&parent, &node);
        {
            let mut guard = parent.write().unwrap();
            let runtime = guard.node_runtime_mut();
            runtime.world_bounds_using_world_transform_id = 1;
            runtime.world_bounds_using_local_bounds_id = 1;
        }
        invalidate_node_world_bounds(&node);
        let guard = parent.read().unwrap();
        assert_eq!(
            guard.node_runtime().world_bounds_using_world_transform_id,
            -1
        );
        assert_eq!(guard.node_runtime().world_bounds_using_local_bounds_id, -1);
    }
}
