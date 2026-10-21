use std::sync::Arc;

use flight_geometry::{Rectangle, create_rectangle};
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
        transform.x = x;
        transform.y = y;
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
        let mut out: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut out, &root);
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (0.0, 0.0, 30.0, 10.0)
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

    #[test]
    fn scales_the_node_so_the_parent_space_height_matches() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        set_node_height(&node, 60.0);
        let scale_y = node
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

    #[test]
    fn scales_the_node_so_the_parent_space_width_matches() {
        let parent = bounds_node(0.0, 0.0, 0.0, 0.0);
        let node = bounds_node(0.0, 0.0, 10.0, 20.0);
        add_node_child(&parent, &node);
        set_node_width(&node, 40.0);
        let scale_x = node
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
        node.write()
            .unwrap()
            .as_transform2d_node_mut()
            .unwrap()
            .transform2d_mut()
            .scale_x = 0.0;
        let before = get_node_local_transform_revision(&*node.read().unwrap());
        set_node_width(&node, 40.0);
        assert_eq!(
            node.read()
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
