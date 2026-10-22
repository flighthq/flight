use std::sync::Arc;

use flight_geometry::{create_matrix, create_rectangle};
use flight_node::contract::NodeRevisionState;
use flight_node::{
    NodeRef, add_node_child, create_viewport, invalidate_node_local_bounds,
    invalidate_node_local_transform,
};
use flight_render::*;

fn object_with_bounds(x: f32, y: f32, width: f32, height: f32) -> NodeRef {
    let typed = flight_scene2d::create_display_object(None);
    {
        let mut source = typed.write().unwrap();
        source.x = x;
        source.y = y;
        source
            .node2d_runtime_mut()
            .bounds
            .compute_local_bounds_rectangle = Arc::new(move |out, _source| {
            out.x = 0.0;
            out.y = 0.0;
            out.width = width;
            out.height = height;
        });
    }
    let source: NodeRef = typed;
    invalidate_node_local_transform(&source);
    invalidate_node_local_bounds(&source);
    return source;
}

fn viewport(x: f32, y: f32, width: f32, height: f32) -> flight_node::Viewport {
    let mut out = create_viewport();
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
    return out;
}

mod compute_render_proxy_world_bounds {
    use super::*;

    #[test]
    fn world_bounds_are_written_for_node2d() {
        let source = object_with_bounds(10.0, 20.0, 50.0, 30.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_render_proxy_world_bounds(
            &mut out,
            &source,
            &mut crate::support::test_default::<NodeRevisionState>(),
        );
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (10.0, 20.0, 50.0, 30.0)
        );
    }

    #[test]
    fn world_bounds_writer_only_requires_rectangle_fields() {
        let source = object_with_bounds(7.0, 9.0, 11.0, 13.0);
        let mut out = crate::support::test_default::<flight_geometry::Rectangle>();
        compute_render_proxy_world_bounds(
            &mut out,
            &source,
            &mut crate::support::test_default::<NodeRevisionState>(),
        );
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (7.0, 9.0, 11.0, 13.0)
        );
    }

    #[test]
    fn world_bounds_include_ancestor_transforms() {
        let typed_parent = flight_scene2d::create_display_object(None);
        typed_parent.write().unwrap().x = 100.0;
        let parent: NodeRef = typed_parent;
        invalidate_node_local_transform(&parent);
        let child = object_with_bounds(0.0, 0.0, 50.0, 50.0);
        add_node_child(&parent, &child);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_render_proxy_world_bounds(
            &mut out,
            &child,
            &mut crate::support::test_default::<NodeRevisionState>(),
        );
        assert_eq!(out.x, 100.0);
        assert_eq!(out.width, 50.0);
    }
}

mod is_render_proxy_in_viewport {
    use super::*;

    #[test]
    fn proxy_outside_viewport_is_culled() {
        let mut state = create_render_state();
        let source = object_with_bounds(900.0, 900.0, 50.0, 50.0);
        let proxy = create_render_proxy_2d(&mut state, &source);
        assert!(!is_render_proxy_in_viewport(
            &proxy,
            &viewport(0.0, 0.0, 100.0, 100.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn proxy_inside_viewport_is_visible() {
        let mut state = create_render_state();
        let source = object_with_bounds(10.0, 10.0, 50.0, 50.0);
        let proxy = create_render_proxy_2d(&mut state, &source);
        assert!(is_render_proxy_in_viewport(
            &proxy,
            &viewport(0.0, 0.0, 800.0, 600.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }
}

mod is_renderable_in_viewport {
    use super::*;

    #[test]
    fn renderable_inside_viewport_returns_true() {
        let source = object_with_bounds(10.0, 10.0, 50.0, 30.0);
        assert!(is_renderable_in_viewport(
            &source,
            &viewport(0.0, 0.0, 800.0, 600.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn renderable_outside_viewport_returns_false() {
        let source = object_with_bounds(100.0, 100.0, 50.0, 50.0);
        assert!(!is_renderable_in_viewport(
            &source,
            &viewport(2000.0, 2000.0, 100.0, 100.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn nested_object_culling_uses_world_bounds() {
        let typed_parent = flight_scene2d::create_display_object(None);
        {
            let mut parent = typed_parent.write().unwrap();
            parent.x = 500.0;
            parent.y = 500.0;
        }
        let parent: NodeRef = typed_parent;
        invalidate_node_local_transform(&parent);
        let child = object_with_bounds(0.0, 0.0, 20.0, 20.0);
        add_node_child(&parent, &child);
        let mut revisions = crate::support::test_default::<NodeRevisionState>();
        assert!(!is_renderable_in_viewport(
            &child,
            &viewport(0.0, 0.0, 100.0, 100.0),
            None,
            &mut revisions
        ));
        assert!(is_renderable_in_viewport(
            &child,
            &viewport(0.0, 0.0, 600.0, 600.0),
            None,
            &mut revisions
        ));
    }

    #[test]
    fn origin_object_is_culled_by_far_viewport() {
        let source = object_with_bounds(0.0, 0.0, 30.0, 30.0);
        assert!(!is_renderable_in_viewport(
            &source,
            &viewport(5000.0, 5000.0, 100.0, 100.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn viewport_overlap_is_inclusive_at_edge() {
        let source = object_with_bounds(0.0, 0.0, 100.0, 100.0);
        assert!(is_renderable_in_viewport(
            &source,
            &viewport(100.0, 100.0, 100.0, 100.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn optional_render_transform_is_applied() {
        let source = object_with_bounds(0.0, 0.0, 50.0, 50.0);
        let vp = viewport(0.0, 0.0, 60.0, 60.0);
        let mut revisions = crate::support::test_default::<NodeRevisionState>();
        assert!(is_renderable_in_viewport(
            &source,
            &vp,
            None,
            &mut revisions
        ));
        let scale = create_matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        assert!(is_renderable_in_viewport(
            &source,
            &vp,
            Some(&scale),
            &mut revisions
        ));
        let offset = create_matrix(1.0, 0.0, 0.0, 1.0, 200.0, 200.0);
        assert!(!is_renderable_in_viewport(
            &source,
            &vp,
            Some(&offset),
            &mut revisions
        ));
    }

    #[test]
    fn explicit_absent_render_transform_uses_world_bounds() {
        let source = object_with_bounds(10.0, 10.0, 50.0, 50.0);
        assert!(is_renderable_in_viewport(
            &source,
            &viewport(0.0, 0.0, 800.0, 600.0),
            None,
            &mut crate::support::test_default::<NodeRevisionState>()
        ));
    }

    #[test]
    fn scaled_parent_affects_world_bounds_culling() {
        let typed_parent = flight_scene2d::create_display_object(None);
        {
            let mut parent = typed_parent.write().unwrap();
            parent.scale_x = 2.0;
            parent.scale_y = 2.0;
        }
        let parent: NodeRef = typed_parent;
        invalidate_node_local_transform(&parent);
        let child = object_with_bounds(0.0, 0.0, 50.0, 50.0);
        add_node_child(&parent, &child);
        let mut revisions = crate::support::test_default::<NodeRevisionState>();
        assert!(is_renderable_in_viewport(
            &child,
            &viewport(80.0, 80.0, 50.0, 50.0),
            None,
            &mut revisions
        ));
        assert!(!is_renderable_in_viewport(
            &child,
            &viewport(200.0, 200.0, 50.0, 50.0),
            None,
            &mut revisions
        ));
    }
}
