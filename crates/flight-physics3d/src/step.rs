// flight-lint: allow-file(conform-params) D5: collision registry and diagnostics guards are explicit caller-owned state
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use flight_collision::CollisionRegistry3D;

use crate::*;

fn clear_joint_accumulators(joint: &Physics3DJointRef, solver: &Physics3DJointSolver) {
    if let Some(clear) = &solver.clear_accumulated_impulses {
        clear(joint);
    }
    let mut joint = joint.write().unwrap();
    let f = joint.fields_mut();
    f.impulse0 = 0.0;
    f.impulse1 = 0.0;
    f.impulse2 = 0.0;
    f.impulse3 = 0.0;
    f.impulse4 = 0.0;
    f.impulse5 = 0.0;
}

fn for_each_solve_body(world: &mut Physics3DWorld, mut visit: impl FnMut(&mut RigidBody3D)) {
    let indices = world.solve_island_body_indices.clone();
    for body_index in indices {
        if let Some(body) = world.bodies.get(body_index) {
            visit(&mut body.write().unwrap());
        }
    }
}

fn integrate_solve_poses(world: &mut Physics3DWorld, registry: &CollisionRegistry3D, dt: f32) {
    if world.config.continuous_collision && has_active_physics_3d_bullet(world) {
        integrate_physics_3d_continuous(world, registry, dt);
        return;
    }
    for_each_solve_body(world, |body| integrate_rigid_body_3d_pose(body, dt));
    for_each_solve_body(world, refresh_rigid_body_3d_world_inertia);
}

fn run_contact_hook(
    world: &mut Physics3DWorld,
    hook: Option<Physics3DContactCallback>,
    phase: &str,
) {
    let Some(hook) = hook else {
        return;
    };
    let contacts = world.contacts.clone();
    for contact in contacts {
        let original = {
            let value = contact.read().unwrap();
            if value.sensor {
                continue;
            }
            (
                value.friction,
                value.restitution,
                value.enabled,
                value.sensor,
            )
        };
        let result = catch_unwind(AssertUnwindSafe(|| hook(world, &contact)));
        let valid = is_physics_3d_contact_valid(&contact.read().unwrap());
        if result.is_err() || !valid {
            let mut value = contact.write().unwrap();
            value.friction = original.0;
            value.restitution = original.1;
            value.enabled = original.2;
            value.sensor = original.3;
            drop(value);
            if let Err(payload) = result {
                resume_unwind(payload);
            }
            panic!("Physics3D {phase} hook produced invalid contact state");
        }
    }
}

fn scale_warm_start_caches(world: &mut Physics3DWorld, dt: f32) {
    let previous = world.previous_timestep;
    if previous <= 0.0 || previous == dt {
        return;
    }
    let divided = dt / previous;
    let ratio = if divided.is_finite() { divided } else { 0.0 };
    for constraint in &mut world.solver.constraints {
        for point in constraint.points.iter_mut().take(constraint.point_count) {
            point.normal_impulse *= ratio;
            point.tangent_impulse0 *= ratio;
            point.tangent_impulse1 *= ratio;
        }
    }
    for joint in &world.joints {
        let kind = {
            let mut value = joint.write().unwrap();
            let f = value.fields_mut();
            f.impulse0 *= ratio;
            f.impulse1 *= ratio;
            f.impulse2 *= ratio;
            f.impulse3 *= ratio;
            f.impulse4 *= ratio;
            f.impulse5 *= ratio;
            f.kind.clone()
        };
        if let Some(scale) = world
            .joint_solvers
            .get(&kind)
            .and_then(|solver| solver.scale_accumulated_impulses.as_ref())
        {
            scale(joint, ratio);
        }
    }
}

pub fn set_physics_3d_step_guard(
    guards: &mut Physics3DGuardState,
    guard: Option<Physics3DStepGuard>,
) {
    guards.step_guard = guard;
}

pub fn step_physics_3d(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    dt: f32,
    guards: Option<&Physics3DGuardState>,
) {
    assert!(!world.stepping, "Cannot step a physics world recursively");
    let config = &world.config;
    if !is_physics_3d_timestep_valid(dt)
        || !is_physics_3d_substeps_valid(config)
        || !is_physics_3d_velocity_iterations_valid(config)
        || !is_physics_3d_position_iterations_valid(config)
        || !is_physics_3d_solver_config_valid(config)
        || !is_physics_3d_gravity_valid(world)
        || !is_physics_3d_body_state_valid(world)
        || !is_physics_3d_collider_state_valid(world)
        || !is_physics_3d_contact_state_valid(world)
        || !is_physics_3d_joint_state_valid(world)
    {
        if let Some(guard) = guards.and_then(|guards| guards.step_guard.as_ref()) {
            guard(world, dt);
        }
        return;
    }
    mark_physics_3d_world_stepping(world, true);
    let result = catch_unwind(AssertUnwindSafe(|| {
        step_validated_physics_3d(world, registry, dt, guards)
    }));
    mark_physics_3d_world_stepping(world, false);
    if let Err(payload) = result {
        resume_unwind(payload);
    }
}

