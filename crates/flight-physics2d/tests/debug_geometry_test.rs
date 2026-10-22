use crate::flight_physics2d_support_test::*;

use std::f32::consts::PI;
use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionPolygon2D, CollisionShape2D,
};
use flight_entity::{Entity, Ref, allocate_entity};
use flight_physics2d::contract::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn add_body(world: &mut Physics2DWorld, body: Ref<RigidBody2D>) -> Ref<RigidBody2D> {
    add_physics2d_body(world, &body);
    return body;
}

fn base(body_a: i32, body_b: i32) -> Physics2DJointOptions {
    let make: fn() -> Physics2DJointOptions = Physics2DJointOptions::default;
    let mut out = make();
    out.body_a = body_a;
    out.body_b = body_b;
    return out;
}

fn body_with(
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    angle: Option<f32>,
    local: CollisionShape2D,
) -> Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, angle);
    body.write()
        .unwrap()
        .colliders
        .push(physics2d_collider(&local, &STONE, None, None));
    return body;
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return body.read().unwrap().index;
}

fn nothing() -> Physics2DDebugGeometryOptions {
    return Physics2DDebugGeometryOptions {
        center_of_mass_radius: None,
        contact_normal_length: None,
        draw_centers_of_mass: Some(false),
        draw_colliders: Some(false),
        draw_contacts: Some(false),
        draw_joints: Some(false),
        point_radius: None,
    };
}

fn only_colliders() -> Physics2DDebugGeometryOptions {
    let mut out = nothing();
    out.draw_colliders = Some(true);
    return out;
}

fn update_world_shapes(body: &Ref<RigidBody2D>) {
    let guard = body.read().unwrap();
    for collider in &guard.colliders {
        update_physics2d_collider_world_shape(&mut collider.write().unwrap(), &guard);
    }
}

mod create_physics2d_debug_geometry {
    use super::*;

    #[test]
    fn starts_with_empty_reusable_primitive_pools() {
        fn assert_entity<T: Entity>(_value: &T) {}
        let geometry = create_physics2d_debug_geometry();
        assert_entity(&geometry);
        assert_eq!(geometry.circle_count, 0);
        assert!(geometry.circles.is_empty());
        assert_eq!(geometry.line_count, 0);
        assert!(geometry.lines.is_empty());
    }
}

mod initialize_physics2d_debug_geometry {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_debug_geometry() {
        let mut out: Physics2DDebugGeometry = allocate_entity();
        out.line_count = 3;
        out.circle_count = 2;
        initialize_physics2d_debug_geometry(&mut out);
        assert_eq!((out.line_count, out.circle_count), (0, 0));
        assert!(out.lines.is_empty() && out.circles.is_empty());
    }
}

mod write_physics2d_debug_geometry {
    use super::*;

