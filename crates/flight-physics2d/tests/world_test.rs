use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};

use flight_collision::{
    CollisionAabb2D, CollisionCircle2D, CollisionPolygon2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{Ref, allocate_entity};
use flight_physics2d::contract::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

struct TestJoint {
    fields: Physics2DJointFields,
}

flight_physics2d::impl_physics2d_joint!(TestJoint, []);

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

fn box_body(x: f32, y: f32) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(Physics2DBodyType::Dynamic, x, y, None);
    write(&body).colliders.push(create_physics2d_collider(
        &aabb(-0.5, -0.5, 0.5, 0.5),
        &STONE,
        None,
        None,
    ));
    return body;
}

fn circle(x: f64, y: f64, radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D { x, y, radius });
}

fn entity_joint(
    kind: &str,
    body_a: i32,
    body_b: i32,
    collide_connected: bool,
    impulses: [f32; 3],
) -> Physics2DJointRef {
    let make: fn() -> Physics2DJointFields = Physics2DJointFields::default;
    let mut fields = make();
    fields.kind = kind.to_string();
    fields.body_a = body_a;
    fields.body_b = body_b;
    fields.collide_connected = collide_connected;
    fields.impulse0 = impulses[0];
    fields.impulse1 = impulses[1];
    fields.impulse2 = impulses[2];
    let joint: Physics2DJointRef = Arc::new(RwLock::new(TestJoint { fields }));
    return joint;
}

fn no_op_solver(uses_body_a: Option<bool>) -> Physics2DJointSolverRef {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake: None,
        prepare: Arc::new(|_, _, _| {}),
        scale_accumulated_impulses: None,
        solve: Arc::new(|_, _| {}),
        swap_ends: None,
        uses_body_a,
        warm_start: None,
        write_reaction: None,
    });
}

fn query_point(world: &Physics2DWorld, x: f32, y: f32) -> Vec<i32> {
    let mut found = Vec::new();
    (world.index.query_spatial_point)(&mut found, x, y);
    return found;
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

fn static_floor(min_x: f32, max_x: f32) -> Ref<RigidBody2D> {
    let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
    write(&floor).colliders.push(create_physics2d_collider(
        &aabb(min_x, -1.0, max_x, 0.0),
        &STONE,
        None,
        None,
    ));
    return floor;
}

fn step(world: &mut Physics2DWorld) {
    step_physics2d(world, 1.0 / 60.0, &registry(), None);
}

fn throws(action: impl FnOnce()) -> bool {
    return catch_unwind(AssertUnwindSafe(action)).is_err();
}

fn world_at(gravity_x: f32, gravity_y: f32) -> Physics2DWorld {
    return create_physics2d_world(Some(gravity_x), Some(gravity_y), None);
}

fn write(body: &Ref<RigidBody2D>) -> RwLockWriteGuard<'_, RigidBody2D> {
    return body.write().unwrap();
}

mod add_physics2d_body {
    use super::*;

    #[test]
    fn assigns_indices_from_a_monotonic_counter_so_a_removed_body_never_hands_its_identity_on() {
        let mut world = create_physics2d_world(None, None, None);
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(1.0, 0.0));
        remove_physics2d_body(&mut world, &first);
        let third = add(&mut world, box_body(2.0, 0.0));

        assert_eq!(read(&second).index, 1);
        assert_eq!(read(&third).index, 2);
        assert_ne!(read(&third).index, read(&first).index);
        assert!(Arc::ptr_eq(
            &world.body_by_index[&read(&second).index],
            &second
        ));
        assert!(Arc::ptr_eq(
            &world.body_by_index[&read(&third).index],
            &third
        ));
    }

    #[test]
    fn derives_mass_properties_on_insertion_so_a_body_is_never_simulated_massless() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(0.0, 0.0));
        assert!((read(&body).mass - 1.0).abs() < 0.005);
        assert!((read(&body).inverse_mass - 1.0).abs() < 0.005);
        assert!(read(&body).inertia > 0.0);
    }

    #[test]
    fn rejects_a_collider_instance_shared_by_two_pre_authored_bodies() {
        let mut world = create_physics2d_world(None, None, None);
        let collider = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        let first = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let second = create_rigid_body2d(Physics2DBodyType::Dynamic, 2.0, 0.0, None);
        write(&first).colliders.push(collider.clone());
        write(&second).colliders.push(collider.clone());

        add_physics2d_body(&mut world, &first);
        assert!(throws(|| add_physics2d_body(&mut world, &second)));
        assert_eq!(read(&second).index, -1);
        assert_eq!(world.bodies.len(), 1);
        assert!(Arc::ptr_eq(&world.bodies[0], &first));
    }

    #[test]
    fn rejects_duplicate_and_cross_world_insertion_without_corrupting_either_world() {
        let mut first_world = create_physics2d_world(None, None, None);
        let mut second_world = create_physics2d_world(None, None, None);
        let body = add(&mut first_world, box_body(0.0, 0.0));
        let index = read(&body).index;

        assert!(throws(|| add_physics2d_body(&mut first_world, &body)));
        assert!(throws(|| add_physics2d_body(&mut second_world, &body)));
        assert_eq!(first_world.bodies.len(), 1);
        assert!(Arc::ptr_eq(&first_world.bodies[0], &body));
        assert!(Arc::ptr_eq(&first_world.body_by_index[&index], &body));
        assert_eq!(second_world.bodies.len(), 0);
    }
}

