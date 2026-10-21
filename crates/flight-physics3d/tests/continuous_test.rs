use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, RwLock};

use super::*;
use crate::common::*;
use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D, create_collision_triangle_mesh3d,
};

fn continuous_world() -> Physics3DWorld {
    let mut world = world();
    world.gravity_y = 0.0;
    world.config.continuous_collision = true;
    world
}

fn add_wall(world: &mut Physics3DWorld) -> RigidBody3DRef {
    let wall = add_body(world, Physics3DBodyType::Static);
    let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.05,
        min_y: -5.0,
        min_z: -5.0,
        max_x: 0.05,
        max_y: 5.0,
        max_z: 5.0,
    }));
    let collider = physics_3d_collider(&shape, None, None, None);
    add_physics_3d_collider(world, &wall, &collider);
    wall
}

fn add_bullet(world: &mut Physics3DWorld, x: f32, speed: f32) -> RigidBody3DRef {
    let bullet = add_body(world, Physics3DBodyType::Dynamic);
    {
        let mut bullet = bullet.write().unwrap();
        bullet.x = x;
        bullet.velocity_x = speed;
        bullet.gravity_scale = 0.0;
        bullet.bullet = true;
    }
    let shape = sphere_shape(0.1, 0.0, 0.0, 0.0);
    let collider = physics_3d_collider(&shape, None, None, None);
    add_physics_3d_collider(world, &bullet, &collider);
    bullet
}

fn add_material_bullet(
    world: &mut Physics3DWorld,
    x: f32,
    speed_x: f32,
    speed_y: f32,
    material: &Physics3DMaterial,
) -> RigidBody3DRef {
    let bullet = add_body(world, Physics3DBodyType::Dynamic);
    {
        let mut bullet = bullet.write().unwrap();
        bullet.x = x;
        bullet.velocity_x = speed_x;
        bullet.velocity_y = speed_y;
        bullet.gravity_scale = 0.0;
        bullet.bullet = true;
    }
    let collider = physics_3d_collider(
        &sphere_shape(0.1, 0.0, 0.0, 0.0),
        Some(material),
        None,
        None,
    );
    add_physics_3d_collider(world, &bullet, &collider);
    bullet
}

fn add_material_wall(world: &mut Physics3DWorld, material: &Physics3DMaterial) -> RigidBody3DRef {
    let wall = add_body(world, Physics3DBodyType::Static);
    let collider = physics_3d_collider(&thin_wall_shape(), Some(material), None, None);
    add_physics_3d_collider(world, &wall, &collider);
    wall
}

fn panic_message(payload: &(dyn Any + Send)) -> &str {
    if let Some(error) = payload.downcast_ref::<flight_entity::FlightError>() {
        return &error.message;
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message;
    }
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return message;
    }
    panic!("unexpected panic payload");
}

fn thin_wall_shape() -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.05,
        min_y: -5.0,
        min_z: -5.0,
        max_x: 0.05,
        max_y: 5.0,
        max_z: 5.0,
    }))
}

mod has_active_physics_3d_bullet {
    use super::*;

    #[test]
    fn detects_an_awake_dynamic_bullet() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        body.write().unwrap().bullet = true;
        assert!(has_active_physics_3d_bullet(&world));
    }

    #[test]
    fn rejects_an_unflagged_body() {
        let mut world = continuous_world();
        add_wall(&mut world);
        add_bullet(&mut world, -5.0, 100.0).write().unwrap().bullet = false;
        assert!(!has_active_physics_3d_bullet(&world));
    }

    #[test]
    fn ignores_a_sleeping_bullet() {
        let mut world = continuous_world();
        let bullet = add_bullet(&mut world, -5.0, 100.0);
        bullet.write().unwrap().sleeping = true;
        assert!(!has_active_physics_3d_bullet(&world));
    }

    #[test]
    fn ignores_a_static_flagged_body() {
        let mut world = continuous_world();
        let wall = add_wall(&mut world);
        wall.write().unwrap().bullet = true;
        assert!(!has_active_physics_3d_bullet(&world));
    }
}

mod integrate_physics_3d_continuous {
    use super::*;

