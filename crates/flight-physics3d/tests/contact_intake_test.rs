use std::sync::Arc;

use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D,
    register_built_in_collision_face_queries3d, register_built_in_collision_supports3d,
};

use super::*;
use crate::common::*;

fn box_shape(half_x: f32, half_y: f32, half_z: f32) -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -half_x,
        min_y: -half_y,
        min_z: -half_z,
        max_x: half_x,
        max_y: half_y,
        max_z: half_z,
    }))
}

fn contact_registry() -> flight_collision::CollisionRegistry3D {
    let mut registry = registry();
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    registry
}

fn add_floor(world: &mut Physics3DWorld) -> RigidBody3DRef {
    let floor = rigid_body(Physics3DBodyType::Static);
    floor.write().unwrap().y = -1.0;
    add_physics_3d_body(world, &floor);
    let collider = physics_3d_collider(&box_shape(20.0, 1.0, 20.0), None, None, None);
    add_physics_3d_collider(world, &floor, &collider);
    floor
}

fn add_crate(world: &mut Physics3DWorld, x: f32, y: f32, sensor: bool) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    {
        let mut body = body.write().unwrap();
        body.x = x;
        body.y = y;
    }
    add_physics_3d_body(world, &body);
    let collider = physics_3d_collider(&box_shape(0.5, 0.5, 0.5), None, None, Some(sensor));
    add_physics_3d_collider(world, &body, &collider);
    body
}

mod build_physics_3d_contacts {
    use super::*;

    #[test]
    fn leaves_an_empty_world_empty() {
        let mut world = world();
        build_physics_3d_contacts(&mut world, &registry());
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn generates_a_four_point_contact_with_the_source_normal() {
        let registry = contact_registry();
        let mut world = world();
        let floor = add_floor(&mut world);
        let crate_body = add_crate(&mut world, 0.0, 0.45, false);
        assert!(world.contacts.is_empty());
        build_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.contacts.len(), 1);
        let contact = world.contacts[0].read().unwrap();
        assert_eq!(contact.point_count, 4);
        assert_eq!(contact.body_a, floor.read().unwrap().index);
        assert_eq!(contact.body_b, crate_body.read().unwrap().index);
        assert!((contact.normal_y + 1.0).abs() < 1e-5);
    }