mod add_physics2d_collider {
    use super::*;

    #[test]
    fn can_author_a_body_before_insertion_without_assigning_world_identity() {
        let mut world = create_physics2d_world(None, None, None);
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        add_physics2d_collider(
            &mut world,
            &body,
            &create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None),
        );
        assert_eq!(read(&body).index, -1);
        assert!((read(&body).mass - std::f32::consts::PI).abs() < 0.005);
        assert_eq!(world.bodies.len(), 0);
    }

    #[test]
    fn invalidates_old_contact_impulses_and_events_while_waking_both_solid_ends() {
        let mut world = world_at(0.0, 0.0);
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(0.75, 0.0));
        step(&mut world);
        assert_eq!(world.contacts.len(), 1);
        assert_eq!(world.events.began.len(), 1);
        write(&first).sleeping = true;
        write(&second).sleeping = true;

        add_physics2d_collider(
            &mut world,
            &first,
            &create_physics2d_collider(&circle(2.0, 0.0, 0.25), &STONE, None, None),
        );

        assert_eq!(world.contacts.len(), 0);
        assert_eq!(world.events.began.len(), 0);
        assert!(!read(&first).sleeping);
        assert!(!read(&second).sleeping);
    }

    #[test]
    fn recomputes_mass_wakes_the_body_and_publishes_bounds_immediately() {
        let mut world = world_at(0.0, 0.0);
        let body = add(
            &mut world,
            create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, 4.0, None),
        );
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;
        let collider = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);

        add_physics2d_collider(&mut world, &body, &collider);
        assert!(Arc::ptr_eq(
            read(&body).colliders.last().unwrap(),
            &collider
        ));

        let found = query_point(&world, 3.0, 4.0);
        assert!((read(&body).mass - std::f32::consts::PI).abs() < 0.005);
        assert!(!read(&body).sleeping);
        assert_eq!(found, vec![read(&body).index]);
    }

    #[test]
    fn rejects_duplicate_shared_and_foreign_world_collider_mutation() {
        let mut first_world = create_physics2d_world(None, None, None);
        let mut second_world = create_physics2d_world(None, None, None);
        let first = add(
            &mut first_world,
            create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None),
        );
        let second = add(
            &mut first_world,
            create_rigid_body2d(Physics2DBodyType::Dynamic, 2.0, 0.0, None),
        );
        let collider = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        add_physics2d_collider(&mut first_world, &first, &collider);

        assert!(throws(|| add_physics2d_collider(
            &mut first_world,
            &first,
            &collider
        )));
        assert!(throws(|| add_physics2d_collider(
            &mut first_world,
            &second,
            &collider
        )));
        assert!(throws(|| add_physics2d_collider(
            &mut second_world,
            &first,
            &create_physics2d_collider(&circle(0.0, 0.0, 2.0), &STONE, None, None),
        )));
        assert_eq!(read(&first).colliders.len(), 1);
        assert!(Arc::ptr_eq(&read(&first).colliders[0], &collider));
        assert_eq!(read(&second).colliders.len(), 0);
    }
}

mod apply_physics2d_force {
    use super::*;