    #[test]
    fn advances_an_unobstructed_body() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        body.write().unwrap().velocity_x = 2.0;
        integrate_physics_3d_continuous(&mut world, &registry(), 0.5);
        assert_eq!(body.read().unwrap().x, 1.0);
    }

    #[test]
    fn stops_a_bullet_at_an_accelerated_static_triangle_mesh() {
        let mut world = continuous_world();
        let wall = add_body(&mut world, Physics3DBodyType::Static);
        let shape = CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(
            create_collision_triangle_mesh3d(
                vec![
                    0.0, -5.0, -5.0, 0.0, 5.0, -5.0, 0.0, 5.0, 5.0, 0.0, -5.0, 5.0,
                ],
                vec![0, 1, 2, 0, 2, 3],
            ),
        )));
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, &wall, &collider);
        let bullet = add_bullet(&mut world, -5.0, 600.0);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(
            bullet.read().unwrap().x < 0.0,
            "triangle-mesh CCD bullet x={}, velocity_x={}, contacts={}, began={}, normal=({},{},{})",
            bullet.read().unwrap().x,
            bullet.read().unwrap().velocity_x,
            world.contacts.len(),
            world.events.began.len(),
            world.contacts[0].read().unwrap().normal_x,
            world.contacts[0].read().unwrap().normal_y,
            world.contacts[0].read().unwrap().normal_z
        );
    }

    #[test]
    fn stops_a_fast_bullet_at_a_thin_wall() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let bullet = bullet.read().unwrap();
        assert!(bullet.x < 0.0 && bullet.x > -2.0);
        assert!(bullet.velocity_x < 1.0);
        assert_eq!(world.events.began.len(), 1);
    }

    #[test]
    fn publishes_a_persistent_contact_and_runs_both_impact_hooks() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        let phases = Arc::new(Mutex::new(Vec::new()));
        let pre_phases = phases.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_, contact| {
            pre_phases.lock().unwrap().push("pre");
            let contact = contact.read().unwrap();
            assert!(contact.body_a < contact.body_b);
            assert_eq!(contact.point_count, 1);
            assert_eq!(contact.points[0].depth, 0.0);
        }));
        let post_phases = phases.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_, contact| {
            post_phases.lock().unwrap().push("post");
            assert!(contact.read().unwrap().touching);
        }));

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_eq!(*phases.lock().unwrap(), vec!["pre", "post"]);
        assert_eq!(world.events.began.len(), 1);
        assert!(world.events.ended.is_empty());
        assert_eq!(world.contacts.len(), 1);
        assert!(Arc::ptr_eq(&world.contacts[0], &world.events.began[0]));
        assert_ne!(
            world.contacts[0].read().unwrap().body_a,
            bullet.read().unwrap().index
        );
        assert_eq!(
            world.contacts[0].read().unwrap().body_b,
            bullet.read().unwrap().index
        );
    }

    #[test]
    fn lets_an_impact_hook_disable_resolution_without_losing_the_contact() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, contact| {
            contact.write().unwrap().enabled = false;
        }));

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(bullet.read().unwrap().x > 4.0);
        assert_eq!(world.events.began.len(), 1);
        assert_eq!(world.contacts.len(), 1);
        assert!(!world.contacts[0].read().unwrap().enabled);
    }

    #[test]
    fn uses_restitution_selected_by_the_impact_hook() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, contact| {
            contact.write().unwrap().restitution = 1.0;
        }));

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(bullet.read().unwrap().velocity_x < -500.0);
    }

    #[test]
    fn restores_impact_overrides_when_a_late_hook_throws() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, contact| {
            contact.write().unwrap().friction = 99.0;
            flight_entity::throw_error("impact hook failed");
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        let payload = result.expect_err("impact hook must rethrow");
        assert_eq!(panic_message(payload.as_ref()), "impact hook failed");
        assert!(bullet.read().unwrap().x > -5.0);
        assert!(bullet.read().unwrap().x < 0.0);
        assert_eq!(world.contacts.len(), 1);
        assert!(Arc::ptr_eq(&world.events.began[0], &world.contacts[0]));
        assert_ne!(world.contacts[0].read().unwrap().friction, 99.0);

        world.contact_hooks.pre_solve = None;
        let resumed = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));
        assert!(resumed.is_ok());
    }

    #[test]
    fn applies_coulomb_friction_at_time_of_impact() {
        fn run(friction: f32) -> f32 {
            let mut world = continuous_world();
            let material = Physics3DMaterial {
                density: 1.0,
                friction,
                restitution: 0.0,
            };
            add_material_wall(&mut world, &material);
            let bullet = add_material_bullet(&mut world, -5.0, 600.0, 60.0, &material);

            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

            let velocity_y = bullet.read().unwrap().velocity_y;
            velocity_y
        }

        let frictionless = run(0.0).abs();
        let gripping = run(1.0).abs();
        assert!(frictionless > 59.0);
        assert!(gripping < 1.0);
        assert!(gripping < frictionless * 0.02);
    }

    #[test]
    fn reports_the_end_transition_after_a_restitutive_impact_separates() {
        let mut world = continuous_world();
        let material = Physics3DMaterial {
            density: 1.0,
            friction: 0.0,
            restitution: 1.0,
        };
        add_material_wall(&mut world, &material);
        add_material_bullet(&mut world, -5.0, 600.0, 0.0, &material);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let impact = world.events.began[0].clone();
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(world.events.began.is_empty());
        assert_eq!(world.events.ended.len(), 1);
        assert!(Arc::ptr_eq(&world.events.ended[0], &impact));
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn bounces_a_restitutive_bullet_back_off_the_wall() {
        let mut world = continuous_world();
        let material = Physics3DMaterial {
            density: 1.0,
            friction: 0.2,
            restitution: 0.8,
        };
        add_material_wall(&mut world, &material);
        let bullet = add_material_bullet(&mut world, -5.0, 600.0, 0.0, &material);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(bullet.read().unwrap().velocity_x < 0.0);
    }

    #[test]
    fn keeps_a_bullet_on_the_near_side_over_many_steps() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        let registry = registered_registry();

        for _ in 0..120 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }

        assert!(bullet.read().unwrap().x < 0.2);
    }

    #[test]
    fn leaves_a_directly_integrated_world_mutable_afterward() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        integrate_physics_3d_continuous(&mut world, &registered_registry(), 1.0 / 60.0);
        assert!(bullet.read().unwrap().x < 0.0);
        assert_physics_3d_world_not_stepping(&world);
    }

    #[test]
    fn keeps_the_mutation_boundary_around_a_direct_impact_hook() {
        let mut world = continuous_world();
        add_wall(&mut world);
        add_bullet(&mut world, -5.0, 600.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|inner, _| {
            add_body(inner, Physics3DBodyType::Dynamic);
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            integrate_physics_3d_continuous(&mut world, &registered_registry(), 1.0 / 60.0);
        }));

        let payload = result.expect_err("impact mutation must fail");
        assert_eq!(
            panic_message(payload.as_ref()),
            "Cannot mutate a physics world while it is stepping"
        );
        assert_eq!(world.bodies.len(), 2);
        assert_physics_3d_world_not_stepping(&world);
    }

    #[test]
    fn rejects_recursive_continuous_integration_from_an_impact_hook() {
        let mut world = continuous_world();
        add_wall(&mut world);
        add_bullet(&mut world, -5.0, 600.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|inner, _| {
            integrate_physics_3d_continuous(inner, &registered_registry(), 1.0 / 60.0);
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            integrate_physics_3d_continuous(&mut world, &registered_registry(), 1.0 / 60.0);
        }));

        let payload = result.expect_err("recursive integration must fail");
        assert_eq!(
            panic_message(payload.as_ref()),
            "Cannot integrate a physics world recursively while it is stepping"
        );
        assert_physics_3d_world_not_stepping(&world);
    }

    #[test]
    fn lets_a_fast_body_cross_when_continuous_collision_is_disabled() {
        let mut world = continuous_world();
        world.config.continuous_collision = false;
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(bullet.read().unwrap().x > 4.0);
    }

    #[test]
    fn lets_an_unflagged_fast_body_cross_an_enabled_world() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let ordinary = add_bullet(&mut world, -5.0, 600.0);
        ordinary.write().unwrap().bullet = false;
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(ordinary.read().unwrap().x > 4.0);
    }

    #[test]
    fn advances_freely_when_nothing_is_in_the_way() {
        let mut world = continuous_world();
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!((bullet.read().unwrap().x - 5.0).abs() < 1e-5);
    }

    #[test]
    fn does_not_stop_for_a_wall_outside_the_swept_shape() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        bullet.write().unwrap().y = 20.0;
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!((bullet.read().unwrap().x - 5.0).abs() < 1e-5);
    }

    #[test]
    fn flies_through_a_sensor_and_publishes_its_transition() {
        let mut world = continuous_world();
        let trigger = add_wall(&mut world);
        trigger.read().unwrap().colliders[0].write().unwrap().sensor = true;
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        let pre_solve_count = Arc::new(Mutex::new(0));
        let pre_solve_count_for_hook = pre_solve_count.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_, _| {
            *pre_solve_count_for_hook.lock().unwrap() += 1;
        }));
        let post_solve_count = Arc::new(Mutex::new(0));
        let post_solve_count_for_hook = post_solve_count.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_, _| {
            *post_solve_count_for_hook.lock().unwrap() += 1;
        }));
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(bullet.read().unwrap().x > 4.0);
        assert_eq!(*pre_solve_count.lock().unwrap(), 0);
        assert_eq!(*post_solve_count.lock().unwrap(), 0);
        assert_eq!(world.events.began.len(), 1);
        assert!(world.events.began[0].read().unwrap().sensor);
        assert_eq!(world.contacts.len(), 1);
        let crossing = world.contacts[0].clone();
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(world.events.began.is_empty());
        assert_eq!(world.events.ended.len(), 1);
        assert!(std::sync::Arc::ptr_eq(&world.events.ended[0], &crossing));
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn pairs_a_sensor_begin_and_end_inside_one_public_step() {
        let mut world = continuous_world();
        world.config.substeps = 2;
        let trigger = add_wall(&mut world);
        trigger.read().unwrap().colliders[0].write().unwrap().sensor = true;
        add_bullet(&mut world, -5.0, 1200.0);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_eq!(world.events.began.len(), 1);
        assert_eq!(world.events.ended.len(), 1);
        assert!(Arc::ptr_eq(&world.events.ended[0], &world.events.began[0]));
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn does_not_report_a_sensor_behind_an_unreached_solid_impact() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let trigger = add_body(&mut world, Physics3DBodyType::Static);
        trigger.write().unwrap().x = 3.0;
        let collider = physics_3d_collider(&thin_wall_shape(), None, None, Some(true));
        add_physics_3d_collider(&mut world, &trigger, &collider);
        let bullet = add_bullet(&mut world, -5.0, 600.0);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(bullet.read().unwrap().x < 0.0);
        assert!(
            world
                .events
                .began
                .iter()
                .all(|contact| !contact.read().unwrap().sensor)
        );
        assert!(
            world
                .contacts
                .iter()
                .all(|contact| !contact.read().unwrap().sensor)
        );
    }

    #[test]
    fn ignores_a_wall_excluded_by_collision_filters() {
        let mut world = continuous_world();
        let wall = add_wall(&mut world);
        wall.read().unwrap().colliders[0].write().unwrap().filter = Physics3DCollisionFilter {
            category_bits: 2,
            mask_bits: 2,
            group_index: 0,
        };
        let bullet = add_bullet(&mut world, -5.0, 600.0);
        bullet.read().unwrap().colliders[0].write().unwrap().filter = Physics3DCollisionFilter {
            category_bits: 1,
            mask_bits: 1,
            group_index: 0,
        };
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(bullet.read().unwrap().x > 4.0);
    }

    #[test]
    fn advances_an_ordinary_body_alongside_a_bullet() {
        let mut world = continuous_world();
        add_wall(&mut world);
        add_bullet(&mut world, -5.0, 600.0);
        let ordinary = add_body(&mut world, Physics3DBodyType::Dynamic);
        {
            let mut ordinary = ordinary.write().unwrap();
            ordinary.y = 30.0;
            ordinary.velocity_y = 6.0;
            ordinary.gravity_scale = 0.0;
        }
        let shape = sphere_shape(1.0, 0.0, 0.0, 0.0);
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, &ordinary, &collider);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!((ordinary.read().unwrap().y - 30.1).abs() < 1e-5);
    }

    #[test]
    fn restores_current_broadphase_bounds_after_the_swept_pass() {
        let mut world = continuous_world();
        add_wall(&mut world);
        add_bullet(&mut world, -5.0, 600.0);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let mut ids = Vec::new();
        (world.index.query_spatial_point)(&mut ids, -4.9, 0.0, 0.0);
        assert!(ids.is_empty());
    }

    #[test]
    fn gives_a_squarely_struck_box_no_spin() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_body(&mut world, Physics3DBodyType::Dynamic);
        {
            let mut bullet = bullet.write().unwrap();
            bullet.x = -5.0;
            bullet.velocity_x = 600.0;
            bullet.gravity_scale = 0.0;
            bullet.bullet = true;
        }
        let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -0.5,
            min_y: -0.5,
            min_z: -0.5,
            max_x: 0.5,
            max_y: 0.5,
            max_z: 0.5,
        }));
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, &bullet, &collider);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let bullet = bullet.read().unwrap();
        assert!(bullet.x < 0.0);
        assert!(
            (bullet.angular_velocity_x * bullet.angular_velocity_x
                + bullet.angular_velocity_y * bullet.angular_velocity_y
                + bullet.angular_velocity_z * bullet.angular_velocity_z)
                .sqrt()
                < 1e-6
        );
    }

    #[test]
    fn keeps_linear_ccd_active_for_a_slightly_spinning_box() {
        let mut world = continuous_world();
        add_wall(&mut world);
        let bullet = add_body(&mut world, Physics3DBodyType::Dynamic);
        {
            let mut bullet = bullet.write().unwrap();
            bullet.x = -5.0;
            bullet.velocity_x = 600.0;
            bullet.angular_velocity_z = 0.01;
            bullet.gravity_scale = 0.0;
            bullet.bullet = true;
        }
        let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -0.5,
            min_y: -0.5,
            min_z: -0.5,
            max_x: 0.5,
            max_y: 0.5,
            max_z: 0.5,
        }));
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, &bullet, &collider);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        assert!(bullet.read().unwrap().x < 0.0);
    }

    #[test]
    fn disables_rotational_crossing_when_the_budget_is_zero() {
        let mut world = continuous_world();
        world.config.max_ccd_rotation_substeps = 0;
        let peg = add_body(&mut world, Physics3DBodyType::Static);
        let peg_collider =
            physics_3d_collider(&sphere_shape(0.25, 4.0, 0.0, 0.0), None, None, None);
        add_physics_3d_collider(&mut world, &peg, &peg_collider);
        let blade = add_body(&mut world, Physics3DBodyType::Dynamic);
        {
            let mut blade = blade.write().unwrap();
            blade.orientation_z = -(std::f32::consts::PI / 8.0).sin();
            blade.orientation_w = (std::f32::consts::PI / 8.0).cos();
            blade.angular_velocity_z = 120.0;
            blade.gravity_scale = 0.0;
            blade.bullet = true;
        }
        let blade_shape =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -5.0,
                min_y: -0.1,
                min_z: -0.1,
                max_x: 5.0,
                max_y: 0.1,
                max_z: 0.1,
            }));
        let blade_collider = physics_3d_collider(&blade_shape, None, None, None);
        add_physics_3d_collider(&mut world, &blade, &blade_collider);
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let blade = blade.read().unwrap();
        assert_eq!(blade.y, 0.0);
        assert!((blade.angular_velocity_z - 120.0).abs() < 1e-4);
        assert!(blade.orientation_z > 0.3);
    }

    #[test]
    fn deflects_a_spinning_blade_at_an_intermediate_orientation() {
        let mut world = continuous_world();
        world.config.max_ccd_rotation_substeps = 128;
        let peg = add_body(&mut world, Physics3DBodyType::Static);
        let peg_shape = sphere_shape(0.25, 4.0, 0.0, 0.0);
        let peg_collider = physics_3d_collider(&peg_shape, None, None, None);
        add_physics_3d_collider(&mut world, &peg, &peg_collider);
        let blade = add_body(&mut world, Physics3DBodyType::Dynamic);
        {
            let mut blade = blade.write().unwrap();
            blade.orientation_z = -(std::f32::consts::PI / 8.0).sin();
            blade.orientation_w = (std::f32::consts::PI / 8.0).cos();
            blade.angular_velocity_z = 120.0;
            blade.gravity_scale = 0.0;
            blade.bullet = true;
        }
        let blade_shape =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -5.0,
                min_y: -0.1,
                min_z: -0.1,
                max_x: 5.0,
                max_y: 0.1,
                max_z: 0.1,
            }));
        let blade_collider = physics_3d_collider(&blade_shape, None, None, None);
        add_physics_3d_collider(&mut world, &blade, &blade_collider);
        assert!(
            is_physics_3d_body_state_valid(&world),
            "invalid body state: mass={} inverse_mass={}",
            blade.read().unwrap().mass,
            blade.read().unwrap().inverse_mass
        );
        assert!(is_physics_3d_collider_state_valid(&world));
        assert!(is_physics_3d_solver_config_valid(&world.config));
        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        let blade = blade.read().unwrap();
        assert!(
            blade.y.abs() > 0.1,
            "blade y={} angular_velocity_z={} orientation_z={}",
            blade.y,
            blade.angular_velocity_z,
            blade.orientation_z
        );
        assert!(blade.angular_velocity_z.abs() < 100.0);
    }
}

