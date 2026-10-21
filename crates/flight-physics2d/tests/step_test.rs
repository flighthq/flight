use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, LazyLock, Mutex, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionPoint2D, CollisionPolygon2D,
    CollisionRegistry2D, CollisionSegment2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{FlightError, Ref, throw_error};
use flight_physics2d::contract::*;
use flight_spatial::{
    SpatialAabb2D, SpatialIndexBackend2D, create_uniform_grid_spatial_backend_2d,
};

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

const DT60: f32 = 1.0 / 60.0;

static REGISTRY: LazyLock<CollisionRegistry2D> = LazyLock::new(|| {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
});

// A custom joint kind the tests author outside the crate, as the TS `entityJoint` helper does.
struct TestJoint {
    fields: Physics2DJointFields,
    motor_impulse: f32,
}

flight_physics2d::impl_physics2d_joint!(TestJoint, [motor_impulse]);

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

fn assert_close(actual: f32, expected: f32, digits: i32) {
    let tolerance = 10f32.powi(-digits) / 2.0;
    assert!(
        (actual - expected).abs() < tolerance,
        "expected {actual} to be close to {expected} ({digits} digits)"
    );
}

// An f32 tolerance in place of a TS `toBeCloseTo(_, 12)` the f32 integrator cannot meet; every call
// site states the error measured against the TS expectation.
fn assert_close_within(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {actual} to be within {tolerance} of {expected}"
    );
}

fn base_fields(kind: &str, body_a: i32, body_b: i32) -> Physics2DJointFields {
    let make: fn() -> Physics2DJointFields = Physics2DJointFields::default;
    let mut fields = make();
    fields.kind = kind.to_string();
    fields.body_a = body_a;
    fields.body_b = body_b;
    return fields;
}

fn box_at(world: &mut Physics2DWorld, x: f32, y: f32) -> Ref<RigidBody2D> {
    return box_with_half(world, x, y, 0.5);
}

fn box_with_half(world: &mut Physics2DWorld, x: f32, y: f32, half: f32) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(Physics2DBodyType::Dynamic, x, y, None);
    body.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(
            &aabb(-half, -half, half, half),
            &STONE,
            None,
            None,
        ));
    return add(world, body);
}

fn circle(x: f64, y: f64, radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D { x, y, radius });
}

fn create_reversed_pair_backend() -> SpatialIndexBackend2D {
    let inner = create_uniform_grid_spatial_backend_2d(1.0);
    let query = inner.query_spatial_pairs.clone();
    let mut out = inner;
    out.query_spatial_pairs = Arc::new(move |pairs| {
        query(pairs);
        pairs.reverse();
    });
    return out;
}

fn create_swapped_pair_backend() -> SpatialIndexBackend2D {
    let inner = create_uniform_grid_spatial_backend_2d(1.0);
    let query = inner.query_spatial_pairs.clone();
    let mut out = inner;
    out.query_spatial_pairs = Arc::new(move |pairs| {
        query(pairs);
        for pair in pairs.iter_mut() {
            let a = pair.a;
            pair.a = pair.b;
            pair.b = a;
        }
    });
    return out;
}

fn distance_joint(body_a: i32, body_b: i32, length: f32) -> Arc<RwLock<Physics2DDistanceJoint>> {
    let make: fn() -> Physics2DDistanceJoint = Physics2DDistanceJoint::default;
    let mut joint = make();
    *joint.joint_fields_mut() = base_fields(PHYSICS2D_DISTANCE_JOINT_KIND, body_a, body_b);
    joint.length = length;
    joint.frequency_hz = 0.0;
    joint.damping_ratio = 0.0;
    return Arc::new(RwLock::new(joint));
}

fn ground(world: &mut Physics2DWorld) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
    body.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(
            &aabb(-50.0, -1.0, 50.0, 0.0),
            &STONE,
            None,
            None,
        ));
    return add(world, body);
}

fn panic_message(run: impl FnOnce()) -> Option<String> {
    let result = catch_unwind(AssertUnwindSafe(run));
    let payload = result.err()?;
    if let Some(error) = payload.downcast_ref::<FlightError>() {
        return Some(error.message.clone());
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return Some(message.clone());
    }
    if let Some(message) = payload.downcast_ref::<&str>() {
        return Some(message.to_string());
    }
    return Some(String::new());
}

fn run_steps(world: &mut Physics2DWorld, count: usize) {
    for _ in 0..count {
        step(world, DT60);
    }
}

fn same_joint(a: &Physics2DJointRef, b: &Physics2DJointRef) -> bool {
    return std::ptr::eq(Arc::as_ptr(a) as *const (), Arc::as_ptr(b) as *const ());
}

fn solver(prepare: Physics2DJointPrepare, solve: Physics2DJointSolve) -> Physics2DJointSolver {
    return Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake: None,
        prepare,
        scale_accumulated_impulses: None,
        solve,
        swap_ends: None,
        uses_body_a: None,
        warm_start: None,
        write_reaction: None,
    };
}

fn step(world: &mut Physics2DWorld, dt: f32) {
    step_physics2d(world, dt, &REGISTRY, None);
}

fn step_guarded(world: &mut Physics2DWorld, dt: f32, guards: &Physics2DGuardState) {
    step_physics2d(world, dt, &REGISTRY, Some(guards));
}

fn test_joint(kind: &str, body_a: i32, body_b: i32) -> Physics2DJointRef {
    return Arc::new(RwLock::new(TestJoint {
        fields: base_fields(kind, body_a, body_b),
        motor_impulse: 0.0,
    }));
}

fn to_joint_ref<T: Physics2DJoint>(joint: &Arc<RwLock<T>>) -> Physics2DJointRef {
    return joint.clone();
}

// A hash of every body's full state, which is what a determinism claim has to be made against.
fn trace_world(world: &Physics2DWorld) -> String {
    let mut bodies: Vec<Ref<RigidBody2D>> = world.bodies.clone();
    bodies.sort_by_key(|body| body.read().unwrap().index);
    return bodies
        .iter()
        .map(|body| {
            let b = body.read().unwrap();
            format!(
                "{}:{}:{}:{}:{}:{}:{}",
                b.index, b.x, b.y, b.angle, b.velocity_x, b.velocity_y, b.angular_velocity
            )
        })
        .collect::<Vec<_>>()
        .join("|");
}

fn new_guards() -> Physics2DGuardState {
    let make: fn() -> Physics2DGuardState = Physics2DGuardState::default;
    return make();
}

mod a_body_the_step_declines_leaves_the_broadphase {
    use super::*;

    fn dynamic_box(world: &mut Physics2DWorld, x: f32) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, x, 0.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                None,
                None,
            ));
        return add(world, body);
    }

    fn region_ids(world: &Physics2DWorld) -> Vec<i32> {
        let mut out = Vec::new();
        (world.index.query_spatial_region)(
            &mut out,
            &SpatialAabb2D {
                min_x: -1.0,
                min_y: -1.0,
                max_x: 1.0,
                max_y: 1.0,
            },
        );
        return out;
    }

    fn set_local(body: &Ref<RigidBody2D>, min: f32, max: f32) {
        let collider = body.read().unwrap().colliders[0].clone();
        collider.write().unwrap().local = aabb(min, min, max, max);
    }

    fn widen_past_limit(body: &Ref<RigidBody2D>) {
        set_local(body, -1e8, 1e8);
    }

    #[test]
    fn drops_the_contact_of_a_body_that_diverges_past_the_simulated_extent() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let diverging = dynamic_box(&mut world, 0.0);
        dynamic_box(&mut world, 0.5);
        step(&mut world, DT60);
        assert_eq!(world.contacts.len(), 1);

        widen_past_limit(&diverging);
        step(&mut world, DT60);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn leaves_the_rest_of_the_world_simulating_after_one_body_diverges() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let diverging = dynamic_box(&mut world, 0.0);
        let near = dynamic_box(&mut world, 0.5);
        let other = dynamic_box(&mut world, 20.0);
        let also_other = dynamic_box(&mut world, 20.5);
        step(&mut world, DT60);
        widen_past_limit(&diverging);
        step(&mut world, DT60);

        let names: Vec<String> = world
            .contacts
            .iter()
            .map(|c| {
                let c = c.read().unwrap();
                format!("{}-{}", c.body_a, c.body_b)
            })
            .collect();
        assert_eq!(
            names,
            vec![format!(
                "{}-{}",
                other.read().unwrap().index,
                also_other.read().unwrap().index
            )]
        );
        assert!(near.read().unwrap().x > 0.5);
        assert!(near.read().unwrap().x.is_finite());
    }

    #[test]
    fn withdraws_a_body_whose_colliders_stop_producing_bounds_from_the_index() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let emptied = dynamic_box(&mut world, 0.0);
        dynamic_box(&mut world, 0.5);
        step(&mut world, DT60);

        let emptied_index = emptied.read().unwrap().index;
        assert!(region_ids(&world).contains(&emptied_index));

        emptied.write().unwrap().colliders.clear();
        step(&mut world, DT60);

        assert!(!region_ids(&world).contains(&emptied_index));
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn withdraws_a_diverged_body_from_the_index_not_merely_from_the_update() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let diverging = dynamic_box(&mut world, 0.0);
        dynamic_box(&mut world, 0.5);
        step(&mut world, DT60);

        widen_past_limit(&diverging);
        step(&mut world, DT60);

        assert!(!region_ids(&world).contains(&diverging.read().unwrap().index));
    }

    #[test]
    fn re_enters_the_broadphase_when_the_body_comes_back_inside_the_limit() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let diverging = dynamic_box(&mut world, 0.0);
        dynamic_box(&mut world, 0.5);
        step(&mut world, DT60);
        widen_past_limit(&diverging);
        step(&mut world, DT60);
        assert_eq!(world.contacts.len(), 0);

        set_local(&diverging, -0.5, 0.5);
        step(&mut world, DT60);
        assert_eq!(world.contacts.len(), 1);
    }
}