    #[test]
    fn accumulates_force_and_wakes_a_dynamic_body() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(10.0, 20.0));
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;

        assert!(apply_physics2d_force(&mut write(&body), 3.0, 4.0));
        assert_eq!(read(&body).force_x, 3.0);
        assert_eq!(read(&body).force_y, 4.0);
        assert!(!read(&body).sleeping);
        assert_eq!(read(&body).sleep_timer, 0.0);
    }

    #[test]
    fn reports_a_rejected_non_dynamic_force_without_mutating_the_body() {
        let body = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        assert!(!apply_physics2d_force(&mut write(&body), 1.0, 2.0));
        assert_eq!(read(&body).force_x, 0.0);
    }
}

mod apply_physics2d_force_at_point {
    use super::*;

    #[test]
    fn accumulates_force_and_its_moment_from_a_world_space_point() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(10.0, 20.0));
        assert!(apply_physics2d_force_at_point(
            &mut write(&body),
            2.0,
            0.0,
            10.0,
            21.0
        ));
        assert_eq!(read(&body).force_x, 2.0);
        assert!((read(&body).torque - -2.0).abs() < 0.005);
    }
}

mod apply_physics2d_linear_impulse {
    use super::*;

    #[test]
    fn changes_linear_velocity_immediately_from_derived_inverse_mass() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        assert!(apply_physics2d_linear_impulse(&mut write(&body), 1.0, 2.0));
        assert!((read(&body).velocity_x - 1.0).abs() < 0.005);
        assert!((read(&body).velocity_y - 2.0).abs() < 0.005);
    }
}

mod apply_physics2d_linear_impulse_at_point {
    use super::*;

    #[test]
    fn changes_linear_and_angular_velocity_from_a_world_space_point() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(10.0, 20.0));
        assert!(apply_physics2d_linear_impulse_at_point(
            &mut write(&body),
            1.0,
            0.0,
            10.0,
            21.0
        ));
        assert!((read(&body).velocity_x - 1.0).abs() < 0.005);
        assert!((read(&body).angular_velocity - -6.0).abs() < 0.005);
    }
}

mod apply_physics2d_torque {
    use super::*;

    #[test]
    fn accumulates_torque_and_wakes_a_dynamic_body() {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;
        assert!(apply_physics2d_torque(&mut write(&body), 3.0));
        assert_eq!(read(&body).torque, 3.0);
        assert!(!read(&body).sleeping);
        assert_eq!(read(&body).sleep_timer, 0.0);
    }
}

mod create_physics2d_collider {
    use super::*;

    #[test]
    fn allocates_a_world_shape_up_front_so_the_step_transforms_in_place() {
        let collider = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        let collider = collider.read().unwrap();
        assert!(matches!(collider.world, CollisionShape2D::Circle(_)));
        assert!(!collider.sensor);
    }

    #[test]
    fn marks_a_sensor_collider_so_the_solver_reports_its_overlaps_without_resolving_them() {
        let collider = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, Some(true), None);
        assert!(collider.read().unwrap().sensor);
    }

    #[test]
    fn owns_a_permissive_default_collision_filter_and_clones_a_supplied_one() {
        let defaulted = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        assert_eq!(
            defaulted.read().unwrap().filter,
            Physics2DCollisionFilter {
                category_bits: 1,
                mask_bits: 0xffff_ffff,
                group_index: 0,
            }
        );

        // The filter is a value record, so the owned copy is distinct by construction.
        let supplied = Physics2DCollisionFilter {
            category_bits: 2,
            mask_bits: 4,
            group_index: -3,
        };
        let filtered =
            create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, Some(false), Some(&supplied));
        assert_eq!(filtered.read().unwrap().filter, supplied);
    }

    #[test]
    fn owns_shape_storage_and_material_values_independently_of_authoring_templates_and_sibling_colliders()
     {
        let mut points: Vec<f64> = vec![0.0, 0.0, 2.0, 0.0, 0.0, 2.0];
        let local = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: points.clone(),
        });
        let mut material = Physics2DMaterial {
            density: 1.0,
            friction: 0.25,
            restitution: 0.5,
        };
        let first = create_physics2d_collider(&local, &material, None, None);
        let second = create_physics2d_collider(&local, &material, None, None);

        points[0] = 100.0;
        material.density = 9.0;
        {
            let mut first = first.write().unwrap();
            if let CollisionShape2D::Polygon(polygon) = &mut first.local {
                polygon.points[1] = 50.0;
            }
            first.material.friction = 0.75;
        }

        let first = first.read().unwrap();
        let second = second.read().unwrap();
        let (CollisionShape2D::Polygon(first_local), CollisionShape2D::Polygon(second_local)) =
            (&first.local, &second.local)
        else {
            panic!("expected polygons");
        };
        assert_eq!(first_local.points[0], 0.0);
        assert_eq!(second_local.points, vec![0.0, 0.0, 2.0, 0.0, 0.0, 2.0]);
        assert_eq!(first.material.density, 1.0);
        assert_eq!(
            second.material,
            Physics2DMaterial {
                density: 1.0,
                friction: 0.25,
                restitution: 0.5,
            }
        );
    }
}

