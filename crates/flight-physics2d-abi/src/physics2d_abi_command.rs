// flight-lint: allow-file(f64) D1: command payloads are little-endian IEEE doubles on the wire (TS DataView.setFloat64)
//! Physics2D ABI command writers (TS `physics2DAbiCommand.ts`). Each writer appends one
//! length-delimited little-endian record, or returns false without changing the stream when the
//! record cannot be encoded or does not fit. Semantic validation happens when a backend executes it.

use flight_collision::CollisionShape2D;
use flight_physics2d::{
    PHYSICS2D_DISTANCE_JOINT_KIND, PHYSICS2D_GEAR_JOINT_KIND, PHYSICS2D_MOUSE_JOINT_KIND,
    PHYSICS2D_PRISMATIC_JOINT_KIND, PHYSICS2D_PULLEY_JOINT_KIND, PHYSICS2D_REVOLUTE_JOINT_KIND,
    PHYSICS2D_ROPE_JOINT_KIND, PHYSICS2D_WELD_JOINT_KIND, PHYSICS2D_WHEEL_JOINT_KIND,
    Physics2DBodyType, Physics2DCollider, Physics2DDistanceJoint, Physics2DGearCoordinateKind,
    Physics2DGearJoint, Physics2DJoint, Physics2DMouseJoint, Physics2DPrismaticJoint,
    Physics2DPulleyJoint, Physics2DRevoluteJoint, Physics2DRopeJoint, Physics2DSolverConfig,
    Physics2DWeldJoint, Physics2DWheelJoint, RigidBody2D,
};

use crate::physics2d_abi_buffer::write_u32;
use crate::physics2d_abi_layout::*;
use crate::types::*;

// One record claimed at the end of the stream, written in place and committed by
// `finish_command`.
struct PendingCommand {
    byte_length: usize,
    payload: usize,
    start: usize,
}

// Claims `byte_length` bytes at the end of the stream and writes the record header, or `None` when
// the record is malformed, does not fit, or the stream header disagrees with the record (a buffer
// mutated behind the record's back, or never initialized, is refused).
fn begin_command(
    out: &mut Physics2DAbiCommandBuffer,
    kind: u32,
    byte_length: usize,
    object_id: u32,
    related_id: u32,
) -> Option<PendingCommand> {
    if byte_length < PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        || byte_length > 0xffff_ffff
        || byte_length % 8 != 0
        || out.byte_length < PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH
        || out.byte_length.checked_add(byte_length)? > out.data.len()
    {
        return None;
    }
    if read_u32(&out.data, 0) != PHYSICS2D_ABI_COMMAND_MAGIC
        || read_u32(&out.data, 4) != PHYSICS2D_ABI_VERSION
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
        payload: start + PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
        start,
    });
}

fn encode_body_type(body_type: Physics2DBodyType) -> u32 {
    return match body_type {
        Physics2DBodyType::Dynamic => PHYSICS2D_ABI_BODY_TYPE_DYNAMIC,
        Physics2DBodyType::Kinematic => PHYSICS2D_ABI_BODY_TYPE_KINEMATIC,
        Physics2DBodyType::Static => PHYSICS2D_ABI_BODY_TYPE_STATIC,
    };
}

fn encode_joint_kind(kind: &str) -> Option<u32> {
    return match kind {
        PHYSICS2D_DISTANCE_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_DISTANCE),
        PHYSICS2D_REVOLUTE_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_REVOLUTE),
        PHYSICS2D_PRISMATIC_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_PRISMATIC),
        PHYSICS2D_WELD_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_WELD),
        PHYSICS2D_WHEEL_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_WHEEL),
        PHYSICS2D_ROPE_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_ROPE),
        PHYSICS2D_MOUSE_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_MOUSE),
        PHYSICS2D_PULLEY_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_PULLEY),
        PHYSICS2D_GEAR_JOINT_KIND => Some(PHYSICS2D_ABI_JOINT_KIND_GEAR),
        _ => None,
    };
}

