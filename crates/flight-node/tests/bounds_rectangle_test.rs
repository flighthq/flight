use std::sync::Arc;

use flight_geometry::{
    Rectangle, acquire_matrix, clear_matrix_pool, create_rectangle, release_matrix,
};
use flight_node::contract::*;

use crate::support::create_test_node_2d;

fn bounds_node(x: f32, y: f32, width: f32, height: f32) -> NodeRef {
    let node = create_test_node_2d("Test");
    let callback: NodeLocalBoundsComputer =
        Arc::new(move |out: &mut Rectangle, _source: &dyn Node| {
            out.x = x;
            out.y = y;
            out.width = width;
            out.height = height;
        });
    {
        let mut guard = node.write().unwrap();
        guard
            .as_bounds_node_mut()
            .expect("test node has bounds")
            .bounds_runtime_mut()
            .compute_local_bounds_rectangle = callback;
    }
    return node;
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

type BoundsInput = Arc<std::sync::Mutex<(f32, f32, f32, f32)>>;

fn mutable_bounds_node(input: BoundsInput) -> NodeRef {
    let node = create_test_node_2d("Test");
    let callback: NodeLocalBoundsComputer =
        Arc::new(move |out: &mut Rectangle, _source: &dyn Node| {
            let values = *input.lock().unwrap();
            out.x = values.0;
            out.y = values.1;
            out.width = values.2;
            out.height = values.3;
        });
    {
        let mut guard = node.write().unwrap();
        guard
            .as_bounds_node_mut()
            .unwrap()
            .bounds_runtime_mut()
            .compute_local_bounds_rectangle = callback;
    }
    return node;
}

fn _set_validity(node: &NodeRef, valid: bool) {
    node.write()
        .unwrap()
        .as_bounds_node_mut()
        .unwrap()
        .bounds_runtime_mut()
        .is_local_bounds_rectangle_valid = Some(Arc::new(move |_source: &dyn Node| valid));
}

fn local_bounds(node: &NodeRef) -> Rectangle {
    return get_node_local_bounds_rectangle(node);
}

fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

fn set_position(node: &NodeRef, x: f32, y: f32) {
    {
        let mut guard = node.write().unwrap();
        let transform = guard
            .as_transform2d_node_mut()
            .expect("test node has a transform")
            .transform2d_mut();
        *transform.x = x;
        *transform.y = y;
    }
    invalidate_node_local_transform(node);
}

mod compute_node_bounds_rectangle {
    use super::*;

    #[test]
    fn uses_local_bounds_when_the_target_is_the_source() {
        let node = bounds_node(1.0, 2.0, 3.0, 4.0);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &node, Some(&node), &mut revisions());
        assert_eq!((out.x, out.y, out.width, out.height), (1.0, 2.0, 3.0, 4.0));
    }

    #[test]
    fn includes_children_when_the_target_is_the_source() {
        let child = bounds_node(0.0, 0.0, 100.0, 100.0);
        let grandchild = bounds_node(5.0, 5.0, 100.0, 100.0);
        add_node_child(&child, &grandchild);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &child, Some(&child), &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (0.0, 0.0, 105.0, 105.0)
        );
    }

    #[test]
    fn defaults_a_missing_target_coordinate_space_to_the_source() {
        let child = bounds_node(0.0, 0.0, 10.0, 20.0);
        let grandchild = bounds_node(1.0, 2.0, 3.0, 4.0);
        add_node_child(&child, &grandchild);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &child, None, &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (0.0, 0.0, 10.0, 20.0)
        );
    }

    #[test]
    fn accounts_for_scaling_translation_and_rotation_in_parent_space() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let child = bounds_node(0.0, 0.0, 50.0, 50.0);
        add_node_child(&parent, &child);
        edit_transform(&child, |transform| {
            *transform.x = 5.0;
            *transform.y = 7.0;
            *transform.scale_x = 2.0;
            *transform.scale_y = 3.0;
        });
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &child, Some(&parent), &mut revisions());
        assert!((out.width - 100.0).abs() <= 1e-3);
        assert!((out.height - 150.0).abs() <= 1e-3);
        edit_transform(&child, |transform| *transform.rotation = 90.0);
        let mut rotated: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut rotated, &child, Some(&parent), &mut revisions());
        assert!((rotated.width - 150.0).abs() <= 1e-3);
        assert!((rotated.height - 100.0).abs() <= 1e-3);
    }

    #[test]
    fn an_unrelated_target_reads_world_bounds() {
        let child = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&child, 5.0, 5.0);
        let unrelated = bounds_node(0.0, 0.0, 0.0, 0.0);
        set_position(&unrelated, 5.0, 5.0);
        clear_matrix_pool();
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &child, Some(&unrelated), &mut revisions());
        let scratch = acquire_matrix();
        assert_eq!((scratch.tx, scratch.ty), (-5.0, -5.0));
        release_matrix(scratch);
        let world = get_node_world_bounds_rectangle(&child, &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (world.x - 5.0, world.y - 5.0, world.width, world.height)
        );
    }

    #[test]
    fn removes_a_detached_target_transform_from_target_relative_bounds() {
        let root = bounds_node(0.0, 0.0, 0.0, 0.0);
        set_position(&root, 40.0, -25.0);
        let child = bounds_node(0.0, 0.0, 100.0, 100.0);
        edit_transform(&child, |transform| {
            *transform.x = 100.0;
            *transform.y = 100.0;
        });
        add_node_child(&root, &child);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &child, Some(&root), &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (100.0, 100.0, 100.0, 100.0)
        );
    }

    #[test]
    fn uses_parent_space_when_the_target_is_the_parent() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        add_node_child(&parent, &node);
        set_position(&node, 10.0, 20.0);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &node, Some(&parent), &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (10.0, 20.0, 10.0, 10.0)
        );
    }

    #[test]
    fn transforms_world_bounds_back_into_another_coordinate_space() {
        let other = bounds_node(0.0, 0.0, 0.0, 0.0);
        set_position(&other, 5.0, 5.0);
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&node, 15.0, 15.0);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_bounds_rectangle(&mut out, &node, Some(&other), &mut revisions());
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (10.0, 10.0, 10.0, 10.0)
        );
    }
}