mod bullet_continuous_collision_detection {
    use super::*;

    fn wall(
        world: &mut Physics2DWorld,
        min_x: f32,
        max_x: f32,
        restitution: f32,
        sensor: bool,
    ) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(min_x, -10.0, max_x, 10.0),
                &Physics2DMaterial {
                    density: 1.0,
                    friction: 0.0,
                    restitution,
                },
                Some(sensor),
                None,
            ));
        return add(world, body);
    }

    fn projectile(
        world: &mut Physics2DWorld,
        speed: f32,
        restitution: f32,
        bullet: bool,
    ) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        {
            let mut b = body.write().unwrap();
            b.bullet = bullet;
            b.velocity_x = speed;
            b.colliders.push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.5),
                &Physics2DMaterial {
                    density: 1.0,
                    friction: 0.0,
                    restitution,
                },
                None,
                None,
            ));
        }
        return add(world, body);
    }

    #[test]
    fn stops_a_bullet_at_a_thin_wall_that_the_discrete_path_tunnels_through() {
        let mut continuous = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut continuous, 5.0, 5.1, 0.0, false);
        let bullet = projectile(&mut continuous, 100.0, 0.0, true);
        step(&mut continuous, 0.1);
        assert_close(bullet.read().unwrap().x, 4.5, 2);
        assert_close(bullet.read().unwrap().velocity_x, 0.0, 2);

        let mut discrete = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut discrete, 5.0, 5.1, 0.0, false);
        let ordinary = projectile(&mut discrete, 100.0, 0.0, false);
        step(&mut discrete, 0.1);
        assert_close(ordinary.read().unwrap().x, 10.0, 2);
    }

    #[test]
    fn applies_restitution_at_impact_and_advances_through_the_remaining_time() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut world, 5.0, 5.1, 1.0, false);
        let bullet = projectile(&mut world, 100.0, 1.0, true);

        step(&mut world, 0.1);

        assert_close(bullet.read().unwrap().velocity_x, -100.0, 2);
        assert_close(bullet.read().unwrap().x, -1.0, 2);
    }

    #[test]
    fn resolves_multiple_impacts_chronologically_within_the_configured_bound() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut world, -5.1, -5.0, 1.0, false);
        wall(&mut world, 5.0, 5.1, 1.0, false);
        let bullet = projectile(&mut world, 100.0, 1.0, true);

        step(&mut world, 0.2);

        let b = bullet.read().unwrap();
        assert!(b.x >= -4.5);
        assert!(b.x <= 4.5);
        assert_close(b.velocity_x.abs(), 100.0, 2);
    }

    #[test]
    fn uses_relative_motion_transfers_impulse_and_wakes_a_sleeping_dynamic_target() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let bullet = projectile(&mut world, 100.0, 0.0, true);
        let target = create_rigid_body2d(Physics2DBodyType::Dynamic, 6.0, 0.0, None);
        {
            let mut t = target.write().unwrap();
            t.sleeping = true;
            t.sleep_timer = 5.0;
            t.colliders.push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.5),
                &Physics2DMaterial {
                    density: 1.0,
                    friction: 0.0,
                    restitution: 0.0,
                },
                None,
                None,
            ));
        }
        add_physics2d_body(&mut world, &target);

        step(&mut world, 0.1);

        let (t, b) = (target.read().unwrap(), bullet.read().unwrap());
        assert!(!t.sleeping);
        assert!(t.velocity_x > 0.0);
        assert!(b.x < t.x);
        assert_close(t.x - b.x, 1.0, 2);
    }

    #[test]
    fn honours_the_world_switch_and_ignores_sensor_only_crossings() {
        let mut disabled = create_physics2d_world(Some(0.0), Some(0.0), None);
        disabled.config.continuous_collision = false;
        wall(&mut disabled, 5.0, 5.1, 0.0, false);
        let unchecked = projectile(&mut disabled, 100.0, 0.0, true);
        step(&mut disabled, 0.1);
        assert_close(unchecked.read().unwrap().x, 10.0, 2);

        let mut sensor_world = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut sensor_world, 5.0, 5.1, 0.0, true);
        let sensor_bullet = projectile(&mut sensor_world, 100.0, 0.0, true);
        step(&mut sensor_world, 0.1);
        assert_close(sensor_bullet.read().unwrap().x, 10.0, 2);
    }

    #[test]
    fn publishes_swept_impacts_through_contact_lifecycle_and_solve_hooks() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut world, 5.0, 5.1, 0.0, false);
        let bullet = projectile(&mut world, 100.0, 0.0, true);
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let pre_order = order.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_world, contact| {
            pre_order.lock().unwrap().push("pre");
            assert_close(contact.points[0].x, 5.0, 2);
        }));
        let post_order = order.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_world, contact| {
            post_order.lock().unwrap().push("post");
            assert!(contact.points[0].normal_impulse > 0.0);
        }));

        step(&mut world, 0.1);

        assert_eq!(*order.lock().unwrap(), vec!["pre", "post"]);
        assert_eq!(world.events.began.len(), 1);
        assert!(Arc::ptr_eq(&world.events.began[0], &world.contacts[0]));
        assert_eq!(world.events.ended.len(), 0);
        assert_close(bullet.read().unwrap().x, 4.5, 2);

        world.contact_hooks.pre_solve = None;
        world.contact_hooks.post_solve = None;
        step(&mut world, 0.1);
        assert_eq!(world.events.ended.len(), 0);
    }

    #[test]
    fn catches_a_thin_bullet_rotating_through_an_obstacle_between_matching_endpoint_poses() {
        let slick = Physics2DMaterial {
            friction: 0.0,
            ..STONE
        };
        let mut continuous = create_physics2d_world(Some(0.0), Some(0.0), None);
        let obstacle = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 1.5, None);
        obstacle
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.15),
                &slick,
                None,
                None,
            ));
        add_physics2d_body(&mut continuous, &obstacle);
        let rod = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        {
            let mut r = rod.write().unwrap();
            r.bullet = true;
            r.angular_velocity = std::f32::consts::PI / 0.1;
            r.colliders.push(create_physics2d_collider(
                &aabb(-2.0, -0.025, 2.0, 0.025),
                &slick,
                None,
                None,
            ));
        }
        add_physics2d_body(&mut continuous, &rod);

        step(&mut continuous, 0.1);

        assert_eq!(continuous.events.began.len(), 1);
        assert_eq!(continuous.contacts.len(), 1);
        assert!(rod.read().unwrap().angular_velocity.abs() < std::f32::consts::PI / 0.1);

        let mut discrete = create_physics2d_world(Some(0.0), Some(0.0), None);
        let discrete_obstacle = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 1.5, None);
        discrete_obstacle
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.15),
                &slick,
                None,
                None,
            ));
        add_physics2d_body(&mut discrete, &discrete_obstacle);
        let unchecked = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        {
            let mut u = unchecked.write().unwrap();
            u.angular_velocity = std::f32::consts::PI / 0.1;
            u.colliders.push(create_physics2d_collider(
                &aabb(-2.0, -0.025, 2.0, 0.025),
                &slick,
                None,
                None,
            ));
        }
        add_physics2d_body(&mut discrete, &unchecked);

        step(&mut discrete, 0.1);

        assert_eq!(discrete.contacts.len(), 0);
        assert_close(unchecked.read().unwrap().angle, std::f32::consts::PI, 2);
    }

    #[test]
    fn lets_pre_solve_disable_a_swept_impact_without_consuming_the_ccd_budget_at_zero_time() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        wall(&mut world, 5.0, 5.1, 0.0, false);
        let bullet = projectile(&mut world, 100.0, 0.0, true);
        let calls = Arc::new(AtomicUsize::new(0));
        let hook_calls = calls.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_world, contact| {
            hook_calls.fetch_add(1, Ordering::SeqCst);
            contact.enabled = false;
        }));

        step(&mut world, 0.1);

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_close(bullet.read().unwrap().x, 10.0, 2);
        assert_eq!(world.contacts.len(), 1);
        assert!(!world.contacts[0].read().unwrap().enabled);
    }
}

mod centre_of_mass_integration {
    use super::*;

    fn centre_of_mass_x(body: &Ref<RigidBody2D>) -> f32 {
        let b = body.read().unwrap();
        return b.x + b.center_x * b.angle.cos() - b.center_y * b.angle.sin();
    }

    fn centre_of_mass_y(body: &Ref<RigidBody2D>) -> f32 {
        let b = body.read().unwrap();
        return b.y + b.center_x * b.angle.sin() + b.center_y * b.angle.cos();
    }

