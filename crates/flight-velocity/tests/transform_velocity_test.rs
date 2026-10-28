//! flight-compiler: target-native

use flight_entity::get_entity_id;
use flight_node::contract::*;
use flight_scene2d::create_display_object;
use flight_velocity::contract::*;

fn create_display_node() -> NodeRef {
    return create_display_object();
}

fn move_node(node: &NodeRef, x: f32, y: f32) {
    {
        let mut guard = node.write().unwrap();
        let transform = guard
            .as_transform2d_node_mut()
            .expect("display object is a Transform2D node")
            .transform2d_mut();
        *transform.x = x;
        *transform.y = y;
    }
    invalidate_node_local_transform(node);
}

fn read_node_velocity(field: &VelocityField, node: &NodeRef) -> Velocity2D {
    let mut out = Velocity2D { x: 0.0, y: 0.0 };
    get_velocity(field, source_of(node), &mut out);
    return out;
}

fn source_of(node: &NodeRef) -> SourceId {
    return get_entity_id(&*node.read().unwrap());
}

mod contribute_transform_velocity {
    use super::*;

    #[test]
    fn reports_zero_velocity_on_the_first_frame() {
        let mut field = create_velocity_field();
        let obj = create_display_node();
        contribute_transform_velocity(&mut field, &obj);
        let velocity = read_node_velocity(&field, &obj);
        assert_eq!(velocity.x, 0.0);
        assert_eq!(velocity.y, 0.0);
        assert_eq!(
            explain_velocity(&field, source_of(&obj)).reason,
            VelocityReason::DerivedZero
        );
    }

    #[test]
    fn derives_velocity_from_the_world_transform_delta_between_frames() {
        let mut field = create_velocity_field();
        let obj = create_display_node();
        contribute_transform_velocity(&mut field, &obj);

        move_node(&obj, 10.0, -5.0);
        begin_velocity_frame(&mut field);
        contribute_transform_velocity(&mut field, &obj);

        let velocity = read_node_velocity(&field, &obj);
        assert_eq!(velocity.x, 10.0);
        assert_eq!(velocity.y, -5.0);
    }

    #[test]
    fn lets_an_explicit_contribution_override_the_derived_delta_regardless_of_call_order() {
        let mut field = create_velocity_field();
        let obj = create_display_node();
        contribute_transform_velocity(&mut field, &obj);

        move_node(&obj, 100.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, source_of(&obj), 2.0, 2.0);
        contribute_transform_velocity(&mut field, &obj);

        let velocity = read_node_velocity(&field, &obj);
        assert_eq!(velocity.x, 2.0);
        assert_eq!(velocity.y, 2.0);
    }

    #[test]
    fn walks_children_and_derives_velocity_for_each_node_in_the_subtree() {
        let mut field = create_velocity_field();
        let parent = create_display_node();
        let child = create_display_node();
        add_node_child(&parent, &child);
        contribute_transform_velocity(&mut field, &parent);

        move_node(&parent, 5.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_transform_velocity(&mut field, &parent);

        assert_eq!(read_node_velocity(&field, &parent).x, 5.0);
        assert_eq!(read_node_velocity(&field, &child).x, 5.0);
    }

    #[test]
    fn honors_an_explicit_override_on_a_child_while_the_parent_derives_from_transforms() {
        let mut field = create_velocity_field();
        let parent = create_display_node();
        let child = create_display_node();
        add_node_child(&parent, &child);
        contribute_transform_velocity(&mut field, &parent);

        move_node(&parent, 10.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, source_of(&child), 99.0, 99.0);
        contribute_transform_velocity(&mut field, &parent);

        assert_eq!(read_node_velocity(&field, &parent).x, 10.0);
        let child_velocity = read_node_velocity(&field, &child);
        assert_eq!(child_velocity.x, 99.0);
        assert_eq!(child_velocity.y, 99.0);
    }

    #[test]
    fn still_updates_previous_world_transform_when_an_explicit_override_is_in_effect() {
        let mut field = create_velocity_field();
        let obj = create_display_node();
        contribute_transform_velocity(&mut field, &obj);
        move_node(&obj, 10.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_velocity(&mut field, source_of(&obj), 99.0, 99.0);
        contribute_transform_velocity(&mut field, &obj);
        assert_eq!(
            find_velocity_sample(&field, source_of(&obj))
                .unwrap()
                .previous_world_transform
                .as_ref()
                .unwrap()
                .tx,
            10.0
        );

        // No movement between frame 2 and frame 3: velocity is zero.
        begin_velocity_frame(&mut field);
        contribute_transform_velocity(&mut field, &obj);
        let velocity = read_node_velocity(&field, &obj);
        assert_eq!(velocity.x, 0.0);
        assert_eq!(velocity.y, 0.0);
    }
}