mod compute_node_root_local_bounds_rectangle {
    use super::*;

    #[test]
    fn merges_children_with_the_root_transform_cancelled() {
        let root = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&root, 100.0, 100.0);
        let child = bounds_node(0.0, 0.0, 10.0, 10.0);
        add_node_child(&root, &child);
        set_position(&child, 20.0, 0.0);
        clear_matrix_pool();
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut out, &root);
        let scratch = acquire_matrix();
        assert_eq!((scratch.tx, scratch.ty), (20.0, 0.0));
        release_matrix(scratch);
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (0.0, 0.0, 30.0, 10.0)
        );
    }

    #[test]
    fn keeps_negative_local_extents_and_ignores_the_detached_root_transform() {
        let root = bounds_node(-10.0, -5.0, 30.0, 20.0);
        edit_transform(&root, |transform| {
            *transform.x = 120.0;
            *transform.y = -35.0;
            *transform.rotation = 37.0;
            *transform.scale_x = 2.0;
            *transform.scale_y = 0.5;
        });
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut out, &root);
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (-10.0, -5.0, 30.0, 20.0)
        );
    }

    #[test]
    fn composes_transforms_at_every_descendant_depth_and_excludes_disabled_nodes() {
        let root = bounds_node(0.0, 0.0, 1.0, 1.0);
        let child = bounds_node(0.0, 0.0, 1.0, 1.0);
        let grandchild = bounds_node(0.0, 0.0, 2.0, 2.0);
        edit_transform(&root, |transform| {
            *transform.x = 500.0;
            *transform.rotation = 90.0;
        });
        edit_transform(&child, |transform| *transform.x = 10.0);
        edit_transform(&grandchild, |transform| *transform.x = 20.0);
        add_node_child(&root, &child);
        add_node_child(&child, &grandchild);
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut out, &root);
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 32.0, 2.0));
        grandchild.write().unwrap().node_fields_mut().enabled = false;
        let mut disabled: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut disabled, &root);
        assert_eq!(
            (disabled.x, disabled.y, disabled.width, disabled.height),
            (0.0, 0.0, 11.0, 1.0)
        );
    }
}

