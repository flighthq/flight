use crate::flight_physics2d_support_test::*;

use std::collections::HashMap;
use std::sync::{Arc, RwLockReadGuard, RwLockWriteGuard};

use flight_collision::{
    CollisionAabb2D, CollisionCircle2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::Ref;
use flight_physics2d::*;

const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.4,
    restitution: 0.0,
};

fn aabb(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    });
}

fn add_box(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    half: f32,
) -> Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, None);
    write(&body).colliders.push(physics2d_collider(
        &aabb(-half, -half, half, half),
        &MATERIAL,
        None,
        None,
    ));
    add_physics2d_body(world, &body);
    return body;
}

fn add_circle(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    radius: f64,
) -> Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, None);
    write(&body).colliders.push(physics2d_collider(
        &CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius,
        }),
        &MATERIAL,
        None,
        None,
    ));
    add_physics2d_body(world, &body);
    return body;
}

fn add_distance_joint(world: &mut Physics2DWorld, body_a: i32, body_b: i32, length: f32) {
    let joint: Physics2DJointRef = physics2d_distance_joint(&Physics2DDistanceJointOptions {
        base: Physics2DJointOptions {
            body_a,
            body_b,
            break_force: None,
            break_torque: None,
            collide_connected: None,
            local_anchor_ax: None,
            local_anchor_ay: None,
            local_anchor_bx: None,
            local_anchor_by: None,
        },
        damping_ratio: None,
        frequency_hz: None,
        length,
    });
    add_physics2d_joint(world, &joint);
}

fn add_static(world: &mut Physics2DWorld, shape: CollisionShape2D) {
    let body = rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
    write(&body)
        .colliders
        .push(physics2d_collider(&shape, &MATERIAL, None, None));
    add_physics2d_body(world, &body);
}

fn assert_finite_body(body: &Ref<RigidBody2D>) {
    let body = read(body);
    let values = [
        body.x,
        body.y,
        body.angle,
        body.velocity_x,
        body.velocity_y,
        body.angular_velocity,
        body.mass,
        body.inertia,
    ];
    assert!(values.iter().all(|value| value.is_finite()));
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return read(body).index;
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

fn run(world: &mut Physics2DWorld, steps: usize) {
    let registry = registry();
    for _ in 0..steps {
        step_physics2d(world, 1.0 / 60.0, &registry, None);
    }
}

fn snapshot_world(world: &Physics2DWorld) -> Vec<Vec<f64>> {
    return world
        .bodies
        .iter()
        .map(|body| {
            let body = read(body);
            return vec![
                body.index as f64,
                body.x as f64,
                body.y as f64,
                body.angle as f64,
                body.velocity_x as f64,
                body.velocity_y as f64,
                body.angular_velocity as f64,
                if body.sleeping { 1.0 } else { 0.0 },
                body.sleep_timer,
            ];
        })
        .collect();
}

// Map identity is observed as retained storage (capacity); Vec identity as the buffer pointer.
fn workspace(world: &Physics2DWorld) -> (Vec<usize>, Vec<*const usize>, *const i32) {
    return (
        vec![
            world.island_parents.capacity(),
            world.island_sleep_timers.capacity(),
            world.solve_island_by_root.capacity(),
        ],
        vec![
            world.solve_island_body_starts.as_ptr(),
            world.solve_island_body_counts.as_ptr(),
            world.solve_island_contact_starts.as_ptr(),
            world.solve_island_contact_counts.as_ptr(),
            world.solve_island_joint_starts.as_ptr(),
            world.solve_island_joint_counts.as_ptr(),
            world.solve_island_body_indices.as_ptr(),
            world.solve_island_contact_indices.as_ptr(),
            world.solve_island_joint_indices.as_ptr(),
            world.solve_island_cursors.as_ptr(),
        ],
        world.solve_island_roots.as_ptr(),
    );
}

fn write(body: &Ref<RigidBody2D>) -> RwLockWriteGuard<'_, RigidBody2D> {
    return body.write().unwrap();
}

mod physics2d_stress_qualification {
    use super::*;

