//! Physics3D ABI buffers (TS `physics3DAbiBuffer.ts`): the command stream and the readback records.
//! Every array is a fixed-length typed array sized by its capacity; nothing here grows.

use flight_entity::{allocate_entity, throw_range_error};

use crate::physics3d_abi_layout::*;
use crate::types::*;

/// The largest capacity a TS caller can express (TS `Number.isSafeInteger`).
const MAX_SAFE_CAPACITY: usize = if usize::BITS >= 64 { (1usize << 53) - 1 } else { usize::MAX };

/// Allocates a body readback buffer for `capacity` bodies (TS `createPhysics3DAbiBodyBuffer`).
pub fn create_physics3d_abi_body_buffer(capacity: usize) -> Physics3DAbiBodyBuffer {
    let mut out: Physics3DAbiBodyBuffer = allocate_entity();
    initialize_physics3d_abi_body_buffer(&mut out, capacity);
    return out;
}

/// Allocates an empty command stream of `byte_capacity` bytes, default 4096 (TS
/// `createPhysics3DAbiCommandBuffer`). Throws `RangeError` below the header length.
pub fn create_physics3d_abi_command_buffer(
    byte_capacity: Option<usize>,
) -> Physics3DAbiCommandBuffer {
    let mut out: Physics3DAbiCommandBuffer = allocate_entity();
    initialize_physics3d_abi_command_buffer(&mut out, byte_capacity);
    return out;
}

/// Allocates a contact readback buffer with independent contact and point capacities (TS
/// `createPhysics3DAbiContactBuffer`).
pub fn create_physics3d_abi_contact_buffer(
    contact_capacity: usize,
    point_capacity: usize,
) -> Physics3DAbiContactBuffer {
    let mut out: Physics3DAbiContactBuffer = allocate_entity();
    initialize_physics3d_abi_contact_buffer(&mut out, contact_capacity, point_capacity);
    return out;
}

/// Allocates an execution result positioned at the first record (TS
/// `createPhysics3DAbiExecutionResult`).
pub fn create_physics3d_abi_execution_result() -> Physics3DAbiExecutionResult {
    let mut out: Physics3DAbiExecutionResult = allocate_entity();
    initialize_physics3d_abi_execution_result(&mut out);
    return out;
}

/// Allocates a joint readback buffer for `capacity` joints (TS `createPhysics3DAbiJointBuffer`).
pub fn create_physics3d_abi_joint_buffer(capacity: usize) -> Physics3DAbiJointBuffer {
    let mut out: Physics3DAbiJointBuffer = allocate_entity();
    initialize_physics3d_abi_joint_buffer(&mut out, capacity);
    return out;
}

/// Allocates a query buffer for `capacity` hits (TS `createPhysics3DAbiQueryBuffer`).
pub fn create_physics3d_abi_query_buffer(capacity: usize) -> Physics3DAbiQueryBuffer {
    let mut out: Physics3DAbiQueryBuffer = allocate_entity();
    initialize_physics3d_abi_query_buffer(&mut out, capacity);
    return out;
}

/// Sizes every body array to `capacity` and resets the counts (TS
/// `initializePhysics3DAbiBodyBuffer`).
pub fn initialize_physics3d_abi_body_buffer(out: &mut Physics3DAbiBodyBuffer, capacity: usize) {
    assert_capacity(capacity, "body");
    out.ids = vec![0; capacity].into_boxed_slice();
    out.flags = vec![0; capacity].into_boxed_slice();
    out.values = vec![0.0; capacity * PHYSICS3D_ABI_BODY_VALUE_STRIDE].into_boxed_slice();
    out.count = 0;
    out.required_count = 0;
}

/// Allocates the stream bytes and writes an empty header (the construction initializer of
/// `create_physics3d_abi_command_buffer`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_physics3d_abi_command_buffer(
    out: &mut Physics3DAbiCommandBuffer,
    byte_capacity: Option<usize>,
) {
    let byte_capacity = byte_capacity.unwrap_or(4096);
    if !(PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH..=MAX_SAFE_CAPACITY).contains(&byte_capacity) {
        throw_range_error(&format!(
            "Physics3D ABI command capacity must be at least {}",
            PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH
        ));
    }
    out.data = vec![0; byte_capacity].into_boxed_slice();
    out.byte_length = 0;
    out.command_count = 0;
    clear_physics3d_abi_command_buffer(out);
}