fn encode_shape_kind(shape: &CollisionShape2D) -> u32 {
    return match shape {
        CollisionShape2D::Circle(_) => PHYSICS2D_ABI_SHAPE_KIND_CIRCLE,
        CollisionShape2D::Aabb(_) => PHYSICS2D_ABI_SHAPE_KIND_AABB,
        CollisionShape2D::Obb(_) => PHYSICS2D_ABI_SHAPE_KIND_OBB,
        CollisionShape2D::Capsule(_) => PHYSICS2D_ABI_SHAPE_KIND_CAPSULE,
        CollisionShape2D::Polygon(_) => PHYSICS2D_ABI_SHAPE_KIND_POLYGON,
        CollisionShape2D::Segment(_) => PHYSICS2D_ABI_SHAPE_KIND_SEGMENT,
        CollisionShape2D::Point(_) => PHYSICS2D_ABI_SHAPE_KIND_POINT,
    };
}

// Commits a claimed record: advances the stream and rewrites its header.
fn finish_command(out: &mut Physics2DAbiCommandBuffer, command: &PendingCommand) {
    out.byte_length = command.start + command.byte_length;
    out.command_count += 1;
    let byte_length = out.byte_length as u32;
    let command_count = out.command_count;
    write_u32(&mut out.data, 8, byte_length);
    write_u32(&mut out.data, 12, command_count);
}

fn get_enable_flags(enable_motor: bool, enable_limit: bool, enable_limit_spring: bool) -> u32 {
    let mut flags = 0;
    if enable_motor {
        flags |= PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR;
    }
    if enable_limit {
        flags |= PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT;
    }
    if enable_limit_spring {
        flags |= PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT_SPRING;
    }
    return flags;
}

