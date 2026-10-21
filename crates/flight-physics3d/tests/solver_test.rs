use super::*;
use crate::common::*;
use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D,
    register_built_in_collision_face_queries3d, register_built_in_collision_supports3d,
};

fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 1e-5,
        "expected {expected}, got {actual}"
    );
}

fn contact_point(feature_id: i64, depth: f32) -> Physics3DContactPoint {
    let mut point = create_physics_3d_contact_point();
    point.depth = depth;
    point.feature_id = feature_id;
    point.r_ay = -0.5;
    point.r_by = 0.5;
    point
}

fn contact(body_a: i32, body_b: i32) -> Physics3DContactRef {
    let contact = physics_3d_contact(body_a, body_b, None, None);
    {
        let mut contact = contact.write().unwrap();
        contact.normal_y = 1.0;
        contact.point_count = 1;
        contact.points.push(contact_point(1, 0.01));
        contact.touching = true;
    }
    contact
}

fn unit_box(world: &mut Physics3DWorld) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut mass = create_physics_3d_mass_data();
    compute_physics_3d_box_mass_data(0.5, 0.5, 0.5, 1.0, &mut mass);
    {
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &mass);
        refresh_rigid_body_3d_world_inertia(&mut body);
    }
    add_physics_3d_body(world, &body);
    body
}

fn build_solve_workspace(world: &mut Physics3DWorld) {
    update_physics_3d_sleep(world, 1.0 / 60.0);
    build_physics_3d_solve_islands(world);
}

fn falling_box_world() -> Physics3DWorld {
    let mut world = world();
    let box_body = unit_box(&mut world);
    let other = unit_box(&mut world);
    world.contacts.push(contact(
        box_body.read().unwrap().index,
        other.read().unwrap().index,
    ));
    build_solve_workspace(&mut world);
    world
}

fn box_on_ground_world() -> Physics3DWorld {
    let mut world = world();
    let box_body = unit_box(&mut world);
    let ground = unit_box(&mut world);
    set_physics_3d_body_type(&mut world, &ground, Physics3DBodyType::Static);
    world.contacts.push(contact(
        box_body.read().unwrap().index,
        ground.read().unwrap().index,
    ));
    build_solve_workspace(&mut world);
    world
}

fn two_dynamic_body_world() -> Physics3DWorld {
    let mut world = world();
    let upper = unit_box(&mut world);
    let lower = unit_box(&mut world);
    world.contacts.push(contact(
        upper.read().unwrap().index,
        lower.read().unwrap().index,
    ));
    build_solve_workspace(&mut world);
    world
}

fn overlapping_box_world(depth: f32) -> (Physics3DWorld, flight_collision::CollisionRegistry3D) {
    let mut world = world();
    let upper = unit_box(&mut world);
    let lower = unit_box(&mut world);
    set_physics_3d_body_type(&mut world, &lower, Physics3DBodyType::Static);
    let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    }));
    for body in [&upper, &lower] {
        let collider = physics_3d_collider(&shape, None, None, None);
        add_physics_3d_collider(&mut world, body, &collider);
    }
    set_physics_3d_body_transform(
        &mut world,
        &upper,
        0.0,
        1.0 - depth,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
    );
    let mut registry = registry();
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    build_physics_3d_contacts(&mut world, &registry);
    build_solve_workspace(&mut world);
    (world, registry)
}

mod create_physics_3d_contact_constraint {
    use super::*;
    #[test]
    fn uses_no_contact_sentinel() {
        assert_eq!(create_physics_3d_contact_constraint().contact, -1);
    }
}

mod create_physics_3d_contact_constraint_point {
    use super::*;
    #[test]
    fn creates_zero_impulses() {
        assert_eq!(
            create_physics_3d_contact_constraint_point().normal_impulse,
            0.0
        );
    }
}

mod initialize_physics_3d_contact_constraint {
    use super::*;
    #[test]
    fn resets_the_constraint() {
        let mut out = create_physics_3d_contact_constraint();
        out.contact = 9;
        initialize_physics_3d_contact_constraint(&mut out);
        assert_eq!(out.contact, -1);
    }
}

mod initialize_physics_3d_contact_constraint_point {
    use super::*;
    #[test]
    fn resets_the_point() {
        let mut out = create_physics_3d_contact_constraint_point();
        out.normal_impulse = 3.0;
        initialize_physics_3d_contact_constraint_point(&mut out);
        assert_eq!(out.normal_impulse, 0.0);
    }
}