mod create_physics2d_solver_config {
    use super::*;

    #[test]
    fn defaults_to_a_tuning_that_converges_for_game_scale_stacks() {
        let config = create_physics2d_solver_config();
        assert!(config.velocity_iterations >= 8);
        assert!(config.warm_starting);
        assert!(config.penetration_slop > 0.0);
        assert!(config.position_correction > 0.0);
        assert!(config.position_correction < 1.0);
    }
}

mod create_physics2d_world {
    use super::*;

    #[test]
    fn starts_empty_with_a_default_broadphase_index() {
        let world = create_physics2d_world(None, None, None);
        assert_eq!(world.bodies.len(), 0);
        assert_eq!(world.body_by_index.len(), 0);
        assert_eq!(world.contacts.len(), 0);
        assert!(world.contact_hooks.pre_solve.is_none());
        assert!(world.contact_hooks.post_solve.is_none());
        assert!(query_point(&world, 0.0, 0.0).is_empty());
        assert!(world.gravity_y < 0.0);
        assert_eq!(world.previous_timestep, 0.0);
    }
}

mod create_rigid_body2d {
    use super::*;

    #[test]
    fn creates_a_body_at_rest_with_no_mass_until_a_world_derives_it_from_the_colliders() {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, 4.0, Some(0.5));
        let body = read(&body);
        assert_eq!(body.x, 3.0);
        assert_eq!(body.angle, 0.5);
        assert_eq!(body.mass, 0.0);
        assert_eq!(body.index, -1);
        assert!(!body.fixed_rotation);
        assert!(!body.bullet);
        assert!(body.sleep_enabled);
    }
}

mod find_physics2d_body {
    use super::*;

    #[test]
    fn reports_null_once_the_body_is_gone_rather_than_resurrecting_a_slot() {
        let mut world = create_physics2d_world(None, None, None);
        let first = add(&mut world, box_body(0.0, 0.0));
        add(&mut world, box_body(1.0, 0.0));
        let first_index = read(&first).index;
        remove_physics2d_body(&mut world, &first);
        assert!(find_physics2d_body(&world, first_index).is_none());
        assert!(!world.body_by_index.contains_key(&first_index));
    }

    #[test]
    fn resolves_a_contact_stored_index_back_to_its_body() {
        let mut world = create_physics2d_world(None, None, None);
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(1.0, 0.0));
        assert!(Arc::ptr_eq(
            &find_physics2d_body(&world, read(&first).index).unwrap(),
            &first
        ));
        assert!(Arc::ptr_eq(
            &find_physics2d_body(&world, read(&second).index).unwrap(),
            &second
        ));
    }
}

mod hydrate_physics2d_world {
    use super::*;

    // D15: deleting fields from a typed record is not representable; the legacy layout is modelled by
    // its absent version (0), with the fields already at their canonical defaults.
    #[test]
    fn upgrades_pre_ccd_body_and_solver_records_with_canonical_defaults() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        world.version = 0;

        assert!(hydrate_physics2d_world(&mut world));

        assert_eq!(world.version, PHYSICS2D_WORLD_VERSION);
        assert!(world.config.continuous_collision);
        assert_eq!(world.config.max_ccd_substeps, 8);
        assert_eq!(world.config.max_ccd_rotation_substeps, 64);
        assert!(!read(&body).bullet);
        assert!(!read(&body).fixed_rotation);
        assert!(read(&body).sleep_enabled);
        assert!(!throws(|| step(&mut world)));
    }

    #[test]
    fn preserves_current_values_and_rejects_unknown_future_versions() {
        let mut current = create_physics2d_world(None, None, None);
        current.config.continuous_collision = false;
        current.config.max_ccd_substeps = 2;
        assert!(hydrate_physics2d_world(&mut current));
        assert!(!current.config.continuous_collision);
        assert_eq!(current.config.max_ccd_substeps, 2);

        let mut future = create_physics2d_world(None, None, None);
        future.version = PHYSICS2D_WORLD_VERSION + 1;
        assert!(!hydrate_physics2d_world(&mut future));
        assert_eq!(future.version, PHYSICS2D_WORLD_VERSION + 1);
    }
}