mod ensure_node_local_bounds_rectangle {
    use super::*;

    #[test]
    fn computes_local_bounds_through_the_kind_callback() {
        let node = bounds_node(3.0, 4.0, 30.0, 40.0);
        ensure_node_local_bounds_rectangle(&node);
        let bounds = node
            .read()
            .unwrap()
            .as_bounds_node()
            .unwrap()
            .bounds_runtime()
            .local_bounds_rectangle
            .clone()
            .expect("bounds are computed");
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (3.0, 4.0, 30.0, 40.0)
        );
    }

    #[test]
    fn the_kind_validity_hook_can_reject_an_unchanged_revision() {
        let input: BoundsInput = Arc::new(std::sync::Mutex::new((0.0, 0.0, 10.0, 10.0)));
        let node = mutable_bounds_node(input.clone());
        let valid = Arc::new(std::sync::Mutex::new(true));
        {
            let valid = valid.clone();
            node.write()
                .unwrap()
                .as_bounds_node_mut()
                .unwrap()
                .bounds_runtime_mut()
                .is_local_bounds_rectangle_valid =
                Some(Arc::new(move |_source: &dyn Node| *valid.lock().unwrap()));
        }
        ensure_node_local_bounds_rectangle(&node);
        *input.lock().unwrap() = (0.0, 0.0, 20.0, 10.0);
        *valid.lock().unwrap() = false;
        ensure_node_local_bounds_rectangle(&node);
        assert_eq!(local_bounds(&node).width, 20.0);
    }

    #[test]
    fn ignores_local_transform_changes() {
        let node = mutable_bounds_node(Arc::new(std::sync::Mutex::new((0.0, 0.0, 10.0, 10.0))));
        ensure_node_local_bounds_rectangle(&node);
        let bounds = local_bounds(&node);
        invalidate_node_local_transform(&node);
        ensure_node_local_bounds_rectangle(&node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (
                local_bounds(&node).x,
                local_bounds(&node).y,
                local_bounds(&node).width,
                local_bounds(&node).height
            )
        );
    }

    #[test]
    fn recomputes_only_when_the_local_bounds_revision_changes() {
        let calls = Arc::new(std::sync::Mutex::new(0u32));
        let counter = calls.clone();
        let node = create_test_node_2d("Test");
        let callback: NodeLocalBoundsComputer =
            Arc::new(move |_out: &mut Rectangle, _source: &dyn Node| {
                *counter.lock().unwrap() += 1;
            });
        {
            let mut guard = node.write().unwrap();
            guard
                .as_bounds_node_mut()
                .unwrap()
                .bounds_runtime_mut()
                .compute_local_bounds_rectangle = callback;
        }
        ensure_node_local_bounds_rectangle(&node);
        ensure_node_local_bounds_rectangle(&node);
        assert_eq!(*calls.lock().unwrap(), 1);
        invalidate_node_local_bounds(&node);
        ensure_node_local_bounds_rectangle(&node);
        assert_eq!(*calls.lock().unwrap(), 2);
    }
}

mod ensure_node_parent_bounds_rectangle {
    use super::*;

    #[test]
    fn ensures_bounds_and_recomputes_on_local_bounds_or_transform_revisions() {
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        ensure_node_parent_bounds_rectangle(&node);
        assert!(
            node.read()
                .unwrap()
                .as_bounds_node()
                .unwrap()
                .bounds_runtime()
                .bounds_rectangle
                .is_some()
        );
        set_position(&node, 5.0, 0.0);
        ensure_node_parent_bounds_rectangle(&node);
        assert_eq!(get_node_parent_bounds_rectangle(&node).x, 5.0);
        invalidate_node_local_bounds(&node);
        ensure_node_parent_bounds_rectangle(&node);
        assert_eq!(get_node_parent_bounds_rectangle(&node).x, 5.0);
    }

