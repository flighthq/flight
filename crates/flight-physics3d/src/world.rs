// flight-lint: allow-file(conform-params) D5 makes owner-world state explicit; Rust also names the source's `type` parameters `body_type`
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};

use flight_collision::CollisionColliderShape3D;
use flight_entity::allocate_entity;

use crate::collider_transform::create_physics_3d_collider_world_shape;
use crate::integrate::refresh_rigid_body_3d_world_inertia;
use crate::mass_properties::update_rigid_body_3d_mass_data;
use crate::symmetric_tensor::apply_symmetric_tensor;
use crate::{
    Physics3DBodyType, Physics3DCollider, Physics3DColliderRef, Physics3DSequentialImpulseConfig,
    Physics3DSequentialImpulseConfigOptions, Physics3DSolverConfig, Physics3DSolverConfigOptions,
    Physics3DWorld, RigidBody3D, RigidBody3DRef,
};

pub const PHYSICS_3D_WORLD_VERSION: usize = 4;

/// Creates a collider from an authored local-space shape, owning its geometry and deriving the
/// world-space shape storage. Callers assign material, filter and sensor fields afterwards.
// flight-lint: allow(conform-params) D23 keeps only the local shape that derives the collider's owned world-shape storage
pub fn create_physics_3d_collider(local: &CollisionColliderShape3D) -> Physics3DColliderRef {
    let mut out: Physics3DCollider = allocate_entity();
    initialize_physics_3d_collider(&mut out, local);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 configuration construction uses optional-field overrides
pub fn create_physics_3d_sequential_impulse_config(
    options: Option<&Physics3DSequentialImpulseConfigOptions>,
) -> Physics3DSequentialImpulseConfig {
    let mut out = Physics3DSequentialImpulseConfig::default();
    initialize_physics_3d_sequential_impulse_config(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 configuration construction uses optional-field overrides
pub fn create_physics_3d_solver_config(
    options: Option<&Physics3DSolverConfigOptions>,
) -> Physics3DSolverConfig {
    let mut out = Physics3DSolverConfig::default();
    initialize_physics_3d_solver_config(&mut out, options);
    return out;
}

pub fn create_physics_3d_world() -> Physics3DWorld {
    let mut out: Physics3DWorld = allocate_entity();
    initialize_physics_3d_world(&mut out);
    return out;
}

pub fn create_rigid_body_3d() -> RigidBody3DRef {
    let mut out: RigidBody3D = allocate_entity();
    initialize_rigid_body_3d(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_physics_3d_collider`.
// flight-lint: allow(conform-params) D23 keeps only the local shape that derives the collider's owned world-shape storage
pub fn initialize_physics_3d_collider(
    out: &mut Physics3DCollider,
    local: &CollisionColliderShape3D,
) {
    out.filter = Default::default();
    out.local = clone_physics_3d_collider_shape(local);
    out.material = Default::default();
    out.sensor = false;
    out.world = create_physics_3d_collider_world_shape(&out.local);
}

// flight-lint: allow(conform-extra) D23 adds the public configuration initializer
pub fn initialize_physics_3d_sequential_impulse_config(
    out: &mut Physics3DSequentialImpulseConfig,
    options: Option<&Physics3DSequentialImpulseConfigOptions>,
) {
    let defaults = Physics3DSequentialImpulseConfig::default();
    *out = Physics3DSequentialImpulseConfig {
        velocity_iterations: options
            .and_then(|value| value.velocity_iterations)
            .unwrap_or(defaults.velocity_iterations),
        position_iterations: options
            .and_then(|value| value.position_iterations)
            .unwrap_or(defaults.position_iterations),
        penetration_slop: options
            .and_then(|value| value.penetration_slop)
            .unwrap_or(defaults.penetration_slop),
        position_correction: options
            .and_then(|value| value.position_correction)
            .unwrap_or(defaults.position_correction),
        restitution_threshold: options
            .and_then(|value| value.restitution_threshold)
            .unwrap_or(defaults.restitution_threshold),
        warm_starting: options
            .and_then(|value| value.warm_starting)
            .unwrap_or(defaults.warm_starting),
    };
}

// flight-lint: allow(conform-extra) D23 adds the public configuration initializer
pub fn initialize_physics_3d_solver_config(
    out: &mut Physics3DSolverConfig,
    options: Option<&Physics3DSolverConfigOptions>,
) {
    let defaults = Physics3DSolverConfig::default();
    *out = Physics3DSolverConfig {
        allow_sleeping: options
            .and_then(|value| value.allow_sleeping)
            .unwrap_or(defaults.allow_sleeping),
        sleep_linear_threshold: options
            .and_then(|value| value.sleep_linear_threshold)
            .unwrap_or(defaults.sleep_linear_threshold),
        sleep_angular_threshold: options
            .and_then(|value| value.sleep_angular_threshold)
            .unwrap_or(defaults.sleep_angular_threshold),
        time_to_sleep: options
            .and_then(|value| value.time_to_sleep)
            .unwrap_or(defaults.time_to_sleep),
        substeps: options
            .and_then(|value| value.substeps)
            .unwrap_or(defaults.substeps),
        continuous_collision: options
            .and_then(|value| value.continuous_collision)
            .unwrap_or(defaults.continuous_collision),
        max_ccd_substeps: options
            .and_then(|value| value.max_ccd_substeps)
            .unwrap_or(defaults.max_ccd_substeps),
        max_ccd_rotation_substeps: options
            .and_then(|value| value.max_ccd_rotation_substeps)
            .unwrap_or(defaults.max_ccd_rotation_substeps),
        sequential_impulse: options
            .and_then(|value| value.sequential_impulse.clone())
            .unwrap_or(defaults.sequential_impulse),
    };
}

pub fn initialize_physics_3d_world(out: &mut Physics3DWorld) {
    *out = Physics3DWorld::default();
    out.version = PHYSICS_3D_WORLD_VERSION;
}

pub fn initialize_rigid_body_3d(out: &mut RigidBody3D) {
    *out = RigidBody3D::default();
}

pub fn add_physics_3d_body(world: &mut Physics3DWorld, body: &RigidBody3DRef) -> i32 {
    assert_physics_3d_world_not_stepping(world);
    {
        let body_read = body.read().unwrap();
        assert!(
            body_read.index == -1
                && body_read
                    .owner
                    .as_ref()
                    .and_then(|owner| owner.upgrade())
                    .is_none()
                && !world
                    .bodies
                    .iter()
                    .any(|candidate| Arc::ptr_eq(candidate, body)),
            "Cannot add a rigid body that already belongs to a physics world"
        );
        let mut seen = Vec::<Physics3DColliderRef>::new();
        for collider in &body_read.colliders {
            assert!(
                !seen
                    .iter()
                    .any(|candidate| Arc::ptr_eq(candidate, collider)),
                "Cannot add a rigid body containing the same collider twice"
            );
            seen.push(collider.clone());
            let collider_read = collider.read().unwrap();
            if let Some(owner) = collider_read
                .owner
                .as_ref()
                .and_then(|owner| owner.upgrade())
            {
                assert!(
                    Arc::ptr_eq(&owner, body),
                    "Cannot share a physics collider between rigid bodies"
                );
            }
            assert!(
                body_read.body_type == Physics3DBodyType::Static
                    || !is_physics_3d_static_surface_shape(&collider_read.local),
                "Triangle-mesh and heightfield colliders require a static rigid body"
            );
        }
    }
    let index = world.next_body_index;
    world.next_body_index += 1;
    {
        let mut body_write = body.write().unwrap();
        body_write.index = index;
        body_write.owner = Some(Arc::downgrade(&world.token));
        for collider in &body_write.colliders {
            collider.write().unwrap().owner = Some(Arc::downgrade(body));
        }
        if !body_write.colliders.is_empty() {
            update_rigid_body_3d_mass_data(&mut body_write);
        }
        refresh_rigid_body_3d_world_inertia(&mut body_write);
    }
    world.bodies.push(body.clone());
    world.body_by_index.insert(index, body.clone());
    crate::broadphase::synchronize_physics_3d_broadphase(world);
    return index;
}

pub fn add_physics_3d_collider(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    collider: &Physics3DColliderRef,
) {
    assert_physics_3d_world_not_stepping(world);
    let mut body_write = body.write().unwrap();
    if let Some(owner) = body_write.owner.as_ref().and_then(|owner| owner.upgrade()) {
        assert!(
            Arc::ptr_eq(&owner, &world.token),
            "Cannot mutate a rigid body through a physics world that does not own it"
        );
    }
    assert!(
        !body_write
            .colliders
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, collider)),
        "Cannot add the same physics collider to a rigid body twice"
    );
    {
        let collider_read = collider.read().unwrap();
        if let Some(owner) = collider_read
            .owner
            .as_ref()
            .and_then(|owner| owner.upgrade())
        {
            assert!(
                Arc::ptr_eq(&owner, body),
                "Cannot share a physics collider between rigid bodies"
            );
        }
        assert!(
            body_write.body_type == Physics3DBodyType::Static
                || !is_physics_3d_static_surface_shape(&collider_read.local),
            "Triangle-mesh and heightfield colliders require a static rigid body"
        );
    }
    collider.write().unwrap().owner = Some(Arc::downgrade(body));
    body_write.colliders.push(collider.clone());
    update_rigid_body_3d_mass_data(&mut body_write);
    refresh_rigid_body_3d_world_inertia(&mut body_write);
    let body_index = body_write.index;
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    if is_owned {
        wake_physics_3d_body_value(&mut body_write);
    }
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
        crate::broadphase::synchronize_physics_3d_broadphase(world);
    }
}

pub fn apply_physics_3d_angular_impulse(body: &RigidBody3DRef, x: f32, y: f32, z: f32) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic
        || body.fixed_rotation
        || !finite_vector(x, y, z)
    {
        return false;
    }
    refresh_rigid_body_3d_world_inertia(&mut body);
    let inertia = world_inverse_inertia(&body);
    let mut impulse = [0.0; 3];
    apply_symmetric_tensor(&mut impulse, &inertia, x, y, z);
    body.angular_velocity_x += impulse[0];
    body.angular_velocity_y += impulse[1];
    body.angular_velocity_z += impulse[2];
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

pub fn apply_physics_3d_force(body: &RigidBody3DRef, x: f32, y: f32, z: f32) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic || !finite_vector(x, y, z) {
        return false;
    }
    body.force_x += x;
    body.force_y += y;
    body.force_z += z;
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

pub fn apply_physics_3d_force_at_point(
    body: &RigidBody3DRef,
    x: f32,
    y: f32,
    z: f32,
    point_x: f32,
    point_y: f32,
    point_z: f32,
) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic
        || !finite_vector(x, y, z)
        || !finite_vector(point_x, point_y, point_z)
    {
        return false;
    }
    body.force_x += x;
    body.force_y += y;
    body.force_z += z;
    if !body.fixed_rotation {
        let mut center = [0.0; 3];
        write_rigid_body_3d_world_center(&body, &mut center);
        let (rx, ry, rz) = (
            point_x - center[0],
            point_y - center[1],
            point_z - center[2],
        );
        body.torque_x += ry * z - rz * y;
        body.torque_y += rz * x - rx * z;
        body.torque_z += rx * y - ry * x;
    }
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

pub fn apply_physics_3d_linear_impulse(body: &RigidBody3DRef, x: f32, y: f32, z: f32) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic || !finite_vector(x, y, z) {
        return false;
    }
    body.velocity_x += x * body.inverse_mass;
    body.velocity_y += y * body.inverse_mass;
    body.velocity_z += z * body.inverse_mass;
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

pub fn apply_physics_3d_linear_impulse_at_point(
    body: &RigidBody3DRef,
    x: f32,
    y: f32,
    z: f32,
    point_x: f32,
    point_y: f32,
    point_z: f32,
) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic
        || !finite_vector(x, y, z)
        || !finite_vector(point_x, point_y, point_z)
    {
        return false;
    }
    body.velocity_x += x * body.inverse_mass;
    body.velocity_y += y * body.inverse_mass;
    body.velocity_z += z * body.inverse_mass;
    if !body.fixed_rotation {
        let mut center = [0.0; 3];
        write_rigid_body_3d_world_center(&body, &mut center);
        let (rx, ry, rz) = (
            point_x - center[0],
            point_y - center[1],
            point_z - center[2],
        );
        refresh_rigid_body_3d_world_inertia(&mut body);
        let inertia = world_inverse_inertia(&body);
        let mut angular = [0.0; 3];
        apply_symmetric_tensor(
            &mut angular,
            &inertia,
            ry * z - rz * y,
            rz * x - rx * z,
            rx * y - ry * x,
        );
        body.angular_velocity_x += angular[0];
        body.angular_velocity_y += angular[1];
        body.angular_velocity_z += angular[2];
    }
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

pub fn apply_physics_3d_torque(body: &RigidBody3DRef, x: f32, y: f32, z: f32) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.body_type != Physics3DBodyType::Dynamic
        || body.fixed_rotation
        || !finite_vector(x, y, z)
    {
        return false;
    }
    body.torque_x += x;
    body.torque_y += y;
    body.torque_z += z;
    if x != 0.0 || y != 0.0 || z != 0.0 {
        wake_physics_3d_body_value(&mut body);
    }
    return true;
}

fn assert_body_not_stepping_value(body: &RigidBody3D) {
    let stepping = body
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| owner.load(Ordering::SeqCst));
    assert!(
        !stepping,
        "Cannot mutate a rigid body while its physics world is stepping"
    );
}

pub fn assert_physics_3d_world_not_stepping(world: &Physics3DWorld) {
    assert!(
        !world.stepping,
        "Cannot mutate a physics world while it is stepping"
    );
}

fn clear_physics_3d_solve_workspace(world: &mut Physics3DWorld) {
    world.solve_island_by_root.clear();
    world.solve_island_roots.clear();
    world.solve_island_body_starts.clear();
    world.solve_island_body_counts.clear();
    world.solve_island_contact_starts.clear();
    world.solve_island_contact_counts.clear();
    world.solve_island_joint_starts.clear();
    world.solve_island_joint_counts.clear();
    world.solve_island_body_indices.clear();
    world.solve_island_contact_indices.clear();
    world.solve_island_joint_indices.clear();
    world.solve_island_cursors.clear();
}

fn clone_physics_3d_collider_shape(shape: &CollisionColliderShape3D) -> CollisionColliderShape3D {
    return match shape {
        CollisionColliderShape3D::BuiltIn(shape) => {
            CollisionColliderShape3D::BuiltIn(shape.clone())
        }
        CollisionColliderShape3D::TriangleMesh(shape) => CollisionColliderShape3D::TriangleMesh(
            Arc::new(RwLock::new(shape.read().unwrap().clone())),
        ),
        CollisionColliderShape3D::Heightfield(shape) => CollisionColliderShape3D::Heightfield(
            Arc::new(RwLock::new(shape.read().unwrap().clone())),
        ),
    };
}

pub fn find_physics_3d_body(world: &Physics3DWorld, index: i32) -> Option<RigidBody3DRef> {
    return world.body_by_index.get(&index).cloned();
}

fn finite_vector(x: f32, y: f32, z: f32) -> bool {
    return x.is_finite() && y.is_finite() && z.is_finite();
}

pub fn hydrate_physics_3d_world(world: &mut Physics3DWorld) -> bool {
    assert_physics_3d_world_not_stepping(world);
    if world.version > PHYSICS_3D_WORLD_VERSION {
        return false;
    }
    if world.version == PHYSICS_3D_WORLD_VERSION {
        return true;
    }
    world.solver.constraints.clear();
    world.solver.constraint_by_contact.clear();
    if world.config.max_ccd_rotation_substeps == 0 {
        world.config.max_ccd_rotation_substeps = 64;
    }
    world.version = PHYSICS_3D_WORLD_VERSION;
    return true;
}

fn invalidate_physics_3d_body_constraints(world: &mut Physics3DWorld, body_index: i32) {
    invalidate_physics_3d_body_contacts(world, body_index);
    for joint_ref in world.joints.clone() {
        let (connected_a, connected_b, other_index, clear, wakes_other) = {
            let joint = joint_ref.read().unwrap();
            let fields = joint.fields();
            let solver = world.joint_solvers.get(&fields.kind);
            let uses_body_a = solver.is_none_or(|solver| solver.uses_body_a != Some(false));
            let connected_a = uses_body_a && fields.body_a == body_index;
            let connected_b = fields.body_b == body_index;
            (
                connected_a,
                connected_b,
                if connected_a {
                    fields.body_b
                } else {
                    fields.body_a
                },
                solver.and_then(|solver| solver.clear_accumulated_impulses.clone()),
                solver.is_some() && uses_body_a,
            )
        };
        if !connected_a && !connected_b {
            continue;
        }
        if let Some(clear) = clear {
            clear(&joint_ref);
        }
        {
            let mut joint = joint_ref.write().unwrap();
            let fields = joint.fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            fields.impulse2 = 0.0;
            fields.impulse3 = 0.0;
            fields.impulse4 = 0.0;
            fields.impulse5 = 0.0;
        }
        if wakes_other
            && other_index != body_index
            && let Some(other) = world.body_by_index.get(&other_index)
        {
            wake_physics_3d_body_value(&mut other.write().unwrap());
        }
    }
}

fn invalidate_physics_3d_body_contacts(world: &mut Physics3DWorld, body_index: i32) {
    let mut wake = Vec::new();
    world.contacts.retain(|contact| {
        let contact = contact.read().unwrap();
        let remove = contact.body_a == body_index || contact.body_b == body_index;
        if remove && contact.enabled && !contact.sensor {
            wake.push(if contact.body_a == body_index {
                contact.body_b
            } else {
                contact.body_a
            });
        }
        !remove
    });
    for index in wake {
        if let Some(body) = world.body_by_index.get(&index) {
            wake_physics_3d_body_value(&mut body.write().unwrap());
        }
    }
    world.events.began.retain(|contact| {
        let contact = contact.read().unwrap();
        contact.body_a != body_index && contact.body_b != body_index
    });
    world.events.ended.retain(|contact| {
        let contact = contact.read().unwrap();
        contact.body_a != body_index && contact.body_b != body_index
    });
    world.solver.constraints.clear();
    world.solver.constraint_by_contact.clear();
    clear_physics_3d_solve_workspace(world);
}

pub fn invalidate_physics_3d_collider(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    collider: &Physics3DColliderRef,
) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let mut body_write = body.write().unwrap();
    if body_write
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| !Arc::ptr_eq(&owner, &world.token))
    {
        return false;
    }
    if !body_write
        .colliders
        .iter()
        .any(|candidate| Arc::ptr_eq(candidate, collider))
    {
        return false;
    }
    {
        let mut collider_write = collider.write().unwrap();
        collider_write.world = crate::collider_transform::create_physics_3d_collider_world_shape(
            &collider_write.local,
        );
    }
    update_rigid_body_3d_mass_data(&mut body_write);
    refresh_rigid_body_3d_world_inertia(&mut body_write);
    let body_index = body_write.index;
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    if is_owned {
        wake_physics_3d_body_value(&mut body_write);
    }
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
        crate::broadphase::synchronize_physics_3d_broadphase(world);
    }
    return true;
}

fn is_physics_3d_static_surface_shape(shape: &CollisionColliderShape3D) -> bool {
    return matches!(
        shape,
        CollisionColliderShape3D::TriangleMesh(_) | CollisionColliderShape3D::Heightfield(_)
    );
}

pub(crate) fn mark_physics_3d_world_stepping(world: &mut Physics3DWorld, stepping: bool) {
    world.stepping = stepping;
    world.token.store(stepping, Ordering::SeqCst);
}

fn refresh_inverse_inertia_from_forward(body: &mut RigidBody3D) {
    let forward = [
        body.inertia_xx,
        body.inertia_yy,
        body.inertia_zz,
        body.inertia_xy,
        body.inertia_xz,
        body.inertia_yz,
    ];
    let mut inverse = [0.0; 6];
    crate::symmetric_tensor::inverse_symmetric_tensor(&mut inverse, &forward);
    body.inverse_inertia_xx = inverse[0];
    body.inverse_inertia_yy = inverse[1];
    body.inverse_inertia_zz = inverse[2];
    body.inverse_inertia_xy = inverse[3];
    body.inverse_inertia_xz = inverse[4];
    body.inverse_inertia_yz = inverse[5];
}

pub fn remove_physics_3d_body(world: &mut Physics3DWorld, body: &RigidBody3DRef) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let Some(at) = world
        .bodies
        .iter()
        .position(|candidate| Arc::ptr_eq(candidate, body))
    else {
        return false;
    };
    world.bodies.remove(at);
    let index = body.read().unwrap().index;
    world.body_by_index.remove(&index);
    invalidate_physics_3d_body_contacts(world, index);
    let mut removed_joints = Vec::new();
    world.joints.retain(|joint_ref| {
        let joint = joint_ref.read().unwrap();
        let fields = joint.fields();
        let solver = world.joint_solvers.get(&fields.kind);
        let uses_body_a = solver.is_none_or(|solver| solver.uses_body_a != Some(false));
        let removes_a = uses_body_a && fields.body_a == index;
        let removes_b = fields.body_b == index;
        if removes_a || removes_b {
            let other_index = if removes_a {
                fields.body_b
            } else {
                fields.body_a
            };
            if solver.is_some() && uses_body_a && other_index != index {
                if let Some(other) = world.body_by_index.get(&other_index) {
                    wake_physics_3d_body_value(&mut other.write().unwrap());
                }
            }
            removed_joints.push(joint_ref.clone());
            false
        } else {
            true
        }
    });
    for joint in removed_joints {
        joint.write().unwrap().fields_mut().owner = None;
    }
    crate::joint_collision_suppression::rebuild_physics_3d_joint_collision_suppressions(world);
    let mut body_write = body.write().unwrap();
    body_write.index = -1;
    body_write.owner = None;
    drop(body_write);
    crate::physics_3d_broadphase_publication::withdraw_physics_3d_broadphase_body(world, index);
    return true;
}

pub fn remove_physics_3d_collider(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    collider: &Physics3DColliderRef,
) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let mut body_write = body.write().unwrap();
    if body_write
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| !Arc::ptr_eq(&owner, &world.token))
    {
        return false;
    }
    let Some(at) = body_write
        .colliders
        .iter()
        .position(|candidate| Arc::ptr_eq(candidate, collider))
    else {
        return false;
    };
    body_write.colliders.remove(at);
    collider.write().unwrap().owner = None;
    update_rigid_body_3d_mass_data(&mut body_write);
    refresh_rigid_body_3d_world_inertia(&mut body_write);
    let body_index = body_write.index;
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    if is_owned {
        wake_physics_3d_body_value(&mut body_write);
    }
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
        crate::broadphase::synchronize_physics_3d_broadphase(world);
    }
    return true;
}

pub fn set_physics_3d_body_bullet(body: &RigidBody3DRef, bullet: bool) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.bullet == bullet {
        return true;
    }
    body.bullet = bullet;
    wake_physics_3d_body_value(&mut body);
    return true;
}

pub fn set_physics_3d_body_fixed_rotation(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    fixed_rotation: bool,
) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let body_read = body.read().unwrap();
    if body_read
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| !Arc::ptr_eq(&owner, &world.token))
    {
        return false;
    }
    let body_index = body_read.index;
    drop(body_read);
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    let body_write = body.write().unwrap();
    assert_body_not_stepping_value(&body_write);
    if body_write.fixed_rotation == fixed_rotation {
        return true;
    }
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
    }
    let mut body = body.write().unwrap();
    body.fixed_rotation = fixed_rotation;
    if fixed_rotation {
        body.angular_velocity_x = 0.0;
        body.angular_velocity_y = 0.0;
        body.angular_velocity_z = 0.0;
        body.torque_x = 0.0;
        body.torque_y = 0.0;
        body.torque_z = 0.0;
        zero_inverse_inertia(&mut body);
    } else if body.body_type == Physics3DBodyType::Dynamic {
        refresh_inverse_inertia_from_forward(&mut body);
    }
    refresh_rigid_body_3d_world_inertia(&mut body);
    wake_physics_3d_body_value(&mut body);
    return true;
}

pub fn set_physics_3d_body_sleep_enabled(body: &RigidBody3DRef, sleep_enabled: bool) -> bool {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    if body.sleep_enabled == sleep_enabled {
        return true;
    }
    body.sleep_enabled = sleep_enabled;
    wake_physics_3d_body_value(&mut body);
    return true;
}

#[allow(clippy::too_many_arguments)]
pub fn set_physics_3d_body_transform(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    x: f32,
    y: f32,
    z: f32,
    orientation_x: f32,
    orientation_y: f32,
    orientation_z: f32,
    orientation_w: f32,
) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let body_write = body.write().unwrap();
    assert_body_not_stepping_value(&body_write);
    if body_write
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| !Arc::ptr_eq(&owner, &world.token))
    {
        return false;
    }
    if !finite_vector(x, y, z)
        || !finite_vector(orientation_x, orientation_y, orientation_z)
        || !orientation_w.is_finite()
    {
        return false;
    }
    let body_index = body_write.index;
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
    }
    let mut body_write = body.write().unwrap();
    body_write.x = x;
    body_write.y = y;
    body_write.z = z;
    let length_squared = orientation_x * orientation_x
        + orientation_y * orientation_y
        + orientation_z * orientation_z
        + orientation_w * orientation_w;
    if length_squared > 0.0 {
        let scale = 1.0 / length_squared.sqrt();
        body_write.orientation_x = orientation_x * scale;
        body_write.orientation_y = orientation_y * scale;
        body_write.orientation_z = orientation_z * scale;
        body_write.orientation_w = orientation_w * scale;
    } else {
        body_write.orientation_x = 0.0;
        body_write.orientation_y = 0.0;
        body_write.orientation_z = 0.0;
        body_write.orientation_w = 1.0;
    }
    wake_physics_3d_body_value(&mut body_write);
    refresh_rigid_body_3d_world_inertia(&mut body_write);
    drop(body_write);
    if is_owned {
        crate::broadphase::synchronize_physics_3d_broadphase(world);
    }
    return true;
}

pub fn set_physics_3d_body_type(
    world: &mut Physics3DWorld,
    body: &RigidBody3DRef,
    body_type: Physics3DBodyType,
) -> bool {
    assert_physics_3d_world_not_stepping(world);
    let body_write = body.write().unwrap();
    assert_body_not_stepping_value(&body_write);
    if body_write
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| !Arc::ptr_eq(&owner, &world.token))
    {
        return false;
    }
    if body_type != Physics3DBodyType::Static
        && body_write
            .colliders
            .iter()
            .any(|collider| is_physics_3d_static_surface_shape(&collider.read().unwrap().local))
    {
        return false;
    }
    if body_write.body_type == body_type {
        return true;
    }
    let body_index = body_write.index;
    let is_owned = world
        .body_by_index
        .get(&body_index)
        .is_some_and(|candidate| Arc::ptr_eq(candidate, body));
    drop(body_write);
    if is_owned {
        invalidate_physics_3d_body_constraints(world, body_index);
    }
    let mut body_write = body.write().unwrap();
    body_write.body_type = body_type;
    if body_type == Physics3DBodyType::Static {
        body_write.velocity_x = 0.0;
        body_write.velocity_y = 0.0;
        body_write.velocity_z = 0.0;
        body_write.angular_velocity_x = 0.0;
        body_write.angular_velocity_y = 0.0;
        body_write.angular_velocity_z = 0.0;
        body_write.sleeping = false;
    }
    body_write.force_x = 0.0;
    body_write.force_y = 0.0;
    body_write.force_z = 0.0;
    body_write.torque_x = 0.0;
    body_write.torque_y = 0.0;
    body_write.torque_z = 0.0;
    if body_type != Physics3DBodyType::Dynamic || body_write.fixed_rotation {
        body_write.inverse_mass = 0.0;
        zero_inverse_inertia(&mut body_write);
    } else {
        body_write.inverse_mass = if body_write.mass > 0.0 {
            1.0 / body_write.mass
        } else {
            0.0
        };
        refresh_inverse_inertia_from_forward(&mut body_write);
    }
    refresh_rigid_body_3d_world_inertia(&mut body_write);
    wake_physics_3d_body_value(&mut body_write);
    return true;
}

pub fn wake_physics_3d_body(body: &RigidBody3DRef) {
    let mut body = body.write().unwrap();
    assert_body_not_stepping_value(&body);
    wake_physics_3d_body_value(&mut body);
}

fn wake_physics_3d_body_value(body: &mut RigidBody3D) {
    if body.body_type == Physics3DBodyType::Static {
        return;
    }
    body.sleeping = false;
    body.sleep_timer = 0.0;
}

fn world_inverse_inertia(body: &RigidBody3D) -> [f32; 6] {
    return [
        body.inverse_inertia_world_xx,
        body.inverse_inertia_world_yy,
        body.inverse_inertia_world_zz,
        body.inverse_inertia_world_xy,
        body.inverse_inertia_world_xz,
        body.inverse_inertia_world_yz,
    ];
}

pub fn write_rigid_body_3d_world_center(body: &RigidBody3D, out: &mut [f32; 3]) {
    let (cx, cy, cz) = (body.center_x, body.center_y, body.center_z);
    if cx == 0.0 && cy == 0.0 && cz == 0.0 {
        *out = [body.x, body.y, body.z];
        return;
    }
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    let tx = qy * cz - qz * cy + qw * cx;
    let ty = qz * cx - qx * cz + qw * cy;
    let tz = qx * cy - qy * cx + qw * cz;
    out[0] = body.x + cx + 2.0 * (qy * tz - qz * ty);
    out[1] = body.y + cy + 2.0 * (qz * tx - qx * tz);
    out[2] = body.z + cz + 2.0 * (qx * ty - qy * tx);
}

fn zero_inverse_inertia(body: &mut RigidBody3D) {
    body.inverse_inertia_xx = 0.0;
    body.inverse_inertia_yy = 0.0;
    body.inverse_inertia_zz = 0.0;
    body.inverse_inertia_xy = 0.0;
    body.inverse_inertia_xz = 0.0;
    body.inverse_inertia_yz = 0.0;
}
