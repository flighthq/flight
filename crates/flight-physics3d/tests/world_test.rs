use std::sync::{Arc, RwLock};

use super::*;
use crate::common::*;
use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionConvex3D, CollisionShape3D,
};

fn physics_3d_sequential_impulse_config_options() -> Physics3DSequentialImpulseConfigOptions {
    return Physics3DSequentialImpulseConfigOptions {
        velocity_iterations: None,
        position_iterations: None,
        penetration_slop: None,
        position_correction: None,
        restitution_threshold: None,
        warm_starting: None,
    };
}

fn physics_3d_solver_config_options() -> Physics3DSolverConfigOptions {
    return Physics3DSolverConfigOptions {
        allow_sleeping: None,
        sleep_linear_threshold: None,
        sleep_angular_threshold: None,
        time_to_sleep: None,
        substeps: None,
        continuous_collision: None,
        max_ccd_substeps: None,
        max_ccd_rotation_substeps: None,
        sequential_impulse: None,
    };
}

fn unit_box_shape() -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    }))
}

fn add_collider_test_body(world: &mut Physics3DWorld, x: f32) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    body.write().unwrap().x = x;
    add_physics_3d_body(world, &body);
    body
}

fn triangle_mesh_shape() -> CollisionColliderShape3D {
    CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(collision_triangle_mesh3d(
        vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        vec![0, 1, 2],
    ))))
}

fn heightfield_shape() -> CollisionColliderShape3D {
    CollisionColliderShape3D::Heightfield(Arc::new(RwLock::new(collision_heightfield3d(
        2,
        2,
        vec![0.0; 4],
        1.0,
        1.0,
    ))))
}

fn sphere_body() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
    set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);
    body
}

fn touching_contact(body_a: i32, body_b: i32) -> Physics3DContactRef {
    let contact = physics_3d_contact(body_a, body_b, None, None);
    {
        let mut contact_write = contact.write().unwrap();
        contact_write.enabled = true;
        contact_write.normal_y = 1.0;
        contact_write.friction = 0.2;
        contact_write.touching = true;
    }
    contact
}

mod add_physics_3d_body {
    use super::*;

    #[test]
    fn rejects_static_surface_geometry_on_a_movable_body() {
        let mut world = world();
        let body = create_rigid_body_3d();
        let collider = physics_3d_collider(&triangle_mesh_shape(), None, None, None);
        body.write().unwrap().colliders.push(collider);

        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_body(&mut world, &body);
        }))
        .is_err());
        assert!(world.bodies.is_empty());
    }

    #[test]
    fn assigns_a_persistent_index_and_registers_the_body() {
        let mut world = world();
        let body = create_rigid_body_3d();

        let index = add_physics_3d_body(&mut world, &body);

        assert_eq!(index, 0);
        assert!(world
            .bodies
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, &body)));
        assert!(Arc::ptr_eq(
            &find_physics_3d_body(&world, index).unwrap(),
            &body
        ));
    }

    #[test]
    fn never_reissues_an_index_a_removed_body_held() {
        let mut world = world();
        let first = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &first);
        let removed_index = first.read().unwrap().index;
        remove_physics_3d_body(&mut world, &first);

        let second = create_rigid_body_3d();
        let index = add_physics_3d_body(&mut world, &second);

        assert_ne!(index, removed_index);
        assert_eq!(first.read().unwrap().index, -1);
        assert!(find_physics_3d_body(&world, removed_index).is_none());
    }

    #[test]
    fn permits_a_removed_body_to_enter_another_world() {
        let mut first = world();
        let mut second = world();
        let body = create_rigid_body_3d();
        add_physics_3d_body(&mut first, &body);
        remove_physics_3d_body(&mut first, &body);
        assert_eq!(add_physics_3d_body(&mut second, &body), 0);
        assert_eq!(second.bodies.len(), 1);
        assert!(Arc::ptr_eq(&second.bodies[0], &body));
    }

    #[test]
    fn rejects_duplicate_and_cross_world_insertion_atomically() {
        let mut first = world();
        let mut second = world();
        let body = create_rigid_body_3d();
        let index = add_physics_3d_body(&mut first, &body);
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_body(&mut first, &body);
        }))
        .is_err());
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_body(&mut second, &body);
        }))
        .is_err());
        assert_eq!(first.bodies.len(), 1);
        assert!(Arc::ptr_eq(first.body_by_index.get(&index).unwrap(), &body));
        assert!(second.bodies.is_empty());
    }

    #[test]
    fn derives_mass_and_claims_colliders_authored_before_insertion() {
        let mut world = world();
        let body = create_rigid_body_3d();
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        body.write().unwrap().colliders.push(collider.clone());

        add_physics_3d_body(&mut world, &body);

        assert!((body.read().unwrap().mass - 1.0).abs() < 1e-6);
        assert!((body.read().unwrap().inverse_mass - 1.0).abs() < 1e-6);
        let second = create_rigid_body_3d();
        second.write().unwrap().colliders.push(collider);
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_body(&mut world, &second);
        }))
        .is_err());
        assert_eq!(
            second
                .read()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .index,
            -1
        );
    }

    #[test]
    fn rejects_the_same_pre_authored_collider_twice_before_mutating_the_world() {
        let mut world = world();
        let body = create_rigid_body_3d();
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        body.write()
            .unwrap()
            .colliders
            .extend([collider.clone(), collider]);

        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_body(&mut world, &body);
        }))
        .is_err());
        assert_eq!(body.read().unwrap().index, -1);
        assert!(world.bodies.is_empty());
    }
}

mod add_physics_3d_collider {
    use super::*;