mod initialize_physics2d_collider {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_collider() {
        let mut out: Physics2DCollider = allocate_entity();
        let filter = Physics2DCollisionFilter {
            category_bits: 2,
            mask_bits: 3,
            group_index: 1,
        };
        initialize_physics2d_collider(
            &mut out,
            filter,
            circle(0.0, 0.0, 1.0),
            STONE,
            true,
            circle(1.0, 0.0, 1.0),
        );
        assert_eq!(out.filter, filter);
        assert_eq!(out.local, circle(0.0, 0.0, 1.0));
        assert_eq!(out.material, STONE);
        assert!(out.sensor);
        assert_eq!(out.world, circle(1.0, 0.0, 1.0));
    }
}

mod initialize_physics2d_world {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_world() {
        let mut out: Physics2DWorld = allocate_entity();
        initialize_physics2d_world(
            &mut out,
            create_physics2d_solver_config(),
            1.0,
            -2.0,
            flight_spatial::create_uniform_grid_spatial_backend_2d(1.0),
        );
        assert_eq!(out.gravity_x, 1.0);
        assert_eq!(out.gravity_y, -2.0);
        assert_eq!(out.config, create_physics2d_solver_config());
        assert_eq!(out.bodies.len(), 0);
        assert_eq!(out.version, PHYSICS2D_WORLD_VERSION);
    }
}

mod initialize_rigid_body2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_rigid_body2d() {
        let mut out: RigidBody2D = allocate_entity();
        initialize_rigid_body2d(&mut out, 0.5, Physics2DBodyType::Kinematic, 3.0, 4.0);
        assert_eq!(out.angle, 0.5);
        assert_eq!(out.body_type, Physics2DBodyType::Kinematic);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
        assert_eq!(out.index, -1);
        assert!(out.sleep_enabled);
    }
}

mod invalidate_physics2d_collider {
    use super::*;

    #[test]
    fn invalidates_contacts_after_filter_and_sensor_changes() {
        let mut world = world_at(0.0, 0.0);
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(0.75, 0.0));
        step(&mut world);
        assert_eq!(world.contacts.len(), 1);

        let collider = read(&first).colliders[0].clone();
        collider.write().unwrap().sensor = true;
        assert!(invalidate_physics2d_collider(&mut world, &first, &collider));
        assert_eq!(world.contacts.len(), 0);
        step(&mut world);
        assert!(world.contacts[0].read().unwrap().sensor);

        collider.write().unwrap().filter.mask_bits = 0;
        assert!(invalidate_physics2d_collider(&mut world, &first, &collider));
        step(&mut world);
        assert_eq!(world.contacts.len(), 0);
        assert!(!read(&second).sleeping);
    }

    #[test]
    fn rebuilds_changed_shape_storage_mass_data_and_broadphase_bounds() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        let collider = read(&body).colliders[0].clone();
        {
            let mut collider = collider.write().unwrap();
            collider.local = circle(4.0, 0.0, 2.0);
            collider.material.density = 2.0;
        }
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;

        assert!(invalidate_physics2d_collider(&mut world, &body, &collider));

        let old_location = query_point(&world, 0.0, 0.0);
        let new_location = query_point(&world, 4.0, 0.0);
        assert!(matches!(
            collider.read().unwrap().world,
            CollisionShape2D::Circle(_)
        ));
        assert!((read(&body).mass - 8.0 * std::f32::consts::PI).abs() < 0.005);
        assert!(!read(&body).sleeping);
        assert_eq!(read(&body).sleep_timer, 0.0);
        assert_eq!(old_location, Vec::<i32>::new());
        assert_eq!(new_location, vec![read(&body).index]);
    }

    #[test]
    fn reports_false_when_the_body_does_not_own_the_collider() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(0.0, 0.0));
        let absent = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        assert!(!invalidate_physics2d_collider(&mut world, &body, &absent));
    }
}

mod is_physics2d_pair_ordered {
    use super::*;

