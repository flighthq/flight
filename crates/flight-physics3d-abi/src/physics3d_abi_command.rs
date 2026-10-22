// flight-lint: allow-file(f64) D1: command payloads are little-endian IEEE doubles on the wire (TS DataView.setFloat64)
//! Physics3D ABI command writers (TS `physics3DAbiCommand.ts`). Each writer appends one
//! length-delimited little-endian record, or returns false without changing the stream when the
//! record cannot be encoded or does not fit. Semantic validation happens when a backend executes it.

use flight_collision::{CollisionColliderShape3D, CollisionShape3D};
use flight_physics3d::contract::{
    PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND, PHYSICS_3D_CONE_TWIST_JOINT_KIND,
    PHYSICS_3D_DISTANCE_JOINT_KIND, PHYSICS_3D_FIXED_JOINT_KIND,
    PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND, PHYSICS_3D_HINGE_JOINT_KIND, PHYSICS_3D_SLIDER_JOINT_KIND,
};
use flight_physics3d::{
    Physics3DBodyType, Physics3DCollider, Physics3DConeTwistJoint, Physics3DDistanceJoint,
    Physics3DFixedJoint, Physics3DGeneric6DofJoint, Physics3DHingeJoint, Physics3DJoint,
    Physics3DJointFrames, Physics3DSliderJoint, Physics3DSolverConfig, RigidBody3D,
};

use crate::physics3d_abi_buffer::write_u32;
use crate::physics3d_abi_layout::*;
use crate::types::*;

// The number of kind-specific slots in a SetJoint record: the generic 6-DOF joint needs fourteen
// and no built-in needs more (TS `new Array<number>(14)`).
pub(crate) const JOINT_KIND_VALUE_COUNT: usize = 14;

// The common joint block: two anchors, the two break thresholds and the two local frames (TS
// `writeFloat64Values(..., [16 values])`).
pub(crate) const JOINT_COMMON_VALUE_COUNT: usize = 16;

// One record claimed at the end of the stream, written in place and committed by
// `finish_command`.
struct PendingCommand {
    byte_length: usize,
    payload: usize,
    start: usize,
}

pub(crate) fn align8(value: usize) -> usize {
    return value.div_ceil(8) * 8;
}

// Claims `byte_length` bytes at the end of the stream and writes the record header, or `None` when
// the record is malformed, does not fit, or the stream header disagrees with the record (a buffer
// mutated behind the record's back, or never initialized, is refused).
fn begin_command(
    out: &mut Physics3DAbiCommandBuffer,
    kind: u32,
    byte_length: usize,
    object_id: u32,
    related_id: u32,
) -> Option<PendingCommand> {
    if !(PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH..=0xffff_ffff).contains(&byte_length)
        || !byte_length.is_multiple_of(8)
        || out.byte_length < PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH
        || out.byte_length.checked_add(byte_length)? > out.data.len()
    {
        return None;
    }
    if read_u32(&out.data, 0) != PHYSICS3D_ABI_COMMAND_MAGIC
        || read_u32(&out.data, 4) != PHYSICS3D_ABI_VERSION
        || read_u32(&out.data, 8) as usize != out.byte_length
        || read_u32(&out.data, 12) != out.command_count
    {
        return None;
    }
    let start = out.byte_length;
    write_u32(&mut out.data, start, kind);
    write_u32(&mut out.data, start + 4, byte_length as u32);
    write_u32(&mut out.data, start + 8, object_id);
    write_u32(&mut out.data, start + 12, related_id);
    return Some(PendingCommand {
        byte_length,
        payload: start + PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
        start,
    });
}

fn encode_body_type(body_type: Physics3DBodyType) -> u32 {
    return match body_type {
        Physics3DBodyType::Dynamic => PHYSICS3D_ABI_BODY_TYPE_DYNAMIC,
        Physics3DBodyType::Kinematic => PHYSICS3D_ABI_BODY_TYPE_KINEMATIC,
        Physics3DBodyType::Static => PHYSICS3D_ABI_BODY_TYPE_STATIC,
    };
}