/// Sizes the contact rows and point rows independently and resets the counts (TS
/// `initializePhysics3DAbiContactBuffer`).
pub fn initialize_physics3d_abi_contact_buffer(
    out: &mut Physics3DAbiContactBuffer,
    contact_capacity: usize,
    point_capacity: usize,
) {
    assert_capacity(contact_capacity, "contact");
    assert_capacity(point_capacity, "contact point");
    out.ids = vec![0; contact_capacity * PHYSICS3D_ABI_CONTACT_ID_STRIDE].into_boxed_slice();
    out.flags = vec![0; contact_capacity].into_boxed_slice();
    out.point_starts = vec![0; contact_capacity].into_boxed_slice();
    out.point_counts = vec![0; contact_capacity].into_boxed_slice();
    out.values =
        vec![0.0; contact_capacity * PHYSICS3D_ABI_CONTACT_VALUE_STRIDE].into_boxed_slice();
    out.point_feature_ids = vec![0; point_capacity].into_boxed_slice();
    out.point_values =
        vec![0.0; point_capacity * PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE].into_boxed_slice();
    out.count = 0;
    out.point_count = 0;
    out.required_count = 0;
    out.required_point_count = 0;
}

/// Positions the result at the first record with a Complete status (TS
/// `initializePhysics3DAbiExecutionResult`).
pub fn initialize_physics3d_abi_execution_result(out: &mut Physics3DAbiExecutionResult) {
    out.status = Physics3DAbiExecutionStatus::Complete;
    out.command_index = 0;
    out.byte_offset = PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH;
    out.command_kind = 0;
}

/// Sizes every joint array to `capacity` and resets the counts (TS
/// `initializePhysics3DAbiJointBuffer`).
pub fn initialize_physics3d_abi_joint_buffer(out: &mut Physics3DAbiJointBuffer, capacity: usize) {
    assert_capacity(capacity, "joint");
    out.ids = vec![0; capacity].into_boxed_slice();
    out.flags = vec![0; capacity].into_boxed_slice();
    out.values = vec![0.0; capacity * PHYSICS3D_ABI_JOINT_VALUE_STRIDE].into_boxed_slice();
    out.count = 0;
    out.required_count = 0;
}

/// Sizes every query array to `capacity` and resets the counts (TS
/// `initializePhysics3DAbiQueryBuffer`).
pub fn initialize_physics3d_abi_query_buffer(out: &mut Physics3DAbiQueryBuffer, capacity: usize) {
    assert_capacity(capacity, "query");
    out.body_ids = vec![0; capacity].into_boxed_slice();
    out.collider_ids = vec![0; capacity].into_boxed_slice();
    out.values = vec![0.0; capacity * PHYSICS3D_ABI_QUERY_VALUE_STRIDE].into_boxed_slice();
    out.count = 0;
    out.required_count = 0;
}

// A capacity must be a non-negative safe integer (TS `assertCapacity`); `usize` already rules out
// the negative and fractional cases, so only the safe-integer ceiling remains.
fn assert_capacity(capacity: usize, subject: &str) {
    if capacity > MAX_SAFE_CAPACITY {
        throw_range_error(&format!(
            "Physics3D ABI {subject} capacity must be a non-negative safe integer"
        ));
    }
}

/// Rewrites the header so a reused buffer cannot carry a stale count (TS
/// `clearPhysics3DAbiCommandBuffer`).
pub fn clear_physics3d_abi_command_buffer(out: &mut Physics3DAbiCommandBuffer) {
    out.byte_length = PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH;
    out.command_count = 0;
    let byte_length = out.byte_length as u32;
    write_u32(&mut out.data, 0, PHYSICS3D_ABI_COMMAND_MAGIC);
    write_u32(&mut out.data, 4, PHYSICS3D_ABI_VERSION);
    write_u32(&mut out.data, 8, byte_length);
    write_u32(&mut out.data, 12, 0);
}

/// The unused stream bytes, never negative (TS `getPhysics3DAbiCommandBufferRemainingByteLength`).
pub fn get_physics3d_abi_command_buffer_remaining_byte_length(
    buffer: &Physics3DAbiCommandBuffer,
) -> usize {
    return buffer.data.len().saturating_sub(buffer.byte_length);
}

pub(crate) fn write_u32(bytes: &mut [u8], at: usize, value: u32) {
    bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
}