    fn off_centre_body(
        world: &mut Physics2DWorld,
        offset_x: f64,
        offset_y: f64,
    ) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(offset_x, offset_y, 0.25),
                &STONE,
                None,
                None,
            ));
        return add(world, body);
    }

    #[test]
    fn leaves_the_centre_of_mass_exactly_where_it_was_when_a_free_body_only_spins() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let body = off_centre_body(&mut world, 1.0, 0.0);
        assert_eq!(
            [body.read().unwrap().center_x, body.read().unwrap().center_y],
            [1.0, 0.0]
        );
        body.write().unwrap().angular_velocity = 1.0;

        for _ in 0..50 {
            step(&mut world, 0.1);
        }

        // f32: measured 1.19e-7 from 1 (TS f64 meets 12 digits).
        assert_close_within(centre_of_mass_x(&body), 1.0, 1e-6);
        assert_close(centre_of_mass_y(&body), 0.0, 12);
        let b = body.read().unwrap();
        // f32: fifty f32 additions of 0.1 measured 4.9999976 (error 2.38e-6).
        assert_close_within(b.angle, 5.0, 1e-5);
        // f32: measured 0.71633995 vs 0.7163378 (error 2.15e-6), carried from the angle error.
        assert_close_within(b.x, 1.0 - 5f32.cos(), 1e-5);
        // f32: measured 0.95892495 vs 0.9589243 (error 6.56e-7), carried from the angle error.
        assert_close_within(b.y, -5f32.sin(), 1e-5);
    }

    #[test]
    fn drops_an_off_centre_spinning_body_along_the_same_path_as_a_centred_one() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        let spinning = off_centre_body(&mut world, 0.75, -0.5);
        spinning.write().unwrap().angular_velocity = 7.0;
        let centred = off_centre_body(&mut world, 0.0, 0.0);

        let start_x = centre_of_mass_x(&spinning);
        let start_y = centre_of_mass_y(&spinning);
        for _ in 0..60 {
            step(&mut world, DT60);
        }

        // f32: measured 7.15e-7 from the centred body's 0 (TS f64 meets 12 digits).
        assert_close_within(
            centre_of_mass_x(&spinning) - start_x,
            centred.read().unwrap().x,
            1e-5,
        );
        assert_close(
            centre_of_mass_y(&spinning) - start_y,
            centred.read().unwrap().y,
            12,
        );
    }

    #[test]
    fn translates_an_off_centre_body_by_exactly_its_velocity_when_it_is_not_rotating() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let body = off_centre_body(&mut world, 2.0, -3.0);
        body.write().unwrap().velocity_x = 5.0;
        body.write().unwrap().velocity_y = -2.0;

        step(&mut world, 0.25);

        let b = body.read().unwrap();
        assert_close(b.x, 1.25, 12);
        assert_close(b.y, -0.5, 12);
        assert_eq!(b.angle, 0.0);
    }

    #[test]
    fn translates_a_fixed_rotation_off_centre_body_without_swinging_its_origin() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let body = off_centre_body(&mut world, 1.5, 0.5);
        {
            let mut b = body.write().unwrap();
            b.fixed_rotation = true;
            b.angular_velocity = 3.0;
            b.velocity_x = 4.0;
        }

        step(&mut world, 0.5);

        let b = body.read().unwrap();
        assert_eq!(b.angle, 0.0);
        assert_close(b.x, 2.0, 12);
        assert_close(b.y, 0.0, 12);
    }

    #[test]
    fn never_moves_the_centre_of_mass_sideways_when_every_force_on_it_points_straight_up() {
        let slick = Physics2DMaterial {
            density: 1.0,
            friction: 0.0,
            restitution: 0.0,
        };
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        floor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-50.0, -1.0, 50.0, 0.0),
                &slick,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &floor);

        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.5, None);
        {
            let mut b = body.write().unwrap();
            b.angle = 0.3;
            b.colliders.push(create_physics2d_collider(
                &CollisionShape2D::Polygon(CollisionPolygon2D {
                    points: vec![-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5],
                }),
                &slick,
                None,
                None,
            ));
            b.colliders.push(create_physics2d_collider(
                &aabb(3.0, 3.0, 4.0, 4.0),
                &slick,
                None,
                None,
            ));
        }
        add_physics2d_body(&mut world, &body);

        let start_x = centre_of_mass_x(&body);
        for _ in 0..8 {
            step(&mut world, DT60);
            assert_eq!(centre_of_mass_x(&body), start_x);
        }
        assert!(body.read().unwrap().angle < 0.29);
    }

    #[test]
    fn conserves_the_centre_of_mass_of_an_off_centre_body_resting_on_the_ground() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        ground(&mut world);
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 1.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(1.5, -0.5, 2.5, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &body);
        assert_close(body.read().unwrap().center_x, 2.0, 12);

        for _ in 0..400 {
            step(&mut world, DT60);
        }

        assert!(centre_of_mass_y(&body) > 0.4);
        assert!(centre_of_mass_y(&body) < 0.6);
        assert!((centre_of_mass_x(&body) - 2.0).abs() < 0.05);
        assert!(body.read().unwrap().angle.abs() < 0.05);
    }
}

mod collision_filtering {
    use super::*;

    fn filtered_box(
        world: &mut Physics2DWorld,
        body_type: Physics2DBodyType,
        category_bits: u32,
        mask_bits: u32,
        group_index: i32,
    ) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(body_type, 0.0, 0.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                Some(false),
                Some(&Physics2DCollisionFilter {
                    category_bits,
                    mask_bits,
                    group_index,
                }),
            ));
        return add(world, body);
    }

    #[test]
    fn requires_each_collider_mask_to_include_the_other_collider_category() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        filtered_box(&mut world, Physics2DBodyType::Static, 0x0001, 0x0002, 0);
        filtered_box(&mut world, Physics2DBodyType::Dynamic, 0x0002, 0x0004, 0);

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn creates_a_contact_when_both_category_and_mask_tests_pass() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        filtered_box(&mut world, Physics2DBodyType::Static, 0x0001, 0x0002, 0);
        filtered_box(&mut world, Physics2DBodyType::Dynamic, 0x0002, 0x0001, 0);

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 1);
    }

    #[test]
    fn forces_a_matching_positive_group_to_collide_regardless_of_masks() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        filtered_box(&mut world, Physics2DBodyType::Static, 0x0001, 0, 7);
        filtered_box(&mut world, Physics2DBodyType::Dynamic, 0x0002, 0, 7);

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 1);
    }

    #[test]
    fn prevents_a_matching_negative_group_from_colliding_regardless_of_masks() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        filtered_box(
            &mut world,
            Physics2DBodyType::Static,
            0x0001,
            0xffff_ffff,
            -7,
        );
        filtered_box(
            &mut world,
            Physics2DBodyType::Dynamic,
            0x0002,
            0xffff_ffff,
            -7,
        );

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 0);
    }
}

mod contact_solve_hooks {
    use super::*;