mod prepare_physics_3d_contact_constraints {
    use super::*;

    #[test]
    fn clears_constraints_for_an_empty_world() {
        let mut world = world();
        world
            .solver
            .constraints
            .push(create_physics_3d_contact_constraint());
        prepare_physics_3d_contact_constraints(&mut world);
        assert!(world.solver.constraints.is_empty());
    }

    #[test]
    fn builds_an_orthonormal_friction_basis() {
        let mut world = falling_box_world();
        prepare_physics_3d_contact_constraints(&mut world);
        let constraint = &world.solver.constraints[0];
        let contact = world.contacts[0].read().unwrap();
        assert_close(
            constraint.tangent0_x * contact.normal_x
                + constraint.tangent0_y * contact.normal_y
                + constraint.tangent0_z * contact.normal_z,
            0.0,
        );
        assert_close(
            constraint.tangent1_x * contact.normal_x
                + constraint.tangent1_y * contact.normal_y
                + constraint.tangent1_z * contact.normal_z,
            0.0,
        );
        assert_close(
            constraint.tangent0_x * constraint.tangent1_x
                + constraint.tangent0_y * constraint.tangent1_y
                + constraint.tangent0_z * constraint.tangent1_z,
            0.0,
        );
        assert_close(
            (constraint.tangent0_x * constraint.tangent0_x
                + constraint.tangent0_y * constraint.tangent0_y
                + constraint.tangent0_z * constraint.tangent0_z)
                .sqrt(),
            1.0,
        );
        assert_close(
            (constraint.tangent1_x * constraint.tangent1_x
                + constraint.tangent1_y * constraint.tangent1_y
                + constraint.tangent1_z * constraint.tangent1_z)
                .sqrt(),
            1.0,
        );
    }

    #[test]
    fn builds_an_orthonormal_basis_for_every_axis_normal() {
        for (nx, ny, nz) in [
            (1.0, 0.0, 0.0),
            (-1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, -1.0, 0.0),
            (0.0, 0.0, 1.0),
            (0.0, 0.0, -1.0),
        ] {
            let mut world = falling_box_world();
            {
                let mut contact = world.contacts[0].write().unwrap();
                (contact.normal_x, contact.normal_y, contact.normal_z) = (nx, ny, nz);
            }
            prepare_physics_3d_contact_constraints(&mut world);
            let constraint = &world.solver.constraints[0];
            assert_close(
                (constraint.tangent0_x * constraint.tangent0_x
                    + constraint.tangent0_y * constraint.tangent0_y
                    + constraint.tangent0_z * constraint.tangent0_z)
                    .sqrt(),
                1.0,
            );
            assert_close(
                (constraint.tangent1_x * constraint.tangent1_x
                    + constraint.tangent1_y * constraint.tangent1_y
                    + constraint.tangent1_z * constraint.tangent1_z)
                    .sqrt(),
                1.0,
            );
            assert_close(
                constraint.tangent0_x * nx
                    + constraint.tangent0_y * ny
                    + constraint.tangent0_z * nz,
                0.0,
            );
            assert_close(
                constraint.tangent1_x * nx
                    + constraint.tangent1_y * ny
                    + constraint.tangent1_z * nz,
                0.0,
            );
        }
    }

    #[test]
    fn uses_inverse_mass_sum_for_a_centred_contact() {
        let mut world = falling_box_world();
        {
            let mut contact = world.contacts[0].write().unwrap();
            contact.points[0].r_ax = 0.0;
            contact.points[0].r_ay = -0.5;
            contact.points[0].r_az = 0.0;
        }
        prepare_physics_3d_contact_constraints(&mut world);
        let inverse_mass_sum = world.bodies[0].read().unwrap().inverse_mass
            + world.bodies[1].read().unwrap().inverse_mass;
        assert_close(
            world.solver.constraints[0].points[0].normal_mass,
            1.0 / inverse_mass_sum,
        );
    }

    #[test]
    fn captures_restitution_from_the_approach_speed() {
        let mut world = falling_box_world();
        world.contacts[0].write().unwrap().restitution = 0.5;
        world.bodies[0].write().unwrap().velocity_y = -10.0;
        prepare_physics_3d_contact_constraints(&mut world);
        assert_close(world.solver.constraints[0].points[0].bias, 5.0);
    }