// Writes the kind's nine wire slots into `out` and returns the kind-specific flag bits, or `None`
// when the joint's struct is not the built-in its kind names (the source reads the properties of
// whatever object it is handed; a Rust trait object only exposes the struct behind it).
fn get_joint_kind_values(
    out: &mut [f64; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT],
    joint: &dyn Physics2DJoint,
    kind: u32,
) -> Option<u32> {
    let any = joint.as_any();
    let mut flags = 0;
    if kind == PHYSICS2D_ABI_JOINT_KIND_DISTANCE {
        let value = any.downcast_ref::<Physics2DDistanceJoint>()?;
        write_kind_values(
            out,
            &[value.length, value.frequency_hz, value.damping_ratio],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_REVOLUTE {
        let value = any.downcast_ref::<Physics2DRevoluteJoint>()?;
        flags |= get_enable_flags(
            value.enable_motor,
            value.enable_limit,
            value.enable_limit_spring,
        );
        write_kind_values(
            out,
            &[
                value.lower_angle,
                value.upper_angle,
                value.reference_angle,
                value.motor_speed,
                value.max_motor_torque,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_PRISMATIC {
        let value = any.downcast_ref::<Physics2DPrismaticJoint>()?;
        flags |= get_enable_flags(
            value.enable_motor,
            value.enable_limit,
            value.enable_limit_spring,
        );
        write_kind_values(
            out,
            &[
                value.local_axis_ax,
                value.local_axis_ay,
                value.reference_angle,
                value.lower_translation,
                value.upper_translation,
                value.motor_speed,
                value.max_motor_force,
                value.limit_frequency_hz,
                value.limit_damping_ratio,
            ],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_WELD {
        let value = any.downcast_ref::<Physics2DWeldJoint>()?;
        write_kind_values(out, &[value.reference_angle]);
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_WHEEL {
        let value = any.downcast_ref::<Physics2DWheelJoint>()?;
        if value.enable_motor {
            flags |= PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR;
        }
        write_kind_values(
            out,
            &[
                value.local_axis_ax,
                value.local_axis_ay,
                value.rest_translation,
                value.frequency_hz,
                value.damping_ratio,
                value.motor_speed,
                value.max_motor_torque,
            ],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_ROPE {
        let value = any.downcast_ref::<Physics2DRopeJoint>()?;
        write_kind_values(out, &[value.max_length]);
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_MOUSE {
        let value = any.downcast_ref::<Physics2DMouseJoint>()?;
        write_kind_values(
            out,
            &[
                value.target_x,
                value.target_y,
                value.max_force,
                value.frequency_hz,
                value.damping_ratio,
            ],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_PULLEY {
        let value = any.downcast_ref::<Physics2DPulleyJoint>()?;
        write_kind_values(
            out,
            &[
                value.ground_anchor_ax,
                value.ground_anchor_ay,
                value.ground_anchor_bx,
                value.ground_anchor_by,
                value.ratio,
                value.constant,
            ],
        );
    } else if kind == PHYSICS2D_ABI_JOINT_KIND_GEAR {
        let value = any.downcast_ref::<Physics2DGearJoint>()?;
        if value.coordinate_a == Physics2DGearCoordinateKind::Linear {
            flags |= PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A;
        }
        if value.coordinate_b == Physics2DGearCoordinateKind::Linear {
            flags |= PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B;
        }
        write_kind_values(
            out,
            &[
                value.axis_ax,
                value.axis_ay,
                value.axis_bx,
                value.axis_by,
                value.ratio,
                value.constant,
            ],
        );
    }
    return Some(flags);
}

/// The exact byte length `write_physics2d_abi_set_collider_command` will consume, or `-1` when the
/// shape cannot be encoded (TS `getPhysics2DAbiSetColliderCommandByteLength`).
// flight-lint: allow(contract-vocabulary) i64: the source returns a byte length or the -1 sentinel; real lengths are bounded by u32
pub fn get_physics2d_abi_set_collider_command_byte_length(collider: &Physics2DCollider) -> i64 {
    let Some(shape_byte_length) = get_shape_byte_length(&collider.local) else {
        return -1;
    };
    let byte_length = PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        + PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
        + shape_byte_length;
    return if byte_length <= 0xffff_ffff {
        byte_length as i64
    } else {
        -1
    };
}

fn get_shape_byte_length(shape: &CollisionShape2D) -> Option<usize> {
    let scalar_count = get_shape_scalar_count(shape)?;
    return Some(PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH + scalar_count * 8);
}

// Every 2D built-in is a fixed field list or a flat point list, so no shape carries an integer
// payload and none needs end padding. A polygon with an odd coordinate count cannot be encoded.
pub(crate) fn get_shape_scalar_count(shape: &CollisionShape2D) -> Option<usize> {
    return match shape {
        CollisionShape2D::Circle(_) => Some(3),
        CollisionShape2D::Aabb(_) => Some(4),
        CollisionShape2D::Obb(_) => Some(5),
        CollisionShape2D::Capsule(_) => Some(5),
        CollisionShape2D::Polygon(polygon) => {
            if polygon.points.len() % 2 == 0 {
                Some(polygon.points.len())
            } else {
                None
            }
        }
        CollisionShape2D::Segment(_) => Some(4),
        CollisionShape2D::Point(_) => Some(2),
    };
}

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
    out: &mut Physics2DAbiCommandBuffer,
    kind: u32,
    body_id: Physics2DAbiObjectId,
    x: f64,
    y: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    if !is_object_id(body_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        kind,
        PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION,
        body_id,
        0,
    ) else {
        return false;
    };
    write_f64_values(&mut out.data, record.payload, &[x, y, point_x, point_y]);
    finish_command(out, &record);
    return true;
}

fn write_empty_command(out: &mut Physics2DAbiCommandBuffer, kind: u32, object_id: u32) -> bool {
    if !is_object_id(object_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        kind,
        PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
        object_id,
        0,
    ) else {
        return false;
    };
    finish_command(out, &record);
    return true;
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

fn write_kind_values(out: &mut [f64; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT], values: &[f32]) {
    for (slot, value) in out.iter_mut().zip(values) {
        *slot = f64::from(*value);
    }
}

/// Appends an ApplyForceAtPoint record carrying the force and the world point (TS
/// `writePhysics2DAbiApplyForceAtPointCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics2d_abi_apply_force_at_point_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    x: f64,
    y: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT,
        body_id,
        x,
        y,
        point_x,
        point_y,
    );
}

/// Appends an ApplyForce record with the point slots zeroed (TS
/// `writePhysics2DAbiApplyForceCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics2d_abi_apply_force_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    x: f64,
    y: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE,
        body_id,
        x,
        y,
        0.0,
        0.0,
    );
}

/// Appends an ApplyLinearImpulseAtPoint record (TS
/// `writePhysics2DAbiApplyLinearImpulseAtPointCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics2d_abi_apply_linear_impulse_at_point_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    x: f64,
    y: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT,
        body_id,
        x,
        y,
        point_x,
        point_y,
    );
}

/// Appends an ApplyLinearImpulse record (TS `writePhysics2DAbiApplyLinearImpulseCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics2d_abi_apply_linear_impulse_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    x: f64,
    y: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE,
        body_id,
        x,
        y,
        0.0,
        0.0,
    );
}

/// Appends an ApplyTorque record: a plane's torque is one scalar, carried in the first slot of the
/// shared body-action record with the other three zeroed (TS `writePhysics2DAbiApplyTorqueCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalar is the source's JS double
pub fn write_physics2d_abi_apply_torque_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    torque: f64,
) -> bool {
    return write_body_action(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_TORQUE,
        body_id,
        torque,
        0.0,
        0.0,
        0.0,
    );
}

/// Appends a header-only DestroyBody record (TS `writePhysics2DAbiDestroyBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_destroy_body_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY, body_id);
}

/// Appends a header-only DestroyCollider record (TS `writePhysics2DAbiDestroyColliderCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_destroy_collider_command(
    out: &mut Physics2DAbiCommandBuffer,
    collider_id: Physics2DAbiObjectId,
) -> bool {
    return write_empty_command(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER,
        collider_id,
    );
}

/// Appends a header-only DestroyJoint record (TS `writePhysics2DAbiDestroyJointCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_destroy_joint_command(
    out: &mut Physics2DAbiCommandBuffer,
    joint_id: Physics2DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT, joint_id);
}