pub fn step_physics_3d_interval(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    dt: f32,
) {
    for_each_solve_body(world, refresh_rigid_body_3d_world_inertia);
    let (gravity_x, gravity_y, gravity_z) = (world.gravity_x, world.gravity_y, world.gravity_z);
    for_each_solve_body(world, |body| {
        integrate_rigid_body_3d_velocity(body, gravity_x, gravity_y, gravity_z, dt)
    });
    prepare_physics_3d_contact_constraints(world);
    visit_solve_joints(world, |world, joint, solver| {
        (solver.prepare)(world, joint, dt)
    });
    if world.config.sequential_impulse.warm_starting {
        warm_start_physics_3d_contacts(world);
        visit_solve_joints(world, |world, joint, solver| {
            if let Some(warm_start) = &solver.warm_start {
                warm_start(world, joint);
            } else {
                clear_joint_accumulators(joint, solver);
            }
        });
    } else {
        visit_solve_joints(world, |_, joint, solver| {
            clear_joint_accumulators(joint, solver)
        });
    }
    for _ in 0..world.config.sequential_impulse.velocity_iterations {
        visit_solve_joints(world, |world, joint, solver| {
            (solver.solve)(world, joint, dt)
        });
        solve_physics_3d_contact_velocities(world);
    }
    evaluate_physics_3d_joint_breakage(world, dt);
    integrate_solve_poses(world, registry, dt);
    for _ in 0..world.config.sequential_impulse.position_iterations {
        solve_physics_3d_contact_positions(world, registry);
    }
}

fn step_validated_physics_3d(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    dt: f32,
    guards: Option<&Physics3DGuardState>,
) {
    let substep_dt = dt / world.config.substeps as f32;
    world.joint_events.broke.clear();
    if let Some(guard) = guards.and_then(|guards| guards.contact_intake_guard.as_ref()) {
        guard(world, registry);
    }
    if !world.joints.is_empty()
        && let Some(guard) = guards.and_then(|guards| guards.joint_resolution_guard.as_ref())
    {
        guard(world);
    }
    if let Some(guard) = guards.and_then(|guards| guards.spatial_indexing_guard.as_ref()) {
        guard(world);
    }
    build_physics_3d_contacts(world, registry);
    run_contact_hook(world, world.contact_hooks.pre_solve.clone(), "pre-solve");
    scale_warm_start_caches(world, substep_dt);
    update_physics_3d_sleep(world, dt);
    build_physics_3d_solve_islands(world);
    for substep in 0..world.config.substeps {
        if substep > 0 {
            refresh_physics_3d_contacts(world, registry);
            update_physics_3d_sleep(world, 0.0);
            build_physics_3d_solve_islands(world);
        }
        step_physics_3d_interval(world, registry, substep_dt);
    }
    for body in &world.bodies {
        clear_rigid_body_3d_forces(&mut body.write().unwrap());
    }
    if world.config.continuous_collision && has_active_physics_3d_bullet(world) {
        world.contacts.sort_by_key(|contact| {
            let contact = contact.read().unwrap();
            (
                contact.body_a,
                contact.body_b,
                contact.collider_a,
                contact.collider_b,
            )
        });
    }
    world.previous_timestep = substep_dt;
    run_contact_hook(world, world.contact_hooks.post_solve.clone(), "post-solve");
}

fn visit_solve_joints(
    world: &mut Physics3DWorld,
    mut visit: impl FnMut(&mut Physics3DWorld, &Physics3DJointRef, &Physics3DJointSolver),
) {
    let indices = world.solve_island_joint_indices.clone();
    for joint_index in indices {
        let Some(joint) = world.joints.get(joint_index).cloned() else {
            continue;
        };
        let kind = joint.read().unwrap().fields().kind.clone();
        let Some(solver) = world.joint_solvers.get(&kind).cloned() else {
            continue;
        };
        visit(world, &joint, &solver);
    }
}