    #[test]
    fn maps_local_bounds_through_the_local_transform() {
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&node, 10.0, 20.0);
        ensure_node_parent_bounds_rectangle(&node);
        let bounds = get_node_parent_bounds_rectangle(&node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (10.0, 20.0, 10.0, 10.0)
        );
    }
}

mod ensure_node_world_bounds_rectangle {
    use super::*;

    #[test]
    fn recomputes_when_bounds_were_cached_before_the_world_matrix_existed() {
        let object = bounds_node(0.0, 0.0, 0.0, 0.0);
        ensure_node_local_bounds_rectangle(&object);
        {
            let mut guard = object.write().unwrap();
            let local_bounds_id = guard.node_runtime().local_bounds_id;
            guard
                .as_bounds_node_mut()
                .unwrap()
                .bounds_runtime_mut()
                .world_bounds_rectangle = Some(create_rectangle(5.0, 5.0, 10.0, 10.0));
            guard.node_runtime_mut().world_bounds_using_local_bounds_id = local_bounds_id as i32;
        }
        ensure_node_world_bounds_rectangle(&object, &mut revisions());
        let world = get_node_world_bounds_rectangle(&object, &mut revisions());
        assert_eq!(
            (world.x, world.y, world.width, world.height),
            (0.0, 0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn recomputes_on_local_bounds_translation_scale_and_parent_translation() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = mutable_bounds_node(Arc::new(std::sync::Mutex::new((0.0, 0.0, 0.0, 0.0))));
        add_node_child(&parent, &node);
        let mut state = revisions();
        ensure_node_world_bounds_rectangle(&node, &mut state);
        invalidate_node_local_bounds(&node);
        ensure_node_world_bounds_rectangle(&node, &mut state);
        set_position(&parent, 100.0, 0.0);
        ensure_node_world_bounds_rectangle(&node, &mut state);
        let translated = get_node_world_bounds_rectangle(&node, &mut state);
        assert_eq!(translated.x, 100.0);
        let scaled = mutable_bounds_node(Arc::new(std::sync::Mutex::new((0.0, 0.0, 10.0, 0.0))));
        edit_transform(&scaled, |transform| *transform.scale_x = 2.0);
        ensure_node_world_bounds_rectangle(&scaled, &mut state);
        let width = get_node_world_bounds_rectangle(&scaled, &mut state).width;
        assert!((width - 20.0).abs() <= 1e-3);
    }

    #[test]
    fn maps_local_bounds_through_the_world_transform() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        set_position(&parent, 5.0, 5.0);
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        add_node_child(&parent, &node);
        set_position(&node, 10.0, 10.0);
        ensure_node_world_bounds_rectangle(&node, &mut revisions());
        let bounds = get_node_world_bounds_rectangle(&node, &mut revisions());
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (15.0, 15.0, 10.0, 10.0)
        );
    }
}

mod get_node_height {
    use super::*;

    #[test]
    fn measures_the_parent_space_height() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        assert_eq!(get_node_height(&node, &mut revisions()), 20.0);
    }

    #[test]
    fn accounts_for_scale_y() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        edit_transform(&node, |transform| *transform.scale_y = 2.0);
        assert_eq!(get_node_height(&node, &mut revisions()), 40.0);
    }
}

mod get_node_local_bounds_rectangle {
    use super::*;

    #[test]
    fn returns_the_kind_computed_bounds() {
        let node = bounds_node(1.0, 2.0, 3.0, 4.0);
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (1.0, 2.0, 3.0, 4.0)
        );
    }
}

mod get_node_parent_bounds_rectangle {
    use super::*;

    #[test]
    fn reads_the_local_transform_mapped_bounds() {
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&node, 3.0, 4.0);
        let bounds = get_node_parent_bounds_rectangle(&node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (3.0, 4.0, 10.0, 10.0)
        );
    }
}

mod get_node_width {
    use super::*;

    #[test]
    fn measures_the_parent_space_width() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        assert_eq!(get_node_width(&node, &mut revisions()), 10.0);
    }

    #[test]
    fn accounts_for_scale_x() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        edit_transform(&node, |transform| *transform.scale_x = 3.0);
        assert_eq!(get_node_width(&node, &mut revisions()), 30.0);
    }
}