    #[test]
    fn orders_by_persistent_index_which_is_the_only_key_that_survives_motion() {
        let mut world = create_physics2d_world(None, None, None);
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(1.0, 0.0));
        assert!(is_physics2d_pair_ordered(&read(&first), &read(&second)));
        assert!(!is_physics2d_pair_ordered(&read(&second), &read(&first)));

        write(&first).x = 100.0;
        assert!(is_physics2d_pair_ordered(&read(&first), &read(&second)));
    }
}

mod remove_physics2d_body {
    use super::*;

    #[test]
    fn does_not_wake_a_sleeper_when_only_a_sensor_overlap_is_removed() {
        let mut world = world_at(0.0, 0.0);
        let trigger = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        write(&trigger).colliders.push(create_physics2d_collider(
            &aabb(-1.0, -1.0, 1.0, 1.0),
            &STONE,
            Some(true),
            None,
        ));
        add_physics2d_body(&mut world, &trigger);
        let crate_body = add(&mut world, box_body(0.0, 0.0));
        step(&mut world);
        assert!(world.contacts[0].read().unwrap().sensor);
        write(&crate_body).sleeping = true;
        write(&crate_body).sleep_timer = 5.0;

        remove_physics2d_body(&mut world, &trigger);

        assert!(read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).sleep_timer, 5.0);
    }

    #[test]
    fn drops_every_contact_naming_the_removed_body() {
        let mut world = create_physics2d_world(None, None, None);
        add_physics2d_body(&mut world, &static_floor(-5.0, 5.0));
        let crate_body = add(&mut world, box_body(0.0, 0.4));
        step(&mut world);
        assert!(!world.contacts.is_empty());

        assert!(remove_physics2d_body(&mut world, &crate_body));
        assert_eq!(world.contacts.len(), 0);
        assert_eq!(world.bodies.len(), 1);
    }

    #[test]
    fn releases_ownership_and_assigns_a_fresh_persistent_identity_when_reinserted() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(0.0, 0.0));
        let first_index = read(&body).index;

        remove_physics2d_body(&mut world, &body);
        add_physics2d_body(&mut world, &body);

        assert_eq!(first_index, 0);
        assert_eq!(read(&body).index, 1);
        assert!(!world.body_by_index.contains_key(&first_index));
        assert!(Arc::ptr_eq(&world.body_by_index[&read(&body).index], &body));
    }

    #[test]
    fn reports_false_for_a_body_the_world_does_not_hold() {
        assert!(!remove_physics2d_body(
            &mut create_physics2d_world(None, None, None),
            &box_body(0.0, 0.0)
        ));
    }

    #[test]
    fn retains_a_one_body_joint_when_only_its_unused_body_a_placeholder_is_removed() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(
            &mut world,
            "OneBody".to_string(),
            no_op_solver(Some(false)),
        );
        let placeholder = add(&mut world, box_body(0.0, 0.0));
        let constrained = add(&mut world, box_body(2.0, 0.0));
        let joint = entity_joint(
            "OneBody",
            read(&placeholder).index,
            read(&constrained).index,
            false,
            [0.0; 3],
        );
        add_physics2d_joint(&mut world, &joint);

        remove_physics2d_body(&mut world, &placeholder);

        assert_eq!(world.joints.len(), 1);
        assert!(Arc::ptr_eq(&world.joints[0], &joint));
    }

    #[test]
    fn wakes_a_sleeping_body_when_its_supporting_contact_is_removed_with_the_other_body() {
        let mut world = create_physics2d_world(None, None, None);
        let floor = static_floor(-5.0, 5.0);
        add_physics2d_body(&mut world, &floor);
        let crate_body = add(&mut world, box_body(0.0, 0.5));
        for _ in 0..180 {
            step(&mut world);
        }
        assert!(read(&crate_body).sleeping);
        let resting_y = read(&crate_body).y;

        remove_physics2d_body(&mut world, &floor);

        assert!(!read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).sleep_timer, 0.0);
        step(&mut world);
        assert!(read(&crate_body).y < resting_y);
    }
}

mod remove_physics2d_collider {
    use super::*;