    #[test]
    fn keeps_a_driven_distance_joint_chain_bounded_over_thousands_of_constraint_solves() {
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        register_physics2d_joint_solver(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND.to_string(),
            PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
        );
        let mut links = vec![add_circle(
            &mut world,
            Physics2DBodyType::Static,
            0.0,
            8.0,
            0.2,
        )];
        for i in 1..=14 {
            let link = add_circle(
                &mut world,
                Physics2DBodyType::Dynamic,
                0.0,
                8.0 - i as f32,
                0.2,
            );
            let previous = index_of(&links[i - 1]);
            add_distance_joint(&mut world, previous, index_of(&link), 1.0);
            links.push(link);
        }
        write(links.last().unwrap()).velocity_x = 4.0;

        run(&mut world, 1200);

        for body in &links {
            assert_finite_body(body);
        }
        for i in 1..links.len() {
            let dx = read(&links[i]).x - read(&links[i - 1]).x;
            let dy = read(&links[i]).y - read(&links[i - 1]).y;
            assert!((dx.hypot(dy) - 1.0).abs() < 0.05);
        }
        assert!(read(links.last().unwrap()).x.abs() < 15.0);
    }

    #[test]
    fn keeps_a_tall_pile_finite_ordered_and_supported_over_a_long_settle_horizon() {
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        add_static(&mut world, aabb(-20.0, -1.0, 20.0, 0.0));
        add_static(&mut world, aabb(-1.0, 0.0, -0.51, 20.0));
        add_static(&mut world, aabb(0.51, 0.0, 1.0, 20.0));
        let mut pile = Vec::new();
        for i in 0..16 {
            pile.push(add_box(
                &mut world,
                Physics2DBodyType::Dynamic,
                0.0,
                0.5 + i as f32,
                0.5,
            ));
        }

        run(&mut world, 900);

        for body in &pile {
            assert_finite_body(body);
        }
        for i in 1..pile.len() {
            assert!(read(&pile[i]).y > read(&pile[i - 1]).y);
        }
        assert!(read(&pile[0]).y > 0.4);
        assert!(read(pile.last().unwrap()).y > 13.5);
        assert!(pile.iter().all(|body| read(body).sleeping));
    }

    #[test]
    fn produces_an_exact_repeat_trace_for_a_mixed_pile_joint_sleep_and_bullet_scene() {
        fn scene() -> Physics2DWorld {
            let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
            register_physics2d_joint_solver(
                &mut world,
                PHYSICS2D_DISTANCE_JOINT_KIND.to_string(),
                PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
            );
            add_static(&mut world, aabb(-10.0, -1.0, 10.0, 0.0));
            let first = add_box(&mut world, Physics2DBodyType::Dynamic, -1.0, 0.5, 0.5);
            let second = add_box(&mut world, Physics2DBodyType::Dynamic, -1.0, 1.5, 0.5);
            add_distance_joint(&mut world, index_of(&first), index_of(&second), 1.0);
            add_box(&mut world, Physics2DBodyType::Dynamic, 2.0, 0.5, 0.5);
            let bullet = add_circle(&mut world, Physics2DBodyType::Dynamic, -8.0, 3.0, 0.25);
            {
                let mut bullet = write(&bullet);
                bullet.bullet = true;
                bullet.gravity_scale = 0.0;
                bullet.velocity_x = 90.0;
            }
            add_box(&mut world, Physics2DBodyType::Static, 0.0, 3.0, 0.25);
            return world;
        }

        let mut first = scene();
        let mut second = scene();
        let registry = registry();
        for _ in 0..480 {
            step_physics2d(&mut first, 1.0 / 60.0, &registry, None);
            step_physics2d(&mut second, 1.0 / 60.0, &registry, None);
        }

        assert_eq!(snapshot_world(&first), snapshot_world(&second));
    }

    #[test]
    fn retains_stable_topology_contacts_and_every_world_owned_island_workspace_object() {
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        add_static(&mut world, aabb(-5.0, -1.0, 5.0, 0.0));
        add_box(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.5, 0.5);
        run(&mut world, 240);
        assert_eq!(world.contacts.len(), 1);
        let contact = world.contacts[0].clone();
        let points = contact.read().unwrap().points.as_ptr();
        let retained = workspace(&world);

        run(&mut world, 600);

        assert!(Arc::ptr_eq(&world.contacts[0], &contact));
        assert_eq!(world.contacts[0].read().unwrap().points.as_ptr(), points);
        assert_eq!(workspace(&world), retained);
    }
}