    #[test]
    fn calls_pre_solve_before_post_solve_exactly_once_per_solved_contact() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 0.4);
        crate_body.write().unwrap().velocity_y = -1.0;
        let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let pre_order = order.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_world, contact| {
            pre_order.lock().unwrap().push("pre");
            contact.friction = 0.0;
        }));
        let post_order = order.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_world, contact| {
            post_order.lock().unwrap().push("post");
            assert!(
                contact.points[..contact.point_count]
                    .iter()
                    .any(|point| point.normal_impulse > 0.0)
            );
        }));

        step(&mut world, DT60);

        assert_eq!(*order.lock().unwrap(), vec!["pre", "post"]);
    }

    #[test]
    fn lets_pre_solve_disable_resolution_for_one_step_and_resets_enabled_on_the_next() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 0.4);
        let post_solve_calls = Arc::new(AtomicUsize::new(0));
        world.contact_hooks.pre_solve = Some(Arc::new(|_world, contact| {
            contact.enabled = false;
        }));
        let hook_calls = post_solve_calls.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_world, _contact| {
            hook_calls.fetch_add(1, Ordering::SeqCst);
        }));

        step(&mut world, DT60);

        assert_eq!(crate_body.read().unwrap().y, 0.4);
        assert!(!world.contacts[0].read().unwrap().enabled);
        assert_eq!(post_solve_calls.load(Ordering::SeqCst), 0);
        for point in &world.contacts[0].read().unwrap().points {
            assert_eq!(point.normal_impulse, 0.0);
            assert_eq!(point.tangent_impulse, 0.0);
        }

        world.contact_hooks.pre_solve = None;
        step(&mut world, DT60);

        assert!(world.contacts[0].read().unwrap().enabled);
        assert!(crate_body.read().unwrap().y > 0.4);
        assert_eq!(post_solve_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn does_not_invoke_solve_hooks_for_sensor_contacts() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let trigger = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        trigger
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-1.0, -1.0, 1.0, 1.0),
                &STONE,
                Some(true),
                None,
            ));
        add_physics2d_body(&mut world, &trigger);
        box_at(&mut world, 0.0, 0.0);
        let calls = Arc::new(AtomicUsize::new(0));
        let pre_calls = calls.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_world, _contact| {
            pre_calls.fetch_add(1, Ordering::SeqCst);
        }));
        let post_calls = calls.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_world, _contact| {
            post_calls.fetch_add(1, Ordering::SeqCst);
        }));

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 1);
        assert!(world.contacts[0].read().unwrap().sensor);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    // D15: the TS hook re-enters `stepPhysics2D(currentWorld)`. A Rust hook receives the world as
    // `&Physics2DWorld` while the step holds it `&mut`, so re-entry is rejected at compile time and the
    // recursion message is unreachable from a hook. The representable half — the stepping boundary
    // is released after a hook fails, and the failed step commits no timestep — is asserted here with a
    // hook that throws instead.
    #[test]
    fn rejects_recursive_stepping_and_releases_the_guard_after_the_callback_fails() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        box_at(&mut world, 0.0, 0.4);
        world.contact_hooks.pre_solve = Some(Arc::new(|_world, _contact| {
            throw_error("callback failed");
        }));

        let message = panic_message(|| step(&mut world, DT60));
        assert_eq!(message.as_deref(), Some("callback failed"));
        assert_eq!(world.previous_timestep, 0.0);

        world.contact_hooks.pre_solve = None;
        assert!(panic_message(|| step(&mut world, DT60)).is_none());
        assert_eq!(world.previous_timestep, DT60);
    }

    // D15: the TS hook calls `addPhysics2DBody(currentWorld, pending)`. A Rust hook holds the world as
    // `&Physics2DWorld`, so topology mutation from a hook does not compile; what stays representable is
    // that a failing hook leaves the pending body unadded, and that it can be added once the step is over.
    #[test]
    fn rejects_topology_mutation_before_a_hook_can_partially_add_an_entity() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        box_at(&mut world, 0.0, 0.4);
        let pending = create_rigid_body2d(Physics2DBodyType::Dynamic, 10.0, 10.0, None);
        world.contact_hooks.pre_solve = Some(Arc::new(|_world, _contact| {
            throw_error("callback failed");
        }));

        assert!(panic_message(|| step(&mut world, DT60)).is_some());
        assert_eq!(pending.read().unwrap().index, -1);
        assert_eq!(world.bodies.len(), 2);

        world.contact_hooks.pre_solve = None;
        add_physics2d_body(&mut world, &pending);
        assert!(world.bodies.iter().any(|body| Arc::ptr_eq(body, &pending)));
    }

    #[test]
    fn rejects_body_actions_from_hooks_instead_of_applying_them_at_a_phase_dependent_time() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 0.4);
        let hooked = crate_body.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_world, _contact| {
            // The body guard is released before the panic resumes so the handle is not poisoned.
            let result = {
                let mut body = hooked.write().unwrap();
                catch_unwind(AssertUnwindSafe(|| {
                    apply_physics2d_force(&mut body, 10.0, 0.0)
                }))
            };
            if let Err(payload) = result {
                resume_unwind(payload);
            }
        }));

        let message = panic_message(|| step(&mut world, DT60));
        assert!(message.is_some_and(|message| message.contains("while it is stepping")));
        assert_eq!(crate_body.read().unwrap().force_x, 0.0);

        world.contact_hooks.post_solve = None;
        assert!(apply_physics2d_force(
            &mut crate_body.write().unwrap(),
            10.0,
            0.0
        ));
    }

    #[test]
    fn rejects_invalid_pre_and_post_solve_output_before_it_can_poison_a_later_step() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        box_at(&mut world, 0.0, 0.4).write().unwrap().velocity_y = -1.0;
        world.contact_hooks.pre_solve = Some(Arc::new(|_world, contact| {
            contact.friction = f32::NAN;
        }));

        let message = panic_message(|| step(&mut world, DT60));
        assert!(message.is_some_and(|message| message.contains("pre-solve hook produced invalid")));
        assert_close(
            world.contacts[0].read().unwrap().friction,
            STONE.friction,
            2,
        );
        world.contact_hooks.pre_solve = None;
        world.contact_hooks.post_solve = Some(Arc::new(|_world, contact| {
            contact.restitution = f32::INFINITY;
        }));

        let message = panic_message(|| step(&mut world, DT60));
        assert!(
            message.is_some_and(|message| message.contains("post-solve hook produced invalid"))
        );
        assert_eq!(
            world.contacts[0].read().unwrap().restitution,
            STONE.restitution
        );
        world.contact_hooks.post_solve = None;
        assert!(panic_message(|| step(&mut world, DT60)).is_none());
    }

    #[test]
    fn does_not_scale_a_warm_cache_until_pre_solve_completes_successfully() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.allow_sleeping = false;
        world.config.velocity_iterations = 0;
        world.config.position_iterations = 0;
        ground(&mut world);
        box_at(&mut world, 0.0, 0.49);
        step(&mut world, DT60);
        world.contacts[0].write().unwrap().points[0].normal_impulse = 3.0;
        world.contact_hooks.pre_solve = Some(Arc::new(|_world, _contact| {
            throw_error("stop");
        }));

        let message = panic_message(|| step(&mut world, 1.0 / 30.0));
        assert_eq!(message.as_deref(), Some("stop"));
        assert_eq!(
            world.contacts[0].read().unwrap().points[0].normal_impulse,
            3.0
        );
        assert_eq!(world.previous_timestep, DT60);

        world.contact_hooks.pre_solve = None;
        step(&mut world, 1.0 / 30.0);
        assert_eq!(
            world.contacts[0].read().unwrap().points[0].normal_impulse,
            6.0
        );
    }

    #[test]
    fn commits_integration_and_cleanup_before_reporting_a_post_solve_exception() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 0.4);
        crate_body.write().unwrap().velocity_x = 1.0;
        crate_body.write().unwrap().force_x = 2.0;
        world.contact_hooks.post_solve = Some(Arc::new(|_world, _contact| {
            throw_error("observer failed");
        }));

        let message = panic_message(|| step(&mut world, DT60));
        assert_eq!(message.as_deref(), Some("observer failed"));
        assert!(crate_body.read().unwrap().x > 0.0);
        assert_eq!(crate_body.read().unwrap().force_x, 0.0);
        assert_eq!(world.previous_timestep, DT60);

        world.contact_hooks.post_solve = None;
        assert!(panic_message(|| step(&mut world, DT60)).is_none());
    }
}

mod sensor_reporting_between_immovable_bodies {
    use super::*;

    fn immovable(world: &mut Physics2DWorld, x: f32, sensor: bool) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Static, x, 0.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                Some(sensor),
                None,
            ));
        return add(world, body);
    }

    fn immovable_with_sensor_and_solid(world: &mut Physics2DWorld, x: f32) -> Ref<RigidBody2D> {
        let body = create_rigid_body2d(Physics2DBodyType::Static, x, 0.0, None);
        {
            let mut b = body.write().unwrap();
            b.colliders.push(create_physics2d_collider(
                &aabb(99.5, -0.5, 100.5, 0.5),
                &STONE,
                Some(true),
                None,
            ));
            b.colliders.push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                Some(false),
                None,
            ));
        }
        return add(world, body);
    }

    #[test]
    fn reports_a_static_sensor_overlapping_a_static_collider() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        immovable(&mut world, 0.0, true);
        immovable(&mut world, 0.0, false);
        step(&mut world, DT60);
        assert_eq!(world.events.began.len(), 1);
        assert_eq!(world.contacts.len(), 1);
        assert!(world.contacts[0].read().unwrap().sensor);
    }

    #[test]
    fn still_skips_two_immovable_bodies_when_neither_senses() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        immovable(&mut world, 0.0, false);
        immovable(&mut world, 0.0, false);
        step(&mut world, DT60);
        assert_eq!(world.events.began.len(), 0);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn reports_nothing_when_the_overlapping_colliders_are_both_solid_and_both_bodies_are_immovable()
    {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        immovable_with_sensor_and_solid(&mut world, 0.0);
        immovable(&mut world, 0.0, false);

        step(&mut world, DT60);

        assert_eq!(world.events.began.len(), 0);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn still_reports_the_sensor_collider_of_a_mixed_body_when_that_collider_overlaps() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        immovable_with_sensor_and_solid(&mut world, 0.0);
        immovable(&mut world, 100.0, false);

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 1);
        assert!(world.contacts[0].read().unwrap().sensor);
    }

    #[test]
    fn keeps_a_solid_contact_when_one_body_can_move() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        immovable_with_sensor_and_solid(&mut world, 0.0);
        box_at(&mut world, 0.0, 0.0);

        step(&mut world, DT60);

        assert!(
            world
                .contacts
                .iter()
                .any(|contact| !contact.read().unwrap().sensor)
        );
    }

    #[test]
    fn resolves_nothing_for_a_static_sensor_pair_reporting_is_not_colliding() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let sensor = immovable(&mut world, 0.0, true);
        let scenery = immovable(&mut world, 0.0, false);
        step(&mut world, DT60);
        assert_eq!(sensor.read().unwrap().x, 0.0);
        assert_eq!(scenery.read().unwrap().x, 0.0);
        assert_eq!(sensor.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn ends_a_static_sensor_contact_when_the_overlap_stops() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let sensor = immovable(&mut world, 0.0, true);
        immovable(&mut world, 0.0, false);
        step(&mut world, DT60);
        assert_eq!(world.events.began.len(), 1);
        sensor.write().unwrap().x = 100.0;
        step(&mut world, DT60);
        assert_eq!(world.events.ended.len(), 1);
        assert_eq!(world.contacts.len(), 0);
    }
}

mod set_physics2d_contact_intake_guard {
    use super::*;

    #[test]
    fn consults_the_seam_once_per_step_that_will_actually_run_and_not_on_one_that_declines() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let calls = Arc::new(AtomicUsize::new(0));
        let mut guards = new_guards();
        let guard_calls = calls.clone();
        set_physics2d_contact_intake_guard(
            &mut guards,
            Some(Arc::new(move |_world| {
                guard_calls.fetch_add(1, Ordering::SeqCst);
            })),
        );