    #[test]
    fn rejects_a_heightfield_on_an_already_owned_movable_body() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        let collider = physics_3d_collider(&heightfield_shape(), None, None, None);

        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_collider(&mut world, &body, &collider);
        }))
        .is_err());
    }

    #[test]
    fn attaches_the_collider_and_derives_the_body_mass_from_its_geometry() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        assert_eq!(body.read().unwrap().mass, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);

        add_physics_3d_collider(&mut world, &body, &collider);

        assert_eq!(body.read().unwrap().colliders.len(), 1);
        assert!(Arc::ptr_eq(&body.read().unwrap().colliders[0], &collider));
        assert!((body.read().unwrap().mass - 1.0).abs() < 1e-6);
        assert!((body.read().unwrap().inverse_mass - 1.0).abs() < 1e-6);
    }

    #[test]
    fn returns_the_collider_it_was_given() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);

        add_physics_3d_collider(&mut world, &body, &collider);

        assert!(Arc::ptr_eq(&body.read().unwrap().colliders[0], &collider));
    }

    #[test]
    fn moves_the_center_of_mass_to_an_offset_collider() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: 1.5,
            min_y: -0.5,
            min_z: -0.5,
            max_x: 2.5,
            max_y: 0.5,
            max_z: 0.5,
        }));
        let collider = physics_3d_collider(&shape, None, None, None);

        add_physics_3d_collider(&mut world, &body, &collider);

        assert!((body.read().unwrap().center_x - 2.0).abs() < 1e-6);
    }

    #[test]
    fn balances_a_compound_body_between_its_pieces() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        for (min_x, max_x) in [(-2.5, -1.5), (1.5, 2.5)] {
            let shape =
                CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                    min_x,
                    min_y: -0.5,
                    min_z: -0.5,
                    max_x,
                    max_y: 0.5,
                    max_z: 0.5,
                }));
            let collider = physics_3d_collider(&shape, None, None, None);
            add_physics_3d_collider(&mut world, &body, &collider);
        }

        assert!((body.read().unwrap().mass - 2.0).abs() < 1e-6);
        assert!(body.read().unwrap().center_x.abs() < 1e-6);
    }

    #[test]
    fn publishes_the_new_geometry_immediately_rather_than_waiting_for_a_step() {
        let mut world = world();
        let floor = add_collider_test_body(&mut world, -1.0);
        let floor_collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &floor, &floor_collider);
        let box_body = add_collider_test_body(&mut world, -0.25);
        let box_collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &box_body, &box_collider);

        build_physics_3d_contacts(&mut world, &registered_registry());

        assert_eq!(world.contacts.len(), 1);
    }

    #[test]
    fn refuses_the_same_collider_twice_on_one_body() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &body, &collider);

        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_collider(&mut world, &body, &collider);
        }))
        .is_err());
    }

    #[test]
    fn refuses_to_share_one_collider_between_two_bodies() {
        let mut world = world();
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        let first = add_collider_test_body(&mut world, 0.0);
        add_physics_3d_collider(&mut world, &first, &collider);
        let second = add_collider_test_body(&mut world, 0.0);

        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            add_physics_3d_collider(&mut world, &second, &collider);
        }))
        .is_err());
    }

    #[test]
    fn refuses_to_mutate_a_body_through_a_world_that_does_not_own_it() {
        let mut owner = world();
        let mut foreign = world();
        let body = add_body(&mut owner, Physics3DBodyType::Dynamic);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
            add_physics_3d_collider(&mut foreign, &body, &collider);
        }));
        assert!(result.is_err());
        assert!(body
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .colliders
            .is_empty());
        assert!(foreign.bodies.is_empty());
    }
}

mod apply_physics_3d_angular_impulse {
    use super::*;

    #[test]
    fn changes_angular_velocity_immediately_through_world_inverse_inertia() {
        let body = sphere_body();
        assert!(apply_physics_3d_angular_impulse(&body, 0.0, 0.0, 2.0));
        assert!(body.read().unwrap().angular_velocity_z > 0.0);
    }

    #[test]
    fn rejects_fixed_rotation_immovable_bodies_and_non_finite_input_atomically() {
        let body = sphere_body();
        body.write().unwrap().fixed_rotation = true;
        assert!(!apply_physics_3d_angular_impulse(&body, 1.0, 0.0, 0.0));
        {
            let mut body_write = body.write().unwrap();
            body_write.fixed_rotation = false;
            body_write.body_type = Physics3DBodyType::Static;
        }
        assert!(!apply_physics_3d_angular_impulse(&body, 1.0, 0.0, 0.0));
        body.write().unwrap().body_type = Physics3DBodyType::Dynamic;
        assert!(!apply_physics_3d_angular_impulse(&body, f32::NAN, 0.0, 0.0));
        assert_eq!(body.read().unwrap().angular_velocity_x, 0.0);
    }
}

mod apply_physics_3d_force {
    use super::*;

    #[test]
    fn accumulates_onto_the_force_vector_and_wakes_the_body() {
        let body = sphere_body();
        body.write().unwrap().sleeping = true;
        assert!(apply_physics_3d_force(&body, 1.0, 2.0, 3.0));
        assert_eq!(body.read().unwrap().force_y, 2.0);
        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn ignores_a_static_body() {
        let body = rigid_body(Physics3DBodyType::Static);
        assert!(!apply_physics_3d_force(&body, 1.0, 2.0, 3.0));
        assert_eq!(body.read().unwrap().force_y, 0.0);
    }

    #[test]
    fn rejects_a_non_finite_force_without_partially_mutating_or_waking_the_body() {
        let body = sphere_body();
        body.write().unwrap().sleeping = true;
        assert!(!apply_physics_3d_force(&body, 1.0, f32::NAN, 3.0));
        let body = body.read().unwrap();
        assert_eq!(body.force_x, 0.0);
        assert_eq!(body.force_y, 0.0);
        assert!(body.sleeping);
    }
}

mod apply_physics_3d_force_at_point {
    use super::*;

    #[test]
    fn produces_torque_from_the_lever_arm() {
        let body = sphere_body();
        assert!(apply_physics_3d_force_at_point(
            &body, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0
        ));
        let body = body.read().unwrap();
        assert_eq!(body.force_x, 1.0);
        assert_eq!(body.torque_z, -1.0);
    }