mod get_node_world_bounds_rectangle {
    use super::*;

    #[test]
    fn includes_enabled_children_and_skips_disabled_ones() {
        let parent = bounds_node(0.0, 0.0, 10.0, 10.0);
        let child = bounds_node(0.0, 0.0, 10.0, 10.0);
        add_node_child(&parent, &child);
        set_position(&child, 20.0, 0.0);
        let world = get_node_world_bounds_rectangle(&parent, &mut revisions());
        assert_eq!(
            (world.x, world.y, world.width, world.height),
            (0.0, 0.0, 30.0, 10.0)
        );
        child.write().unwrap().node_fields_mut().enabled = false;
        invalidate_node_world_bounds(&parent);
        let world = get_node_world_bounds_rectangle(&parent, &mut revisions());
        assert_eq!(world.width, 10.0);
    }

    #[test]
    fn refreshes_aggregate_bounds_when_children_move_are_removed_or_are_toggled() {
        let parent = bounds_node(0.0, 0.0, 10.0, 10.0);
        let child = bounds_node(0.0, 0.0, 20.0, 20.0);
        add_node_child(&parent, &child);
        set_position(&child, 30.0, 0.0);
        assert_eq!(
            get_node_world_bounds_rectangle(&parent, &mut revisions()).width,
            50.0
        );
        set_position(&child, 80.0, 0.0);
        assert_eq!(
            get_node_world_bounds_rectangle(&parent, &mut revisions()).width,
            100.0
        );
        set_node_enabled(&child, false);
        assert_eq!(
            get_node_world_bounds_rectangle(&parent, &mut revisions()).width,
            10.0
        );
        set_node_enabled(&child, true);
        assert_eq!(
            get_node_world_bounds_rectangle(&parent, &mut revisions()).width,
            100.0
        );
        remove_node_child(&parent, &child);
        let bounds = get_node_world_bounds_rectangle(&parent, &mut revisions());
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 10.0, 10.0)
        );
    }

    #[test]
    fn ignores_an_enabled_child_with_zero_area_world_bounds() {
        let parent = bounds_node(0.0, 0.0, 10.0, 10.0);
        let child = bounds_node(0.0, 0.0, 0.0, 5.0);
        add_node_child(&parent, &child);
        set_position(&child, 100.0, 0.0);
        let bounds = get_node_world_bounds_rectangle(&parent, &mut revisions());
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 10.0, 10.0)
        );
    }

    #[test]
    fn offsets_cached_world_bounds_when_only_translation_changes() {
        let node = bounds_node(0.0, 0.0, 10.0, 10.0);
        set_position(&node, 5.0, 5.0);
        let first = get_node_world_bounds_rectangle(&node, &mut revisions());
        assert_eq!((first.x, first.y), (5.0, 5.0));
        set_position(&node, 15.0, 25.0);
        let second = get_node_world_bounds_rectangle(&node, &mut revisions());
        assert_eq!(
            (second.x, second.y, second.width, second.height),
            (15.0, 25.0, 10.0, 10.0)
        );
    }
}

mod set_node_height {
    use super::*;

    fn round_trip_height(transform: impl FnOnce(Transform2DMut<'_>)) {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        edit_transform(&node, transform);
        let sign = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_y
            .signum();
        set_node_height(&node, 100.0);
        assert!((get_node_height(&node, &mut revisions()) - 100.0).abs() <= 1e-3);
        assert_eq!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_y
                .signum(),
            sign
        );
    }

    #[test]
    fn round_trips_height_through_rotation_skew_and_mirrored_scales() {
        round_trip_height(|transform| {
            *transform.rotation = 30.0;
        });
        round_trip_height(|transform| {
            *transform.rotation = 10.0;
            *transform.scale_x = 0.7;
            *transform.scale_y = 2.3;
            *transform.skew_x = 25.0;
            *transform.skew_y = -15.0;
        });
        round_trip_height(|transform| {
            *transform.rotation = -25.0;
            *transform.scale_x = -1.4;
            *transform.scale_y = 0.6;
            *transform.skew_x = -10.0;
            *transform.skew_y = 20.0;
        });
    }