        step_guarded(&mut world, DT60, &guards);
        step_guarded(&mut world, DT60, &guards);
        assert_eq!(calls.load(Ordering::SeqCst), 2);

        world.config.velocity_iterations = -1;
        step_guarded(&mut world, DT60, &guards);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn removes_the_seam_when_passed_null() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let calls = Arc::new(AtomicUsize::new(0));
        let mut guards = new_guards();
        let guard_calls = calls.clone();
        set_physics2d_contact_intake_guard(
            &mut guards,
            Some(Arc::new(move |_world| {
                guard_calls.fetch_add(1, Ordering::SeqCst);
            })),
        );
        set_physics2d_contact_intake_guard(&mut guards, None);

        step_guarded(&mut world, DT60, &guards);

        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod set_physics2d_joint_resolution_guard {
    use super::*;

    fn counting_guards(calls: &Arc<AtomicUsize>) -> Physics2DGuardState {
        let mut guards = new_guards();
        let guard_calls = calls.clone();
        set_physics2d_joint_resolution_guard(
            &mut guards,
            Some(Arc::new(move |_world| {
                guard_calls.fetch_add(1, Ordering::SeqCst);
            })),
        );
        return guards;
    }

    fn unregistered_joint(world: &Physics2DWorld) -> Physics2DJointRef {
        let index = world.bodies[0].read().unwrap().index;
        return test_joint("acme.Unregistered", index, index);
    }

    #[test]
    fn consults_the_seam_once_per_step_that_will_actually_run() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let calls = Arc::new(AtomicUsize::new(0));
        let guards = counting_guards(&calls);

        step_guarded(&mut world, DT60, &guards);
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        let joint = unregistered_joint(&world);
        add_physics2d_joint(&mut world, &joint);
        step_guarded(&mut world, DT60, &guards);
        step_guarded(&mut world, DT60, &guards);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn leaves_the_joint_seam_alone_on_a_step_that_declines_its_preconditions() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let joint = unregistered_joint(&world);
        add_physics2d_joint(&mut world, &joint);
        world.config.velocity_iterations = -1;
        let calls = Arc::new(AtomicUsize::new(0));
        let guards = counting_guards(&calls);

        step_guarded(&mut world, DT60, &guards);

        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn removes_the_seam_when_passed_null() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let joint = unregistered_joint(&world);
        add_physics2d_joint(&mut world, &joint);
        let calls = Arc::new(AtomicUsize::new(0));
        let mut guards = counting_guards(&calls);
        set_physics2d_joint_resolution_guard(&mut guards, None);

        step_guarded(&mut world, DT60, &guards);

        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod set_physics2d_step_guard {
    use super::*;

    #[test]
    fn consults_the_seam_with_the_rejected_timestep_only_when_the_step_declines() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        box_at(&mut world, 0.0, 0.0);
        let seen: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let mut guards = new_guards();
        let guard_seen = seen.clone();
        set_physics2d_step_guard(
            &mut guards,
            Some(Arc::new(move |_world, dt| {
                guard_seen.lock().unwrap().push(dt);
            })),
        );

        step_guarded(&mut world, DT60, &guards);
        assert!(seen.lock().unwrap().is_empty());

        step_guarded(&mut world, f32::NAN, &guards);
        assert_eq!(seen.lock().unwrap().len(), 1);
        assert!(seen.lock().unwrap()[0].is_nan());
    }

    #[test]
    fn removes_the_seam_when_passed_null() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        let calls = Arc::new(AtomicUsize::new(0));
        let mut guards = new_guards();
        let guard_calls = calls.clone();
        set_physics2d_step_guard(
            &mut guards,
            Some(Arc::new(move |_world, _dt| {
                guard_calls.fetch_add(1, Ordering::SeqCst);
            })),
        );
        set_physics2d_step_guard(&mut guards, None);

        step_guarded(&mut world, -1.0, &guards);

        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod step_physics2d {
    use super::*;

    #[test]
    fn keeps_step_scratch_isolated_when_a_broadphase_callback_steps_another_world() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.continuous_collision = false;
        let fixed = ground(&mut world);
        let dynamic = box_at(&mut world, 0.0, 0.4);
        let mut nested = create_physics2d_world(Some(0.0), Some(0.0), None);
        nested.config.continuous_collision = false;
        let nested_world = Arc::new(Mutex::new(nested));
        let nested_calls = Arc::new(AtomicUsize::new(0));
        let (fixed_index, dynamic_index) =
            (fixed.read().unwrap().index, dynamic.read().unwrap().index);
        let (callback_world, callback_calls) = (nested_world.clone(), nested_calls.clone());
        world.index.query_spatial_pairs = Arc::new(move |out| {
            out.clear();
            out.push(flight_spatial::SpatialPair {
                a: fixed_index,
                b: dynamic_index,
            });
            if callback_calls.load(Ordering::SeqCst) == 0 {
                callback_calls.fetch_add(1, Ordering::SeqCst);
                step(&mut callback_world.lock().unwrap(), DT60);
            }
        });

        step(&mut world, DT60);

        assert_eq!(nested_calls.load(Ordering::SeqCst), 1);
        assert_eq!(world.contacts.len(), 1);
    }

    #[test]
    fn rejects_invalid_solver_state_before_mutating_the_world() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        crate_body.write().unwrap().velocity_x = 3.0;
        crate_body.write().unwrap().force_y = 4.0;
        world.config.position_correction = f32::NAN;

        step(&mut world, DT60);

        let c = crate_body.read().unwrap();
        assert_eq!(c.x, 0.0);
        assert_eq!(c.y, 2.0);
        assert_eq!(c.velocity_x, 3.0);
        assert_eq!(c.force_y, 4.0);
        assert_eq!(world.contacts.len(), 0);
        assert_eq!(world.previous_timestep, 0.0);
    }

    #[test]
    fn scales_cached_contact_impulses_into_a_changed_timestep() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.allow_sleeping = false;
        world.config.velocity_iterations = 0;
        world.config.position_iterations = 0;
        ground(&mut world);
        box_at(&mut world, 0.0, 0.49);
        step(&mut world, DT60);
        {
            let mut contact = world.contacts[0].write().unwrap();
            contact.points[0].normal_impulse = 3.0;
            contact.points[0].tangent_impulse = 4.0;
        }

        step(&mut world, 1.0 / 30.0);

