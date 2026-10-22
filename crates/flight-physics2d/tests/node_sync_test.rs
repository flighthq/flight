use crate::flight_physics2d_support_test::*;

use flight_physics2d::*;
use flight_scene2d::{Node2DRef, create_display_object};

fn stub_body(x: f32, y: f32, angle: f32) -> flight_entity::Ref<RigidBody2D> {
    return rigid_body2d(Physics2DBodyType::Dynamic, x, y, Some(angle));
}

mod sync_physics2d_body_to_node2d {
    use super::*;

    #[test]
    fn converts_a_quarter_turn() {
        let body = stub_body(0.0, 0.0, std::f32::consts::PI / 2.0);
        let node: Node2DRef = create_display_object(None);
        sync_physics2d_body_to_node2d(&body.read().unwrap(), &node);
        // f32: PI/2 * RAD_TO_DEG rounds to 90 within f32 (TS asserts 10 digits on f64)
        assert!((node.read().unwrap().node2d_fields().rotation - 90.0).abs() < 1e-5);
    }

    #[test]
    fn converts_angle_from_radians_to_degrees() {
        let body = stub_body(0.0, 0.0, std::f32::consts::PI);
        let node: Node2DRef = create_display_object(None);
        sync_physics2d_body_to_node2d(&body.read().unwrap(), &node);
        // f32: PI * RAD_TO_DEG rounds to 180 within f32 (TS asserts 10 digits on f64)
        assert!((node.read().unwrap().node2d_fields().rotation - 180.0).abs() < 1e-5);
    }

    #[test]
    fn copies_position_from_body_to_node() {
        let body = stub_body(5.0, -3.0, 0.0);
        let node: Node2DRef = create_display_object(None);
        sync_physics2d_body_to_node2d(&body.read().unwrap(), &node);
        let guard = node.read().unwrap();
        assert_eq!(guard.node2d_fields().x, 5.0);
        assert_eq!(guard.node2d_fields().y, -3.0);
    }

    #[test]
    fn handles_zero_angle() {
        let body = stub_body(1.0, 2.0, 0.0);
        let shared = create_display_object(None);
        shared.write().unwrap().rotation = 45.0;
        let node: Node2DRef = shared;
        sync_physics2d_body_to_node2d(&body.read().unwrap(), &node);
        assert_eq!(node.read().unwrap().node2d_fields().rotation, 0.0);
    }
}