    #[test]
    fn recomputes_mass_shifts_collider_identity_safely_and_republishes_bounds() {
        let mut world = world_at(0.0, 0.0);
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let left = create_physics2d_collider(&circle(-4.0, 0.0, 1.0), &STONE, None, None);
        let right = create_physics2d_collider(&circle(4.0, 0.0, 2.0), &STONE, None, None);
        write(&body).colliders.push(left.clone());
        write(&body).colliders.push(right.clone());
        add_physics2d_body(&mut world, &body);
        let original_mass = read(&body).mass;

        assert!(remove_physics2d_collider(&mut world, &body, &left));

        let removed_location = query_point(&world, -4.0, 0.0);
        let retained_location = query_point(&world, 4.0, 0.0);
        assert_eq!(read(&body).colliders.len(), 1);
        assert!(Arc::ptr_eq(&read(&body).colliders[0], &right));
        assert!(read(&body).mass < original_mass);
        assert_eq!(removed_location, Vec::<i32>::new());
        assert_eq!(retained_location, vec![read(&body).index]);
    }

    #[test]
    fn reports_false_without_changing_mass_when_the_collider_is_absent() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(0.0, 0.0));
        let mass = read(&body).mass;
        let absent = create_physics2d_collider(&circle(0.0, 0.0, 1.0), &STONE, None, None);
        assert!(!remove_physics2d_collider(&mut world, &body, &absent));
        assert_eq!(read(&body).mass, mass);
    }
}

mod set_physics2d_body_bullet {
    use super::*;

    #[test]
    fn changes_ccd_policy_and_wakes_the_owned_body() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(0.0, 0.0));
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;

        assert!(set_physics2d_body_bullet(&mut world, &body, true));

        assert!(read(&body).bullet);
        assert!(!read(&body).sleeping);
        assert_eq!(read(&body).sleep_timer, 0.0);
    }

    #[test]
    fn reports_false_for_a_body_outside_the_world() {
        assert!(!set_physics2d_body_bullet(
            &mut create_physics2d_world(None, None, None),
            &box_body(0.0, 0.0),
            true
        ));
    }
}

mod set_physics2d_body_fixed_rotation {
    use super::*;

    #[test]
    fn preserves_linear_mass_while_clearing_spin_torque_angular_response_and_cached_contacts() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        let other = add(&mut world, box_body(0.75, 0.0));
        step(&mut world);
        write(&body).angular_velocity = 4.0;
        write(&body).torque = 7.0;
        let mass = read(&body).mass;
        write(&other).sleeping = true;

        assert!(set_physics2d_body_fixed_rotation(&mut world, &body, true));

        assert_eq!(read(&body).mass, mass);
        assert!(read(&body).inverse_mass > 0.0);
        assert_eq!(read(&body).inverse_inertia, 0.0);
        assert_eq!(read(&body).angular_velocity, 0.0);
        assert_eq!(read(&body).torque, 0.0);
        assert_eq!(world.contacts.len(), 0);
        assert!(!read(&other).sleeping);
        assert!(!apply_physics2d_torque(&mut write(&body), 10.0));
        let (x, y) = (read(&body).x, read(&body).y);
        assert!(apply_physics2d_force_at_point(
            &mut write(&body),
            1.0,
            0.0,
            x,
            y + 1.0
        ));
        assert_eq!(read(&body).torque, 0.0);
        assert!(apply_physics2d_linear_impulse_at_point(
            &mut write(&body),
            1.0,
            0.0,
            x,
            y + 1.0
        ));
        assert_eq!(read(&body).angular_velocity, 0.0);
        write(&body).angular_velocity = 100.0;
        let angle = read(&body).angle;
        step(&mut world);
        assert_eq!(read(&body).angle, angle);
        assert_eq!(read(&body).angular_velocity, 0.0);

        assert!(set_physics2d_body_fixed_rotation(&mut world, &body, false));
        assert!(read(&body).inverse_inertia > 0.0);
    }

    #[test]
    fn reports_false_for_a_body_outside_the_world() {
        assert!(!set_physics2d_body_fixed_rotation(
            &mut create_physics2d_world(None, None, None),
            &box_body(0.0, 0.0),
            true
        ));
    }
}

mod set_physics2d_body_sleep_enabled {
    use super::*;

    #[test]
    fn reports_false_for_a_body_outside_the_world() {
        assert!(!set_physics2d_body_sleep_enabled(
            &mut create_physics2d_world(None, None, None),
            &box_body(0.0, 0.0),
            false
        ));
    }

    #[test]
    fn wakes_on_either_transition_and_requires_a_new_stillness_interval_when_re_enabled() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        write(&body).sleeping = true;
        write(&body).sleep_timer = 5.0;

        assert!(set_physics2d_body_sleep_enabled(&mut world, &body, false));
        assert!(!read(&body).sleep_enabled);
        assert!(!read(&body).sleeping);
        assert_eq!(read(&body).sleep_timer, 0.0);

