// flight-lint: allow-file(f64) D1: wire records are IEEE doubles (TS DataView/Float64Array)
//! The executable specification for the Physics3D ABI (TS `referencePhysics3DAbi.ts`): a real
//! `Physics3DWorld` behind persistent handles, caller-chosen ids and packed buffers. It exists to
//! make the wire contract testable rather than to be fast; a native shadow replaces this one
//! constructor and inherits every codec above it.
//!
//! D5: every world, id table, collision registry and scratch result lives in state the ABI's
//! callbacks capture, never in module globals. Each world has its own lock plus a `stepping` flag
//! that every entry point checks first, so a contact hook calling back into the ABI during a step
//! sees `Busy` instead of blocking.

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionColliderShape3D, CollisionCone3D,
    CollisionConvex3D, CollisionCylinder3D, CollisionRegistry3D, CollisionShape3D,
    CollisionSphere3D, create_collision_heightfield3d, create_collision_triangle_mesh3d,
    get_collision_heightfield_validation_status3d, get_collision_shape_validation_status3d,
    get_collision_triangle_mesh_validation_status3d, register_built_in_collision_face_queries3d,
    register_built_in_collision_pair_tests3d, register_built_in_collision_supports3d,
};
use flight_entity::{Ref, allocate_entity, throw_error};
use flight_physics3d::{
    Physics3DBodyType, Physics3DColliderRef, Physics3DCollisionFilter, Physics3DContact,
    Physics3DContactCallback, Physics3DContactRef, Physics3DJoint, Physics3DJointFrames,
    Physics3DJointReaction, Physics3DJointRef, Physics3DMaterial, Physics3DQueryResult,
    Physics3DRayResult, Physics3DSequentialImpulseConfig, Physics3DShapeCastResult,
    Physics3DSolverConfig, Physics3DWorld, RigidBody3D, RigidBody3DRef, add_physics_3d_body,
    add_physics_3d_collider, add_physics_3d_joint, apply_physics_3d_force,
    apply_physics_3d_force_at_point, apply_physics_3d_linear_impulse,
    apply_physics_3d_linear_impulse_at_point, apply_physics_3d_torque,
    create_physics_3d_ball_and_socket_joint, create_physics_3d_collider,
    create_physics_3d_cone_twist_joint, create_physics_3d_distance_joint,
    create_physics_3d_fixed_joint, create_physics_3d_generic_6_dof_joint,
    create_physics_3d_hinge_joint, create_physics_3d_joint_reaction, create_physics_3d_mass_data,
    create_physics_3d_query_result, create_physics_3d_ray_result,
    create_physics_3d_shape_cast_result, create_physics_3d_slider_joint, create_physics_3d_world,
    create_rigid_body_3d, is_physics_3d_body_state_valid, is_physics_3d_collider_state_valid,
    is_physics_3d_contact_state_valid, is_physics_3d_gravity_valid,
    is_physics_3d_joint_state_valid, is_physics_3d_position_iterations_valid,
    is_physics_3d_solver_config_valid, is_physics_3d_substeps_valid, is_physics_3d_timestep_valid,
    is_physics_3d_velocity_iterations_valid, query_physics_3d_point, query_physics_3d_ray,
    query_physics_3d_ray_closest, query_physics_3d_region, query_physics_3d_shape_cast,
    refresh_rigid_body_3d_world_inertia, register_built_in_physics_3d_joint_solvers,
    remove_physics_3d_body, remove_physics_3d_collider, remove_physics_3d_joint,
    set_physics_3d_body_bullet, set_physics_3d_body_fixed_rotation,
    set_physics_3d_body_sleep_enabled, set_physics_3d_body_transform, set_physics_3d_body_type,
    set_rigid_body_3d_mass_data, step_physics_3d, wake_physics_3d_body,
    write_physics_3d_joint_reaction,
};

use crate::physics3d_abi_command::{
    JOINT_COMMON_VALUE_COUNT, JOINT_KIND_VALUE_COUNT, align8, read_f64, read_i32, read_u32,
};
use crate::physics3d_abi_layout::*;
use crate::types::*;

const PHYSICS3D_ABI_BODY_FLAG_MASK: u32 = PHYSICS3D_ABI_BODY_FLAG_TYPE_MASK
    | PHYSICS3D_ABI_BODY_FLAG_FIXED_ROTATION
    | PHYSICS3D_ABI_BODY_FLAG_BULLET
    | PHYSICS3D_ABI_BODY_FLAG_SLEEPING
    | PHYSICS3D_ABI_BODY_FLAG_SLEEP_ENABLED;

// The ABI-id view of a world's objects, shared with the contact hooks: a step reads it while the
// world itself is locked, and only commands (never during a step) change it. Bodies are keyed by
// the world's persistent body index and colliders by their shared allocation (D15), standing in
// for the source's object-keyed `idByBody` / `idByCollider` maps.
#[derive(Default)]
struct ReferenceIds {
    id_by_body_index: HashMap<i32, u32>,
    id_by_collider: HashMap<usize, u32>,
}

struct ReferenceCollider {
    body_id: u32,
    collider: Physics3DColliderRef,
}

struct ReferenceWorld {
    body_by_id: HashMap<u32, RigidBody3DRef>,
    body_ids: Vec<u32>,
    collider_by_id: HashMap<u32, ReferenceCollider>,
    ids: Arc<RwLock<ReferenceIds>>,
    joint_by_id: HashMap<u32, Physics3DJointRef>,
    joint_ids: Vec<u32>,
    query: Physics3DQueryResult,
    ray: Physics3DRayResult,
    reaction: Physics3DJointReaction,
    registry: Arc<CollisionRegistry3D>,
    shape_cast: Physics3DShapeCastResult,
    world: Physics3DWorld,
}

struct ReferenceWorldEntry {
    state: Mutex<ReferenceWorld>,
    stepping: AtomicBool,
}

struct ReferenceAbiState {
    next_world_handle: u64,
    registry: Arc<CollisionRegistry3D>,
    worlds: HashMap<u32, Arc<ReferenceWorldEntry>>,
}

type ReferenceAbiStateRef = Arc<Mutex<ReferenceAbiState>>;

// A decoded joint that has not joined the world yet. `add_physics_3d_joint` is generic over the
// concrete kind, so the typed handle is kept until the previous joint under the same id is gone.
type ReferenceJointAdder = Box<dyn FnOnce(&mut Physics3DWorld) -> Physics3DJointRef>;

// One decoded command record.
struct CommandRecord<'a> {
    byte_length: usize,
    bytes: &'a [u8],
    kind: u32,
    object_id: u32,
    payload: usize,
    related_id: u32,
    start: usize,
}