// The SetJoint flag word: bit 0 collide-connected, bit 1 broken, then up to three bits read against
// the record's own kind.
fn encode_joint_flags(joint: &dyn Physics3DJoint, kind: u32) -> Option<u32> {
    let fields = joint.fields();
    let any = joint.as_any();
    let mut flags = u32::from(fields.collide_connected);
    if fields.broken {
        flags |= 1 << 1;
    }
    if kind == PHYSICS3D_ABI_JOINT_KIND_DISTANCE {
        let distance = any.downcast_ref::<Physics3DDistanceJoint>()?;
        flags |= get_enable_bits(distance.enable_spring, distance.enable_limit, false);
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_HINGE {
        let hinge = any.downcast_ref::<Physics3DHingeJoint>()?;
        flags |= get_enable_bits(
            hinge.enable_limit,
            hinge.enable_motor,
            hinge.enable_limit_spring,
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_SLIDER {
        let slider = any.downcast_ref::<Physics3DSliderJoint>()?;
        flags |= get_enable_bits(
            slider.enable_limit,
            slider.enable_motor,
            slider.enable_limit_spring,
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST {
        let cone = any.downcast_ref::<Physics3DConeTwistJoint>()?;
        flags |= get_enable_bits(
            cone.enable_swing_limit,
            cone.enable_twist_limit,
            cone.enable_limit_spring,
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF {
        let generic = any.downcast_ref::<Physics3DGeneric6DofJoint>()?;
        flags |= get_enable_bits(generic.enable_limit_spring, false, false);
    }
    return Some(flags);
}

fn encode_joint_kind(kind: &str) -> u32 {
    return match kind {
        PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET,
        PHYSICS_3D_DISTANCE_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_DISTANCE,
        PHYSICS_3D_FIXED_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_FIXED,
        PHYSICS_3D_HINGE_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_HINGE,
        PHYSICS_3D_SLIDER_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_SLIDER,
        PHYSICS_3D_CONE_TWIST_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST,
        PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND => PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF,
        _ => 0,
    };
}

fn encode_shape_kind(shape: &CollisionColliderShape3D) -> u32 {
    return match shape {
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_SPHERE
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_AABB
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(_)) => PHYSICS3D_ABI_SHAPE_KIND_BOX,
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_CAPSULE
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cylinder(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_CYLINDER
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cone(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_CONE
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(_)) => {
            PHYSICS3D_ABI_SHAPE_KIND_CONVEX
        }
        CollisionColliderShape3D::TriangleMesh(_) => PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH,
        CollisionColliderShape3D::Heightfield(_) => PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD,
    };
}

// Commits a claimed record: advances the stream and rewrites its header.
fn finish_command(out: &mut Physics3DAbiCommandBuffer, command: &PendingCommand) {
    out.byte_length = command.start + command.byte_length;
    out.command_count += 1;
    let byte_length = out.byte_length as u32;
    let command_count = out.command_count;
    write_u32(&mut out.data, 8, byte_length);
    write_u32(&mut out.data, 12, command_count);
}

fn get_enable_bits(bit2: bool, bit3: bool, bit4: bool) -> u32 {
    let mut flags = 0;
    if bit2 {
        flags |= 1 << 2;
    }
    if bit3 {
        flags |= 1 << 3;
    }
    if bit4 {
        flags |= 1 << 4;
    }
    return flags;
}

// The local frames of the kinds that carry them (TS `hasJointFrames`); the others write identity.
fn get_joint_frames(joint: &dyn Physics3DJoint) -> Option<&Physics3DJointFrames> {
    let any = joint.as_any();
    if let Some(joint) = any.downcast_ref::<Physics3DFixedJoint>() {
        return Some(&joint.frames);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DHingeJoint>() {
        return Some(&joint.frames);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DSliderJoint>() {
        return Some(&joint.frames);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DConeTwistJoint>() {
        return Some(&joint.frames);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DGeneric6DofJoint>() {
        return Some(&joint.frames);
    }
    return None;
}

// Writes the kind's fourteen wire slots into `out`, or `None` when the joint's struct is not the
// built-in its kind names (the source reads the properties of whatever object it is handed; a Rust
// trait object only exposes the struct behind it).
fn get_joint_kind_values(
    out: &mut [f64; JOINT_KIND_VALUE_COUNT],
    joint: &dyn Physics3DJoint,
    kind: u32,
) -> Option<()> {
    let any = joint.as_any();
    if kind == PHYSICS3D_ABI_JOINT_KIND_DISTANCE {
        let value = any.downcast_ref::<Physics3DDistanceJoint>()?;
        write_kind_values(
            out,
            &[
                value.length,
                value.frequency_hz,
                value.damping_ratio,
                value.min_length,
                value.max_length,
            ],
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_HINGE {
        let value = any.downcast_ref::<Physics3DHingeJoint>()?;
        write_kind_values(
            out,
            &[
                value.lower_angle,
                value.upper_angle,
                value.motor_speed,
                value.max_motor_torque,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_SLIDER {
        let value = any.downcast_ref::<Physics3DSliderJoint>()?;
        write_kind_values(
            out,
            &[
                value.lower_translation,
                value.upper_translation,
                value.motor_speed,
                value.max_motor_force,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST {
        let value = any.downcast_ref::<Physics3DConeTwistJoint>()?;
        write_kind_values(
            out,
            &[
                value.swing_limit_y,
                value.swing_limit_z,
                value.lower_twist_angle,
                value.upper_twist_angle,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    } else if kind == PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF {
        let value = any.downcast_ref::<Physics3DGeneric6DofJoint>()?;
        write_kind_values(
            out,
            &[
                value.lower_linear_x,
                value.lower_linear_y,
                value.lower_linear_z,
                value.upper_linear_x,
                value.upper_linear_y,
                value.upper_linear_z,
                value.lower_angular_x,
                value.lower_angular_y,
                value.lower_angular_z,
                value.upper_angular_x,
                value.upper_angular_y,
                value.upper_angular_z,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    }
    return Some(());
}

/// The exact byte length `write_physics3d_abi_set_collider_command` will consume, or `-1` when the
/// shape cannot be encoded (TS `getPhysics3DAbiSetColliderCommandByteLength`).
// flight-lint: allow(contract-vocabulary) i64: the source returns a byte length or the -1 sentinel; real lengths are bounded by u32
pub fn get_physics3d_abi_set_collider_command_byte_length(collider: &Physics3DCollider) -> i64 {
    let Some(shape_byte_length) = get_shape_byte_length(&collider.local) else {
        return -1;
    };
    let byte_length = PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
        + shape_byte_length;
    return if byte_length <= 0xffff_ffff {
        byte_length as i64
    } else {
        -1
    };
}

// The aligned byte length of a shape block, or `None` when a triangle mesh or heightfield carries
// an integer (version, index, grid size) that does not fit its uint32 wire word.
fn get_shape_byte_length(shape: &CollisionColliderShape3D) -> Option<usize> {
    match shape {
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            let mesh = mesh.read().unwrap();
            if u32::try_from(mesh.version).is_err()
                || mesh
                    .indices
                    .iter()
                    .any(|index| u32::try_from(*index).is_err())
            {
                return None;
            }
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            let heightfield = heightfield.read().unwrap();
            if u32::try_from(heightfield.version).is_err()
                || u32::try_from(heightfield.columns).is_err()
                || u32::try_from(heightfield.rows).is_err()
            {
                return None;
            }
        }
        CollisionColliderShape3D::BuiltIn(_) => {}
    }
    let unaligned = PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH
        + get_shape_scalar_count(shape) * 8
        + get_shape_integer_count(shape) * 4;
    if unaligned > 0xffff_ffff {
        return None;
    }
    return Some(align8(unaligned));
}

fn get_shape_integer_count(shape: &CollisionColliderShape3D) -> usize {
    return match shape {
        CollisionColliderShape3D::TriangleMesh(mesh) => mesh.read().unwrap().indices.len(),
        CollisionColliderShape3D::Heightfield(_) => 2,
        CollisionColliderShape3D::BuiltIn(_) => 0,
    };
}

fn get_shape_scalar_count(shape: &CollisionColliderShape3D) -> usize {
    return match shape {
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(_)) => 4,
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(_)) => 6,
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(_)) => 10,
        CollisionColliderShape3D::BuiltIn(
            CollisionShape3D::Capsule(_)
            | CollisionShape3D::Cylinder(_)
            | CollisionShape3D::Cone(_),
        ) => 7,
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(convex)) => convex.points.len(),
        CollisionColliderShape3D::TriangleMesh(mesh) => 7 + mesh.read().unwrap().points.len(),
        CollisionColliderShape3D::Heightfield(heightfield) => {
            9 + heightfield.read().unwrap().heights.len()
        }
    };
}

// A caller id is a non-zero uint32 (TS `isObjectId`); the `u32` type supplies the upper bound.
fn is_object_id(value: u32) -> bool {
    return value > 0;
}

pub(crate) fn read_f64(bytes: &[u8], at: usize) -> f64 {
    return f64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
}

pub(crate) fn read_i32(bytes: &[u8], at: usize) -> i32 {
    return i32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
}

pub(crate) fn read_u32(bytes: &[u8], at: usize) -> u32 {
    return u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
}

fn write_body_action(
    out: &mut Physics3DAbiCommandBuffer,
    kind: u32,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
    point_x: f64,
    point_y: f64,
    point_z: f64,
) -> bool {
    if !is_object_id(body_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        kind,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION,
        body_id,
        0,
    ) else {
        return false;
    };
    write_f64_values(
        &mut out.data,
        record.payload,
        &[x, y, z, point_x, point_y, point_z],
    );
    finish_command(out, &record);
    return true;
}

fn write_empty_command(out: &mut Physics3DAbiCommandBuffer, kind: u32, object_id: u32) -> bool {
    if !is_object_id(object_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        kind,
        PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
        object_id,
        0,
    ) else {
        return false;
    };
    finish_command(out, &record);
    return true;
}

fn write_f32_values(bytes: &mut [u8], at: usize, values: &[f32]) {
    for (i, value) in values.iter().enumerate() {
        write_f64(bytes, at + i * 8, f64::from(*value));
    }
}

pub(crate) fn write_f64(bytes: &mut [u8], at: usize, value: f64) {
    bytes[at..at + 8].copy_from_slice(&value.to_le_bytes());
}

fn write_f64_values(bytes: &mut [u8], at: usize, values: &[f64]) {
    for (i, value) in values.iter().enumerate() {
        write_f64(bytes, at + i * 8, *value);
    }
}

fn write_i32(bytes: &mut [u8], at: usize, value: i32) {
    bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
}

fn write_kind_values(out: &mut [f64; JOINT_KIND_VALUE_COUNT], values: &[f32]) {
    for (slot, value) in out.iter_mut().zip(values) {
        *slot = f64::from(*value);
    }
}

/// Appends an ApplyForceAtPoint record carrying the force and the world point (TS
/// `writePhysics3DAbiApplyForceAtPointCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_apply_force_at_point_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
    point_x: f64,
    point_y: f64,
    point_z: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT,
        body_id,
        x,
        y,
        z,
        point_x,
        point_y,
        point_z,
    );
}

/// Appends an ApplyForce record with the point slots zeroed (TS
/// `writePhysics3DAbiApplyForceCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_apply_force_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE,
        body_id,
        x,
        y,
        z,
        0.0,
        0.0,
        0.0,
    );
}

/// Appends an ApplyLinearImpulseAtPoint record (TS
/// `writePhysics3DAbiApplyLinearImpulseAtPointCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_apply_linear_impulse_at_point_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
    point_x: f64,
    point_y: f64,
    point_z: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT,
        body_id,
        x,
        y,
        z,
        point_x,
        point_y,
        point_z,
    );
}

/// Appends an ApplyLinearImpulse record (TS `writePhysics3DAbiApplyLinearImpulseCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_apply_linear_impulse_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE,
        body_id,
        x,
        y,
        z,
        0.0,
        0.0,
        0.0,
    );
}

/// Appends an ApplyTorque record with the point slots zeroed (TS
/// `writePhysics3DAbiApplyTorqueCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_apply_torque_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    x: f64,
    y: f64,
    z: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE,
        body_id,
        x,
        y,
        z,
        0.0,
        0.0,
        0.0,
    );
}

/// Appends a header-only DestroyBody record (TS `writePhysics3DAbiDestroyBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_destroy_body_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY, body_id);
}

/// Appends a header-only DestroyCollider record (TS `writePhysics3DAbiDestroyColliderCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_destroy_collider_command(
    out: &mut Physics3DAbiCommandBuffer,
    collider_id: Physics3DAbiObjectId,
) -> bool {
    return write_empty_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER,
        collider_id,
    );
}

/// Appends a header-only DestroyJoint record (TS `writePhysics3DAbiDestroyJointCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_destroy_joint_command(
    out: &mut Physics3DAbiCommandBuffer,
    joint_id: Physics3DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT, joint_id);
}

/// Appends a fixed-length SetBody record carrying the flags and the thirty-three body scalars
/// (TS `writePhysics3DAbiSetBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_set_body_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
    body: &RigidBody3D,
) -> bool {
    // The source's unknown-type sentinel is unreachable: `Physics3DBodyType` is a closed enum.
    if !is_object_id(body_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_SET_BODY,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_BODY,
        body_id,
        0,
    ) else {
        return false;
    };
    let mut flags = encode_body_type(body.body_type);
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
    write_u32(&mut out.data, record.payload, flags);
    write_u32(&mut out.data, record.payload + 4, 0);
    write_f32_values(
        &mut out.data,
        record.payload + PHYSICS3D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES,
        &[
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
        ],
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetCollider record that names its body in the related id and encodes the shape inline,
/// padded to eight bytes (TS `writePhysics3DAbiSetColliderCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_set_collider_command(
    out: &mut Physics3DAbiCommandBuffer,
    collider_id: Physics3DAbiObjectId,
    body_id: Physics3DAbiObjectId,
    collider: &Physics3DCollider,
) -> bool {
    // The filter's u32 masks and i32 group index always fit their wire words in Rust; the source's
    // uint32/int32 range checks are statically satisfied.
    if !is_object_id(collider_id) || !is_object_id(body_id) {
        return false;
    }
    let Some(shape_byte_length) = get_shape_byte_length(&collider.local) else {
        return false;
    };
    let Some(record) = begin_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER,
        PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
            + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
            + shape_byte_length,
        collider_id,
        body_id,
    ) else {
        return false;
    };
    let payload = record.payload;
    write_u32(&mut out.data, payload, u32::from(collider.sensor));
    write_u32(&mut out.data, payload + 4, collider.filter.category_bits);
    write_u32(&mut out.data, payload + 8, collider.filter.mask_bits);
    write_i32(&mut out.data, payload + 12, collider.filter.group_index);
    write_f32_values(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_DENSITY,
        &[
            collider.material.density,
            collider.material.friction,
            collider.material.restitution,
        ],
    );
    write_shape(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE,
        &collider.local,
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetGravity record carrying three components and naming no object (TS
/// `writePhysics3DAbiSetGravityCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics3d_abi_set_gravity_command(
    out: &mut Physics3DAbiCommandBuffer,
    x: f64,
    y: f64,
    z: f64,
) -> bool {
    let Some(record) = begin_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY,
        0,
        0,
    ) else {
        return false;
    };
    write_f64_values(&mut out.data, record.payload, &[x, y, z]);
    finish_command(out, &record);
    return true;
}

/// Appends a fixed-length SetJoint record: the kind, both body ids (the joint's own `body_a` and
/// `body_b`, read as caller ids), the per-kind flags, the sixteen common values (anchors, break
/// thresholds and local frames, identity for kinds without frames) and the fourteen kind slots (TS
/// `writePhysics3DAbiSetJointCommand`).
// flight-lint: allow(conform-params) D9b: out first
// flight-lint: allow(contract-vocabulary) D16: the open joint family is read as &dyn Physics3DJoint
pub fn write_physics3d_abi_set_joint_command(
    out: &mut Physics3DAbiCommandBuffer,
    joint_id: Physics3DAbiObjectId,
    joint: &dyn Physics3DJoint,
) -> bool {
    let fields = joint.fields();
    let (Ok(body_a), Ok(body_b)) = (u32::try_from(fields.body_a), u32::try_from(fields.body_b))
    else {
        return false;
    };
    if !is_object_id(joint_id) || !is_object_id(body_a) || !is_object_id(body_b) {
        return false;
    }
    let kind = encode_joint_kind(&fields.kind);
    if kind == 0 {
        return false;
    }
    let mut kind_values = [0.0; JOINT_KIND_VALUE_COUNT];
    let (Some(flags), Some(())) = (
        encode_joint_flags(joint, kind),
        get_joint_kind_values(&mut kind_values, joint, kind),
    ) else {
        return false;
    };
    let Some(record) = begin_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT,
        joint_id,
        0,
    ) else {
        return false;
    };
    let payload = record.payload;
    write_u32(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND,
        kind,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A,
        body_a,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B,
        body_b,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS,
        flags,
    );
    let identity = Physics3DJointFrames {
        local_rotation_ax: 0.0,
        local_rotation_ay: 0.0,
        local_rotation_az: 0.0,
        local_rotation_aw: 1.0,
        local_rotation_bx: 0.0,
        local_rotation_by: 0.0,
        local_rotation_bz: 0.0,
        local_rotation_bw: 1.0,
    };
    let frames = get_joint_frames(joint).unwrap_or(&identity);
    let common: [f32; JOINT_COMMON_VALUE_COUNT] = [
        fields.local_anchor_ax,
        fields.local_anchor_ay,
        fields.local_anchor_az,
        fields.local_anchor_bx,
        fields.local_anchor_by,
        fields.local_anchor_bz,
        fields.break_force,
        fields.break_torque,
        frames.local_rotation_ax,
        frames.local_rotation_ay,
        frames.local_rotation_az,
        frames.local_rotation_aw,
        frames.local_rotation_bx,
        frames.local_rotation_by,
        frames.local_rotation_bz,
        frames.local_rotation_bw,
    ];
    write_f32_values(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES,
        &common,
    );
    write_f64_values(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES,
        &kind_values,
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetSolverConfig record packing the three booleans into flags (TS
/// `writePhysics3DAbiSetSolverConfigCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_set_solver_config_command(
    out: &mut Physics3DAbiCommandBuffer,
    config: &Physics3DSolverConfig,
) -> bool {
    let (
        Ok(substeps),
        Ok(max_ccd_substeps),
        Ok(max_ccd_rotation_substeps),
        Ok(velocity_iterations),
        Ok(position_iterations),
    ) = (
        u32::try_from(config.substeps),
        u32::try_from(config.max_ccd_substeps),
        u32::try_from(config.max_ccd_rotation_substeps),
        u32::try_from(config.sequential_impulse.velocity_iterations),
        u32::try_from(config.sequential_impulse.position_iterations),
    )
    else {
        return false;
    };
    let Some(record) = begin_command(
        out,
        PHYSICS3D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG,
        0,
        0,
    ) else {
        return false;
    };
    let mut flags = 0;
    if config.allow_sleeping {
        flags |= 1;
    }
    if config.continuous_collision {
        flags |= 1 << 1;
    }
    if config.sequential_impulse.warm_starting {
        flags |= 1 << 2;
    }
    let payload = record.payload;
    write_u32(&mut out.data, payload, flags);
    write_u32(&mut out.data, payload + 4, substeps);
    write_u32(&mut out.data, payload + 8, max_ccd_substeps);
    write_u32(&mut out.data, payload + 12, max_ccd_rotation_substeps);
    write_u32(&mut out.data, payload + 16, velocity_iterations);
    write_u32(&mut out.data, payload + 20, position_iterations);
    write_u32(&mut out.data, payload + 24, 0);
    write_u32(&mut out.data, payload + 28, 0);
    write_f32_values(
        &mut out.data,
        payload + PHYSICS3D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES,
        &[
            config.sleep_linear_threshold,
            config.sleep_angular_threshold,
            config.time_to_sleep,
            config.sequential_impulse.penetration_slop,
            config.sequential_impulse.position_correction,
            config.sequential_impulse.restitution_threshold,
        ],
    );
    finish_command(out, &record);
    return true;
}

/// Appends a header-only WakeBody record (TS `writePhysics3DAbiWakeBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics3d_abi_wake_body_command(
    out: &mut Physics3DAbiCommandBuffer,
    body_id: Physics3DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY, body_id);
}

// Writes the shape header, its scalars, its integers and zero padding to the next eight bytes.
// Triangle-mesh and heightfield integers are range-checked by `get_shape_byte_length` first.
fn write_shape(bytes: &mut [u8], at: usize, shape: &CollisionColliderShape3D) {
    let scalar_count = get_shape_scalar_count(shape);
    let integer_count = get_shape_integer_count(shape);
    let version = match shape {
        CollisionColliderShape3D::TriangleMesh(mesh) => mesh.read().unwrap().version as u32,
        CollisionColliderShape3D::Heightfield(heightfield) => {
            heightfield.read().unwrap().version as u32
        }
        CollisionColliderShape3D::BuiltIn(_) => 0,
    };
    write_u32(bytes, at, encode_shape_kind(shape));
    write_u32(bytes, at + 4, scalar_count as u32);
    write_u32(bytes, at + 8, integer_count as u32);
    write_u32(bytes, at + 12, version);
    let scalars_at = at + PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH;
    write_shape_scalars(bytes, scalars_at, shape);
    let integers_at = scalars_at + scalar_count * 8;
    match shape {
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            let mesh = mesh.read().unwrap();
            for (i, index) in mesh.indices.iter().enumerate() {
                write_u32(bytes, integers_at + i * 4, *index as u32);
            }
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            let heightfield = heightfield.read().unwrap();
            write_u32(bytes, integers_at, heightfield.columns as u32);
            write_u32(bytes, integers_at + 4, heightfield.rows as u32);
        }
        CollisionColliderShape3D::BuiltIn(_) => {}
    }
    let unaligned_end = integers_at + integer_count * 4;
    let aligned_end = align8(unaligned_end);
    bytes[unaligned_end..aligned_end].fill(0);
}

fn write_shape_scalars(bytes: &mut [u8], at: usize, shape: &CollisionColliderShape3D) {
    match shape {
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(s)) => {
            write_f32_values(bytes, at, &[s.x, s.y, s.z, s.radius]);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(s)) => {
            write_f32_values(
                bytes,
                at,
                &[s.min_x, s.min_y, s.min_z, s.max_x, s.max_y, s.max_z],
            );
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(s)) => {
            write_f32_values(
                bytes,
                at,
                &[
                    s.x,
                    s.y,
                    s.z,
                    s.half_x,
                    s.half_y,
                    s.half_z,
                    s.rotation_x,
                    s.rotation_y,
                    s.rotation_z,
                    s.rotation_w,
                ],
            );
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(s)) => {
            write_f32_values(bytes, at, &[s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.radius]);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cylinder(s)) => {
            write_f32_values(bytes, at, &[s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.radius]);
        }
        // The wire carries the source's apex then base. flight-collision stores the base in the
        // `0` endpoint and the apex in the `1` endpoint.
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cone(s)) => {
            write_f32_values(bytes, at, &[s.x1, s.y1, s.z1, s.x0, s.y0, s.z0, s.radius]);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(s)) => {
            write_f32_values(bytes, at, &s.points);
        }
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            let mesh = mesh.read().unwrap();
            write_f32_values(
                bytes,
                at,
                &[
                    mesh.x,
                    mesh.y,
                    mesh.z,
                    mesh.rotation_x,
                    mesh.rotation_y,
                    mesh.rotation_z,
                    mesh.rotation_w,
                ],
            );
            write_f32_values(bytes, at + 7 * 8, &mesh.points);
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            let heightfield = heightfield.read().unwrap();
            write_f32_values(
                bytes,
                at,
                &[
                    heightfield.cell_size_x,
                    heightfield.cell_size_z,
                    heightfield.x,
                    heightfield.y,
                    heightfield.z,
                    heightfield.rotation_x,
                    heightfield.rotation_y,
                    heightfield.rotation_z,
                    heightfield.rotation_w,
                ],
            );
            write_f32_values(bytes, at + 9 * 8, &heightfield.heights);
        }
    }
}