        let contact = world.contacts[0].read().unwrap();
        assert_eq!(contact.points[0].normal_impulse, 6.0);
        assert_eq!(contact.points[0].tangent_impulse, 8.0);
        assert_eq!(world.previous_timestep, 1.0 / 30.0);
    }

    #[test]
    fn rests_a_box_on_the_ground_instead_of_sinking_through_it() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 180);

        let c = crate_body.read().unwrap();
        assert!(c.y > 0.48);
        assert!(c.y < 0.52);
        assert!(c.velocity_y.abs() < 0.05);
    }

    #[test]
    fn keeps_a_stack_standing_rather_than_letting_the_lower_boxes_be_compressed_through_each_other()
    {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let bottom = box_at(&mut world, 0.0, 0.5);
        let middle = box_at(&mut world, 0.0, 1.5);
        let top = box_at(&mut world, 0.0, 2.5);
        run_steps(&mut world, 240);

        let (bottom, middle, top) = (
            bottom.read().unwrap().y,
            middle.read().unwrap().y,
            top.read().unwrap().y,
        );
        assert!(bottom > 0.45);
        assert!(middle > 1.4);
        assert!(top > 2.35);
        assert!(middle - bottom > 0.9);
        assert!(top - middle > 0.9);
    }

    #[test]
    fn uses_position_iterations_to_project_overlap_without_adding_separating_velocity() {
        let mut without_projection = create_physics2d_world(Some(0.0), Some(0.0), None);
        without_projection.config.position_iterations = 0;
        let fixed_without = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        fixed_without
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut without_projection, &fixed_without);
        let body_without = box_at(&mut without_projection, 0.75, 0.0);

        let mut with_projection = create_physics2d_world(Some(0.0), Some(0.0), None);
        with_projection.config.position_iterations = 3;
        let fixed_with = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        fixed_with
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut with_projection, &fixed_with);
        let body_with = box_at(&mut with_projection, 0.75, 0.0);

        step(&mut without_projection, DT60);
        step(&mut with_projection, DT60);

        assert_eq!(
            body_without.read().unwrap().x - fixed_without.read().unwrap().x,
            0.75
        );
        assert!(body_with.read().unwrap().x - fixed_with.read().unwrap().x > 0.84);
        assert_eq!(body_with.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn clears_contact_accumulators_when_warm_starting_is_switched_off() {
        let mut world = create_physics2d_world(None, None, None);
        world.config.allow_sleeping = false;
        ground(&mut world);
        box_at(&mut world, 0.0, 0.5);
        run_steps(&mut world, 60);
        assert!(world.contacts[0].read().unwrap().points[0].normal_impulse > 0.0);

        world.config.warm_starting = false;
        world.config.velocity_iterations = 0;
        world.config.position_iterations = 0;
        step(&mut world, DT60);

        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            for i in 0..contact.point_count {
                assert_eq!(contact.points[i].normal_impulse, 0.0);
                assert_eq!(contact.points[i].tangent_impulse, 0.0);
            }
        }
    }

    #[test]
    fn produces_a_bitwise_identical_trace_for_the_same_scene_stepped_twice() {
        let mut first = create_physics2d_world(None, None, None);
        ground(&mut first);
        box_at(&mut first, 0.1, 2.0);
        box_at(&mut first, -0.3, 3.2);
        run_steps(&mut first, 120);

        let mut second = create_physics2d_world(None, None, None);
        ground(&mut second);
        box_at(&mut second, 0.1, 2.0);
        box_at(&mut second, -0.3, 3.2);
        run_steps(&mut second, 120);

        assert_eq!(trace_world(&second), trace_world(&first));
    }

    #[test]
    fn produces_the_same_trace_when_the_broadphase_reports_its_pairs_in_the_opposite_order() {
        let mut plain = create_physics2d_world(None, None, None);
        ground(&mut plain);
        let plain_left = box_at(&mut plain, -0.9, 0.5);
        let plain_right = box_at(&mut plain, 0.9, 0.5);
        let plain_top = box_at(&mut plain, 0.0, 1.6);

        let mut reversed =
            create_physics2d_world(Some(0.0), Some(-9.81), Some(create_reversed_pair_backend()));
        ground(&mut reversed);
        let reversed_left = box_at(&mut reversed, -0.9, 0.5);
        let reversed_right = box_at(&mut reversed, 0.9, 0.5);
        let reversed_top = box_at(&mut reversed, 0.0, 1.6);

        run_steps(&mut plain, 90);
        run_steps(&mut reversed, 90);

        assert_eq!(trace_world(&reversed), trace_world(&plain));
        assert_eq!(
            reversed_left.read().unwrap().y,
            plain_left.read().unwrap().y
        );
        assert_eq!(
            reversed_right.read().unwrap().y,
            plain_right.read().unwrap().y
        );
        assert_eq!(reversed_top.read().unwrap().y, plain_top.read().unwrap().y);
    }

    #[test]
    fn orders_every_contact_pair_by_body_index_however_the_broadphase_hands_it_over() {
        let mut swapped =
            create_physics2d_world(Some(0.0), Some(-9.81), Some(create_swapped_pair_backend()));
        ground(&mut swapped);
        let crate_body = box_at(&mut swapped, 0.2, 1.4);
        run_steps(&mut swapped, 120);

        for contact in &swapped.contacts {
            let contact = contact.read().unwrap();
            assert!(contact.body_a < contact.body_b);
        }

        let mut plain = create_physics2d_world(None, None, None);
        ground(&mut plain);
        let plain_crate = box_at(&mut plain, 0.2, 1.4);
        run_steps(&mut plain, 120);

        let (c, p) = (crate_body.read().unwrap(), plain_crate.read().unwrap());
        assert_eq!(c.y, p.y);
        assert_eq!(c.x, p.x);
        assert_eq!(c.angle, p.angle);
    }

    #[test]
    fn keeps_the_contact_list_in_a_canonical_order_after_a_step() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        box_at(&mut world, -0.9, 0.5);
        box_at(&mut world, 0.9, 0.5);
        box_at(&mut world, 0.0, 1.6);
        run_steps(&mut world, 60);

        assert!(world.contacts.len() > 1);
        for i in 1..world.contacts.len() {
            let previous = world.contacts[i - 1].read().unwrap();
            let current = world.contacts[i].read().unwrap();
            let ordered = previous.body_a < current.body_a
                || (previous.body_a == current.body_a
                    && (previous.body_b < current.body_b
                        || (previous.body_b == current.body_b
                            && previous.collider_a <= current.collider_a)));
            assert!(ordered);
        }
    }

    #[test]
    fn tips_a_box_that_overhangs_a_ledge_instead_of_sliding_off_level() {
        let mut world = create_physics2d_world(None, None, None);
        let ledge = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        ledge
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-5.0, -1.0, 0.0, 0.0),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &ledge);
        let crate_body = box_at(&mut world, 0.2, 0.5);
        run_steps(&mut world, 120);

        assert!(crate_body.read().unwrap().angle.abs() > 0.05);
    }

    #[test]
    fn leaves_a_sensor_collider_overlapping_without_pushing_anything_out_of_it() {
        let mut world = create_physics2d_world(None, None, None);
        let trigger = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        trigger
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-2.0, -2.0, 2.0, 2.0),
                &STONE,
                Some(true),
                None,
            ));
        add_physics2d_body(&mut world, &trigger);
        let crate_body = box_at(&mut world, 0.0, 0.0);
        run_steps(&mut world, 30);

        assert!(
            world
                .contacts
                .iter()
                .any(|contact| contact.read().unwrap().sensor)
        );
        assert!(crate_body.read().unwrap().velocity_y < -0.1);
    }

    #[test]
    fn rejects_a_non_positive_or_non_finite_timestep_before_mutating_the_world() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        let before = trace_world(&world);
        for dt in [0.0, -1.0 / 60.0, f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            step(&mut world, dt);
            assert_eq!(trace_world(&world), before);
        }
        assert_eq!(crate_body.read().unwrap().y, 2.0);
    }

    // D15: the TS table also feeds `Infinity` and `1.5`; the Rust iteration counts are `i32`, so
    // only the negative value is representable.
    #[test]
    fn rejects_invalid_iteration_values_before_mutating_the_world() {
        for velocity in [true, false] {
            let mut world = create_physics2d_world(None, None, None);
            ground(&mut world);
            box_at(&mut world, 0.0, 2.0);
            let before = trace_world(&world);
            if velocity {
                world.config.velocity_iterations = -1;
            } else {
                world.config.position_iterations = -1;
            }

            step(&mut world, DT60);

            assert_eq!(trace_world(&world), before);
            assert_eq!(world.contacts.len(), 0);
        }
    }
}

mod step_physics2d_contact_cache_identity {
    use super::*;

    #[test]
    fn preserves_every_cached_point_impulse_when_manifold_feature_order_changes() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.position_iterations = 0;
        world.config.velocity_iterations = 0;
        box_at(&mut world, 0.0, 0.0);
        box_at(&mut world, 0.0, 0.75);
        step(&mut world, DT60);
        let contact = world.contacts[0].clone();
        let mut expected: Vec<(i64, f32, f32)> = Vec::new();
        {
            let mut c = contact.write().unwrap();
            assert_eq!(c.point_count, 2);
            for i in 0..c.point_count {
                let point = &mut c.points[i];
                point.normal_impulse = (i + 1) as f32;
                point.tangent_impulse = -((i + 1) as f32);
                expected.push((
                    point.feature_id,
                    point.normal_impulse,
                    point.tangent_impulse,
                ));
            }
            c.points.reverse();
        }

        step(&mut world, DT60);

        let c = contact.read().unwrap();
        for i in 0..c.point_count {
            let point = c.points[i];
            let cached = expected.iter().find(|entry| entry.0 == point.feature_id);
            assert!(cached.is_some());
            let cached = cached.unwrap();
            assert_eq!(point.normal_impulse, cached.1);
            assert_eq!(point.tangent_impulse, cached.2);
        }
    }
}

mod step_physics2d_contact_events {
    use super::*;

    #[test]
    fn reports_a_contact_beginning_and_ending_read_off_the_cache_transitions() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 3.0);
        run_steps(&mut world, 1);
        assert_eq!(world.events.began.len(), 0);

        let mut began = 0;
        let mut i = 0;
        while i < 200 && began == 0 {
            step(&mut world, DT60);
            began += world.events.began.len();
            i += 1;
        }
        assert_eq!(began, 1);

        crate_body.write().unwrap().y = 50.0;
        crate_body.write().unwrap().velocity_y = 0.0;
        step(&mut world, DT60);
        assert_eq!(world.events.ended.len(), 1);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn clears_its_event_buffers_each_step_rather_than_accumulating() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        box_at(&mut world, 0.0, 0.4);
        run_steps(&mut world, 5);
        assert_eq!(world.events.began.len(), 0);
        assert_eq!(world.events.ended.len(), 0);
    }

    #[test]
    fn reports_begin_and_end_events_for_a_point_sensor_without_inventing_a_manifold() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let trigger = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        trigger
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
                &STONE,
                Some(true),
                None,
            ));
        add_physics2d_body(&mut world, &trigger);
        let target = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        target
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &target);

        step(&mut world, DT60);

        assert_eq!(world.events.began.len(), 1);
        {
            let contact = world.contacts[0].read().unwrap();
            assert_eq!(contact.point_count, 0);
            assert!(contact.sensor);
            assert!(contact.touching);
        }

        target.write().unwrap().x = 2.0;
        step(&mut world, DT60);

        assert_eq!(world.events.ended.len(), 1);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn reports_a_segment_overlap_when_the_area_bearing_collider_is_the_sensor() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let segment = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        segment
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &CollisionShape2D::Segment(CollisionSegment2D {
                    x0: -2.0,
                    y0: 0.0,
                    x1: 2.0,
                    y1: 0.0,
                }),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &segment);
        let trigger = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        trigger
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.5),
                &STONE,
                Some(true),
                None,
            ));
        add_physics2d_body(&mut world, &trigger);

        step(&mut world, DT60);

        assert_eq!(world.events.began.len(), 1);
        let contact = world.contacts[0].read().unwrap();
        assert_eq!(contact.point_count, 0);
        assert!(contact.sensor);
        assert!(contact.touching);
    }
}

mod step_physics2d_with_breakable_joints {
    use super::*;

    const GRAVITY: f32 = -10.0;
    const DT: f32 = 1.0 / 240.0;