    #[test]
    fn draws_a_capsule_as_two_end_discs_and_the_two_lines_tangent_to_them() {
        // Its actual silhouette. Two circles alone would leave the straight sides missing, and a single
        // line through the axis would draw a shape the collider does not have.
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: -2.0,
            y0: 0.0,
            x1: 2.0,
            y1: 0.0,
            radius: 1.0,
        });
        add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 0.0, 0.0, None, capsule),
        );
        let mut out = create_physics2d_debug_geometry();

        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));

        assert_eq!(out.circle_count, 2);
        assert_eq!(out.line_count, 2);
        let circles: Vec<[f32; 3]> = out.circles[..2]
            .iter()
            .map(|circle| [circle.x, circle.y, circle.radius])
            .collect();
        assert_eq!(circles, vec![[-2.0, 0.0, 1.0], [2.0, 0.0, 1.0]]);
        // The sides sit one radius either side of the axis, which is what makes them tangent to both
        // discs.
        let mut sides: Vec<f32> = out.lines[..2].iter().map(|line| line.y0).collect();
        sides.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(sides, vec![-1.0, 1.0]);
    }

    #[test]
    fn draws_ordinary_mouse_and_pulley_joints_using_the_anchors_each_solver_constrains() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let first = add_body(
            &mut world,
            rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None),
        );
        let second = add_body(
            &mut world,
            rigid_body2d(Physics2DBodyType::Dynamic, 4.0, 0.0, None),
        );
        let custom: Physics2DJointRef = {
            let mut options = base(index_of(&first), index_of(&second));
            options.local_anchor_ax = Some(1.0);
            let mut out: Physics2DDistanceJoint = allocate_entity();
            initialize_physics2d_distance_joint(&mut out);
            out.body_a = options.body_a;
            out.body_b = options.body_b;
            out.local_anchor_ax = options.local_anchor_ax.unwrap_or(0.0);
            out.kind = "acme.Custom".to_string();
            Arc::new(RwLock::new(out))
        };
        add_physics2d_joint(&mut world, &custom);
        let mouse = physics2d_mouse_joint(&Physics2DMouseJointOptions {
            body: index_of(&second),
            break_force: None,
            break_torque: None,
            damping_ratio: None,
            frequency_hz: None,
            local_anchor_x: None,
            local_anchor_y: None,
            max_force: 0.0,
            target_x: 8.0,
            target_y: 3.0,
        });
        mouse.write().unwrap().body_a = 999;
        add_physics2d_joint(&mut world, &(mouse as Physics2DJointRef));
        let pulley = physics2d_pulley_joint(&Physics2DPulleyJointOptions {
            base: base(index_of(&first), index_of(&second)),
            constant: 4.0,
            ground_anchor_ax: 0.0,
            ground_anchor_ay: 2.0,
            ground_anchor_bx: 4.0,
            ground_anchor_by: 2.0,
            ratio: Some(1.0),
        });
        add_physics2d_joint(&mut world, &(pulley as Physics2DJointRef));
        let mut out = create_physics2d_debug_geometry();
        let mut options = nothing();
        options.draw_joints = Some(true);

        write_physics2d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 5);
        let ends = |at: usize| {
            let line = out.lines[at];
            return (line.x0, line.x1, line.y0, line.y1);
        };
        assert_eq!(out.lines[0].feature, Physics2DDebugFeature::Joint);
        assert_eq!(ends(0), (1.0, 4.0, 0.0, 0.0));
        assert_eq!(ends(1), (8.0, 4.0, 3.0, 0.0));
        assert_eq!(ends(2), (0.0, 0.0, 2.0, 0.0));
        assert_eq!(ends(3), (4.0, 4.0, 2.0, 0.0));
        assert_eq!(ends(4), (0.0, 4.0, 2.0, 2.0));
    }

    #[test]
    fn draws_only_the_two_discs_for_a_zero_length_capsule_which_has_no_sides() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 0.0,
            y0: 0.0,
            x1: 0.0,
            y1: 0.0,
            radius: 0.5,
        });
        add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 3.0, 4.0, None, capsule),
        );
        let mut out = create_physics2d_debug_geometry();

        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));

        assert_eq!(out.circle_count, 2);
        assert_eq!(out.line_count, 0);
    }

    #[test]
    fn extracts_circle_box_and_polygon_collider_outlines_in_world_space() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let circle_shape = CollisionShape2D::Circle(CollisionCircle2D {
            radius: 0.5,
            x: 1.0,
            y: 0.0,
        });
        let circle = add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 2.0, 3.0, None, circle_shape),
        );
        let box_shape = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 1.0,
            max_y: 0.5,
            min_x: -1.0,
            min_y: -0.5,
        });
        let boxed = add_body(
            &mut world,
            body_with(
                Physics2DBodyType::Dynamic,
                -2.0,
                0.0,
                Some(PI / 2.0),
                box_shape,
            ),
        );
        let polygon_shape = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 2.0, 0.0, 0.0, 1.0],
        });
        let polygon = add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 0.0, 4.0, None, polygon_shape),
        );
        for body in world.bodies.clone() {
            update_world_shapes(&body);
        }
        let mut out = create_physics2d_debug_geometry();

        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));

        assert_eq!(out.circle_count, 1);
        let drawn = out.circles[0];
        assert_eq!(drawn.body_a, index_of(&circle));
        assert_eq!(drawn.feature, Physics2DDebugFeature::Collider);
        assert_eq!((drawn.radius, drawn.x, drawn.y), (0.5, 3.0, 3.0));
        assert_eq!(out.line_count, 7);
        let live = &out.lines[..out.line_count];
        assert_eq!(
            live.iter()
                .filter(|line| line.body_a == index_of(&boxed))
                .count(),
            4
        );
        assert_eq!(
            live.iter()
                .filter(|line| line.body_a == index_of(&polygon))
                .count(),
            3
        );
    }

    #[test]
    fn places_center_markers_at_each_rotated_center_of_mass() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            radius: 1.0,
            x: 2.0,
            y: 0.0,
        });
        add_body(
            &mut world,
            body_with(
                Physics2DBodyType::Dynamic,
                10.0,
                5.0,
                Some(PI / 2.0),
                circle,
            ),
        );
        let mut out = create_physics2d_debug_geometry();
        let mut options = nothing();
        options.center_of_mass_radius = Some(0.25);
        options.draw_centers_of_mass = Some(true);

        write_physics2d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.circle_count, 1);
        let marker = out.circles[0];
        assert_eq!(marker.feature, Physics2DDebugFeature::CenterOfMass);
        assert_eq!((marker.radius, marker.x, marker.y), (0.25, 10.0, 7.0));
    }

    #[test]
    fn reuses_its_high_water_primitive_objects_and_exposes_only_entries_below_each_count() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let square = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 1.0,
            max_y: 1.0,
            min_x: -1.0,
            min_y: -1.0,
        });
        let body = add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 0.0, 0.0, None, square),
        );
        update_world_shapes(&body);
        let mut out = create_physics2d_debug_geometry();
        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));
        let first_line = out.lines[0];
        // Lines are plain values in Rust, so object identity becomes slot reuse: the pool keeps its
        // high-water length and the first slot is rewritten in place.
        let pool = out.lines.as_ptr();

        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));
        assert_eq!(out.lines[0], first_line);
        assert!(std::ptr::eq(out.lines.as_ptr(), pool));
        assert_eq!(out.line_count, 4);

        write_physics2d_debug_geometry(&mut out, &world, Some(&nothing()));
        assert_eq!(out.line_count, 0);
        assert_eq!(out.lines.len(), 4);
    }

    #[test]
    fn uses_the_current_body_pose_instead_of_the_narrow_phase_world_shape_snapshot() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            radius: 1.0,
            x: 0.0,
            y: 0.0,
        });
        let body = add_body(
            &mut world,
            body_with(Physics2DBodyType::Dynamic, 0.0, 0.0, None, circle),
        );
        update_world_shapes(&body);
        body.write().unwrap().x = 5.0;
        let mut out = create_physics2d_debug_geometry();

        write_physics2d_debug_geometry(&mut out, &world, Some(&only_colliders()));

        let snapshot = body.read().unwrap().colliders[0]
            .read()
            .unwrap()
            .world
            .clone();
        assert!(
            matches!(snapshot, CollisionShape2D::Circle(CollisionCircle2D { x, .. }) if x == 0.0)
        );
        assert_eq!(out.circles[0].x, 5.0);
    }

    #[test]
    fn writes_live_contact_normals_with_their_body_identities_and_configured_length() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        world.contacts.push(Arc::new(RwLock::new(Physics2DContact {
            body_a: 4,
            body_b: 7,
            collider_a: 0,
            collider_b: 0,
            enabled: true,
            friction: 0.0,
            normal_x: 0.0,
            normal_y: 1.0,
            point_count: 1,
            points: vec![Physics2DContactPoint {
                bias: 0.0,
                depth: 0.1,
                feature_id: 3,
                normal_impulse: 0.0,
                normal_mass: 0.0,
                r_ax: 0.0,
                r_ay: 0.0,
                r_bx: 0.0,
                r_by: 0.0,
                tangent_impulse: 0.0,
                tangent_mass: 0.0,
                x: 2.0,
                y: 3.0,
            }],
            restitution: 0.0,
            sensor: false,
            touching: true,
        })));
        let mut out = create_physics2d_debug_geometry();
        let mut options = nothing();
        options.contact_normal_length = Some(2.0);
        options.draw_contacts = Some(true);

        write_physics2d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 1);
        assert_eq!(
            out.lines[0],
            Physics2DDebugLine {
                body_a: 4,
                body_b: 7,
                feature: Physics2DDebugFeature::ContactNormal,
                x0: 2.0,
                x1: 2.0,
                y0: 3.0,
                y1: 5.0,
            }
        );
    }
}
