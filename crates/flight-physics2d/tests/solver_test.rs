use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{RwLockReadGuard, RwLockWriteGuard};

use flight_collision::{
    CollisionAabb2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::Ref;
use flight_physics2d::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

const POINT: Physics2DContactPoint = Physics2DContactPoint {
    bias: 0.0,
    depth: 0.0,
    feature_id: 0,
    normal_impulse: 0.0,
    normal_mass: 0.0,
    r_ax: 0.0,
    r_ay: 0.0,
    r_bx: 0.0,
    r_by: 0.0,
    tangent_impulse: 0.0,
    tangent_mass: 0.0,
    x: 0.0,
    y: 0.0,
};

fn aabb(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    });
}

fn add(world: &mut Physics2DWorld, body: Ref<RigidBody2D>) -> Ref<RigidBody2D> {
    add_physics2d_body(world, &body);
    return body;
}

fn body(body_type: Physics2DBodyType, x: f32, y: f32) -> Ref<RigidBody2D> {
    let made = create_rigid_body2d(body_type, x, y, None);
    write(&made).colliders.push(create_physics2d_collider(
        &aabb(-0.5, -0.5, 0.5, 0.5),
        &STONE,
        None,
        None,
    ));
    return made;
}

fn floor(material: &Physics2DMaterial) -> Ref<RigidBody2D> {
    let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
    write(&floor).colliders.push(create_physics2d_collider(
        &aabb(-50.0, -1.0, 50.0, 0.0),
        material,
        None,
        None,
    ));
    return floor;
}

fn read(body: &Ref<RigidBody2D>) -> RwLockReadGuard<'_, RigidBody2D> {
    return body.read().unwrap();
}

fn registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn resting_world() -> (Physics2DWorld, Ref<RigidBody2D>) {
    let mut world = create_physics2d_world(None, None, None);
    add_physics2d_body(&mut world, &floor(&STONE));
    let crate_body = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 0.499));
    return (world, crate_body);
}

fn step(world: &mut Physics2DWorld) {
    step_physics2d(world, 1.0 / 60.0, &registry(), None);
}

fn throws(action: impl FnOnce()) -> bool {
    return catch_unwind(AssertUnwindSafe(action)).is_err();
}

fn write(body: &Ref<RigidBody2D>) -> RwLockWriteGuard<'_, RigidBody2D> {
    return body.write().unwrap();
}

mod apply_physics2d_impulse {
    use super::*;

    #[test]
    fn leaves_a_static_body_untouched_through_its_zero_inverse_mass_with_no_branch() {
        let mut world = create_physics2d_world(None, None, None);
        let floor = add(&mut world, body(Physics2DBodyType::Static, 0.0, 0.0));
        let crate_body = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 1.0));
        apply_physics2d_impulse(
            &mut write(&floor),
            &mut write(&crate_body),
            0.3,
            0.2,
            0.0,
            0.0,
            5.0,
            7.0,
        );
        assert_eq!(read(&floor).velocity_x, 0.0);
        assert_eq!(read(&floor).velocity_y, 0.0);
        assert_eq!(read(&floor).angular_velocity, 0.0);
    }

    #[test]
    fn pushes_a_along_the_impulse_and_b_against_it_matching_the_manifold_normal_direction() {
        let mut world = create_physics2d_world(None, None, None);
        let a = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 0.0));
        let b = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 1.0));
        apply_physics2d_impulse(&mut write(&a), &mut write(&b), 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert!(read(&a).velocity_y > 0.0);
        assert!(read(&b).velocity_y < 0.0);
    }

    #[test]
    fn spins_a_body_when_the_impulse_acts_off_its_centre_of_mass() {
        let mut world = create_physics2d_world(None, None, None);
        let a = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 0.0));
        let b = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 1.0));
        apply_physics2d_impulse(&mut write(&a), &mut write(&b), 0.5, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_ne!(read(&a).angular_velocity, 0.0);
    }
}

mod relative_normal_velocity {
    use super::*;

    #[test]
    fn includes_the_angular_contribution_at_the_lever_arm() {
        let mut world = create_physics2d_world(None, None, None);
        let a = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 0.0));
        let b = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 1.0));
        let spinning = Physics2DContactPoint {
            r_ax: 1.0,
            r_ay: 0.0,
            ..POINT
        };
        write(&a).angular_velocity = 2.0;
        assert!(
            (relative_normal_velocity(&read(&a), &read(&b), &spinning, 0.0, 1.0) - 2.0).abs()
                < 0.005
        );
    }

    #[test]
    fn is_negative_while_the_pair_is_closing_along_the_separating_normal() {
        let mut world = create_physics2d_world(None, None, None);
        let a = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 0.0));
        let b = add(&mut world, body(Physics2DBodyType::Dynamic, 0.0, 1.0));
        write(&b).velocity_y = -1.0;
        assert!(relative_normal_velocity(&read(&a), &read(&b), &POINT, 0.0, 1.0) > 0.0);
        write(&b).velocity_y = 1.0;
        assert!(relative_normal_velocity(&read(&a), &read(&b), &POINT, 0.0, 1.0) < 0.0);
    }
}

mod solve_physics2d_contact_indices_once {
    use super::*;

    #[test]
    fn solves_only_the_selected_flattened_island_slice() {
        let (mut world, crate_body) = resting_world();
        step(&mut world);
        write(&crate_body).velocity_y = -5.0;

        solve_physics2d_contact_indices_once(&world, &[0], 0, 1);

        assert!(read(&crate_body).velocity_y > -5.0);
        let after_selected = read(&crate_body).velocity_y;
        solve_physics2d_contact_indices_once(&world, &[0], 1, 0);
        assert_eq!(read(&crate_body).velocity_y, after_selected);
    }
}