    #[test]
    fn produces_no_torque_for_a_force_through_the_center_of_mass() {
        let body = sphere_body();
        assert!(apply_physics_3d_force_at_point(
            &body, 5.0, 0.0, 0.0, 0.0, 0.0, 0.0
        ));
        let body = body.read().unwrap();
        assert_eq!(
            (body.torque_x, body.torque_y, body.torque_z),
            (0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn measures_the_lever_arm_from_the_center_of_mass_not_the_origin() {
        let body = sphere_body();
        body.write().unwrap().center_y = 1.0;
        assert!(apply_physics_3d_force_at_point(
            &body, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0
        ));
        assert_eq!(body.read().unwrap().torque_z, 0.0);
    }

    #[test]
    fn rejects_a_non_finite_point_before_accumulating_any_force() {
        let body = sphere_body();
        assert!(!apply_physics_3d_force_at_point(
            &body,
            1.0,
            2.0,
            3.0,
            f32::INFINITY,
            0.0,
            0.0
        ));
        let body = body.read().unwrap();
        assert_eq!(body.force_x, 0.0);
        assert_eq!(body.torque_z, 0.0);
    }
}

mod apply_physics_3d_linear_impulse {
    use super::*;

    #[test]
    fn changes_velocity_immediately_through_the_inverse_mass() {
        let body = sphere_body();
        let mass = body.read().unwrap().mass;
        assert!(apply_physics_3d_linear_impulse(&body, mass * 3.0, 0.0, 0.0));
        assert!((body.read().unwrap().velocity_x - 3.0).abs() < 1e-6);
    }

    #[test]
    fn ignores_an_immovable_body() {
        let body = rigid_body(Physics3DBodyType::Static);
        assert!(!apply_physics_3d_linear_impulse(&body, 100.0, 0.0, 0.0));
        assert_eq!(body.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn rejects_a_non_finite_impulse_without_poisoning_velocity() {
        let body = sphere_body();
        assert!(!apply_physics_3d_linear_impulse(&body, f32::NAN, 0.0, 0.0));
        assert_eq!(body.read().unwrap().velocity_x, 0.0);
    }
}

mod apply_physics_3d_linear_impulse_at_point {
    use super::*;

    #[test]
    fn changes_linear_and_angular_velocity() {
        let body = sphere_body();
        assert!(apply_physics_3d_linear_impulse_at_point(
            &body, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0,
        ));
        let body = body.read().unwrap();
        assert!(body.velocity_x > 0.0);
        assert!(body.angular_velocity_z < 0.0);
    }

    #[test]
    fn uses_the_world_center_of_mass_for_the_lever_arm() {
        let body = sphere_body();
        body.write().unwrap().center_y = 1.0;
        assert!(apply_physics_3d_linear_impulse_at_point(
            &body, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0
        ));
        assert_eq!(body.read().unwrap().angular_velocity_z, 0.0);
    }

    #[test]
    fn rejects_invalid_input_atomically() {
        let body = sphere_body();
        assert!(!apply_physics_3d_linear_impulse_at_point(
            &body,
            1.0,
            0.0,
            0.0,
            0.0,
            f32::NAN,
            0.0
        ));
        let body = body.read().unwrap();
        assert_eq!(body.velocity_x, 0.0);
        assert_eq!(body.angular_velocity_z, 0.0);
    }
}

mod apply_physics_3d_torque {
    use super::*;

    #[test]
    fn accumulates_onto_the_torque_vector() {
        let body = sphere_body();
        assert!(apply_physics_3d_torque(&body, 0.0, 0.0, 4.0));
        assert_eq!(body.read().unwrap().torque_z, 4.0);
    }

    #[test]
    fn rejects_non_finite_torque_and_a_body_with_fixed_rotation() {
        let body = sphere_body();
        assert!(!apply_physics_3d_torque(&body, 0.0, 0.0, f32::NAN));
        body.write().unwrap().fixed_rotation = true;
        assert!(!apply_physics_3d_torque(&body, 0.0, 0.0, 4.0));
        assert_eq!(body.read().unwrap().torque_z, 0.0);
    }
}

mod assert_physics_3d_world_not_stepping {
    use super::*;

    #[test]
    fn accepts_an_idle_world() {
        assert_physics_3d_world_not_stepping(&world());
    }
}

mod create_physics_3d_collider {
    use super::*;

    #[test]
    fn defaults_to_a_solid_mildly_frictional_non_bouncing_surface_that_collides_with_everything() {
        let collider = create_physics_3d_collider(&unit_box_shape());
        let collider = collider.read().unwrap();
        assert_eq!(
            collider.material,
            Physics3DMaterial {
                density: 1.0,
                friction: 0.2,
                restitution: 0.0,
            }
        );
        assert_eq!(
            collider.filter,
            Physics3DCollisionFilter {
                category_bits: 1,
                mask_bits: 0xffff,
                group_index: 0,
            }
        );
        assert!(!collider.sensor);
    }

    #[test]
    fn takes_the_material_filter_and_sensor_flag_a_caller_supplies() {
        let material = Physics3DMaterial {
            density: 7.0,
            friction: 0.9,
            restitution: 0.5,
        };
        let filter = Physics3DCollisionFilter {
            category_bits: 4,
            mask_bits: 8,
            group_index: -1,
        };
        let collider = physics_3d_collider(
            &unit_box_shape(),
            Some(&material),
            Some(&filter),
            Some(true),
        );
        let collider = collider.read().unwrap();
        assert_eq!(collider.material.density, 7.0);
        assert_eq!(collider.filter.group_index, -1);
        assert!(collider.sensor);
    }

    #[test]
    fn clones_the_authored_shape_so_reusing_one_value_does_not_link_two_colliders() {
        let local = unit_box_shape();
        let first = physics_3d_collider(&local, None, None, None);
        let second = physics_3d_collider(&local, None, None, None);
        first.write().unwrap().local = sphere_shape(2.0, 0.0, 0.0, 0.0);
        assert!(matches!(
            second.read().unwrap().local,
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(_))
        ));
        assert!(matches!(
            local,
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(_))
        ));
    }

    #[test]
    fn clones_hull_points_rather_than_aliasing_the_array() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0],
            }));
        let original_ptr = match &local {
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(shape)) => {
                shape.points.as_ptr()
            }
            _ => unreachable!(),
        };
        let collider = physics_3d_collider(&local, None, None, None);
        let collider = collider.read().unwrap();
        let cloned_ptr = match &collider.local {
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(shape)) => {
                shape.points.as_ptr()
            }
            _ => unreachable!(),
        };
        assert_ne!(cloned_ptr, original_ptr);
    }

    #[test]
    fn clones_static_shape_entities_and_their_geometry_buffers() {
        let mesh = triangle_mesh_shape();
        let CollisionColliderShape3D::TriangleMesh(authored_mesh) = &mesh else {
            unreachable!();
        };
        let collider = create_physics_3d_collider(&mesh);
        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::TriangleMesh(owned_mesh) = &collider.local else {
            unreachable!();
        };
        assert!(!Arc::ptr_eq(authored_mesh, owned_mesh));
        assert_ne!(
            authored_mesh.read().unwrap().points.as_ptr(),
            owned_mesh.read().unwrap().points.as_ptr()
        );

        let heightfield = heightfield_shape();
        let CollisionColliderShape3D::Heightfield(authored_heightfield) = &heightfield else {
            unreachable!();
        };
        let collider = create_physics_3d_collider(&heightfield);
        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::Heightfield(owned_heightfield) = &collider.local else {
            unreachable!();
        };
        assert!(!Arc::ptr_eq(authored_heightfield, owned_heightfield));
        assert_ne!(
            authored_heightfield.read().unwrap().heights.as_ptr(),
            owned_heightfield.read().unwrap().heights.as_ptr()
        );
    }

    #[test]
    fn allocates_the_world_shape_ready_to_be_written_in_place() {
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        assert!(matches!(
            collider.read().unwrap().world,
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(_))
        ));
    }
}