mod write_physics_3d_rotational_ccd_envelope {
    use super::*;

    #[test]
    fn publishes_the_wider_gaps_when_the_hard_budget_binds() {
        let mut out = Physics3DRotationalCcdEnvelope {
            angular_travel: 0.0,
            sample_count: 0,
            max_angular_increment: 0.0,
            max_point_arc_travel: 0.0,
            target_increment_met: false,
        };
        assert!(write_physics_3d_rotational_ccd_envelope(
            &mut out,
            120.0,
            5.0,
            1.0 / 60.0,
            10,
        ));
        assert_eq!(out.sample_count, 10);
        assert!((out.max_angular_increment - 0.2).abs() < 1e-6);
        assert!((out.max_point_arc_travel - 1.0).abs() < 1e-6);
        assert!(!out.target_increment_met);
    }

    #[test]
    fn reports_the_one_degree_target_when_the_budget_covers_the_travel() {
        let mut out = Physics3DRotationalCcdEnvelope {
            angular_travel: 0.0,
            sample_count: 0,
            max_angular_increment: 0.0,
            max_point_arc_travel: 0.0,
            target_increment_met: false,
        };
        assert!(write_physics_3d_rotational_ccd_envelope(
            &mut out,
            120.0,
            5.0,
            1.0 / 60.0,
            128,
        ));
        assert!((out.angular_travel - 2.0).abs() < 1e-6);
        assert_eq!(out.sample_count, 115);
        assert!(out.max_angular_increment <= std::f32::consts::PI / 180.0);
        assert!((out.max_point_arc_travel - (2.0 / 115.0) * 5.0).abs() < 1e-6);
        assert!(out.target_increment_met);
    }

    #[test]
    fn reports_disabled_rotation_and_clears_invalid_inputs() {
        let cleared = Physics3DRotationalCcdEnvelope {
            angular_travel: 0.0,
            sample_count: 0,
            max_angular_increment: 0.0,
            max_point_arc_travel: 0.0,
            target_increment_met: false,
        };
        let mut out = cleared;
        assert!(write_physics_3d_rotational_ccd_envelope(
            &mut out,
            10.0,
            2.0,
            1.0 / 60.0,
            0,
        ));
        assert_eq!(out.sample_count, 0);
        assert_eq!(out.max_angular_increment, f32::INFINITY);
        assert_eq!(out.max_point_arc_travel, f32::INFINITY);
        assert!(!out.target_increment_met);
        assert!(!write_physics_3d_rotational_ccd_envelope(
            &mut out,
            -1.0,
            2.0,
            1.0 / 60.0,
            10,
        ));
        assert_eq!(out, cleared);
        assert!(!write_physics_3d_rotational_ccd_envelope(
            &mut out,
            f32::MAX,
            2.0,
            2.0,
            10,
        ));
        assert_eq!(out, cleared);
    }
}