    struct Hanging {
        bob: Ref<RigidBody2D>,
        joint: Arc<RwLock<Physics2DDistanceJoint>>,
        joint_ref: Physics2DJointRef,
        weight: f32,
        world: Physics2DWorld,
    }

    fn hanging_world(break_force: f32) -> Hanging {
        let mut world = create_physics2d_world(Some(0.0), Some(GRAVITY), None);
        register_physics2d_joint_solver(
            &mut world,
            "Distance".to_string(),
            PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
        );
        let anchor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        anchor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.1),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &anchor);
        let bob = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, -2.0, None);
        bob.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.4),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &bob);
        let joint = distance_joint(anchor.read().unwrap().index, bob.read().unwrap().index, 2.0);
        joint.write().unwrap().break_force = break_force;
        let joint_ref = to_joint_ref(&joint);
        add_physics2d_joint(&mut world, &joint_ref);
        let weight = bob.read().unwrap().mass * -GRAVITY;
        return Hanging {
            bob,
            joint,
            joint_ref,
            weight,
            world,
        };
    }

    #[test]
    fn holds_a_load_under_its_threshold_indefinitely() {
        let Hanging {
            mut world,
            joint,
            weight,
            ..
        } = hanging_world(0.0);
        joint.write().unwrap().break_force = weight * 2.0;

        for _ in 0..600 {
            step(&mut world, DT);
        }

        assert_eq!(world.joints.len(), 1);
        assert_eq!(world.joint_events.broke.len(), 0);
    }

    #[test]
    fn breaks_a_joint_whose_load_exceeds_its_threshold_and_removes_it_from_the_world() {
        let Hanging {
            mut world,
            bob,
            joint,
            joint_ref,
            weight,
        } = hanging_world(0.0);
        joint.write().unwrap().break_force = weight / 2.0;

        step(&mut world, DT);

        assert_eq!(world.joints.len(), 0);
        assert_eq!(world.joint_events.broke.len(), 1);
        assert!(same_joint(&world.joint_events.broke[0].joint, &joint_ref));
        assert!(world.joint_events.broke[0].force_y > weight / 2.0);

        let before = bob.read().unwrap().y;
        for _ in 0..60 {
            step(&mut world, DT);
        }
        assert!(bob.read().unwrap().y < before - 0.01);
    }

    #[test]
    fn never_breaks_a_joint_whose_thresholds_are_both_infinite_which_is_the_default() {
        let Hanging {
            mut world, joint, ..
        } = hanging_world(f32::INFINITY);
        assert_eq!(joint.read().unwrap().break_force, f32::INFINITY);

        for _ in 0..600 {
            step(&mut world, DT);
        }

        assert_eq!(world.joints.len(), 1);
    }

    #[test]
    fn breaks_on_torque_alone_independently_of_the_force_threshold() {
        let mut world = create_physics2d_world(Some(0.0), Some(GRAVITY), None);
        register_physics2d_joint_solver(
            &mut world,
            "Weld".to_string(),
            PHYSICS2D_WELD_JOINT_SOLVER.clone(),
        );
        let post = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        post.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(0.0, 0.0, 0.1),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &post);
        let arm = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        arm.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &circle(1.5, 0.0, 0.4),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &arm);
        let moment = arm.read().unwrap().mass * -GRAVITY * 1.5;
        let make: fn() -> Physics2DWeldJoint = Physics2DWeldJoint::default;
        let mut weld = make();
        *weld.joint_fields_mut() = base_fields(
            PHYSICS2D_WELD_JOINT_KIND,
            post.read().unwrap().index,
            arm.read().unwrap().index,
        );
        weld.break_torque = moment / 2.0;
        weld.reference_angle = 0.0;
        let joint: Physics2DJointRef = Arc::new(RwLock::new(weld));
        add_physics2d_joint(&mut world, &joint);

        let mut step_count = 0;
        while step_count < 240 && world.joint_events.broke.is_empty() {
            step(&mut world, DT);
            step_count += 1;
        }

        assert_eq!(world.joint_events.broke.len(), 1);
        assert!(world.joint_events.broke[0].torque.abs() > moment / 2.0);
        assert_eq!(
            world.joint_events.broke[0]
                .joint
                .read()
                .unwrap()
                .joint_fields()
                .break_force,
            f32::INFINITY
        );
    }

    #[test]
    fn clears_the_broken_list_at_the_start_of_each_step_so_it_names_only_this_step() {
        let Hanging {
            mut world,
            weight,
            joint,
            ..
        } = hanging_world(0.0);
        joint.write().unwrap().break_force = weight / 2.0;

        step(&mut world, DT);
        assert_eq!(world.joint_events.broke.len(), 1);

        step(&mut world, DT);
        assert_eq!(world.joint_events.broke.len(), 0);
    }

    #[test]
    fn lets_a_caller_re_add_a_broken_joint_because_breaking_only_removes_it() {
        let Hanging {
            mut world,
            joint,
            joint_ref,
            weight,
            ..
        } = hanging_world(0.0);
        joint.write().unwrap().break_force = weight / 2.0;
        step(&mut world, DT);
        assert_eq!(world.joints.len(), 0);

        joint.write().unwrap().break_force = f32::INFINITY;
        add_physics2d_joint(&mut world, &joint_ref);
        for _ in 0..60 {
            step(&mut world, DT);
        }

        assert_eq!(world.joints.len(), 1);
    }
}

mod step_physics2d_with_capsule_colliders {
    use super::*;

    fn capsule(x0: f32, x1: f32, radius: f32) -> CollisionShape2D {
        return CollisionShape2D::Capsule(CollisionCapsule2D {
            x0,
            y0: 0.0,
            x1,
            y1: 0.0,
            radius,
        });
    }

    #[test]
    fn settles_a_horizontal_capsule_flat_on_the_ground_without_rocking_and_lets_it_sleep() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        floor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-20.0, -1.0, 20.0, 0.0),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &floor);
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 2.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &capsule(-1.0, 1.0, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &body);

        let mut worst_angle_after_settling: f32 = 0.0;
        for step_index in 0..900 {
            step(&mut world, 1.0 / 240.0);
            if step_index > 500 {
                worst_angle_after_settling =
                    worst_angle_after_settling.max(body.read().unwrap().angle.abs());
            }
        }

        assert_close(body.read().unwrap().y, 0.5, 2);
        assert!(worst_angle_after_settling < 1e-6);
        assert!(body.read().unwrap().sleeping);
    }

    #[test]
    fn stops_a_capsule_bullet_at_a_thin_wall_instead_of_tunnelling_through_it() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.continuous_collision = true;
        let wall = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        wall.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(9.9, -5.0, 10.0, 5.0),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &wall);
        let bullet = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        {
            let mut b = bullet.write().unwrap();
            b.bullet = true;
            b.colliders.push(create_physics2d_collider(
                &capsule(-0.2, 0.2, 0.1),
                &STONE,
                None,
                None,
            ));
        }
        add_physics2d_body(&mut world, &bullet);
        bullet.write().unwrap().velocity_x = 600.0;

        for _ in 0..10 {
            step(&mut world, DT60);
        }

        assert!(bullet.read().unwrap().x < 10.0);
    }

    #[test]
    fn rolls_a_capsule_down_a_slope_rather_than_sticking_on_a_corner() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        let slope = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        {
            let mut s = slope.write().unwrap();
            s.angle = -0.3;
            s.colliders.push(create_physics2d_collider(
                &aabb(-20.0, -1.0, 20.0, 0.0),
                &STONE,
                None,
                None,
            ));
        }
        add_physics2d_body(&mut world, &slope);
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, -2.0, 2.0, None);
        body.write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &capsule(-0.4, 0.4, 0.3),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &body);

        for _ in 0..600 {
            step(&mut world, 1.0 / 240.0);
        }

        let b = body.read().unwrap();
        assert!(b.x.is_finite());
        assert!(b.x > -2.0);
        assert!(b.y > -2.0);
    }

    #[test]
    fn stacks_a_capsule_on_a_capsule_without_either_falling_through() {
        let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        floor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-20.0, -1.0, 20.0, 0.0),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &floor);
        let lower = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 1.0, None);
        lower
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &capsule(-1.0, 1.0, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &lower);
        let upper = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 2.5, None);
        upper
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &capsule(-1.0, 1.0, 0.5),
                &STONE,
                None,
                None,
            ));
        add_physics2d_body(&mut world, &upper);

        for _ in 0..1200 {
            step(&mut world, 1.0 / 240.0);
        }

        let (lower, upper) = (lower.read().unwrap().y, upper.read().unwrap().y);
        assert_close(lower, 0.5, 1);
        assert_close(upper, 1.5, 1);
        assert!(upper > lower + 0.9);
    }
}

mod step_physics2d_with_joints {
    use super::*;

    struct Jointed {
        world: Physics2DWorld,
    }