// Builds the joint a SetJoint record describes (TS `createJoint`), ready to be added. Kinds without
// local frames ignore the frame slots, as the source's options spread does.
fn create_joint(
    kind: u32,
    body_a: i32,
    body_b: i32,
    flags: u32,
    common: &[f64; JOINT_COMMON_VALUE_COUNT],
    values: &[f64; JOINT_KIND_VALUE_COUNT],
) -> Option<ReferenceJointAdder> {
    let c = |i: usize| common[i] as f32;
    let v = |i: usize| values[i] as f32;
    let bit = |i: u32| flags & (1 << i) != 0;
    let broken = flags & PHYSICS3D_ABI_JOINT_FLAG_BROKEN != 0;
    let frames = Physics3DJointFrames {
        local_rotation_ax: c(8),
        local_rotation_ay: c(9),
        local_rotation_az: c(10),
        local_rotation_aw: c(11),
        local_rotation_bx: c(12),
        local_rotation_by: c(13),
        local_rotation_bz: c(14),
        local_rotation_bw: c(15),
    };
    let base = |joint: &mut dyn Physics3DJoint| {
        let out = joint.fields_mut();
        out.body_a = body_a;
        out.body_b = body_b;
        out.local_anchor_ax = c(0);
        out.local_anchor_ay = c(1);
        out.local_anchor_az = c(2);
        out.local_anchor_bx = c(3);
        out.local_anchor_by = c(4);
        out.local_anchor_bz = c(5);
        out.break_force = c(6);
        out.break_torque = c(7);
        out.collide_connected = flags & PHYSICS3D_ABI_JOINT_FLAG_COLLIDE_CONNECTED != 0;
        out.broken = broken;
    };
    if kind == PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET {
        let joint = create_physics_3d_ball_and_socket_joint();
        base(&mut *joint.write().unwrap());
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_DISTANCE {
        let joint = create_physics_3d_distance_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.length = v(0);
            out.frequency_hz = v(1);
            out.damping_ratio = v(2);
            out.min_length = v(3);
            out.max_length = v(4);
            out.enable_spring = bit(2);
            out.enable_limit = bit(3);
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_FIXED {
        let joint = create_physics_3d_fixed_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.frames = frames;
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_HINGE {
        let joint = create_physics_3d_hinge_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.frames = frames;
            out.lower_angle = v(0);
            out.upper_angle = v(1);
            out.motor_speed = v(2);
            out.max_motor_torque = v(3);
            out.limit_frequency_hz = v(4);
            out.limit_damping_ratio = v(5);
            out.enable_limit = bit(2);
            out.enable_motor = bit(3);
            out.enable_limit_spring = bit(4);
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_SLIDER {
        let joint = create_physics_3d_slider_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.frames = frames;
            out.lower_translation = v(0);
            out.upper_translation = v(1);
            out.motor_speed = v(2);
            out.max_motor_force = v(3);
            out.limit_frequency_hz = v(4);
            out.limit_damping_ratio = v(5);
            out.enable_limit = bit(2);
            out.enable_motor = bit(3);
            out.enable_limit_spring = bit(4);
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST {
        let joint = create_physics_3d_cone_twist_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.frames = frames;
            out.swing_limit_y = v(0);
            out.swing_limit_z = v(1);
            out.lower_twist_angle = v(2);
            out.upper_twist_angle = v(3);
            out.limit_frequency_hz = v(4);
            out.limit_damping_ratio = v(5);
            out.enable_swing_limit = bit(2);
            out.enable_twist_limit = bit(3);
            out.enable_limit_spring = bit(4);
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF {
        let joint = create_physics_3d_generic_6_dof_joint();
        {
            let mut out = joint.write().unwrap();
            base(&mut *out);
            out.frames = frames;
            out.lower_linear_x = v(0);
            out.lower_linear_y = v(1);
            out.lower_linear_z = v(2);
            out.upper_linear_x = v(3);
            out.upper_linear_y = v(4);
            out.upper_linear_z = v(5);
            out.lower_angular_x = v(6);
            out.lower_angular_y = v(7);
            out.lower_angular_z = v(8);
            out.upper_angular_x = v(9);
            out.upper_angular_y = v(10);
            out.upper_angular_z = v(11);
            out.limit_frequency_hz = v(12);
            out.limit_damping_ratio = v(13);
            out.enable_limit_spring = bit(2);
        }
        return Some(Box::new(move |world| add_reference_joint(world, joint)));
    }
    return None;
}

/// Creates the executable reference ABI (TS `createReferencePhysics3DAbi`).
pub fn create_reference_physics3d_abi() -> Physics3DAbi {
    let mut out: Physics3DAbi = allocate_entity();
    initialize_reference_physics3d_abi(&mut out);
    return out;
}

fn create_reference_world(
    world: Physics3DWorld,
    registry: Arc<CollisionRegistry3D>,
) -> ReferenceWorld {
    return ReferenceWorld {
        body_by_id: HashMap::new(),
        body_ids: Vec::new(),
        collider_by_id: HashMap::new(),
        ids: Arc::new(RwLock::new(ReferenceIds::default())),
        joint_by_id: HashMap::new(),
        joint_ids: Vec::new(),
        query: create_physics_3d_query_result(),
        ray: create_physics_3d_ray_result(),
        reaction: create_physics_3d_joint_reaction(),
        registry,
        shape_cast: create_physics_3d_shape_cast_result(),
        world,
    };
}

/// Installs a fresh reference backend into `out` (TS `initializeReferencePhysics3DAbi`): its own
/// collision registry, world table and handle counter, captured by every callback.
pub fn initialize_reference_physics3d_abi(out: &mut Physics3DAbi) {
    let mut registry = CollisionRegistry3D {
        face_queries: HashMap::new(),
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_pair_tests3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    let state: ReferenceAbiStateRef = Arc::new(Mutex::new(ReferenceAbiState {
        next_world_handle: 1,
        registry: Arc::new(registry),
        worlds: HashMap::new(),
    }));
    out.version = PHYSICS3D_ABI_VERSION;
    out.capabilities = PHYSICS3D_ABI_CAPABILITY_CONTACT_HOOKS
        | PHYSICS3D_ABI_CAPABILITY_PERSISTENT_WORLDS
        | PHYSICS3D_ABI_CAPABILITY_QUERIES
        | PHYSICS3D_ABI_CAPABILITY_SELECTIVE_READBACK;

    let s = state.clone();
    out.create_world = Arc::new(move || {
        let mut abi = lock(&s);
        if abi.next_world_handle > 0xffff_ffff {
            return 0;
        }
        let handle = abi.next_world_handle as u32;
        abi.next_world_handle += 1;
        let mut world = create_physics_3d_world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let registry = abi.registry.clone();
        abi.worlds.insert(
            handle,
            Arc::new(ReferenceWorldEntry {
                state: Mutex::new(create_reference_world(world, registry)),
                stepping: AtomicBool::new(false),
            }),
        );
        return handle;
    });
    let s = state.clone();
    out.destroy_world = Arc::new(move |handle| {
        let mut abi = lock(&s);
        if abi
            .worlds
            .get(&handle)
            .is_some_and(|entry| entry.stepping.load(Ordering::SeqCst))
        {
            return false;
        }
        return abi.worlds.remove(&handle).is_some();
    });
    let s = state.clone();
    out.get_world_status = Arc::new(move |handle| {
        let Some(entry) = get_entry(&s, handle) else {
            return Physics3DAbiWorldStatus::Stale;
        };
        return if entry.stepping.load(Ordering::SeqCst) {
            Physics3DAbiWorldStatus::Busy
        } else {
            Physics3DAbiWorldStatus::Ready
        };
    });
    let s = state.clone();
    out.execute = Arc::new(move |handle, commands, result| {
        let Some(entry) = get_entry(&s, handle) else {
            return fail_execution(
                result,
                Physics3DAbiExecutionStatus::StaleWorld,
                0,
                PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH,
                0,
            );
        };
        if entry.stepping.load(Ordering::SeqCst) {
            return fail_execution(
                result,
                Physics3DAbiExecutionStatus::BusyWorld,
                0,
                PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH,
                0,
            );
        }
        return execute_commands(&mut lock(&entry.state), commands, result);
    });
    let s = state.clone();
    out.step = Arc::new(move |handle, dt, hooks| {
        let Some(entry) = get_entry(&s, handle) else {
            return Physics3DAbiStepStatus::StaleWorld;
        };
        if entry.stepping.load(Ordering::SeqCst) {
            return Physics3DAbiStepStatus::BusyWorld;
        }
        return step_reference_world(&entry, dt, hooks);
    });
    let s = state.clone();
    out.read_bodies = Arc::new(move |handle, body_ids, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_bodies(&lock(&entry.state), body_ids, buffer);
        return true;
    });
    let s = state.clone();
    out.read_contacts = Arc::new(move |handle, selection, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_contacts(&lock(&entry.state), selection, buffer);
        return true;
    });
    let s = state.clone();
    out.read_joints = Arc::new(move |handle, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_joints(&mut lock(&entry.state), buffer);
        return true;
    });
    let s = state.clone();
    out.query_point = Arc::new(move |handle, x, y, z, filter, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        let mut world = lock(&entry.state);
        let world = &mut *world;
        query_physics_3d_point(&mut world.query, &mut world.world, x, y, z, filter);
        write_query_hits(world, buffer);
        return true;
    });
    let s = state.clone();
    out.query_ray = Arc::new(
        move |handle,
              origin_x,
              origin_y,
              origin_z,
              direction_x,
              direction_y,
              direction_z,
              max_fraction,
              closest,
              filter,
              buffer| {
            let Some(entry) = get_ready_entry(&s, handle) else {
                return false;
            };
            let mut world = lock(&entry.state);
            let world = &mut *world;
            let query = if closest {
                query_physics_3d_ray_closest
            } else {
                query_physics_3d_ray
            };
            query(
                &mut world.ray,
                &mut world.world,
                origin_x,
                origin_y,
                origin_z,
                direction_x,
                direction_y,
                direction_z,
                Some(max_fraction),
                filter,
            );
            write_ray_hits(world, buffer);
            return true;
        },
    );
    let s = state.clone();
    out.query_region = Arc::new(move |handle, region, filter, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        let mut world = lock(&entry.state);
        let world = &mut *world;
        query_physics_3d_region(&mut world.query, &mut world.world, region, filter);
        write_query_hits(world, buffer);
        return true;
    });
    let s = state;
    out.query_shape_cast = Arc::new(
        move |handle, shape, dx, dy, dz, max_fraction, filter, buffer| {
            let Some(entry) = get_ready_entry(&s, handle) else {
                return false;
            };
            let mut world = lock(&entry.state);
            let world = &mut *world;
            let registry = world.registry.clone();
            query_physics_3d_shape_cast(
                &mut world.shape_cast,
                &mut world.world,
                &registry,
                shape,
                dx,
                dy,
                dz,
                Some(max_fraction),
                filter,
            );
            write_shape_cast_hit(world, buffer);
            return true;
        },
    );
}

fn add_reference_joint<T: Physics3DJoint + 'static>(
    world: &mut Physics3DWorld,
    joint: Ref<T>,
) -> Physics3DJointRef {
    add_physics_3d_joint(world, &joint);
    return joint;
}

fn are_finite(values: &[f64]) -> bool {
    return values.iter().all(|value| value.is_finite());
}

// The Physics3D step validator's admission of a world (TS `canStep`).
fn can_step(world: &Physics3DWorld, dt: f32) -> bool {
    return is_physics_3d_timestep_valid(dt)
        && is_physics_3d_substeps_valid(&world.config)
        && is_physics_3d_velocity_iterations_valid(&world.config)
        && is_physics_3d_position_iterations_valid(&world.config)
        && is_physics_3d_solver_config_valid(&world.config)
        && is_physics_3d_gravity_valid(world)
        && is_physics_3d_body_state_valid(world)
        && is_physics_3d_collider_state_valid(world)
        && is_physics_3d_contact_state_valid(world)
        && is_physics_3d_joint_state_valid(world);
}

fn clear_contact_buffer(out: &mut Physics3DAbiContactBuffer) {
    out.count = 0;
    out.point_count = 0;
    out.required_count = 0;
    out.required_point_count = 0;
}

fn clear_query_buffer(out: &mut Physics3DAbiQueryBuffer, required_count: usize) {
    out.count = 0;
    out.required_count = required_count;
}

fn clear_query_values(out: &mut Physics3DAbiQueryBuffer, at: usize) {
    let base = at * PHYSICS3D_ABI_QUERY_VALUE_STRIDE;
    out.values[base..base + PHYSICS3D_ABI_QUERY_VALUE_STRIDE].fill(0.0);
}

fn decode_body_type(value: u32) -> Option<Physics3DBodyType> {
    return match value {
        PHYSICS3D_ABI_BODY_TYPE_DYNAMIC => Some(Physics3DBodyType::Dynamic),
        PHYSICS3D_ABI_BODY_TYPE_KINEMATIC => Some(Physics3DBodyType::Kinematic),
        PHYSICS3D_ABI_BODY_TYPE_STATIC => Some(Physics3DBodyType::Static),
        _ => None,
    };
}

fn encode_body_flags(body: &RigidBody3D) -> u32 {
    let mut flags = match body.body_type {
        Physics3DBodyType::Dynamic => PHYSICS3D_ABI_BODY_TYPE_DYNAMIC,
        Physics3DBodyType::Kinematic => PHYSICS3D_ABI_BODY_TYPE_KINEMATIC,
        Physics3DBodyType::Static => PHYSICS3D_ABI_BODY_TYPE_STATIC,
    };
    if body.fixed_rotation {
        flags |= PHYSICS3D_ABI_BODY_FLAG_FIXED_ROTATION;
    }
    if body.bullet {
        flags |= PHYSICS3D_ABI_BODY_FLAG_BULLET;
    }
    if body.sleeping {
        flags |= PHYSICS3D_ABI_BODY_FLAG_SLEEPING;
    }
    if body.sleep_enabled {
        flags |= PHYSICS3D_ABI_BODY_FLAG_SLEEP_ENABLED;
    }
    return flags;
}

fn execute_body_action(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
    apply: fn(&RigidBody3DRef, f32, f32, f32) -> bool,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    let applied = apply(
        body,
        read_f64(command.bytes, command.payload) as f32,
        read_f64(command.bytes, command.payload + 8) as f32,
        read_f64(command.bytes, command.payload + 16) as f32,
    );
    return if applied {
        Physics3DAbiExecutionStatus::Complete
    } else {
        Physics3DAbiExecutionStatus::RejectedMutation
    };
}

fn execute_body_point_action(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
    apply: fn(&RigidBody3DRef, f32, f32, f32, f32, f32, f32) -> bool,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    let value = |i: usize| read_f64(command.bytes, command.payload + i * 8) as f32;
    let applied = apply(
        body,
        value(0),
        value(1),
        value(2),
        value(3),
        value(4),
        value(5),
    );
    return if applied {
        Physics3DAbiExecutionStatus::Complete
    } else {
        Physics3DAbiExecutionStatus::RejectedMutation
    };
}

fn execute_command(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    return match command.kind {
        PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY => execute_set_gravity(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG => execute_set_solver_config(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_SET_BODY => execute_set_body(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY => execute_destroy_body(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER => execute_set_collider(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER => execute_destroy_collider(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT => execute_set_joint(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT => execute_destroy_joint(state, command),
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE => {
            execute_body_action(state, command, apply_physics_3d_force)
        }
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT => {
            execute_body_point_action(state, command, apply_physics_3d_force_at_point)
        }
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE => {
            execute_body_action(state, command, apply_physics_3d_linear_impulse)
        }
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT => {
            execute_body_point_action(state, command, apply_physics_3d_linear_impulse_at_point)
        }
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE => {
            execute_body_action(state, command, apply_physics_3d_torque)
        }
        PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY => execute_wake_body(state, command),
        _ => Physics3DAbiExecutionStatus::InvalidCommand,
    };
}

fn execute_commands(
    state: &mut ReferenceWorld,
    commands: &Physics3DAbiCommandBuffer,
    out: &mut Physics3DAbiExecutionResult,
) -> bool {
    if !is_command_buffer_valid(commands) {
        return fail_execution(
            out,
            Physics3DAbiExecutionStatus::InvalidBuffer,
            0,
            PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH,
            0,
        );
    }
    let bytes = &commands.data[..];
    let mut byte_offset = PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH;
    for command_index in 0..commands.command_count {
        if byte_offset + PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH > commands.byte_length {
            return fail_execution(
                out,
                Physics3DAbiExecutionStatus::InvalidBuffer,
                command_index,
                byte_offset,
                0,
            );
        }
        let kind = read_u32(bytes, byte_offset);
        let byte_length = read_u32(bytes, byte_offset + 4) as usize;
        if byte_length < PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
            || !byte_length.is_multiple_of(8)
            || byte_offset + byte_length > commands.byte_length
        {
            return fail_execution(
                out,
                Physics3DAbiExecutionStatus::InvalidBuffer,
                command_index,
                byte_offset,
                kind,
            );
        }
        let record = CommandRecord {
            byte_length,
            bytes,
            kind,
            object_id: read_u32(bytes, byte_offset + 8),
            payload: byte_offset + PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
            related_id: read_u32(bytes, byte_offset + 12),
            start: byte_offset,
        };
        let status = execute_command(state, &record);
        if status != Physics3DAbiExecutionStatus::Complete {
            return fail_execution(out, status, command_index, byte_offset, kind);
        }
        byte_offset += byte_length;
    }
    if byte_offset != commands.byte_length {
        return fail_execution(
            out,
            Physics3DAbiExecutionStatus::InvalidBuffer,
            commands.command_count,
            byte_offset,
            0,
        );
    }
    out.status = Physics3DAbiExecutionStatus::Complete;
    out.command_index = commands.command_count;
    out.byte_offset = byte_offset;
    out.command_kind = 0;
    return true;
}

// Destroying a body cascades to the colliders it owns and to every joint naming it.
fn execute_destroy_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id).cloned() else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    let body_index = body.read().unwrap().index;
    {
        let mut ids = state.ids.write().unwrap();
        state.collider_by_id.retain(|_, held| {
            if held.body_id != command.object_id {
                return true;
            }
            ids.id_by_collider.remove(&get_collider_key(&held.collider));
            return false;
        });
        let mut removed_joints = Vec::new();
        state.joint_by_id.retain(|id, joint| {
            let joint = joint.read().unwrap();
            let fields = joint.fields();
            if fields.body_a != body_index && fields.body_b != body_index {
                return true;
            }
            removed_joints.push(*id);
            return false;
        });
        for id in removed_joints {
            remove_sorted(&mut state.joint_ids, id);
        }
        ids.id_by_body_index.remove(&body_index);
    }
    remove_physics_3d_body(&mut state.world, &body);
    state.body_by_id.remove(&command.object_id);
    remove_sorted(&mut state.body_ids, command.object_id);
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_destroy_collider(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(held) = state.collider_by_id.get(&command.object_id) else {
        return Physics3DAbiExecutionStatus::MissingCollider;
    };
    let Some(body) = state.body_by_id.get(&held.body_id) else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    if !remove_physics_3d_collider(&mut state.world, body, &held.collider) {
        return Physics3DAbiExecutionStatus::MissingBody;
    }
    let key = get_collider_key(&held.collider);
    state.collider_by_id.remove(&command.object_id);
    state.ids.write().unwrap().id_by_collider.remove(&key);
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_destroy_joint(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(joint) = state.joint_by_id.remove(&command.object_id) else {
        return Physics3DAbiExecutionStatus::MissingJoint;
    };
    remove_physics_3d_joint(&mut state.world, &joint);
    remove_sorted(&mut state.joint_ids, command.object_id);
    return Physics3DAbiExecutionStatus::Complete;
}

// The authored mass block is applied as mass data and then the dynamic state is written field by
// field, gated by what the body type and fixed rotation allow (TS `writeBodyDynamicValues`).
fn execute_set_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let flags = read_u32(command.bytes, command.payload);
    if flags & PHYSICS3D_ABI_BODY_FLAG_MASK != flags
        || read_u32(command.bytes, command.payload + 4) != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let body_type = decode_body_type(flags & PHYSICS3D_ABI_BODY_FLAG_TYPE_MASK);
    let mut values = [0.0; PHYSICS3D_ABI_BODY_VALUE_STRIDE];
    read_f64_values(
        &mut values,
        command,
        PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES,
    );
    let Some(body_type) = body_type else {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    };
    if !is_body_value_block_valid(&values) {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }

    let existing = state.body_by_id.get(&command.object_id).cloned();
    let added = existing.is_none();
    let body = existing.unwrap_or_else(|| {
        let body = create_rigid_body_3d();
        body.write().unwrap().body_type = body_type;
        return body;
    });
    let v = |i: usize| values[i] as f32;
    let world = &mut state.world;
    if !set_physics_3d_body_type(world, &body, body_type)
        || !set_physics_3d_body_fixed_rotation(
            world,
            &body,
            flags & PHYSICS3D_ABI_BODY_FLAG_FIXED_ROTATION != 0,
        )
        || !set_physics_3d_body_bullet(&body, flags & PHYSICS3D_ABI_BODY_FLAG_BULLET != 0)
        || !set_physics_3d_body_sleep_enabled(
            &body,
            flags & PHYSICS3D_ABI_BODY_FLAG_SLEEP_ENABLED != 0,
        )
        || !set_physics_3d_body_transform(world, &body, v(0), v(1), v(2), v(3), v(4), v(5), v(6))
    {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    {
        let mut mass = create_physics_3d_mass_data();
        mass.mass = v(19);
        mass.inertia_xx = v(20);
        mass.inertia_yy = v(21);
        mass.inertia_zz = v(22);
        mass.inertia_xy = v(23);
        mass.inertia_xz = v(24);
        mass.inertia_yz = v(25);
        mass.center_x = v(26);
        mass.center_y = v(27);
        mass.center_z = v(28);
        let mut out = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut out, &mass);
        refresh_rigid_body_3d_world_inertia(&mut out);
        write_body_dynamic_values(&mut out, &values, flags);
    }

    if added {
        add_physics_3d_body(&mut state.world, &body);
        let index = body.read().unwrap().index;
        state.body_by_id.insert(command.object_id, body);
        state
            .ids
            .write()
            .unwrap()
            .id_by_body_index
            .insert(index, command.object_id);
        insert_sorted(&mut state.body_ids, command.object_id);
    }
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_set_collider(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if !is_object_id(command.object_id)
        || !is_object_id(command.related_id)
        || command.byte_length < PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.related_id).cloned() else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    let collider_flags = read_u32(command.bytes, command.payload);
    if collider_flags & 1 != collider_flags {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let shape_at = command.payload + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE;
    let shape_kind = read_u32(command.bytes, shape_at);
    if !(PHYSICS3D_ABI_SHAPE_KIND_SPHERE..=PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD)
        .contains(&shape_kind)
    {
        return Physics3DAbiExecutionStatus::UnsupportedShape;
    }
    let Some(shape) = read_shape(command, shape_at) else {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    };
    if !is_shape_valid(&shape) {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    if body.read().unwrap().body_type != Physics3DBodyType::Static
        && !matches!(shape, CollisionColliderShape3D::BuiltIn(_))
    {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    let density = read_f64(command.bytes, command.payload + 16);
    let friction = read_f64(command.bytes, command.payload + 24);
    let restitution = read_f64(command.bytes, command.payload + 32);
    if ![density, friction, restitution]
        .iter()
        .all(|value| value.is_finite() && *value >= 0.0)
    {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    let collider = create_physics_3d_collider(&shape);
    {
        let mut out = collider.write().unwrap();
        out.material = Physics3DMaterial {
            density: density as f32,
            friction: friction as f32,
            restitution: restitution as f32,
        };
        out.filter = Physics3DCollisionFilter {
            category_bits: read_u32(command.bytes, command.payload + 4),
            mask_bits: read_u32(command.bytes, command.payload + 8),
            group_index: read_i32(command.bytes, command.payload + 12),
        };
        out.sensor = collider_flags & 1 != 0;
    }

    // Replacing an id detaches the previous collider first, so an id names one live collider.
    if let Some(previous) = state.collider_by_id.get(&command.object_id) {
        let Some(previous_body) = state.body_by_id.get(&previous.body_id) else {
            return Physics3DAbiExecutionStatus::MissingBody;
        };
        remove_physics_3d_collider(&mut state.world, previous_body, &previous.collider);
        let key = get_collider_key(&previous.collider);
        state.ids.write().unwrap().id_by_collider.remove(&key);
    }
    add_physics_3d_collider(&mut state.world, &body, &collider);
    state
        .ids
        .write()
        .unwrap()
        .id_by_collider
        .insert(get_collider_key(&collider), command.object_id);
    state.collider_by_id.insert(
        command.object_id,
        ReferenceCollider {
            body_id: command.related_id,
            collider,
        },
    );
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_set_gravity(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY
        || command.object_id != 0
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let x = read_f64(command.bytes, command.payload);
    let y = read_f64(command.bytes, command.payload + 8);
    let z = read_f64(command.bytes, command.payload + 16);
    if !x.is_finite() || !y.is_finite() || !z.is_finite() {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    state.world.gravity_x = x as f32;
    state.world.gravity_y = y as f32;
    state.world.gravity_z = z as f32;
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_set_joint(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let payload = command.payload;
    let kind = read_u32(
        command.bytes,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND,
    );
    if !(PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET..=PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF)
        .contains(&kind)
    {
        return Physics3DAbiExecutionStatus::UnsupportedJoint;
    }
    let body_a_id = read_u32(
        command.bytes,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A,
    );
    let body_b_id = read_u32(
        command.bytes,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B,
    );
    if !is_object_id(body_a_id) || !is_object_id(body_b_id) {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let (Some(body_a), Some(body_b)) = (
        state.body_by_id.get(&body_a_id),
        state.body_by_id.get(&body_b_id),
    ) else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    let (body_a_index, body_b_index) = (body_a.read().unwrap().index, body_b.read().unwrap().index);
    let flags = read_u32(
        command.bytes,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS,
    );
    if flags & get_joint_flag_mask(kind) != flags {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let mut common = [0.0; JOINT_COMMON_VALUE_COUNT];
    read_f64_values(
        &mut common,
        command,
        PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES,
    );
    let mut values = [0.0; JOINT_KIND_VALUE_COUNT];
    read_f64_values(
        &mut values,
        command,
        PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES,
    );
    if !is_joint_value_block_valid(kind, &common, &values) {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    let Some(add_joint) = create_joint(kind, body_a_index, body_b_index, flags, &common, &values)
    else {
        return Physics3DAbiExecutionStatus::UnsupportedJoint;
    };

    let previous = state.joint_by_id.remove(&command.object_id);
    if let Some(previous) = &previous {
        remove_physics_3d_joint(&mut state.world, previous);
    }
    let joint = add_joint(&mut state.world);
    state.joint_by_id.insert(command.object_id, joint);
    if previous.is_none() {
        insert_sorted(&mut state.joint_ids, command.object_id);
    }
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_set_solver_config(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG
        || command.object_id != 0
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let payload = command.payload;
    let flags = read_u32(command.bytes, payload);
    if flags & 0b111 != flags
        || read_u32(
            command.bytes,
            payload + PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0,
        ) != 0
        || read_u32(
            command.bytes,
            payload + PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED1,
        ) != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let count = |at: usize| read_u32(command.bytes, payload + at) as usize;
    let value = |i: usize| {
        read_f64(
            command.bytes,
            payload + PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES + i * 8,
        ) as f32
    };
    let config = Physics3DSolverConfig {
        allow_sleeping: flags & 1 != 0,
        continuous_collision: flags & (1 << 1) != 0,
        substeps: count(PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_SUBSTEPS),
        max_ccd_substeps: count(PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_SUBSTEPS),
        max_ccd_rotation_substeps: count(
            PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_MAX_CCD_ROTATION_SUBSTEPS,
        ),
        sleep_linear_threshold: value(0),
        sleep_angular_threshold: value(1),
        time_to_sleep: value(2),
        sequential_impulse: Physics3DSequentialImpulseConfig {
            velocity_iterations: count(
                PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VELOCITY_ITERATIONS,
            ),
            position_iterations: count(
                PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_POSITION_ITERATIONS,
            ),
            penetration_slop: value(3),
            position_correction: value(4),
            restitution_threshold: value(5),
            warm_starting: flags & (1 << 2) != 0,
        },
    };
    if !is_physics_3d_substeps_valid(&config)
        || !is_physics_3d_velocity_iterations_valid(&config)
        || !is_physics_3d_position_iterations_valid(&config)
        || !is_physics_3d_solver_config_valid(&config)
    {
        return Physics3DAbiExecutionStatus::RejectedMutation;
    }
    state.world.config = config;
    return Physics3DAbiExecutionStatus::Complete;
}

fn execute_wake_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics3DAbiExecutionStatus {
    if command.byte_length != PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics3DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics3DAbiExecutionStatus::MissingBody;
    };
    wake_physics_3d_body(body);
    return Physics3DAbiExecutionStatus::Complete;
}

fn fail_execution(
    out: &mut Physics3DAbiExecutionResult,
    status: Physics3DAbiExecutionStatus,
    command_index: u32,
    byte_offset: usize,
    command_kind: u32,
) -> bool {
    out.status = status;
    out.command_index = command_index;
    out.byte_offset = byte_offset;
    out.command_kind = command_kind;
    return false;
}

fn get_body_id(ids: &ReferenceIds, body: &RigidBody3DRef) -> u32 {
    let index = body.read().unwrap().index;
    return ids.id_by_body_index.get(&index).copied().unwrap_or(0);
}

fn get_collider_id(ids: &ReferenceIds, collider: &Physics3DColliderRef) -> u32 {
    return ids
        .id_by_collider
        .get(&get_collider_key(collider))
        .copied()
        .unwrap_or(0);
}

fn get_collider_key(collider: &Physics3DColliderRef) -> usize {
    return Arc::as_ptr(collider) as *const () as usize;
}

fn get_contact_capacity(out: &Physics3DAbiContactBuffer) -> usize {
    return out
        .flags
        .len()
        .min(out.point_starts.len())
        .min(out.point_counts.len())
        .min(out.ids.len() / PHYSICS3D_ABI_CONTACT_ID_STRIDE)
        .min(out.values.len() / PHYSICS3D_ABI_CONTACT_VALUE_STRIDE);
}

fn get_entry(state: &ReferenceAbiStateRef, handle: u32) -> Option<Arc<ReferenceWorldEntry>> {
    return lock(state).worlds.get(&handle).cloned();
}

// Which flag bits a joint record may set, by kind (bits 0-1 are common). Anything outside the mask
// is InvalidCommand.
fn get_joint_flag_mask(kind: u32) -> u32 {
    if kind == PHYSICS3D_ABI_JOINT_KIND_DISTANCE {
        return 0b1111;
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_HINGE
        || kind == PHYSICS3D_ABI_JOINT_KIND_SLIDER
        || kind == PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST
    {
        return 0b11111;
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF {
        return 0b111;
    }
    return 0b11;
}

fn get_query_capacity(out: &Physics3DAbiQueryBuffer) -> usize {
    return out
        .body_ids
        .len()
        .min(out.collider_ids.len())
        .min(out.values.len() / PHYSICS3D_ABI_QUERY_VALUE_STRIDE);
}

// The entry of a live world that is not mid-step; reads and queries refuse otherwise.
fn get_ready_entry(state: &ReferenceAbiStateRef, handle: u32) -> Option<Arc<ReferenceWorldEntry>> {
    let entry = get_entry(state, handle)?;
    if entry.stepping.load(Ordering::SeqCst) {
        return None;
    }
    return Some(entry);
}

fn has_hook_capacity(buffer: &Physics3DAbiContactBuffer) -> bool {
    return get_contact_capacity(buffer) >= 1
        && buffer.point_feature_ids.len() >= PHYSICS3D_ABI_MAX_CONTACT_POINTS
        && buffer.point_values.len()
            >= PHYSICS3D_ABI_MAX_CONTACT_POINTS * PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE;
}

fn insert_sorted(values: &mut Vec<u32>, value: u32) {
    let mut at = values.len();
    while at > 0 && values[at - 1] > value {
        at -= 1;
    }
    values.insert(at, value);
}

// Hands one contact to a hook through the shared buffer, then reads back the three fields a hook
// may change. A non-finite or negative friction or restitution is a programmer error.
fn invoke_contact_hook(
    ids: &ReferenceIds,
    world: &Physics3DWorld,
    contact: &Physics3DContactRef,
    buffer: &Ref<Physics3DAbiContactBuffer>,
    hook: &Physics3DAbiContactHook,
) {
    let mut buffer = buffer.write().unwrap();
    clear_contact_buffer(&mut buffer);
    let point_count = {
        let contact = contact.read().unwrap();
        write_contact(ids, world, &contact, &mut buffer, 0, 0);
        contact.point_count
    };
    buffer.count = 1;
    buffer.point_count = point_count;
    buffer.required_count = 1;
    buffer.required_point_count = point_count;
    hook(&mut buffer);
    // Row zero: a hook is handed exactly one contact.
    let flags = buffer.flags[0];
    let friction = buffer.values[PHYSICS3D_ABI_CONTACT_VALUE_FRICTION];
    let restitution = buffer.values[PHYSICS3D_ABI_CONTACT_VALUE_RESTITUTION];
    if !friction.is_finite() || friction < 0.0 || !restitution.is_finite() || restitution < 0.0 {
        throw_error("Physics3D ABI contact hook produced invalid contact values");
    }
    let mut contact = contact.write().unwrap();
    contact.enabled = flags & PHYSICS3D_ABI_CONTACT_FLAG_ENABLED != 0;
    contact.friction = friction as f32;
    contact.restitution = restitution as f32;
}

fn is_body_value_block_valid(values: &[f64; PHYSICS3D_ABI_BODY_VALUE_STRIDE]) -> bool {
    if !are_finite(values) {
        return false;
    }
    if values[19] < 0.0 || values[29] < 0.0 || values[30] < 0.0 || values[32] < 0.0 {
        return false;
    }
    let orientation_length_squared = values[3] * values[3]
        + values[4] * values[4]
        + values[5] * values[5]
        + values[6] * values[6];
    return orientation_length_squared > 0.0;
}

fn is_command_buffer_valid(commands: &Physics3DAbiCommandBuffer) -> bool {
    // The source's safe-integer and non-negative checks are statically satisfied by `usize`/`u32`.
    if commands.data.len() < PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH
        || commands.byte_length < PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH
        || commands.byte_length > commands.data.len()
        || commands.command_count as usize
            > (commands.byte_length - PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH)
                / PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
    {
        return false;
    }
    return read_u32(&commands.data, 0) == PHYSICS3D_ABI_COMMAND_MAGIC
        && read_u32(&commands.data, 4) == PHYSICS3D_ABI_VERSION
        && read_u32(&commands.data, 8) as usize == commands.byte_length
        && read_u32(&commands.data, 12) == commands.command_count;
}

// Every slot must be finite, except the two break thresholds and a distance joint's maximum length,
// which may be +Infinity (their "unbounded" defaults).
fn is_joint_value_block_valid(
    kind: u32,
    common: &[f64; JOINT_COMMON_VALUE_COUNT],
    values: &[f64; JOINT_KIND_VALUE_COUNT],
) -> bool {
    for (i, value) in common.iter().enumerate() {
        if (i == 6 || i == 7) && *value == f64::INFINITY {
            continue;
        }
        if !value.is_finite() {
            return false;
        }
    }
    for (i, value) in values.iter().enumerate() {
        if kind == PHYSICS3D_ABI_JOINT_KIND_DISTANCE && i == 4 && *value == f64::INFINITY {
            continue;
        }
        if !value.is_finite() {
            return false;
        }
    }
    return true;
}

fn is_object_id(value: u32) -> bool {
    return value > 0;
}

fn is_shape_valid(shape: &CollisionColliderShape3D) -> bool {
    return match shape {
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            get_collision_triangle_mesh_validation_status3d(&mesh.read().unwrap()).is_none()
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            get_collision_heightfield_validation_status3d(&heightfield.read().unwrap()).is_none()
        }
        CollisionColliderShape3D::BuiltIn(shape) => {
            get_collision_shape_validation_status3d(shape).is_none()
        }
    };
}

// Locks a mutex, recovering it after a panic: a hook's throw unwinds through a step that holds the
// world lock, and the world stays usable afterwards as it does in the source (D10).
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    return mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
}

fn read_bodies(state: &ReferenceWorld, body_ids: Option<&[u32]>, out: &mut Physics3DAbiBodyBuffer) {
    out.count = 0;
    out.required_count = 0;
    let capacity = out
        .ids
        .len()
        .min(out.flags.len())
        .min(out.values.len() / PHYSICS3D_ABI_BODY_VALUE_STRIDE);
    let Some(body_ids) = body_ids else {
        out.required_count = state.body_ids.len();
        for id in &state.body_ids {
            if out.count >= capacity {
                break;
            }
            let Some(body) = state.body_by_id.get(id) else {
                continue;
            };
            let at = out.count;
            write_body(*id, &body.read().unwrap(), out, at);
            out.count += 1;
        }
        return;
    };
    for id in body_ids {
        let Some(body) = state.body_by_id.get(id) else {
            continue;
        };
        out.required_count += 1;
        if out.count >= capacity {
            continue;
        }
        let at = out.count;
        write_body(*id, &body.read().unwrap(), out, at);
        out.count += 1;
    }
}

// Publishes a prefix: once one contact does not fit, publication stops, so a grown buffer reads a
// superset rather than a different subsequence. The required counts report the whole answer.
fn read_contacts(
    state: &ReferenceWorld,
    selection: Physics3DAbiContactSelection,
    out: &mut Physics3DAbiContactBuffer,
) {
    clear_contact_buffer(out);
    let contacts = match selection {
        Physics3DAbiContactSelection::All => &state.world.contacts,
        Physics3DAbiContactSelection::Began => &state.world.events.began,
        Physics3DAbiContactSelection::Ended => &state.world.events.ended,
    };
    let contact_capacity = get_contact_capacity(out);
    let point_capacity = out
        .point_feature_ids
        .len()
        .min(out.point_values.len() / PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE);
    let ids = state.ids.read().unwrap();
    let mut prefix_fits = true;
    for contact in contacts {
        let contact = contact.read().unwrap();
        out.required_count += 1;
        out.required_point_count += contact.point_count;
        if !prefix_fits
            || out.count >= contact_capacity
            || out.point_count + contact.point_count > point_capacity
        {
            prefix_fits = false;
            continue;
        }
        let (at, point_at) = (out.count, out.point_count);
        write_contact(&ids, &state.world, &contact, out, at, point_at);
        out.count += 1;
        out.point_count += contact.point_count;
    }
}

fn read_f64_values(out: &mut [f64], command: &CommandRecord, payload_offset: usize) {
    let at = command.payload + payload_offset;
    for (i, value) in out.iter_mut().enumerate() {
        *value = read_f64(command.bytes, at + i * 8);
    }
}

// Joint ids in ascending order with their latest reaction at the previous substep; a broken joint
// stays listed with the Broken flag until it is destroyed or replaced.
fn read_joints(state: &mut ReferenceWorld, out: &mut Physics3DAbiJointBuffer) {
    out.count = 0;
    out.required_count = state.joint_ids.len();
    let capacity = out
        .ids
        .len()
        .min(out.flags.len())
        .min(out.values.len() / PHYSICS3D_ABI_JOINT_VALUE_STRIDE);
    let dt = state.world.previous_timestep;
    for id in &state.joint_ids {
        if out.count >= capacity {
            break;
        }
        let Some(joint) = state.joint_by_id.get(id) else {
            continue;
        };
        let at = out.count;
        out.ids[at] = *id;
        out.flags[at] = if joint.read().unwrap().fields().broken {
            PHYSICS3D_ABI_JOINT_FLAG_BROKEN
        } else {
            0
        };
        write_physics_3d_joint_reaction(&mut state.reaction, &state.world, joint, dt);
        let reaction = &state.reaction;
        let base = at * PHYSICS3D_ABI_JOINT_VALUE_STRIDE;
        out.values[base] = f64::from(reaction.force_x);
        out.values[base + 1] = f64::from(reaction.force_y);
        out.values[base + 2] = f64::from(reaction.force_z);
        out.values[base + 3] = f64::from(reaction.torque_x);
        out.values[base + 4] = f64::from(reaction.torque_y);
        out.values[base + 5] = f64::from(reaction.torque_z);
        out.count += 1;
    }
}

// Decodes a shape block that must end exactly at the record's end, with zero padding (TS
// `readShape`). Only the triangle mesh and heightfield carry a payload version.
fn read_shape(command: &CommandRecord, at: usize) -> Option<CollisionColliderShape3D> {
    let end = command.start + command.byte_length;
    if at + PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH > end {
        return None;
    }
    let kind = read_u32(command.bytes, at);
    let scalar_count = read_u32(command.bytes, at + 4) as usize;
    let integer_count = read_u32(command.bytes, at + 8) as usize;
    let version = read_u32(command.bytes, at + 12);
    if kind != PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH
        && kind != PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD
        && version != 0
    {
        return None;
    }
    let scalars_at = at + PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH;
    let integers_at = scalars_at + scalar_count * 8;
    let unaligned_end = integers_at + integer_count * 4;
    if align8(unaligned_end) != end {
        return None;
    }
    if command.bytes[unaligned_end..end]
        .iter()
        .any(|byte| *byte != 0)
    {
        return None;
    }
    let scalars: Vec<f64> = (0..scalar_count)
        .map(|i| read_f64(command.bytes, scalars_at + i * 8))
        .collect();
    if !are_finite(&scalars) {
        return None;
    }
    let integers: Vec<u32> = (0..integer_count)
        .map(|i| read_u32(command.bytes, integers_at + i * 4))
        .collect();
    let s = |i: usize| scalars[i] as f32;
    let built_in = |shape: CollisionShape3D| Some(CollisionColliderShape3D::BuiltIn(shape));

    if kind == PHYSICS3D_ABI_SHAPE_KIND_SPHERE && scalar_count == 4 && integer_count == 0 {
        return built_in(CollisionShape3D::Sphere(CollisionSphere3D {
            x: s(0),
            y: s(1),
            z: s(2),
            radius: s(3),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_AABB && scalar_count == 6 && integer_count == 0 {
        return built_in(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: s(0),
            min_y: s(1),
            min_z: s(2),
            max_x: s(3),
            max_y: s(4),
            max_z: s(5),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_BOX && scalar_count == 10 && integer_count == 0 {
        return built_in(CollisionShape3D::Box(CollisionBox3D {
            x: s(0),
            y: s(1),
            z: s(2),
            half_x: s(3),
            half_y: s(4),
            half_z: s(5),
            rotation_x: s(6),
            rotation_y: s(7),
            rotation_z: s(8),
            rotation_w: s(9),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_CAPSULE && scalar_count == 7 && integer_count == 0 {
        return built_in(CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: s(0),
            y0: s(1),
            z0: s(2),
            x1: s(3),
            y1: s(4),
            z1: s(5),
            radius: s(6),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_CYLINDER && scalar_count == 7 && integer_count == 0 {
        return built_in(CollisionShape3D::Cylinder(CollisionCylinder3D {
            x0: s(0),
            y0: s(1),
            z0: s(2),
            x1: s(3),
            y1: s(4),
            z1: s(5),
            radius: s(6),
        }));
    }
    // The wire carries the apex then the base; flight-collision stores the base in the `0`
    // endpoint and the apex in the `1` endpoint.
    if kind == PHYSICS3D_ABI_SHAPE_KIND_CONE && scalar_count == 7 && integer_count == 0 {
        return built_in(CollisionShape3D::Cone(CollisionCone3D {
            x0: s(3),
            y0: s(4),
            z0: s(5),
            x1: s(0),
            y1: s(1),
            z1: s(2),
            radius: s(6),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_CONVEX && integer_count == 0 {
        return built_in(CollisionShape3D::Convex(CollisionConvex3D {
            points: scalars.iter().map(|value| *value as f32).collect(),
        }));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH && scalar_count >= 7 {
        let mut mesh = create_collision_triangle_mesh3d();
        mesh.points = scalars[7..].iter().map(|value| *value as f32).collect();
        mesh.indices = integers.iter().map(|index| *index as usize).collect();
        mesh.version = i64::from(version);
        mesh.x = s(0);
        mesh.y = s(1);
        mesh.z = s(2);
        mesh.rotation_x = s(3);
        mesh.rotation_y = s(4);
        mesh.rotation_z = s(5);
        mesh.rotation_w = s(6);
        return Some(CollisionColliderShape3D::TriangleMesh(Arc::new(
            RwLock::new(mesh),
        )));
    }
    if kind == PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD && scalar_count >= 9 && integer_count == 2 {
        let mut heightfield = create_collision_heightfield3d();
        heightfield.columns = integers[0] as usize;
        heightfield.rows = integers[1] as usize;
        heightfield.heights = scalars[9..].iter().map(|value| *value as f32).collect();
        heightfield.cell_size_x = s(0);
        heightfield.cell_size_z = s(1);
        heightfield.version = i64::from(version);
        heightfield.x = s(2);
        heightfield.y = s(3);
        heightfield.z = s(4);
        heightfield.rotation_x = s(5);
        heightfield.rotation_y = s(6);
        heightfield.rotation_z = s(7);
        heightfield.rotation_w = s(8);
        return Some(CollisionColliderShape3D::Heightfield(Arc::new(
            RwLock::new(heightfield),
        )));
    }
    return None;
}

fn remove_sorted(values: &mut Vec<u32>, value: u32) {
    if let Some(at) = values.iter().position(|candidate| *candidate == value) {
        values.remove(at);
    }
}

fn step_reference_world(
    entry: &ReferenceWorldEntry,
    dt: f32,
    hooks: Option<&Physics3DAbiContactHooks>,
) -> Physics3DAbiStepStatus {
    let mut state = lock(&entry.state);
    if !can_step(&state.world, dt) {
        return Physics3DAbiStepStatus::Declined;
    }
    if let Some(hooks) = hooks
        && (hooks.pre_solve.is_some() || hooks.post_solve.is_some())
        && !has_hook_capacity(&hooks.buffer.read().unwrap())
    {
        return Physics3DAbiStepStatus::InsufficientHookBuffer;
    }
    let previous_pre_solve = state.world.contact_hooks.pre_solve.take();
    let previous_post_solve = state.world.contact_hooks.post_solve.take();
    state.world.contact_hooks.pre_solve = hooks.and_then(|hooks| {
        let hook = hooks.pre_solve.clone()?;
        return Some(wrap_contact_hook(
            state.ids.clone(),
            hooks.buffer.clone(),
            hook,
        ));
    });
    state.world.contact_hooks.post_solve = hooks.and_then(|hooks| {
        let hook = hooks.post_solve.clone()?;
        return Some(wrap_contact_hook(
            state.ids.clone(),
            hooks.buffer.clone(),
            hook,
        ));
    });
    entry.stepping.store(true, Ordering::SeqCst);
    let registry = state.registry.clone();
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        step_physics_3d(&mut state.world, &registry, dt, None);
    }));
    // The source's `finally`: the previous hooks are restored and the world released even when a
    // hook throws.
    state.world.contact_hooks.pre_solve = previous_pre_solve;
    state.world.contact_hooks.post_solve = previous_post_solve;
    entry.stepping.store(false, Ordering::SeqCst);
    if let Err(payload) = outcome {
        drop(state);
        resume_unwind(payload);
    }
    return Physics3DAbiStepStatus::Complete;
}

fn wrap_contact_hook(
    ids: Arc<RwLock<ReferenceIds>>,
    buffer: Ref<Physics3DAbiContactBuffer>,
    hook: Physics3DAbiContactHook,
) -> Physics3DContactCallback {
    return Arc::new(
        move |world: &mut Physics3DWorld, contact: &Physics3DContactRef| {
            invoke_contact_hook(&ids.read().unwrap(), world, contact, &buffer, &hook);
        },
    );
}

fn write_body(id: u32, body: &RigidBody3D, out: &mut Physics3DAbiBodyBuffer, at: usize) {
    out.ids[at] = id;
    out.flags[at] = encode_body_flags(body);
    let base = at * PHYSICS3D_ABI_BODY_VALUE_STRIDE;
    let values = [
        body.x,
        body.y,
        body.z,
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
        body.velocity_x,
        body.velocity_y,
        body.velocity_z,
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
        body.force_x,
        body.force_y,
        body.force_z,
        body.torque_x,
        body.torque_y,
        body.torque_z,
        body.mass,
        body.inertia_xx,
        body.inertia_yy,
        body.inertia_zz,
        body.inertia_xy,
        body.inertia_xz,
        body.inertia_yz,
        body.center_x,
        body.center_y,
        body.center_z,
        body.linear_damping,
        body.angular_damping,
        body.gravity_scale,
        body.sleep_timer,
    ];
    for (slot, value) in out.values[base..base + PHYSICS3D_ABI_BODY_VALUE_STRIDE]
        .iter_mut()
        .zip(values)
    {
        *slot = f64::from(value);
    }
}

// Applies the dynamic half of a SetBody record, zeroing what the body type cannot hold (TS
// `writeBodyDynamicValues`).
fn write_body_dynamic_values(
    body: &mut RigidBody3D,
    values: &[f64; PHYSICS3D_ABI_BODY_VALUE_STRIDE],
    flags: u32,
) {
    let movable = body.body_type != Physics3DBodyType::Static;
    let dynamic = body.body_type == Physics3DBodyType::Dynamic;
    let rotates = movable && !body.fixed_rotation;
    let gated = |allowed: bool, i: usize| if allowed { values[i] as f32 } else { 0.0 };
    body.velocity_x = gated(movable, 7);
    body.velocity_y = gated(movable, 8);
    body.velocity_z = gated(movable, 9);
    body.angular_velocity_x = gated(rotates, 10);
    body.angular_velocity_y = gated(rotates, 11);
    body.angular_velocity_z = gated(rotates, 12);
    body.force_x = gated(dynamic, 13);
    body.force_y = gated(dynamic, 14);
    body.force_z = gated(dynamic, 15);
    body.torque_x = gated(dynamic && rotates, 16);
    body.torque_y = gated(dynamic && rotates, 17);
    body.torque_z = gated(dynamic && rotates, 18);
    body.linear_damping = values[29] as f32;
    body.angular_damping = values[30] as f32;
    body.gravity_scale = values[31] as f32;
    body.sleep_timer = gated(movable && body.sleep_enabled, 32);
    body.sleeping = movable && body.sleep_enabled && flags & PHYSICS3D_ABI_BODY_FLAG_SLEEPING != 0;
}

fn write_contact(
    ids: &ReferenceIds,
    world: &Physics3DWorld,
    contact: &Physics3DContact,
    out: &mut Physics3DAbiContactBuffer,
    at: usize,
    point_at: usize,
) {
    let body_a = world.body_by_index.get(&contact.body_a);
    let body_b = world.body_by_index.get(&contact.body_b);
    let collider_a = body_a.and_then(|body| {
        body.read()
            .unwrap()
            .colliders
            .get(contact.collider_a)
            .cloned()
    });
    let collider_b = body_b.and_then(|body| {
        body.read()
            .unwrap()
            .colliders
            .get(contact.collider_b)
            .cloned()
    });
    let id_at = at * PHYSICS3D_ABI_CONTACT_ID_STRIDE;
    out.ids[id_at] = body_a.map_or(0, |body| get_body_id(ids, body));
    out.ids[id_at + 1] = body_b.map_or(0, |body| get_body_id(ids, body));
    out.ids[id_at + 2] = collider_a.map_or(0, |collider| get_collider_id(ids, &collider));
    out.ids[id_at + 3] = collider_b.map_or(0, |collider| get_collider_id(ids, &collider));
    let mut flags = 0;
    if contact.enabled {
        flags |= PHYSICS3D_ABI_CONTACT_FLAG_ENABLED;
    }
    if contact.sensor {
        flags |= PHYSICS3D_ABI_CONTACT_FLAG_SENSOR;
    }
    if contact.touching {
        flags |= PHYSICS3D_ABI_CONTACT_FLAG_TOUCHING;
    }
    out.flags[at] = flags;
    out.point_starts[at] = point_at as u32;
    out.point_counts[at] = contact.point_count as u32;
    let value_at = at * PHYSICS3D_ABI_CONTACT_VALUE_STRIDE;
    out.values[value_at] = f64::from(contact.normal_x);
    out.values[value_at + 1] = f64::from(contact.normal_y);
    out.values[value_at + 2] = f64::from(contact.normal_z);
    out.values[value_at + 3] = f64::from(contact.friction);
    out.values[value_at + 4] = f64::from(contact.restitution);
    for i in 0..contact.point_count {
        let point = &contact.points[i];
        let destination = point_at + i;
        // A manifold feature id is a packed 32-bit key in the source (`featureId >>> 0`).
        out.point_feature_ids[destination] = point.feature_id as u32;
        let point_value_at = destination * PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE;
        let values = [
            point.x,
            point.y,
            point.z,
            point.depth,
            point.r_ax,
            point.r_ay,
            point.r_az,
            point.r_bx,
            point.r_by,
            point.r_bz,
        ];
        for (slot, value) in out.point_values
            [point_value_at..point_value_at + PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE]
            .iter_mut()
            .zip(values)
        {
            *slot = f64::from(value);
        }
    }
}

fn write_query_hits(state: &ReferenceWorld, out: &mut Physics3DAbiQueryBuffer) {
    clear_query_buffer(out, state.query.hit_count);
    let capacity = get_query_capacity(out);
    let ids = state.ids.read().unwrap();
    for i in 0..state.query.hit_count.min(capacity) {
        let hit = &state.query.hits[i];
        write_query_identity(&ids, &hit.body, &hit.collider, out, i);
        clear_query_values(out, i);
        out.count += 1;
    }
}

fn write_query_identity(
    ids: &ReferenceIds,
    body: &RigidBody3DRef,
    collider: &Physics3DColliderRef,
    out: &mut Physics3DAbiQueryBuffer,
    at: usize,
) {
    out.body_ids[at] = get_body_id(ids, body);
    out.collider_ids[at] = get_collider_id(ids, collider);
}

fn write_query_values(
    out: &mut Physics3DAbiQueryBuffer,
    at: usize,
    fraction: f32,
    x: f32,
    y: f32,
    z: f32,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
) {
    let base = at * PHYSICS3D_ABI_QUERY_VALUE_STRIDE;
    let values = [fraction, x, y, z, normal_x, normal_y, normal_z];
    for (slot, value) in out.values[base..base + PHYSICS3D_ABI_QUERY_VALUE_STRIDE]
        .iter_mut()
        .zip(values)
    {
        *slot = f64::from(value);
    }
}

fn write_ray_hits(state: &ReferenceWorld, out: &mut Physics3DAbiQueryBuffer) {
    clear_query_buffer(out, state.ray.hit_count);
    let capacity = get_query_capacity(out);
    let ids = state.ids.read().unwrap();
    for i in 0..state.ray.hit_count.min(capacity) {
        let hit = &state.ray.hits[i];
        write_query_identity(&ids, &hit.body, &hit.collider, out, i);
        write_query_values(
            out,
            i,
            hit.fraction,
            hit.x,
            hit.y,
            hit.z,
            hit.normal_x,
            hit.normal_y,
            hit.normal_z,
        );
        out.count += 1;
    }
}

fn write_shape_cast_hit(state: &ReferenceWorld, out: &mut Physics3DAbiQueryBuffer) {
    let hit = &state.shape_cast;
    clear_query_buffer(out, usize::from(hit.hit));
    let (true, Some(body), Some(collider)) = (hit.hit, hit.body.as_ref(), hit.collider.as_ref())
    else {
        return;
    };
    if get_query_capacity(out) == 0 {
        return;
    }
    let ids = state.ids.read().unwrap();
    write_query_identity(&ids, body, collider, out, 0);
    write_query_values(
        out,
        0,
        hit.fraction,
        hit.x,
        hit.y,
        hit.z,
        hit.normal_x,
        hit.normal_y,
        hit.normal_z,
    );
    out.count = 1;
}