    #[test]
    fn drops_restitution_below_the_threshold() {
        let mut world = falling_box_world();
        world.contacts[0].write().unwrap().restitution = 0.9;
        world.config.sequential_impulse.restitution_threshold = 1.0;
        world.bodies[0].write().unwrap().velocity_y = -0.1;
        prepare_physics_3d_contact_constraints(&mut world);
        assert_eq!(world.solver.constraints[0].points[0].bias, 0.0);
    }

    #[test]
    fn skips_non_touching_disabled_sensor_and_immovable_contacts() {
        let mut non_touching = falling_box_world();
        non_touching.contacts[0].write().unwrap().touching = false;
        prepare_physics_3d_contact_constraints(&mut non_touching);
        assert!(non_touching.solver.constraints.is_empty());

        for (enabled, sensor) in [(false, false), (true, true)] {
            let mut filtered = falling_box_world();
            {
                let mut contact = filtered.contacts[0].write().unwrap();
                contact.enabled = enabled;
                contact.sensor = sensor;
            }
            build_solve_workspace(&mut filtered);
            prepare_physics_3d_contact_constraints(&mut filtered);
            assert!(filtered.solver.constraints.is_empty());
        }

        let mut immovable = falling_box_world();
        let a = immovable.bodies[0].clone();
        let b = immovable.bodies[1].clone();
        set_physics_3d_body_type(&mut immovable, &a, Physics3DBodyType::Static);
        set_physics_3d_body_type(&mut immovable, &b, Physics3DBodyType::Static);
        build_solve_workspace(&mut immovable);
        prepare_physics_3d_contact_constraints(&mut immovable);
        assert!(immovable.solver.constraints.is_empty());
    }

    #[test]
    fn carries_accumulators_by_feature_not_point_index() {
        let mut world = falling_box_world();
        prepare_physics_3d_contact_constraints(&mut world);
        world.solver.constraints[0].points[0].normal_impulse = 7.0;
        {
            let mut contact = world.contacts[0].write().unwrap();
            let moved = contact.points[0].clone();
            contact.points = vec![contact_point(99, 0.01), moved];
            contact.point_count = 2;
        }
        prepare_physics_3d_contact_constraints(&mut world);
        assert_eq!(world.solver.constraints[0].points[0].normal_impulse, 0.0);
        assert_eq!(world.solver.constraints[0].points[1].normal_impulse, 7.0);
    }

    #[test]
    fn keeps_compound_accumulators_with_their_contact_after_reordering() {
        let mut world = falling_box_world();
        let second = contact(
            world.bodies[0].read().unwrap().index,
            world.bodies[1].read().unwrap().index,
        );
        {
            let mut second = second.write().unwrap();
            second.collider_a = 1;
            second.collider_b = 1;
        }
        world.contacts.push(second);
        build_solve_workspace(&mut world);
        prepare_physics_3d_contact_constraints(&mut world);
        world.solver.constraints[0].points[0].normal_impulse = 3.0;
        world.solver.constraints[1].points[0].normal_impulse = 11.0;
        world.contacts.swap(0, 1);
        build_solve_workspace(&mut world);
        prepare_physics_3d_contact_constraints(&mut world);
        assert_eq!(world.solver.constraints[0].points[0].normal_impulse, 11.0);
        assert_eq!(world.solver.constraints[1].points[0].normal_impulse, 3.0);
    }

    #[test]
    fn clears_accumulators_when_warm_starting_is_disabled() {
        let mut world = falling_box_world();
        prepare_physics_3d_contact_constraints(&mut world);
        world.solver.constraints[0].points[0].normal_impulse = 7.0;
        world.config.sequential_impulse.warm_starting = false;
        prepare_physics_3d_contact_constraints(&mut world);
        assert_eq!(world.solver.constraints[0].points[0].normal_impulse, 0.0);
    }
}

mod solve_physics_3d_contact_positions {
    use super::*;

    #[test]
    fn accepts_an_empty_world() {
        let mut world = world();
        solve_physics_3d_contact_positions(&mut world, &registry());
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn pushes_a_penetrating_body_along_the_normal() {
        let (mut world, registry) = overlapping_box_world(0.1);
        prepare_physics_3d_contact_constraints(&mut world);
        let before = world.bodies[0].read().unwrap().y;
        solve_physics_3d_contact_positions(&mut world, &registry);
        assert!(world.bodies[0].read().unwrap().y > before);
    }

    #[test]
    fn leaves_the_penetration_slop_unresolved() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().points[0].depth =
            world.config.sequential_impulse.penetration_slop;
        prepare_physics_3d_contact_constraints(&mut world);
        let before = world.bodies[0].read().unwrap().y;
        solve_physics_3d_contact_positions(&mut world, &registry());
        assert_eq!(world.bodies[0].read().unwrap().y, before);
    }