    fn jointed_world(index: Option<SpatialIndexBackend2D>) -> Jointed {
        let mut world = create_physics2d_world(Some(0.0), Some(-9.81), index);
        register_physics2d_joint_solver(
            &mut world,
            "Distance".to_string(),
            PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
        );
        ground(&mut world);
        let anchor_body = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 4.0, None);
        anchor_body
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(
                &aabb(-0.5, -0.5, 0.5, 0.5),
                &STONE,
                None,
                None,
            ));
        let anchor = add(&mut world, anchor_body);
        let left = box_at(&mut world, -1.0, 2.0);
        let right = box_at(&mut world, 1.0, 2.0);
        for bob in [&left, &right] {
            let joint =
                distance_joint(anchor.read().unwrap().index, bob.read().unwrap().index, 2.0);
            add_physics2d_joint(&mut world, &to_joint_ref(&joint));
        }
        return Jointed { world };
    }

    #[test]
    fn scales_common_and_kind_owned_joint_impulses_into_a_changed_timestep() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        world.config.allow_sleeping = false;
        world.config.velocity_iterations = 0;
        world.config.position_iterations = 0;
        let first = box_at(&mut world, 0.0, 0.0);
        let second = box_at(&mut world, 4.0, 0.0);
        let mut scaled = solver(
            Arc::new(|_world, _joint, _dt| {}),
            Arc::new(|_world, _joint| {}),
        );
        scaled.scale_accumulated_impulses = Some(Arc::new(|joint, ratio| {
            if let Some(joint) = joint.as_any_mut().downcast_mut::<TestJoint>() {
                joint.motor_impulse *= ratio;
            }
        }));
        scaled.warm_start = Some(Arc::new(|_world, _joint| {}));
        register_physics2d_joint_solver(&mut world, "Scaled".to_string(), Arc::new(scaled));
        let added = Arc::new(RwLock::new(TestJoint {
            fields: base_fields(
                "Scaled",
                first.read().unwrap().index,
                second.read().unwrap().index,
            ),
            motor_impulse: 0.0,
        }));
        add_physics2d_joint(&mut world, &to_joint_ref(&added));
        step(&mut world, DT60);
        {
            let mut joint = added.write().unwrap();
            joint.impulse0 = 2.0;
            joint.impulse1 = 3.0;
            joint.impulse2 = 4.0;
            joint.motor_impulse = 5.0;
        }

        step(&mut world, 1.0 / 30.0);

        let joint = added.read().unwrap();
        assert_eq!(
            [
                joint.impulse0,
                joint.impulse1,
                joint.impulse2,
                joint.motor_impulse
            ],
            [4.0, 6.0, 8.0, 10.0]
        );
    }

    #[test]
    fn produces_the_same_trace_when_the_broadphase_reports_its_pairs_in_the_opposite_order() {
        let mut plain = jointed_world(None);
        let mut reversed = jointed_world(Some(create_reversed_pair_backend()));
        run_steps(&mut plain.world, 120);
        run_steps(&mut reversed.world, 120);
        assert_eq!(trace_world(&reversed.world), trace_world(&plain.world));
    }

    #[test]
    fn orders_every_contact_pair_by_body_index_with_joints_present() {
        let Jointed { mut world } = jointed_world(Some(create_swapped_pair_backend()));
        run_steps(&mut world, 120);
        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            assert!(contact.body_a < contact.body_b);
        }
        for joint in &world.joints {
            let joint = joint.read().unwrap();
            assert!(joint.joint_fields().body_a < joint.joint_fields().body_b);
        }
    }

    #[test]
    fn is_bit_for_bit_repeatable_with_joints_in_the_solve_list() {
        let mut first = jointed_world(None);
        let mut second = jointed_world(None);
        run_steps(&mut first.world, 90);
        run_steps(&mut second.world, 90);
        assert_eq!(trace_world(&second.world), trace_world(&first.world));
    }

    #[test]
    fn suppresses_the_contact_between_jointed_bodies_unless_the_joint_asks_for_it() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        register_physics2d_joint_solver(
            &mut world,
            "Distance".to_string(),
            PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
        );
        let a = box_at(&mut world, 0.0, 0.0);
        let b = box_at(&mut world, 0.2, 0.0);
        let joint = distance_joint(a.read().unwrap().index, b.read().unwrap().index, 0.2);
        add_physics2d_joint(&mut world, &to_joint_ref(&joint));
        run_steps(&mut world, 10);
        assert_eq!(world.contacts.len(), 0);
    }

    #[test]
    fn does_not_suppress_collision_through_a_one_body_joint_placeholder() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let mut one_body = solver(
            Arc::new(|_world, _joint, _dt| {}),
            Arc::new(|_world, _joint| {}),
        );
        one_body.uses_body_a = Some(false);
        register_physics2d_joint_solver(&mut world, "OneBody".to_string(), Arc::new(one_body));
        let placeholder = box_at(&mut world, 0.0, 0.0);
        let constrained = box_at(&mut world, 0.2, 0.0);
        let joint = test_joint(
            "OneBody",
            placeholder.read().unwrap().index,
            constrained.read().unwrap().index,
        );
        add_physics2d_joint(&mut world, &joint);

        step(&mut world, DT60);

        assert_eq!(world.contacts.len(), 1);
    }
}

mod step_physics2d_with_sleeping {
    use super::*;

    #[test]
    fn settles_a_resting_crate_to_sleep_and_then_holds_its_pose_exactly() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 240);
        assert!(crate_body.read().unwrap().sleeping);

        let resting_y = crate_body.read().unwrap().y;
        run_steps(&mut world, 120);

        assert_eq!(crate_body.read().unwrap().y, resting_y);
        assert_eq!(crate_body.read().unwrap().velocity_y, 0.0);
    }

    #[test]
    fn wakes_a_sleeping_crate_when_another_body_lands_on_it() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let settled = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 240);
        assert!(settled.read().unwrap().sleeping);

        box_at(&mut world, 0.0, 4.0);
        run_steps(&mut world, 60);

        assert!(!settled.read().unwrap().sleeping);
    }

    #[test]
    fn wakes_a_sleeping_crate_in_the_same_step_a_force_is_applied_to_it() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 240);
        assert!(crate_body.read().unwrap().sleeping);

        crate_body.write().unwrap().force_x = 500.0;
        step(&mut world, DT60);

        assert!(!crate_body.read().unwrap().sleeping);
        assert!(crate_body.read().unwrap().velocity_x > 0.0);
    }

    #[test]
    fn holds_a_jointed_body_still_once_its_island_sleeps() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(
            &mut world,
            "Distance".to_string(),
            PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
        );
        let anchor = add(
            &mut world,
            create_rigid_body2d(Physics2DBodyType::Static, 0.0, 4.0, None),
        );
        let bob = box_at(&mut world, 0.0, 2.0);
        let joint = distance_joint(anchor.read().unwrap().index, bob.read().unwrap().index, 2.0);
        add_physics2d_joint(&mut world, &to_joint_ref(&joint));
        run_steps(&mut world, 600);
        assert!(bob.read().unwrap().sleeping);

        let resting_y = bob.read().unwrap().y;
        run_steps(&mut world, 120);

        assert_eq!(bob.read().unwrap().y, resting_y);
        assert!(bob.read().unwrap().sleeping);
    }

    #[test]
    fn never_leaves_a_sleeping_body_holding_velocity_however_it_came_to_rest() {
        let mut world = create_physics2d_world(None, None, None);
        ground(&mut world);
        let settled = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 240);
        assert!(settled.read().unwrap().sleeping);
        box_at(&mut world, 0.1, 4.0);

        let mut sleeping_samples = 0;
        for _ in 0..600 {
            step(&mut world, DT60);
            for body in &world.bodies {
                let body = body.read().unwrap();
                if !body.sleeping {
                    continue;
                }
                sleeping_samples += 1;
                assert_eq!(body.velocity_x, 0.0);
                assert_eq!(body.velocity_y, 0.0);
                assert_eq!(body.angular_velocity, 0.0);
            }
        }

        assert!(sleeping_samples > 0);
    }

    #[test]
    fn invokes_no_joint_solver_callback_for_a_pair_whose_every_end_is_asleep() {
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let mut world = create_physics2d_world(None, None, None);
        let (prepare_calls, solve_calls) = (calls.clone(), calls.clone());
        let mut recording = solver(
            Arc::new(move |_world, _joint, _dt| prepare_calls.lock().unwrap().push("prepare")),
            Arc::new(move |_world, _joint| solve_calls.lock().unwrap().push("solve")),
        );
        let (warm_calls, clear_calls) = (calls.clone(), calls.clone());
        recording.warm_start = Some(Arc::new(move |_world, _joint| {
            warm_calls.lock().unwrap().push("warmStart")
        }));
        recording.clear_accumulated_impulses = Some(Arc::new(move |_joint| {
            clear_calls.lock().unwrap().push("clear")
        }));
        register_physics2d_joint_solver(&mut world, "Recording".to_string(), Arc::new(recording));
        ground(&mut world);
        let left = box_at(&mut world, -1.0, 2.0);
        let right = box_at(&mut world, 1.0, 2.0);
        let joint = test_joint(
            "Recording",
            left.read().unwrap().index,
            right.read().unwrap().index,
        );
        joint.write().unwrap().joint_fields_mut().collide_connected = true;
        add_physics2d_joint(&mut world, &joint);
        run_steps(&mut world, 240);
        assert!(left.read().unwrap().sleeping);
        assert!(right.read().unwrap().sleeping);

        calls.lock().unwrap().clear();
        run_steps(&mut world, 30);

        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn never_sleeps_a_resting_crate_when_allow_sleeping_is_off() {
        let mut world = create_physics2d_world(None, None, None);
        world.config.allow_sleeping = false;
        ground(&mut world);
        let crate_body = box_at(&mut world, 0.0, 2.0);
        run_steps(&mut world, 240);

        assert!(!crate_body.read().unwrap().sleeping);
    }
}