    #[test]
    fn keeps_a_finite_scale_when_the_local_height_is_zero_and_declines_below_the_fixed_term() {
        let node = bounds_node(0.0, 0.0, 10.0, 0.0);
        set_node_height(&node, 100.0);
        let untouched = *node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_y;
        assert_eq!(untouched, 1.0);
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let rotated = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &rotated);
        edit_transform(&rotated, |transform| *transform.rotation = 30.0);
        let before = *rotated
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_y;
        set_node_height(&rotated, 4.0);
        assert_eq!(
            *rotated
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_y,
            before
        );
    }

    #[test]
    fn does_not_mutate_at_a_singular_rotation_and_still_solves_near_it() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let singular = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &singular);
        edit_transform(&singular, |transform| {
            *transform.rotation = 90.0;
            *transform.scale_y = 2.0;
        });
        set_node_height(&singular, 50.0);
        assert_eq!(
            *singular
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_y,
            2.0
        );
        let near_parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let near = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&near_parent, &near);
        edit_transform(&near, |transform| *transform.rotation = 89.999);
        set_node_height(&near, 50.0);
        assert!((get_node_height(&near, &mut revisions()) - 50.0).abs() <= 1e-2);
    }

    #[test]
    fn scales_the_node_so_the_parent_space_height_matches() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        set_node_height(&node, 60.0);
        let scale_y = *node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_y;
        assert_eq!(scale_y, 3.0);
        assert_eq!(get_node_height(&node, &mut revisions()), 60.0);
    }
}

mod set_node_width {
    use super::*;

    fn round_trip_width(transform: impl FnOnce(Transform2DMut<'_>)) {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        edit_transform(&node, transform);
        let sign = node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_x
            .signum();
        set_node_width(&node, 100.0);
        assert!((get_node_width(&node, &mut revisions()) - 100.0).abs() <= 1e-3);
        assert_eq!(
            node.read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_x
                .signum(),
            sign
        );
    }

    #[test]
    fn round_trips_width_through_rotation_skew_and_mirrored_scales() {
        round_trip_width(|transform| {
            *transform.rotation = 30.0;
        });
        round_trip_width(|transform| {
            *transform.rotation = 10.0;
            *transform.scale_x = 0.7;
            *transform.scale_y = 2.3;
            *transform.skew_x = 25.0;
            *transform.skew_y = -15.0;
        });
        round_trip_width(|transform| {
            *transform.rotation = 40.0;
            *transform.scale_x = 1.8;
            *transform.scale_y = -1.2;
        });
    }

    #[test]
    fn keeps_a_finite_scale_when_the_local_width_is_zero_and_declines_below_the_fixed_term() {
        let node = bounds_node(0.0, 0.0, 0.0, 10.0);
        set_node_width(&node, 100.0);
        assert_eq!(
            *node
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_x,
            1.0
        );
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let rotated = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &rotated);
        edit_transform(&rotated, |transform| *transform.rotation = 30.0);
        let before = *rotated
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_x;
        set_node_width(&rotated, 5.0);
        assert_eq!(
            *rotated
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_x,
            before
        );
    }

    #[test]
    fn scales_the_node_so_the_parent_space_width_matches() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        set_node_width(&node, 40.0);
        let scale_x = *node
            .read()
            .unwrap()
            .as_transform2d_node()
            .unwrap()
            .transform2d()
            .scale_x;
        assert_eq!(scale_x, 4.0);
        assert_eq!(get_node_width(&node, &mut revisions()), 40.0);
    }

    #[test]
    fn declines_without_mutation_when_the_scale_is_zero() {
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        *node
            .write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .scale_x = 0.0;
        let before = get_node_local_transform_revision(&*node.read().unwrap());
        set_node_width(&node, 40.0);
        assert_eq!(
            *node
                .read()
                .unwrap()
                .as_transform2d_node()
                .unwrap()
                .transform2d()
                .scale_x,
            0.0
        );
        assert_eq!(
            get_node_local_transform_revision(&*node.read().unwrap()),
            before
        );
    }
}