mod create_physics_3d_sequential_impulse_config {
    use super::*;

    #[test]
    fn defaults_to_warm_starting_on() {
        assert!(create_physics_3d_sequential_impulse_config(None).warm_starting);
    }

    #[test]
    fn gives_more_velocity_iterations_than_position_iterations() {
        let config = create_physics_3d_sequential_impulse_config(None);
        assert!(config.velocity_iterations > config.position_iterations);
    }

    #[test]
    fn applies_every_optional_override() {
        let options = Physics3DSequentialImpulseConfigOptions {
            velocity_iterations: Some(12),
            position_iterations: Some(6),
            penetration_slop: Some(0.25),
            position_correction: Some(0.5),
            restitution_threshold: Some(2.0),
            warm_starting: Some(false),
        };
        assert_eq!(
            create_physics_3d_sequential_impulse_config(Some(&options)),
            Physics3DSequentialImpulseConfig {
                velocity_iterations: 12,
                position_iterations: 6,
                penetration_slop: 0.25,
                position_correction: 0.5,
                restitution_threshold: 2.0,
                warm_starting: false,
            }
        );
    }
}

mod create_physics_3d_solver_config {
    use super::*;

    #[test]
    fn defaults_substeps_to_one_reproducing_a_single_discrete_step() {
        assert_eq!(create_physics_3d_solver_config(None).substeps, 1);
    }

    #[test]
    fn carries_the_sequential_impulse_block_as_a_named_sibling_rather_than_flattened() {
        let config = create_physics_3d_solver_config(None);
        assert!(config.sequential_impulse.velocity_iterations > 0);
    }

    #[test]
    fn applies_every_optional_override() {
        let sequential_impulse = create_physics_3d_sequential_impulse_config(Some(
            &Physics3DSequentialImpulseConfigOptions {
                velocity_iterations: Some(16),
                ..physics_3d_sequential_impulse_config_options()
            },
        ));
        let options = Physics3DSolverConfigOptions {
            allow_sleeping: Some(false),
            sleep_linear_threshold: Some(0.125),
            sleep_angular_threshold: Some(0.75),
            time_to_sleep: Some(1.5),
            substeps: Some(3),
            continuous_collision: Some(true),
            max_ccd_substeps: Some(7),
            max_ccd_rotation_substeps: Some(18),
            sequential_impulse: Some(sequential_impulse.clone()),
        };
        assert_eq!(
            create_physics_3d_solver_config(Some(&options)),
            Physics3DSolverConfig {
                allow_sleeping: false,
                sleep_linear_threshold: 0.125,
                sleep_angular_threshold: 0.75,
                time_to_sleep: 1.5,
                substeps: 3,
                continuous_collision: true,
                max_ccd_substeps: 7,
                max_ccd_rotation_substeps: 18,
                sequential_impulse,
            }
        );
    }
}

mod create_physics_3d_world {
    use super::*;

    #[test]
    fn starts_empty_at_the_current_version() {
        let world = create_physics_3d_world();
        assert_eq!(world.version, PHYSICS_3D_WORLD_VERSION);
        assert!(world.bodies.is_empty());
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn defaults_gravity_to_earth_along_negative_y() {
        let world = create_physics_3d_world();
        assert_eq!(
            (world.gravity_x, world.gravity_y, world.gravity_z),
            (0.0, -9.80665, 0.0)
        );
    }

    #[test]
    fn gives_each_world_its_own_joint_solver_registry() {
        let mut a = create_physics_3d_world();
        let b = create_physics_3d_world();
        register_built_in_physics_3d_joint_solvers(&mut a);
        assert!(!a.joint_solvers.is_empty());
        assert!(b.joint_solvers.is_empty());
    }
}

mod create_rigid_body_3d {
    use super::*;

    #[test]
    fn starts_at_rest_at_the_origin_with_an_identity_orientation() {
        let body = create_rigid_body_3d();
        let body = body.read().unwrap();
        assert_eq!(body.orientation_w, 1.0);
        assert_eq!(body.velocity_x, 0.0);
        assert_eq!(body.x, 0.0);
    }

    #[test]
    fn is_immovable_until_given_mass() {
        assert_eq!(create_rigid_body_3d().read().unwrap().inverse_mass, 0.0);
    }

    #[test]
    fn defaults_to_dynamic() {
        assert_eq!(
            create_rigid_body_3d().read().unwrap().body_type,
            Physics3DBodyType::Dynamic
        );
    }
}

mod find_physics_3d_body {
    use super::*;

    #[test]
    fn returns_none_for_an_unknown_index_rather_than_panicking() {
        assert!(find_physics_3d_body(&world(), 99).is_none());
    }
}

mod hydrate_physics_3d_world {
    use super::*;