    #[test]
    fn reports_the_deepest_remaining_penetration() {
        let (mut world, registry) = overlapping_box_world(0.25);
        prepare_physics_3d_contact_constraints(&mut world);
        let expected = 0.25 - world.config.sequential_impulse.penetration_slop;
        let deepest = solve_physics_3d_contact_positions(&mut world, &registry);
        assert_close(deepest, expected);
    }

    #[test]
    fn converges_toward_the_slop_over_repeated_iterations() {
        let (mut world, registry) = overlapping_box_world(0.2);
        prepare_physics_3d_contact_constraints(&mut world);
        let mut remaining = 0.2;
        for _ in 0..40 {
            remaining = solve_physics_3d_contact_positions(&mut world, &registry);
        }
        assert!(remaining < 0.01);
        assert!(remaining >= 0.0);
    }

    #[test]
    fn never_moves_a_static_body() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().points[0].depth = 0.1;
        prepare_physics_3d_contact_constraints(&mut world);
        solve_physics_3d_contact_positions(&mut world, &registry());
        let ground = world.bodies[1].read().unwrap();
        assert_eq!(ground.y, 0.0);
        assert_eq!(ground.orientation_w, 1.0);
    }
}

mod solve_physics_3d_contact_velocities {
    use super::*;

    #[test]
    fn accepts_an_empty_world() {
        let mut world = world();
        solve_physics_3d_contact_velocities(&mut world);
        assert!(world.solver.constraints.is_empty());
    }

    #[test]
    fn removes_approach_velocity_against_static_ground() {
        let mut world = box_on_ground_world();
        world.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        assert_close(world.bodies[0].read().unwrap().velocity_y, 0.0);
    }

    #[test]
    fn applies_restitution_at_the_expected_fraction() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().restitution = 0.5;
        world.bodies[0].write().unwrap().velocity_y = -10.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        assert_close(world.bodies[0].read().unwrap().velocity_y, 5.0);
    }

    #[test]
    fn never_pulls_separating_bodies_together() {
        let mut world = box_on_ground_world();
        world.bodies[0].write().unwrap().velocity_y = 5.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..4 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        assert_eq!(world.solver.constraints[0].points[0].normal_impulse, 0.0);
        assert_close(world.bodies[0].read().unwrap().velocity_y, 5.0);
    }

    #[test]
    fn leaves_a_frictionless_body_at_full_tangential_speed() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().friction = 0.0;
        {
            let mut body = world.bodies[0].write().unwrap();
            body.velocity_x = 3.0;
            body.velocity_y = -1.0;
        }
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        assert_close(world.bodies[0].read().unwrap().velocity_x, 3.0);
    }

    #[test]
    fn opposes_tangential_motion_when_friction_is_present() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().friction = 0.5;
        {
            let mut body = world.bodies[0].write().unwrap();
            body.velocity_x = 3.0;
            body.velocity_y = -1.0;
        }
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        let velocity_x = world.bodies[0].read().unwrap().velocity_x;
        assert!(velocity_x < 3.0);
        assert!(velocity_x > 0.0);
    }

    #[test]
    fn applies_friction_on_the_first_velocity_iteration() {
        let mut world = box_on_ground_world();
        world.contacts[0].write().unwrap().friction = 1.0;
        {
            let mut body = world.bodies[0].write().unwrap();
            body.velocity_x = 3.0;
            body.velocity_y = -1.0;
        }
        prepare_physics_3d_contact_constraints(&mut world);
        solve_physics_3d_contact_velocities(&mut world);
        assert!(world.solver.constraints[0].points[0].normal_impulse > 0.0);
        assert!(world.bodies[0].read().unwrap().velocity_x < 3.0);
    }

    #[test]
    fn clamps_both_tangents_as_one_coulomb_cone() {
        let speed = 3.0;
        let mut axis = box_on_ground_world();
        axis.contacts[0].write().unwrap().friction = 0.3;
        {
            let mut body = axis.bodies[0].write().unwrap();
            body.velocity_x = speed;
            body.velocity_y = -1.0;
        }
        prepare_physics_3d_contact_constraints(&mut axis);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut axis);
        }
        let axis_remaining = {
            let body = axis.bodies[0].read().unwrap();
            (body.velocity_x * body.velocity_x + body.velocity_z * body.velocity_z).sqrt()
        };

        let mut diagonal = box_on_ground_world();
        diagonal.contacts[0].write().unwrap().friction = 0.3;
        {
            let mut body = diagonal.bodies[0].write().unwrap();
            body.velocity_x = speed / std::f32::consts::SQRT_2;
            body.velocity_z = speed / std::f32::consts::SQRT_2;
            body.velocity_y = -1.0;
        }
        prepare_physics_3d_contact_constraints(&mut diagonal);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut diagonal);
        }
        let diagonal_remaining = {
            let body = diagonal.bodies[0].read().unwrap();
            (body.velocity_x * body.velocity_x + body.velocity_z * body.velocity_z).sqrt()
        };
        assert_close(diagonal_remaining, axis_remaining);
    }

    #[test]
    fn spins_a_body_for_an_off_centre_impulse() {
        let mut world = box_on_ground_world();
        {
            let mut contact = world.contacts[0].write().unwrap();
            contact.points[0].r_ax = 0.5;
            contact.points[0].r_ay = -0.5;
        }
        world.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        assert!(world.bodies[0].read().unwrap().angular_velocity_z.abs() > 1e-6);
    }

    #[test]
    fn applies_no_impulse_to_a_static_body() {
        let mut world = box_on_ground_world();
        world.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..8 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        let ground = world.bodies[1].read().unwrap();
        assert_eq!(ground.velocity_x, 0.0);
        assert_eq!(ground.velocity_y, 0.0);
        assert_eq!(ground.angular_velocity_z, 0.0);
    }

    #[test]
    fn shares_separation_between_equal_dynamic_bodies() {
        let mut world = two_dynamic_body_world();
        world.bodies[0].write().unwrap().velocity_y = -4.0;
        prepare_physics_3d_contact_constraints(&mut world);
        for _ in 0..12 {
            solve_physics_3d_contact_velocities(&mut world);
        }
        let a = world.bodies[0].read().unwrap().velocity_y;
        let b = world.bodies[1].read().unwrap().velocity_y;
        assert_close(a, b);
        assert_close(a + b, -4.0);
    }
}

