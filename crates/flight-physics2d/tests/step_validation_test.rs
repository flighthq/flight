use crate::flight_physics2d_support_test::*;

use std::sync::{Arc, RwLock};

use flight_collision::{CollisionCircle2D, CollisionShape2D};
use flight_entity::Ref;
use flight_physics2d::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn body_world() -> (Ref<RigidBody2D>, Physics2DWorld) {
    let mut world = physics2d_world(None, None, None);
    let body = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
    let circle = CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 1.0,
    });
    body.write()
        .unwrap()
        .colliders
        .push(physics2d_collider(&circle, &STONE, None, None));
    add_physics2d_body(&mut world, &body);
    return (body, world);
}

mod is_physics2d_body_state_valid {
    use super::*;

    // D15: the source also assigns `undefined` to the boolean flags (fixedRotation, bullet,
    // sleepEnabled); a Rust bool cannot hold that, so those three probes are unrepresentable.
    #[test]
    fn accepts_coherent_world_bodies_and_rejects_invalid_numeric_or_lookup_state() {
        let (body, mut world) = body_world();
        assert!(is_physics2d_body_state_valid(&world));
        body.write().unwrap().linear_damping = -1.0;
        assert!(!is_physics2d_body_state_valid(&world));
        body.write().unwrap().linear_damping = 0.0;
        assert!(is_physics2d_body_state_valid(&world));
        let index = body.read().unwrap().index;
        world.body_by_index.remove(&index);
        assert!(!is_physics2d_body_state_valid(&world));
    }
}

mod is_physics2d_contact_state_valid {
    use super::*;

    #[test]
    fn accepts_an_empty_cache_and_rejects_a_non_finite_cached_contact() {
        let mut world = physics2d_world(None, None, None);
        assert!(is_physics2d_contact_state_valid(&world));
        world.contacts.push(Arc::new(RwLock::new(Physics2DContact {
            body_a: 0,
            body_b: 0,
            collider_a: 0,
            collider_b: 0,
            enabled: true,
            friction: 0.0,
            normal_x: f32::NAN,
            normal_y: 0.0,
            point_count: 0,
            points: Vec::new(),
            restitution: 0.0,
            sensor: false,
            touching: false,
        })));
        assert!(!is_physics2d_contact_state_valid(&world));
    }
}

mod is_physics2d_contact_valid {
    use super::*;

    #[test]
    fn accepts_a_finite_contact_and_rejects_an_invalid_hook_authored_coefficient() {
        let mut contact = Physics2DContact {
            body_a: 0,
            body_b: 1,
            collider_a: 0,
            collider_b: 0,
            normal_x: 0.0,
            normal_y: 1.0,
            point_count: 0,
            points: Vec::new(),
            friction: 0.5,
            restitution: 0.0,
            enabled: true,
            sensor: false,
            touching: true,
        };
        assert!(is_physics2d_contact_valid(&contact));
        contact.friction = f32::NAN;
        assert!(!is_physics2d_contact_valid(&contact));
    }
}

mod is_physics2d_gravity_valid {
    use super::*;

    #[test]
    fn requires_finite_world_acceleration() {
        let mut world = physics2d_world(None, None, None);
        assert!(is_physics2d_gravity_valid(&world));
        world.gravity_y = f32::INFINITY;
        assert!(!is_physics2d_gravity_valid(&world));
    }
}

mod is_physics2d_joint_state_valid {
    use super::*;

    #[test]
    fn rejects_a_non_finite_authored_or_accumulated_joint_number() {
        let (body, mut world) = body_world();
        let index = body.read().unwrap().index;
        let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
        let mut options = make();
        options.base.body_a = index;
        options.base.body_b = index;
        let joint: Physics2DJointRef = physics2d_distance_joint(&options);
        joint.write().unwrap().joint_fields_mut().kind = "Unknown".to_string();
        add_physics2d_joint(&mut world, &joint);
        assert!(is_physics2d_joint_state_valid(&world));
        joint.write().unwrap().joint_fields_mut().impulse0 = f32::NAN;
        assert!(!is_physics2d_joint_state_valid(&world));
    }
}

mod is_physics2d_previous_timestep_valid {
    use super::*;

    #[test]
    fn accepts_the_initial_sentinel_and_a_positive_finite_completed_step() {
        let mut world = physics2d_world(None, None, None);
        assert!(is_physics2d_previous_timestep_valid(&world));
        world.previous_timestep = 1.0 / 60.0;
        assert!(is_physics2d_previous_timestep_valid(&world));
        world.previous_timestep = -1.0;
        assert!(!is_physics2d_previous_timestep_valid(&world));
    }
}

mod is_physics2d_solver_config_valid {
    use super::*;

    #[test]
    fn rejects_unsafe_ranges_and_non_finite_solver_coefficients() {
        let mut world = physics2d_world(None, None, None);
        assert!(is_physics2d_solver_config_valid(&world.config));
        world.config.position_correction = 2.0;
        assert!(!is_physics2d_solver_config_valid(&world.config));
        world.config.position_correction = 0.2;
        world.config.penetration_slop = f32::NAN;
        assert!(!is_physics2d_solver_config_valid(&world.config));
        world.config.penetration_slop = 0.005;
        world.config.max_ccd_substeps = -1;
        assert!(!is_physics2d_solver_config_valid(&world.config));
        world.config.max_ccd_substeps = 8;
        world.config.max_ccd_rotation_substeps = -1;
        assert!(!is_physics2d_solver_config_valid(&world.config));
    }
}

mod is_physics2d_timestep_valid {
    use super::*;

    #[test]
    fn accepts_only_positive_finite_intervals() {
        assert!(is_physics2d_timestep_valid(1.0 / 60.0));
        assert!(!is_physics2d_timestep_valid(0.0));
        assert!(!is_physics2d_timestep_valid(f64::NAN));
    }
}
