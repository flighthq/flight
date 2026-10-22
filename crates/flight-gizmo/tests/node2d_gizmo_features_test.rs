use flight_camera::create_camera_2d;
use flight_geometry::{create_rectangle, create_vector2};
use flight_gizmo::*;
use flight_node::contract::{NodeRef, add_node_child};
use flight_scene2d::contract::{create_display_object, create_scene2d};
use flight_shape::contract::{
    append_shape_begin_fill, append_shape_end_fill,
    append_shape_rectangle, create_shape, create_shape_bounds_state,
    register_default_shape_bounds_commands,
};

mod create_node2d_gizmo_features {
    use super::*;

    #[test]
    fn adapts_node2d_world_bounds_pivot_origin_and_composed_rotation_in_degrees() {
        let bounds_state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&bounds_state);
        let scene = create_scene2d();
        let parent = create_display_object();
        {
            let mut p = parent.write().unwrap();
            p.rotation = 15.0;
            p.x = 10.0;
            p.y = 20.0;
        }
        let node = create_shape();
        {
            use flight_scene2d::contract::Node2D;
            let mut g = node.write().unwrap();
            g.data.bounds_state = bounds_state;
            let n2d = g.node2d_fields_mut();
            n2d.pivot_x = 2.0;
            n2d.pivot_y = 3.0;
            n2d.rotation = 30.0;
            n2d.x = 8.0;
            n2d.y = 9.0;
        }
        append_shape_begin_fill(&node, 0xffffff, None);
        append_shape_rectangle(&node, 0.0, 0.0, 10.0, 20.0);
        append_shape_end_fill(&node);
        let root_ref: NodeRef = scene.read().unwrap().root.clone();
        let parent_ref: NodeRef = parent.clone();
        let node_ref: NodeRef = node.clone();
        add_node_child(&root_ref, &parent_ref);
        add_node_child(&parent_ref, &node_ref);
        let features = create_node2d_gizmo_features();
        let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut origin = create_vector2(0.0, 0.0);

        assert!((features.get_world_bounds_rectangle)(
            &mut bounds,
            &node_ref
        ));
        (features.get_world_origin)(&mut origin, &node_ref);

        assert!(bounds.width > 0.0);
        assert!(bounds.height > 0.0);
        let radians = std::f32::consts::PI / 12.0;
        assert_f32_close(origin.x, 10.0 + 8.0 * radians.cos() - 9.0 * radians.sin());
        assert_f32_close(origin.y, 20.0 + 8.0 * radians.sin() + 9.0 * radians.cos());
        assert_f32_close((features.get_world_rotation)(&node_ref), 45.0);
    }

    #[test]
    fn is_independent_of_camera_and_overlay_state() {
        let features = create_node2d_gizmo_features();
        let mut camera = create_camera_2d();
        camera.zoom = 2.0;

        assert_eq!(camera.zoom, 2.0);
        assert!(std::sync::Arc::strong_count(&features.get_world_bounds_rectangle) >= 1);
        assert!(std::sync::Arc::strong_count(&features.get_world_origin) >= 1);
        assert!(std::sync::Arc::strong_count(&features.get_world_rotation) >= 1);
    }
}

fn assert_f32_close(actual: f32, expected: f32) {
    // The pinned source uses toBeCloseTo(..., 8), whose original absolute bound is 5e-9.
    let bound = 5e-9_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