    #[test]
    fn upgrades_the_pre_collider_world_shape_and_clears_unserializable_solver_caches() {
        let mut world = world();
        let first = add_body(&mut world, Physics3DBodyType::Dynamic);
        let second = add_body(&mut world, Physics3DBodyType::Dynamic);
        let contact = physics_3d_contact(
            first.read().unwrap().index,
            second.read().unwrap().index,
            None,
            None,
        );
        world.contacts.push(contact);
        world
            .solver
            .constraints
            .push(create_physics_3d_contact_constraint());
        world.solver.constraint_by_contact.insert(7, 0);
        world.version = 1;
        world.config.max_ccd_rotation_substeps = 0;

        assert!(hydrate_physics_3d_world(&mut world));

        assert_eq!(world.version, PHYSICS_3D_WORLD_VERSION);
        assert!(world.solver.constraints.is_empty());
        assert!(world.solver.constraint_by_contact.is_empty());
        assert_eq!(world.config.max_ccd_rotation_substeps, 64);
    }

    #[test]
    fn preserves_current_values_and_rejects_an_unknown_future_version() {
        let mut current = world();
        current.config.max_ccd_substeps = 19;
        assert!(hydrate_physics_3d_world(&mut current));
        assert_eq!(current.config.max_ccd_substeps, 19);

        let mut future = world();
        future.version = PHYSICS_3D_WORLD_VERSION + 1;
        assert!(!hydrate_physics_3d_world(&mut future));
        assert_eq!(future.version, PHYSICS_3D_WORLD_VERSION + 1);
    }
}

mod initialize_physics_3d_collider {
    use super::*;

    #[test]
    fn resets_the_entity_to_its_construction_defaults() {
        let target = collider();
        target.write().unwrap().sensor = true;
        let local = sphere_shape(2.0, 1.0, 2.0, 3.0);
        initialize_physics_3d_collider(&mut target.write().unwrap(), &local);
        let target = target.read().unwrap();
        assert!(!target.sensor);
        assert_eq!(
            target.material,
            Physics3DMaterial {
                density: 1.0,
                friction: 0.2,
                restitution: 0.0,
            }
        );
        assert_eq!(
            target.filter,
            Physics3DCollisionFilter {
                category_bits: 1,
                mask_bits: 0xffff,
                group_index: 0,
            }
        );
        assert!(matches!(
            target.local,
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(_))
        ));
        assert!(matches!(
            target.world,
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(_))
        ));
    }
}

mod initialize_physics_3d_sequential_impulse_config {
    use super::*;

    #[test]
    fn matches_create_and_overwrites_existing_values() {
        let options = Physics3DSequentialImpulseConfigOptions {
            position_iterations: Some(9),
            ..physics_3d_sequential_impulse_config_options()
        };
        let mut out = create_physics_3d_sequential_impulse_config(Some(
            &Physics3DSequentialImpulseConfigOptions {
                position_iterations: Some(99),
                ..physics_3d_sequential_impulse_config_options()
            },
        ));
        initialize_physics_3d_sequential_impulse_config(&mut out, Some(&options));
        assert_eq!(
            out,
            create_physics_3d_sequential_impulse_config(Some(&options))
        );
    }
}

mod initialize_physics_3d_solver_config {
    use super::*;

    #[test]
    fn matches_create_and_overwrites_existing_values() {
        let options = Physics3DSolverConfigOptions {
            substeps: Some(4),
            ..physics_3d_solver_config_options()
        };
        let mut out = create_physics_3d_solver_config(Some(&Physics3DSolverConfigOptions {
            substeps: Some(99),
            ..physics_3d_solver_config_options()
        }));
        initialize_physics_3d_solver_config(&mut out, Some(&options));
        assert_eq!(out, create_physics_3d_solver_config(Some(&options)));
    }
}

mod initialize_physics_3d_world {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_world() {
        let mut target: Physics3DWorld = flight_entity::allocate_entity();
        initialize_physics_3d_world(&mut target);
        assert!(target.bodies.is_empty());
        assert!(target.contacts.is_empty());
        assert_eq!(target.version, PHYSICS_3D_WORLD_VERSION);
        assert_eq!(
            (target.gravity_x, target.gravity_y, target.gravity_z),
            (0.0, -9.80665, 0.0)
        );
    }
}

mod initialize_rigid_body_3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_rigid_body_3d() {
        let body = create_rigid_body_3d();
        let mut body = body.write().unwrap();
        body.velocity_x = 9.0;
        body.body_type = Physics3DBodyType::Static;
        initialize_rigid_body_3d(&mut body);
        assert_eq!(body.velocity_x, 0.0);
        assert_eq!(body.body_type, Physics3DBodyType::Dynamic);
    }
}

mod invalidate_physics_3d_collider {
    use super::*;

    #[test]
    fn rebuilds_the_mass_properties_after_the_local_shape_is_edited_in_place() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &body, &collider);
        assert!((body.read().unwrap().mass - 1.0).abs() < 1e-6);
        if let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(local)) =
            &mut collider.write().unwrap().local
        {
            local.min_x = -1.5;
            local.max_x = 1.5;
        }

        assert!(invalidate_physics_3d_collider(&mut world, &body, &collider));

        assert!((body.read().unwrap().mass - 3.0).abs() < 1e-6);
    }

    #[test]
    fn resizes_the_world_shape_when_the_edit_changed_the_hull_point_count() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let shape =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0],
            }));
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, &body, &collider);
        if let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(local)) =
            &mut collider.write().unwrap().local
        {
            local.points.extend([1.0, 1.0, 1.0]);
        }

        assert!(invalidate_physics_3d_collider(&mut world, &body, &collider));

        match &collider.read().unwrap().world {
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(world_shape)) => {
                assert_eq!(world_shape.points.len(), 6);
            }
            _ => panic!("expected convex world shape"),
        }
    }

    #[test]
    fn returns_false_for_a_collider_the_body_does_not_own() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        assert!(!invalidate_physics_3d_collider(
            &mut world, &body, &collider
        ));
    }

    #[test]
    fn drops_the_body_contacts_whose_lever_arms_used_the_old_center_of_mass() {
        let mut world = world();
        let floor = add_collider_test_body(&mut world, -1.0);
        let floor_collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &floor, &floor_collider);
        let box_body = add_collider_test_body(&mut world, -0.25);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &box_body, &collider);
        build_physics_3d_contacts(&mut world, &registered_registry());
        assert_eq!(world.contacts.len(), 1);

        assert!(invalidate_physics_3d_collider(
            &mut world, &box_body, &collider
        ));

        assert!(world.contacts.is_empty());
    }
}