    #[test]
    fn finds_no_contact_for_a_clear_pair() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        add_crate(&mut world, 0.0, 3.0, false);
        build_physics_3d_contacts(&mut world, &registry);
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn reports_begin_once_and_end_once() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        let crate_body = add_crate(&mut world, 0.0, 3.0, false);
        build_physics_3d_contacts(&mut world, &registry);
        assert!(world.events.began.is_empty());
        crate_body.write().unwrap().y = 0.45;
        build_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.events.began.len(), 1);
        build_physics_3d_contacts(&mut world, &registry);
        assert!(world.events.began.is_empty());
        assert_eq!(world.contacts.len(), 1);
        crate_body.write().unwrap().y = 5.0;
        build_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.events.ended.len(), 1);
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn retains_contact_identity_across_rebuilds() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        add_crate(&mut world, 0.0, 0.45, false);
        build_physics_3d_contacts(&mut world, &registry);
        let first = world.contacts[0].clone();
        build_physics_3d_contacts(&mut world, &registry);
        assert!(Arc::ptr_eq(&world.contacts[0], &first));
    }

    #[test]
    fn reports_sensor_overlap_without_a_resolvable_contact() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        add_crate(&mut world, 0.0, 0.45, true);
        build_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.contacts.len(), 1);
        assert!(world.contacts[0].read().unwrap().sensor);
    }

    #[test]
    fn skips_filter_exclusions_and_static_pairs() {
        let registry = contact_registry();
        let mut filtered = world();
        let floor = rigid_body(Physics3DBodyType::Static);
        floor.write().unwrap().y = -1.0;
        add_physics_3d_body(&mut filtered, &floor);
        let floor_filter = Physics3DCollisionFilter {
            category_bits: 1,
            mask_bits: 1,
            group_index: 0,
        };
        let floor_collider =
            physics_3d_collider(&box_shape(20.0, 1.0, 20.0), None, Some(&floor_filter), None);
        add_physics_3d_collider(&mut filtered, &floor, &floor_collider);
        let crate_body = create_rigid_body_3d();
        crate_body.write().unwrap().y = 0.45;
        add_physics_3d_body(&mut filtered, &crate_body);
        let crate_filter = Physics3DCollisionFilter {
            category_bits: 2,
            mask_bits: 2,
            group_index: 0,
        };
        let crate_collider =
            physics_3d_collider(&box_shape(0.5, 0.5, 0.5), None, Some(&crate_filter), None);
        add_physics_3d_collider(&mut filtered, &crate_body, &crate_collider);
        build_physics_3d_contacts(&mut filtered, &registry);
        assert!(filtered.contacts.is_empty());

        let mut static_world = world();
        add_floor(&mut static_world);
        let wall = rigid_body(Physics3DBodyType::Static);
        wall.write().unwrap().y = 0.45;
        add_physics_3d_body(&mut static_world, &wall);
        let wall_collider = physics_3d_collider(&box_shape(0.5, 0.5, 0.5), None, None, None);
        add_physics_3d_collider(&mut static_world, &wall, &wall_collider);
        build_physics_3d_contacts(&mut static_world, &registry);
        assert!(static_world.contacts.is_empty());
    }

    #[test]
    fn creates_one_deterministically_ordered_contact_per_collider_pair() {
        let registry = contact_registry();
        let mut compound = world();
        add_floor(&mut compound);
        let barbell = create_rigid_body_3d();
        barbell.write().unwrap().y = 0.45;
        add_physics_3d_body(&mut compound, &barbell);
        for shape in [
            CollisionAabb3D {
                min_x: -3.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: -2.5,
                max_y: 0.5,
                max_z: 0.5,
            },
            CollisionAabb3D {
                min_x: 2.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 3.5,
                max_y: 0.5,
                max_z: 0.5,
            },
        ] {
            let collider = physics_3d_collider(
                &CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(shape)),
                None,
                None,
                None,
            );
            add_physics_3d_collider(&mut compound, &barbell, &collider);
        }
        build_physics_3d_contacts(&mut compound, &registry);
        assert_eq!(compound.contacts.len(), 2);
        assert_eq!(compound.contacts[0].read().unwrap().collider_b, 0);
        assert_eq!(compound.contacts[1].read().unwrap().collider_b, 1);

        let mut ordered = world();
        add_floor(&mut ordered);
        add_crate(&mut ordered, 5.0, 0.45, false);
        add_crate(&mut ordered, -5.0, 0.45, false);
        add_crate(&mut ordered, 0.0, 0.45, false);
        build_physics_3d_contacts(&mut ordered, &registry);
        let pairs: Vec<_> = ordered
            .contacts
            .iter()
            .map(|contact| {
                let contact = contact.read().unwrap();
                (contact.body_a, contact.body_b)
            })
            .collect();
        let mut sorted = pairs.clone();
        sorted.sort();
        assert_eq!(pairs, sorted);
    }

    #[test]
    fn measures_lever_arms_from_the_centre_of_mass() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        let crate_body = create_rigid_body_3d();
        crate_body.write().unwrap().y = 0.45;
        add_physics_3d_body(&mut world, &crate_body);
        let collider = physics_3d_collider(
            &CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: 0.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 1.5,
                max_y: 0.5,
                max_z: 0.5,
            })),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &crate_body, &collider);
        assert!((crate_body.read().unwrap().center_x - 1.0).abs() < 1e-5);
        build_physics_3d_contacts(&mut world, &registry);
        let contact = world.contacts[0].read().unwrap();
        let average = contact
            .points
            .iter()
            .take(contact.point_count)
            .map(|point| point.r_bx)
            .sum::<f32>()
            / contact.point_count as f32;
        assert!(average.abs() < 1e-5, "{average}");
    }
}

mod refresh_physics_3d_contacts {
    use super::*;