/// Appends a fixed-length SetBody record carrying the flags and the seventeen authored body
/// scalars (TS `writePhysics2DAbiSetBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_set_body_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
    body: &RigidBody2D,
) -> bool {
    if !is_object_id(body_id) {
        return false;
    }
    let Some(record) = begin_command(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_SET_BODY,
        PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY,
        body_id,
        0,
    ) else {
        return false;
    };
    let mut flags = encode_body_type(body.body_type);
    if body.fixed_rotation {
        flags |= PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION;
    }
    if body.bullet {
        flags |= PHYSICS2D_ABI_BODY_FLAG_BULLET;
    }
    if body.sleeping {
        flags |= PHYSICS2D_ABI_BODY_FLAG_SLEEPING;
    }
    if body.sleep_enabled {
        flags |= PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED;
    }
    write_u32(&mut out.data, record.payload, flags);
    write_u32(&mut out.data, record.payload + 4, 0);
    write_f64_values(
        &mut out.data,
        record.payload + 8,
        &[
            f64::from(body.x),
            f64::from(body.y),
            f64::from(body.angle),
            f64::from(body.velocity_x),
            f64::from(body.velocity_y),
            f64::from(body.angular_velocity),
            f64::from(body.force_x),
            f64::from(body.force_y),
            f64::from(body.torque),
            f64::from(body.mass),
            f64::from(body.inertia),
            f64::from(body.center_x),
            f64::from(body.center_y),
            f64::from(body.linear_damping),
            f64::from(body.angular_damping),
            f64::from(body.gravity_scale),
            body.sleep_timer,
        ],
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetCollider record that names its body in the related id and encodes the shape inline
/// (TS `writePhysics2DAbiSetColliderCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_set_collider_command(
    out: &mut Physics2DAbiCommandBuffer,
    collider_id: Physics2DAbiObjectId,
    body_id: Physics2DAbiObjectId,
    collider: &Physics2DCollider,
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
        PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER,
        PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
            + PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
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
    write_f64(
        &mut out.data,
        payload + 16,
        f64::from(collider.material.density),
    );
    write_f64(
        &mut out.data,
        payload + 24,
        f64::from(collider.material.friction),
    );
    write_f64(
        &mut out.data,
        payload + 32,
        f64::from(collider.material.restitution),
    );
    write_shape(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE,
        &collider.local,
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetGravity record carrying two components and naming no object (TS
/// `writePhysics2DAbiSetGravityCommand`).
// flight-lint: allow(conform-params) D9b: out first; the wire scalars are the source's JS doubles
pub fn write_physics2d_abi_set_gravity_command(
    out: &mut Physics2DAbiCommandBuffer,
    x: f64,
    y: f64,
) -> bool {
    let Some(record) = begin_command(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY,
        PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY,
        0,
        0,
    ) else {
        return false;
    };
    write_f64(&mut out.data, record.payload, x);
    write_f64(&mut out.data, record.payload + 8, y);
    finish_command(out, &record);
    return true;
}

/// Appends a fixed-length SetJoint record: the kind, both body ids, the per-kind flags, the common
/// block and the nine kind slots (TS `writePhysics2DAbiSetJointCommand`). The Broken bit is never
/// written: breaking removes a 2D joint, so the bit exists only on readback.
// flight-lint: allow(conform-params) D9b: out first
// flight-lint: allow(contract-vocabulary) D16: the open joint family is read as &dyn Physics2DJoint
pub fn write_physics2d_abi_set_joint_command(
    out: &mut Physics2DAbiCommandBuffer,
    joint_id: Physics2DAbiObjectId,
    body_a_id: Physics2DAbiObjectId,
    body_b_id: Physics2DAbiObjectId,
    joint: &dyn Physics2DJoint,
) -> bool {
    if !is_object_id(joint_id) || !is_object_id(body_a_id) || !is_object_id(body_b_id) {
        return false;
    }
    let Some(kind) = encode_joint_kind(&joint.joint_fields().kind) else {
        return false;
    };
    let mut kind_values = [0.0; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT];
    let Some(kind_flags) = get_joint_kind_values(&mut kind_values, joint, kind) else {
        return false;
    };
    let Some(record) = begin_command(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_SET_JOINT,
        PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT,
        joint_id,
        0,
    ) else {
        return false;
    };
    let fields = joint.joint_fields();
    let mut flags = kind_flags;
    if fields.collide_connected {
        flags |= PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED;
    }
    let payload = record.payload;
    write_u32(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND,
        kind,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A,
        body_a_id,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B,
        body_b_id,
    );
    write_u32(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS,
        flags,
    );
    write_f64_values(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES,
        &[
            f64::from(fields.local_anchor_ax),
            f64::from(fields.local_anchor_ay),
            f64::from(fields.local_anchor_bx),
            f64::from(fields.local_anchor_by),
            f64::from(fields.break_force),
            f64::from(fields.break_torque),
        ],
    );
    write_f64_values(
        &mut out.data,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES,
        &kind_values,
    );
    finish_command(out, &record);
    return true;
}

/// Appends a SetSolverConfig record packing the three booleans into flags and holding the substep
/// word zero (TS `writePhysics2DAbiSetSolverConfigCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_set_solver_config_command(
    out: &mut Physics2DAbiCommandBuffer,
    config: &Physics2DSolverConfig,
) -> bool {
    let (
        Ok(velocity_iterations),
        Ok(position_iterations),
        Ok(max_ccd_substeps),
        Ok(max_ccd_rotation_substeps),
    ) = (
        u32::try_from(config.velocity_iterations),
        u32::try_from(config.position_iterations),
        u32::try_from(config.max_ccd_substeps),
        u32::try_from(config.max_ccd_rotation_substeps),
    )
    else {
        return false;
    };
    let Some(record) = begin_command(
        out,
        PHYSICS2D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG,
        PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG,
        0,
        0,
    ) else {
        return false;
    };
    let mut flags = 0;
    if config.allow_sleeping {
        flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING;
    }
    if config.continuous_collision {
        flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION;
    }
    if config.warm_starting {
        flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING;
    }
    let payload = record.payload;
    write_u32(&mut out.data, payload, flags);
    write_u32(&mut out.data, payload + 4, 0);
    write_u32(&mut out.data, payload + 8, max_ccd_substeps);
    write_u32(&mut out.data, payload + 12, max_ccd_rotation_substeps);
    write_u32(&mut out.data, payload + 16, velocity_iterations);
    write_u32(&mut out.data, payload + 20, position_iterations);
    write_u32(&mut out.data, payload + 24, 0);
    write_u32(&mut out.data, payload + 28, 0);
    write_f64_values(
        &mut out.data,
        payload + 32,
        &[
            f64::from(config.sleep_linear_threshold),
            f64::from(config.sleep_angular_threshold),
            f64::from(config.time_to_sleep),
            f64::from(config.penetration_slop),
            f64::from(config.position_correction),
            f64::from(config.restitution_threshold),
        ],
    );
    finish_command(out, &record);
    return true;
}

/// Appends a header-only WakeBody record (TS `writePhysics2DAbiWakeBodyCommand`).
// flight-lint: allow(conform-params) D9b: out first
pub fn write_physics2d_abi_wake_body_command(
    out: &mut Physics2DAbiCommandBuffer,
    body_id: Physics2DAbiObjectId,
) -> bool {
    return write_empty_command(out, PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY, body_id);
}

fn write_shape(bytes: &mut [u8], at: usize, shape: &CollisionShape2D) {
    let scalar_count = get_shape_scalar_count(shape).unwrap_or(0);
    write_u32(bytes, at, encode_shape_kind(shape));
    write_u32(bytes, at + 4, scalar_count as u32);
    write_u32(bytes, at + 8, 0);
    write_u32(bytes, at + 12, 0);
    let scalars_at = at + PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH;
    match shape {
        CollisionShape2D::Circle(s) => write_f64_values(bytes, scalars_at, &[s.x, s.y, s.radius]),
        CollisionShape2D::Aabb(s) => write_f64_values(
            bytes,
            scalars_at,
            &[
                f64::from(s.min_x),
                f64::from(s.min_y),
                f64::from(s.max_x),
                f64::from(s.max_y),
            ],
        ),
        CollisionShape2D::Obb(s) => write_f64_values(
            bytes,
            scalars_at,
            &[
                f64::from(s.x),
                f64::from(s.y),
                f64::from(s.half_w),
                f64::from(s.half_h),
                f64::from(s.rotation),
            ],
        ),
        CollisionShape2D::Capsule(s) => write_f64_values(
            bytes,
            scalars_at,
            &[
                f64::from(s.x0),
                f64::from(s.y0),
                f64::from(s.x1),
                f64::from(s.y1),
                f64::from(s.radius),
            ],
        ),
        CollisionShape2D::Polygon(s) => write_f64_values(bytes, scalars_at, &s.points),
        CollisionShape2D::Segment(s) => write_f64_values(
            bytes,
            scalars_at,
            &[
                f64::from(s.x0),
                f64::from(s.y0),
                f64::from(s.x1),
                f64::from(s.y1),
            ],
        ),
        CollisionShape2D::Point(s) => {
            write_f64_values(bytes, scalars_at, &[f64::from(s.x), f64::from(s.y)])
        }
    }
}