mod remove_physics_3d_body {
    use super::*;

    #[test]
    fn wakes_a_sleeping_neighbour_whose_support_was_removed() {
        let mut world = world();
        let support = add_body(&mut world, Physics3DBodyType::Static);
        let sleeper = add_body(&mut world, Physics3DBodyType::Dynamic);
        world.contacts.push(touching_contact(
            support.read().unwrap().index,
            sleeper.read().unwrap().index,
        ));
        {
            let mut sleeper_write = sleeper.write().unwrap();
            sleeper_write.sleeping = true;
            sleeper_write.sleep_timer = 1.0;
        }

        assert!(remove_physics_3d_body(&mut world, &support));

        assert!(!sleeper.read().unwrap().sleeping);
        assert_eq!(sleeper.read().unwrap().sleep_timer, 0.0);
    }

    #[test]
    fn drops_pending_contact_events_that_name_the_removed_body() {
        let mut world = world();
        let removed = add_body(&mut world, Physics3DBodyType::Dynamic);
        let survivor = add_body(&mut world, Physics3DBodyType::Dynamic);
        let removed_index = removed.read().unwrap().index;
        let survivor_index = survivor.read().unwrap().index;
        world
            .events
            .began
            .push(touching_contact(removed_index, survivor_index));
        world
            .events
            .ended
            .push(touching_contact(removed_index, survivor_index));

        assert!(remove_physics_3d_body(&mut world, &removed));

        assert!(world.events.began.is_empty());
        assert!(world.events.ended.is_empty());
    }

    #[test]
    fn releases_the_ownership_of_every_joint_it_drops() {
        let mut world = world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let anchor = add_body(&mut world, Physics3DBodyType::Dynamic);
        let hanging = add_body(&mut world, Physics3DBodyType::Dynamic);
        let joint = physics_3d_ball_and_socket_joint(&joint_options(
            anchor.read().unwrap().index,
            hanging.read().unwrap().index,
        ));
        add_physics_3d_joint(&mut world, &joint);

        assert!(remove_physics_3d_body(&mut world, &hanging));

        assert!(world.joints.is_empty());
        add_physics_3d_joint(&mut world, &joint);
        assert_eq!(world.joints.len(), 1);
    }

    #[test]
    fn stops_suppressing_a_pair_whose_joint_it_just_dropped() {
        let mut world = world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let first = add_body(&mut world, Physics3DBodyType::Dynamic);
        let second = add_body(&mut world, Physics3DBodyType::Dynamic);
        let first_index = first.read().unwrap().index;
        let second_index = second.read().unwrap().index;
        let joint = physics_3d_ball_and_socket_joint(&joint_options(first_index, second_index));
        add_physics_3d_joint(&mut world, &joint);
        assert!(is_physics_3d_pair_joint_suppressed(
            &world,
            first_index,
            second_index
        ));

        assert!(remove_physics_3d_body(&mut world, &second));

        assert!(!is_physics_3d_pair_joint_suppressed(
            &world,
            first_index,
            second_index
        ));
    }

    #[test]
    fn reports_false_for_a_body_that_is_not_in_the_world() {
        assert!(!remove_physics_3d_body(
            &mut world(),
            &create_rigid_body_3d()
        ));
    }

    #[test]
    fn drops_contacts_that_named_the_removed_body() {
        let mut world = world();
        let a = add_body(&mut world, Physics3DBodyType::Dynamic);
        let b = add_body(&mut world, Physics3DBodyType::Dynamic);
        world.contacts.push(touching_contact(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));

        assert!(remove_physics_3d_body(&mut world, &a));

        assert!(world.contacts.is_empty());
    }

    #[test]
    fn drops_joints_that_named_the_removed_body() {
        let mut world = world();
        let a = add_body(&mut world, Physics3DBodyType::Dynamic);
        let b = add_body(&mut world, Physics3DBodyType::Dynamic);
        let joint = physics_3d_ball_and_socket_joint(&joint_options(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));
        let erased: Physics3DJointRef = joint;
        world.joints.push(erased);

        assert!(remove_physics_3d_body(&mut world, &b));

        assert!(world.joints.is_empty());
    }

    #[test]
    fn leaves_unrelated_contacts_in_place() {
        let mut world = world();
        let a = add_body(&mut world, Physics3DBodyType::Dynamic);
        let b = add_body(&mut world, Physics3DBodyType::Dynamic);
        let c = add_body(&mut world, Physics3DBodyType::Dynamic);
        world.contacts.push(touching_contact(
            b.read().unwrap().index,
            c.read().unwrap().index,
        ));

        assert!(remove_physics_3d_body(&mut world, &a));

        assert_eq!(world.contacts.len(), 1);
    }
}

mod remove_physics_3d_collider {
    use super::*;

    #[test]
    fn detaches_the_collider_and_rederives_the_mass() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &body, &collider);

        assert!(remove_physics_3d_collider(&mut world, &body, &collider));

        assert!(body.read().unwrap().colliders.is_empty());
        assert_eq!(body.read().unwrap().mass, 0.0);
        assert_eq!(body.read().unwrap().inverse_mass, 0.0);
    }

    #[test]
    fn returns_false_for_a_collider_the_body_does_not_own() {
        let mut world = world();
        let body = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        assert!(!remove_physics_3d_collider(&mut world, &body, &collider));
    }

    #[test]
    fn drops_the_body_contacts_because_surviving_colliders_have_been_renumbered() {
        let mut world = world();
        let floor = add_collider_test_body(&mut world, -1.0);
        let floor_collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &floor, &floor_collider);
        let box_body = add_collider_test_body(&mut world, -0.25);
        let first = physics_3d_collider(&unit_box_shape(), None, None, None);
        let second = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &box_body, &first);
        add_physics_3d_collider(&mut world, &box_body, &second);
        build_physics_3d_contacts(&mut world, &registered_registry());
        assert!(!world.contacts.is_empty());

        assert!(remove_physics_3d_collider(&mut world, &box_body, &first));

        assert!(world.contacts.is_empty());
    }

    #[test]
    fn lets_the_same_collider_be_attached_to_another_body_once_detached() {
        let mut world = world();
        let first = add_collider_test_body(&mut world, 0.0);
        let collider = physics_3d_collider(&unit_box_shape(), None, None, None);
        add_physics_3d_collider(&mut world, &first, &collider);
        assert!(remove_physics_3d_collider(&mut world, &first, &collider));
        let second = add_collider_test_body(&mut world, 0.0);

        add_physics_3d_collider(&mut world, &second, &collider);

        assert!(Arc::ptr_eq(&second.read().unwrap().colliders[0], &collider));
    }
}