mod warm_start_physics_3d_contacts {
    use super::*;

    #[test]
    fn accepts_an_empty_world() {
        let mut world = world();
        warm_start_physics_3d_contacts(&mut world);
        assert!(world.solver.constraints.is_empty());
    }

    #[test]
    fn replays_a_carried_normal_impulse() {
        let mut world = box_on_ground_world();
        prepare_physics_3d_contact_constraints(&mut world);
        world.solver.constraints[0].points[0].normal_impulse = 3.0;
        let inverse_mass = world.bodies[0].read().unwrap().inverse_mass;
        warm_start_physics_3d_contacts(&mut world);
        assert_close(
            world.bodies[0].read().unwrap().velocity_y,
            3.0 * inverse_mass,
        );
    }

    #[test]
    fn does_nothing_when_warm_starting_is_disabled() {
        let mut world = box_on_ground_world();
        prepare_physics_3d_contact_constraints(&mut world);
        world.solver.constraints[0].points[0].normal_impulse = 3.0;
        world.config.sequential_impulse.warm_starting = false;
        warm_start_physics_3d_contacts(&mut world);
        assert_eq!(world.bodies[0].read().unwrap().velocity_y, 0.0);
    }

    #[test]
    fn reaches_the_resting_impulse_no_slower_than_a_cold_solve() {
        let mut converged = box_on_ground_world();
        converged.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut converged);
        for _ in 0..30 {
            solve_physics_3d_contact_velocities(&mut converged);
        }
        let target = converged.solver.constraints[0].points[0].normal_impulse;

        let mut warm = box_on_ground_world();
        warm.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut warm);
        warm.solver.constraints[0].points[0].normal_impulse = target;
        warm_start_physics_3d_contacts(&mut warm);
        solve_physics_3d_contact_velocities(&mut warm);

        let mut cold = box_on_ground_world();
        cold.bodies[0].write().unwrap().velocity_y = -5.0;
        prepare_physics_3d_contact_constraints(&mut cold);
        solve_physics_3d_contact_velocities(&mut cold);
        assert!(
            warm.bodies[0].read().unwrap().velocity_y.abs()
                <= cold.bodies[0].read().unwrap().velocity_y.abs()
        );
    }
}