        write(&body).sleep_timer = 5.0;
        assert!(set_physics2d_body_sleep_enabled(&mut world, &body, true));
        assert!(read(&body).sleep_enabled);
        assert_eq!(read(&body).sleep_timer, 0.0);
    }
}

mod set_physics2d_body_transform {
    use super::*;

    #[test]
    fn invalidates_pose_caches_wakes_connected_bodies_and_republishes_bounds() {
        let mut world = world_at(0.0, 0.0);
        register_physics2d_joint_solver(&mut world, "Cached".to_string(), no_op_solver(None));
        let first = add(&mut world, box_body(0.0, 0.0));
        let second = add(&mut world, box_body(0.75, 0.0));
        let joint = entity_joint(
            "Cached",
            read(&first).index,
            read(&second).index,
            true,
            [3.0, 4.0, 5.0],
        );
        add_physics2d_joint(&mut world, &joint);
        step(&mut world);
        {
            let mut guard = joint.write().unwrap();
            let fields = guard.joint_fields_mut();
            fields.impulse0 = 3.0;
            fields.impulse1 = 4.0;
            fields.impulse2 = 5.0;
        }
        write(&first).sleeping = true;
        write(&second).sleeping = true;

        assert!(set_physics2d_body_transform(
            &mut world, &first, 4.0, 2.0, 0.25
        ));

        let moved_location = query_point(&world, 4.0, 2.0);
        assert_eq!(world.contacts.len(), 0);
        assert_eq!(world.events.began.len(), 0);
        {
            let guard = joint.read().unwrap();
            let fields = guard.joint_fields();
            assert_eq!(
                [fields.impulse0, fields.impulse1, fields.impulse2],
                [0.0, 0.0, 0.0]
            );
        }
        assert!(!read(&first).sleeping);
        assert!(!read(&second).sleeping);
        assert_eq!(moved_location, vec![read(&first).index]);
    }

    #[test]
    fn reports_invalid_transforms_without_changing_the_body() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add(&mut world, box_body(1.0, 2.0));
        assert!(!set_physics2d_body_transform(
            &mut world,
            &body,
            f32::NAN,
            3.0,
            0.0
        ));
        assert!(!set_physics2d_body_transform(
            &mut create_physics2d_world(None, None, None),
            &body,
            4.0,
            5.0,
            0.0
        ));
        assert_eq!(
            [read(&body).x, read(&body).y, read(&body).angle],
            [1.0, 2.0, 0.0]
        );
    }
}

mod set_physics2d_body_type {
    use super::*;

    #[test]
    fn rebuilds_mass_and_clears_incompatible_state_across_type_transitions() {
        let mut world = world_at(0.0, 0.0);
        let body = add(&mut world, box_body(0.0, 0.0));
        let other = add(&mut world, box_body(0.75, 0.0));
        step(&mut world);
        {
            let mut body = write(&body);
            body.velocity_x = 2.0;
            body.velocity_y = 3.0;
            body.angular_velocity = 4.0;
            body.force_x = 5.0;
            body.force_y = 6.0;
            body.torque = 7.0;
        }
        write(&other).sleeping = true;

        assert!(set_physics2d_body_type(
            &mut world,
            &body,
            Physics2DBodyType::Static
        ));
        {
            let body = read(&body);
            assert_eq!(body.mass, 0.0);
            assert_eq!(body.inverse_mass, 0.0);
            assert_eq!(
                [body.velocity_x, body.velocity_y, body.angular_velocity],
                [0.0, 0.0, 0.0]
            );
            assert_eq!([body.force_x, body.force_y, body.torque], [0.0, 0.0, 0.0]);
        }
        assert_eq!(world.contacts.len(), 0);
        assert!(!read(&other).sleeping);

        assert!(set_physics2d_body_type(
            &mut world,
            &body,
            Physics2DBodyType::Dynamic
        ));
        assert!((read(&body).mass - 1.0).abs() < 0.005);
        assert!((read(&body).inverse_mass - 1.0).abs() < 0.005);
    }

    #[test]
    fn reports_false_for_a_body_outside_the_world() {
        assert!(!set_physics2d_body_type(
            &mut create_physics2d_world(None, None, None),
            &box_body(0.0, 0.0),
            Physics2DBodyType::Static
        ));
    }
}