mod set_physics_3d_body_bullet {
    use super::*;

    #[test]
    fn changes_continuous_collision_policy_and_wakes_an_owned_body() {
        let mut world = world();
        let body = sphere_body();
        add_physics_3d_body(&mut world, &body);
        body.write().unwrap().sleeping = true;

        assert!(set_physics_3d_body_bullet(&body, true));

        assert!(body.read().unwrap().bullet);
        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn leaves_sleep_state_unchanged_for_a_no_op() {
        let body = create_rigid_body_3d();
        body.write().unwrap().sleeping = true;
        assert!(set_physics_3d_body_bullet(&body, false));
        assert!(body.read().unwrap().sleeping);
    }
}

mod set_physics_3d_body_fixed_rotation {
    use super::*;

    #[test]
    fn zeroes_inverse_inertia_and_clears_angular_velocity_while_keeping_inverse_mass() {
        let mut world = world();
        let body = sphere_body();
        body.write().unwrap().angular_velocity_z = 5.0;
        assert!(set_physics_3d_body_fixed_rotation(&mut world, &body, true));
        let body = body.read().unwrap();
        assert_eq!(body.inverse_inertia_xx, 0.0);
        assert_eq!(body.angular_velocity_z, 0.0);
        assert!(body.inverse_mass > 0.0);
    }

    #[test]
    fn restores_inverse_inertia_from_the_stored_forward_tensor_when_released() {
        let mut world = world();
        let body = sphere_body();
        let before = body.read().unwrap().inverse_inertia_xx;
        assert!(set_physics_3d_body_fixed_rotation(&mut world, &body, true));
        assert!(set_physics_3d_body_fixed_rotation(&mut world, &body, false));
        assert!((body.read().unwrap().inverse_inertia_xx - before).abs() < 1e-6);
    }

    #[test]
    fn invalidates_owned_body_constraints_whose_effective_mass_just_changed() {
        let mut world = world();
        let body = sphere_body();
        let neighbour = sphere_body();
        add_physics_3d_body(&mut world, &body);
        add_physics_3d_body(&mut world, &neighbour);
        neighbour.write().unwrap().sleeping = true;
        world.contacts.push(touching_contact(
            body.read().unwrap().index,
            neighbour.read().unwrap().index,
        ));

        assert!(set_physics_3d_body_fixed_rotation(&mut world, &body, true));

        assert!(world.contacts.is_empty());
        assert!(!neighbour.read().unwrap().sleeping);
    }
}

mod set_physics_3d_body_sleep_enabled {
    use super::*;

    #[test]
    fn wakes_the_body_on_either_policy_transition() {
        let body = sphere_body();
        {
            let mut body_write = body.write().unwrap();
            body_write.sleeping = true;
            body_write.sleep_timer = 2.0;
        }
        assert!(set_physics_3d_body_sleep_enabled(&body, false));
        let body_read = body.read().unwrap();
        assert!(!body_read.sleep_enabled);
        assert!(!body_read.sleeping);
        assert_eq!(body_read.sleep_timer, 0.0);
    }

    #[test]
    fn leaves_sleep_state_unchanged_for_a_no_op() {
        let body = create_rigid_body_3d();
        body.write().unwrap().sleeping = true;
        assert!(set_physics_3d_body_sleep_enabled(&body, true));
        assert!(body.read().unwrap().sleeping);
    }
}

mod set_physics_3d_body_transform {
    use super::*;

    #[test]
    fn moves_the_body_and_refreshes_the_world_inertia() {
        let mut world = world();
        let body = sphere_body();
        assert!(set_physics_3d_body_transform(
            &mut world, &body, 1.0, 2.0, 3.0, 0.0, 0.0, 0.0, 1.0
        ));
        let body = body.read().unwrap();
        assert_eq!(body.y, 2.0);
        assert!((body.inverse_inertia_world_xx - body.inverse_inertia_xx).abs() < 1e-6);
    }

    #[test]
    fn normalizes_a_quaternion_it_is_handed_unnormalized() {
        let mut world = world();
        let body = sphere_body();
        assert!(set_physics_3d_body_transform(
            &mut world, &body, 0.0, 0.0, 0.0, 0.0, 0.0, 3.0, 3.0
        ));
        let body = body.read().unwrap();
        let length = (body.orientation_x * body.orientation_x
            + body.orientation_y * body.orientation_y
            + body.orientation_z * body.orientation_z
            + body.orientation_w * body.orientation_w)
            .sqrt();
        assert!((length - 1.0).abs() < 1e-6);
    }

    #[test]
    fn falls_back_to_identity_for_a_zero_quaternion_rather_than_dividing_by_zero() {
        let mut world = world();
        let body = sphere_body();
        assert!(set_physics_3d_body_transform(
            &mut world, &body, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
        ));
        assert_eq!(body.read().unwrap().orientation_w, 1.0);
    }

    #[test]
    fn rejects_a_non_finite_transform_without_invalidating_the_current_world_state() {
        let mut world = world();
        let body = sphere_body();
        let neighbour = sphere_body();
        add_physics_3d_body(&mut world, &body);
        add_physics_3d_body(&mut world, &neighbour);
        world.contacts.push(touching_contact(
            body.read().unwrap().index,
            neighbour.read().unwrap().index,
        ));
        assert!(!set_physics_3d_body_transform(
            &mut world,
            &body,
            f32::NAN,
            2.0,
            3.0,
            0.0,
            0.0,
            0.0,
            1.0,
        ));
        assert_eq!(body.read().unwrap().x, 0.0);
        assert_eq!(body.read().unwrap().y, 0.0);
        assert_eq!(world.contacts.len(), 1);
    }