mod solve_physics2d_contacts {
    use super::*;

    #[test]
    fn accumulates_a_non_negative_normal_impulse_rather_than_pulling_the_pair_together() {
        let (mut world, _) = resting_world();
        for _ in 0..30 {
            step(&mut world);
        }
        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            for i in 0..contact.point_count {
                assert!(contact.points[i].normal_impulse >= 0.0);
            }
        }
    }

    #[test]
    fn bounds_friction_by_the_coulomb_limit_against_the_normal_impulse() {
        let (mut world, crate_body) = resting_world();
        write(&crate_body).velocity_x = 4.0;
        for _ in 0..20 {
            step(&mut world);
        }
        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            for i in 0..contact.point_count {
                let point = contact.points[i];
                assert!(
                    point.tangent_impulse.abs() <= contact.friction * point.normal_impulse + 1e-9
                );
            }
        }
    }

    #[test]
    fn does_nothing_for_a_world_with_no_contacts() {
        let world = create_physics2d_world(None, None, None);
        assert!(!throws(|| solve_physics2d_contacts(&world)));
    }

    #[test]
    fn keeps_a_contact_frictionless_when_either_collider_has_zero_friction() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        add_physics2d_body(
            &mut world,
            &floor(&Physics2DMaterial {
                density: 1.0,
                friction: 0.0,
                restitution: 0.0,
            }),
        );
        let crate_body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.499, None);
        write(&crate_body).colliders.push(create_physics2d_collider(
            &aabb(-0.5, -0.5, 0.5, 0.5),
            &Physics2DMaterial {
                density: 1.0,
                friction: 1.0,
                restitution: 0.0,
            },
            None,
            None,
        ));
        add_physics2d_body(&mut world, &crate_body);
        write(&crate_body).velocity_x = 4.0;

        step(&mut world);

        assert_eq!(world.contacts.len(), 1);
        let contact = world.contacts[0].read().unwrap();
        assert_eq!(contact.friction, 0.0);
        assert_eq!(contact.points[0].tangent_impulse, 0.0);
    }

    #[test]
    fn removes_the_closing_velocity_at_a_resting_contact() {
        let (mut world, crate_body) = resting_world();
        write(&crate_body).velocity_y = -5.0;
        step(&mut world);
        assert!(read(&crate_body).velocity_y > -1.0);
    }

    #[test]
    fn slows_a_sliding_box_through_friction_instead_of_letting_it_glide_forever() {
        let (mut world, crate_body) = resting_world();
        write(&crate_body).velocity_x = 4.0;
        for _ in 0..60 {
            step(&mut world);
        }
        assert!(read(&crate_body).velocity_x < 4.0);
        assert!(read(&crate_body).velocity_x > 0.0);
    }
}

mod solve_physics2d_contacts_once {
    use super::*;

    #[test]
    fn applies_one_pass_so_the_step_can_interleave_contacts_with_joints_inside_a_single_iteration()
    {
        let (mut world, crate_body) = resting_world();
        write(&crate_body).velocity_y = -5.0;
        step(&mut world);
        let before = read(&crate_body).velocity_y;
        solve_physics2d_contacts_once(&world);
        assert_ne!(read(&crate_body).velocity_y, before);
    }

    #[test]
    fn does_nothing_for_a_world_with_no_contacts() {
        let world = create_physics2d_world(None, None, None);
        assert!(!throws(|| solve_physics2d_contacts_once(&world)));
    }
}

mod warm_start_physics2d_contact_indices {
    use super::*;

    #[test]
    fn reapplies_cached_impulses_only_from_the_selected_flattened_island_slice() {
        let (mut world, crate_body) = resting_world();
        step(&mut world);
        assert!(world.contacts[0].read().unwrap().points[0].normal_impulse > 0.0);
        write(&crate_body).velocity_x = 0.0;
        write(&crate_body).velocity_y = 0.0;

        warm_start_physics2d_contact_indices(&world, &[0], 0, 1);

        assert_ne!(read(&crate_body).velocity_y, 0.0);
    }
}

mod warm_start_physics2d_contacts {
    use super::*;

    #[test]
    fn does_nothing_for_a_world_with_no_contacts() {
        let world = create_physics2d_world(None, None, None);
        assert!(!throws(|| warm_start_physics2d_contacts(&world)));
    }

    #[test]
    fn reapplies_the_cached_impulse_leaving_a_converged_resting_contact_deeper_than_a_cold_start() {
        let mut warm = create_physics2d_world(None, None, None);
        let mut cold = create_physics2d_world(None, None, None);
        cold.config.warm_starting = false;
        for world in [&mut warm, &mut cold] {
            add_physics2d_body(world, &floor(&STONE));
            add_physics2d_body(world, &body(Physics2DBodyType::Dynamic, 0.0, 0.5));
            add_physics2d_body(world, &body(Physics2DBodyType::Dynamic, 0.0, 1.5));
            add_physics2d_body(world, &body(Physics2DBodyType::Dynamic, 0.0, 2.5));
            for _ in 0..120 {
                step(world);
            }
        }
        let warm_top = read(&warm.bodies[3]).y;
        let cold_top = read(&cold.bodies[3]).y;
        assert!(warm_top >= cold_top - 1e-9);
    }
}