    #[test]
    fn leaves_an_empty_world_empty() {
        let mut world = world();
        refresh_physics_3d_contacts(&mut world, &registry());
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn appends_transitions_and_preserves_pre_solve_fields() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        let crate_body = add_crate(&mut world, 0.0, 3.0, false);
        build_physics_3d_contacts(&mut world, &registry);
        crate_body.write().unwrap().y = 0.45;
        refresh_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.events.began.len(), 1);
        let contact = world.contacts[0].clone();
        {
            let mut contact = contact.write().unwrap();
            contact.friction = 0.9;
            contact.restitution = 0.8;
            contact.enabled = false;
            contact.sensor = true;
        }
        refresh_physics_3d_contacts(&mut world, &registry);
        assert_eq!(world.events.began.len(), 1);
        assert!(Arc::ptr_eq(&world.contacts[0], &contact));
        let contact = contact.read().unwrap();
        assert_eq!(contact.friction, 0.9);
        assert_eq!(contact.restitution, 0.8);
        assert!(!contact.enabled);
        assert!(contact.sensor);
    }
}

mod set_physics_3d_contact_intake_guard {
    use super::*;

    #[test]
    fn stores_and_clears_the_guard() {
        let mut guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: None,
            step_guard: None,
        };
        set_physics_3d_contact_intake_guard(&mut guards, Some(Arc::new(|_, _| {})));
        assert!(guards.contact_intake_guard.is_some());
        set_physics_3d_contact_intake_guard(&mut guards, None);
        assert!(guards.contact_intake_guard.is_none());
    }

    #[test]
    fn is_consulted_by_each_public_step_while_installed() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let seen = Arc::new(AtomicUsize::new(0));
        let count = seen.clone();
        let mut guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: None,
            step_guard: None,
        };
        set_physics_3d_contact_intake_guard(
            &mut guards,
            Some(Arc::new(move |_, _| {
                count.fetch_add(1, Ordering::SeqCst);
            })),
        );
        let mut world = world();
        add_floor(&mut world);
        add_crate(&mut world, 0.0, 3.0, false);
        let registry = contact_registry();
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, Some(&guards));
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, Some(&guards));
        assert_eq!(seen.load(Ordering::SeqCst), 2);
        set_physics_3d_contact_intake_guard(&mut guards, None);
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, Some(&guards));
        assert_eq!(seen.load(Ordering::SeqCst), 2);
    }
}

mod step_physics_3d_contact_generation {
    use super::*;

    #[test]
    fn lands_a_falling_box_without_tunnelling() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        let crate_body = add_crate(&mut world, 0.0, 3.0, false);
        for _ in 0..240 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }
        let body = crate_body.read().unwrap();
        assert!(body.y > 0.4);
        assert!(body.y < 0.6);
        assert!(body.velocity_y.abs() < 0.1);
        drop(body);
        for _ in 0..360 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }
        assert!(crate_body.read().unwrap().y > 0.0);
    }

    #[test]
    fn stacks_two_boxes_without_sinking() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        let lower = add_crate(&mut world, 0.0, 0.5, false);
        let upper = add_crate(&mut world, 0.0, 1.5, false);
        for _ in 0..300 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }
        let lower_y = lower.read().unwrap().y;
        let upper_y = upper.read().unwrap().y;
        assert!(lower_y > 0.4);
        assert!(upper_y - lower_y > 0.9);
        assert!(upper_y - lower_y < 1.1);
    }

    #[test]
    fn publishes_the_single_begin_transition() {
        let registry = contact_registry();
        let mut world = world();
        add_floor(&mut world);
        add_crate(&mut world, 0.0, 0.6, false);
        let mut began = 0;
        for _ in 0..60 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
            began += world.events.began.len();
        }
        assert_eq!(began, 1);
    }

    #[test]
    fn runs_identically_from_the_same_initial_state() {
        fn trace() -> Vec<[f32; 3]> {
            let registry = contact_registry();
            let mut world = world();
            add_floor(&mut world);
            let crate_body = add_crate(&mut world, 0.1, 2.0, false);
            let mut samples = Vec::new();
            for _ in 0..180 {
                step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
                let body = crate_body.read().unwrap();
                samples.push([body.x, body.y, body.z]);
            }
            samples
        }
        assert_eq!(trace(), trace());
    }
}