    #[test]
    fn wakes_the_body() {
        let mut world = world();
        let body = sphere_body();
        body.write().unwrap().sleeping = true;
        assert!(set_physics_3d_body_transform(
            &mut world, &body, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0
        ));
        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn invalidates_contacts_and_joint_caches_and_wakes_the_other_endpoints() {
        let mut world = world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let body = sphere_body();
        let neighbour = sphere_body();
        add_physics_3d_body(&mut world, &body);
        add_physics_3d_body(&mut world, &neighbour);
        let body_index = body.read().unwrap().index;
        let neighbour_index = neighbour.read().unwrap().index;
        world
            .contacts
            .push(touching_contact(body_index, neighbour_index));
        let joint = physics_3d_ball_and_socket_joint(&joint_options(body_index, neighbour_index));
        add_physics_3d_joint(&mut world, &joint);
        joint.write().unwrap().impulse0 = 9.0;
        neighbour.write().unwrap().sleeping = true;

        assert!(set_physics_3d_body_transform(
            &mut world, &body, 10.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ));

        assert!(world.contacts.is_empty());
        assert_eq!(joint.read().unwrap().impulse0, 0.0);
        assert!(!neighbour.read().unwrap().sleeping);
    }
}

mod set_physics_3d_body_type {
    use super::*;

    #[test]
    fn declines_to_make_a_static_terrain_body_movable() {
        let mut world = world();
        let body = rigid_body(Physics3DBodyType::Static);
        let collider = physics_3d_collider(&triangle_mesh_shape(), None, None, None);
        body.write().unwrap().colliders.push(collider);
        assert!(!set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Dynamic
        ));
        assert_eq!(body.read().unwrap().body_type, Physics3DBodyType::Static);
    }

    #[test]
    fn makes_a_dynamic_body_immovable_when_it_becomes_static() {
        let mut world = world();
        let body = sphere_body();
        body.write().unwrap().velocity_x = 5.0;
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Static
        ));
        assert_eq!(body.read().unwrap().inverse_mass, 0.0);
        assert_eq!(body.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn restores_inverse_mass_and_inertia_when_a_static_body_becomes_dynamic_again() {
        let mut world = world();
        let body = sphere_body();
        let mass = body.read().unwrap().inverse_mass;
        let inertia = body.read().unwrap().inverse_inertia_xx;
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Static
        ));
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Dynamic
        ));
        assert!((body.read().unwrap().inverse_mass - mass).abs() < 1e-6);
        assert!((body.read().unwrap().inverse_inertia_xx - inertia).abs() < 1e-6);
    }

    #[test]
    fn keeps_velocity_when_a_kinematic_body_becomes_dynamic() {
        let mut world = world();
        let body = rigid_body(Physics3DBodyType::Kinematic);
        body.write().unwrap().velocity_x = 4.0;
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Dynamic
        ));
        assert_eq!(body.read().unwrap().velocity_x, 4.0);
    }

    #[test]
    fn clears_the_force_accumulators_on_any_change() {
        let mut world = world();
        let body = sphere_body();
        body.write().unwrap().force_x = 9.0;
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Kinematic
        ));
        assert_eq!(body.read().unwrap().force_x, 0.0);
    }

    #[test]
    fn is_a_no_op_for_the_type_it_already_has() {
        let mut world = world();
        let body = sphere_body();
        body.write().unwrap().force_x = 9.0;
        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Dynamic
        ));
        assert_eq!(body.read().unwrap().force_x, 9.0);
    }

    #[test]
    fn invalidates_owned_body_contacts_whose_mass_participation_just_changed() {
        let mut world = world();
        let body = sphere_body();
        let neighbour = sphere_body();
        add_physics_3d_body(&mut world, &body);
        add_physics_3d_body(&mut world, &neighbour);
        world.contacts.push(touching_contact(
            body.read().unwrap().index,
            neighbour.read().unwrap().index,
        ));
        neighbour.write().unwrap().sleeping = true;

        assert!(set_physics_3d_body_type(
            &mut world,
            &body,
            Physics3DBodyType::Static
        ));

        assert!(world.contacts.is_empty());
        assert!(!neighbour.read().unwrap().sleeping);
    }
}

mod wake_physics_3d_body {
    use super::*;

    #[test]
    fn clears_the_sleep_flag_and_timer() {
        let body = sphere_body();
        {
            let mut body_write = body.write().unwrap();
            body_write.sleeping = true;
            body_write.sleep_timer = 3.0;
        }
        wake_physics_3d_body(&body);
        assert!(!body.read().unwrap().sleeping);
        assert_eq!(body.read().unwrap().sleep_timer, 0.0);
    }

    #[test]
    fn is_a_no_op_for_a_static_body_which_is_neither_awake_nor_asleep() {
        let body = rigid_body(Physics3DBodyType::Static);
        body.write().unwrap().sleep_timer = 3.0;
        wake_physics_3d_body(&body);
        assert_eq!(body.read().unwrap().sleep_timer, 3.0);
    }
}

mod write_rigid_body_3d_world_center {
    use super::*;

    #[test]
    fn returns_the_position_when_the_center_of_mass_is_the_origin() {
        let body = sphere_body();
        let mut body_write = body.write().unwrap();
        body_write.x = 1.0;
        body_write.y = 2.0;
        body_write.z = 3.0;
        let mut center = [0.0; 3];
        write_rigid_body_3d_world_center(&body_write, &mut center);
        assert_eq!(center, [1.0, 2.0, 3.0]);
    }

    #[test]
    fn offsets_by_the_local_center_at_identity_orientation() {
        let body = sphere_body();
        let mut body_write = body.write().unwrap();
        body_write.x = 1.0;
        body_write.center_y = 2.0;
        let mut center = [0.0; 3];
        write_rigid_body_3d_world_center(&body_write, &mut center);
        assert_eq!(center, [1.0, 2.0, 0.0]);
    }

    #[test]
    fn rotates_the_local_center_by_the_body_orientation() {
        let body = sphere_body();
        let mut body_write = body.write().unwrap();
        body_write.center_x = 1.0;
        body_write.orientation_z = std::f32::consts::FRAC_1_SQRT_2;
        body_write.orientation_w = std::f32::consts::FRAC_1_SQRT_2;
        let mut center = [0.0; 3];
        write_rigid_body_3d_world_center(&body_write, &mut center);
        assert!(center[0].abs() < 1e-6);
        assert!((center[1] - 1.0).abs() < 1e-6);
    }
}
