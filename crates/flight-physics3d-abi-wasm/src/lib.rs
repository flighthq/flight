use std::cell::RefCell;

use wasm_bindgen::prelude::*;

use flight_physics3d_abi::{
    PHYSICS3D_ABI_BODY_VALUE_STRIDE, PHYSICS3D_ABI_JOINT_VALUE_STRIDE, PHYSICS3D_ABI_VERSION,
    Physics3DAbiExecutionStatus, Physics3DAbiStepStatus, Physics3DAbiWorldStatus,
    create_physics3d_abi, create_physics3d_abi_body_buffer, create_physics3d_abi_command_buffer,
    create_physics3d_abi_contact_buffer, create_physics3d_abi_execution_result,
    create_physics3d_abi_joint_buffer, create_physics3d_abi_query_buffer,
    destroy_physics3d_abi_world, execute_physics3d_abi_commands, get_physics3d_abi_world_status,
    read_physics3d_abi_bodies, read_physics3d_abi_contacts, read_physics3d_abi_joints,
    step_physics3d_abi_world,
};

type Physics3DAbi = flight_physics3d_abi::Physics3DAbi;

thread_local! {
    static INSTANCES: RefCell<Vec<Option<Physics3DAbi>>> = RefCell::new(Vec::new());
}

fn with_abi<R>(handle: u32, f: impl FnOnce(&Physics3DAbi) -> R) -> R {
    INSTANCES.with(|cell| {
        let instances = cell.borrow();
        let abi = instances
            .get(handle as usize)
            .and_then(|slot| slot.as_ref())
            .expect("invalid ABI handle");
        f(abi)
    })
}

#[wasm_bindgen]
pub fn abi_version() -> u32 {
    PHYSICS3D_ABI_VERSION
}

#[wasm_bindgen]
pub fn abi_capabilities() -> u32 {
    with_abi(0, |abi| abi.capabilities)
}

#[wasm_bindgen]
pub fn create_abi() -> u32 {
    let abi = create_physics3d_abi();
    INSTANCES.with(|cell| {
        let mut instances = cell.borrow_mut();
        for (i, slot) in instances.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(abi);
                return i as u32;
            }
        }
        let index = instances.len();
        instances.push(Some(abi));
        index as u32
    })
}

#[wasm_bindgen]
pub fn create_world(abi: u32) -> u32 {
    with_abi(abi, |a| (a.create_world)())
}

#[wasm_bindgen]
pub fn destroy_abi(abi: u32) -> bool {
    INSTANCES.with(|cell| {
        let mut instances = cell.borrow_mut();
        if let Some(slot) = instances.get_mut(abi as usize) {
            if slot.is_some() {
                *slot = None;
                return true;
            }
        }
        false
    })
}

#[wasm_bindgen]
pub fn destroy_world(abi: u32, world: u32) -> bool {
    with_abi(abi, |a| destroy_physics3d_abi_world(a, world))
}

#[wasm_bindgen]
pub fn execute(
    abi: u32,
    world: u32,
    commands: &[u8],
    byte_length: u32,
    command_count: u32,
    result: &js_sys::Uint32Array,
) -> bool {
    with_abi(abi, |a| {
        let mut cmd_buf = create_physics3d_abi_command_buffer(Some(commands.len()));
        cmd_buf.data[..commands.len()].copy_from_slice(commands);
        cmd_buf.byte_length = byte_length as usize;
        cmd_buf.command_count = command_count;

        let mut exec_result = create_physics3d_abi_execution_result();
        let success = execute_physics3d_abi_commands(&mut exec_result, a, world, &cmd_buf);

        result.set_index(0, execution_status_code(exec_result.status));
        result.set_index(1, exec_result.command_index);
        result.set_index(2, exec_result.byte_offset as u32);
        result.set_index(3, exec_result.command_kind);
        success
    })
}

#[wasm_bindgen]
pub fn query(abi: u32, world: u32, counts: &js_sys::Uint32Array) -> bool {
    with_abi(abi, |a| {
        let mut out = create_physics3d_abi_query_buffer(0);
        let success = (a.query_point)(world, 0.0, 0.0, 0.0, None, &mut out);
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.required_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn read_bodies(
    abi: u32,
    world: u32,
    selection: &js_sys::Uint32Array,
    has_selection: bool,
    ids: &js_sys::Uint32Array,
    flags: &js_sys::Uint32Array,
    values: &js_sys::Float64Array,
    counts: &js_sys::Uint32Array,
) -> bool {
    with_abi(abi, |a| {
        let capacity = ids.length() as usize;
        let mut out = create_physics3d_abi_body_buffer(capacity);

        let sel_vec: Option<Vec<u32>> = if has_selection {
            let mut v = vec![0u32; selection.length() as usize];
            selection.copy_to(&mut v);
            Some(v)
        } else {
            None
        };

        let success = read_physics3d_abi_bodies(&mut out, a, world, sel_vec.as_deref());

        copy_u32_to_js(ids, &out.ids, out.count);
        copy_u32_to_js(flags, &out.flags, out.count);
        copy_f64_to_js(
            values,
            &out.values,
            out.count * PHYSICS3D_ABI_BODY_VALUE_STRIDE,
        );
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.required_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn read_contacts(abi: u32, world: u32, counts: &js_sys::Uint32Array) -> bool {
    with_abi(abi, |a| {
        let mut out = create_physics3d_abi_contact_buffer(0, 0);
        let success = read_physics3d_abi_contacts(
            &mut out,
            a,
            world,
            flight_physics3d_abi::Physics3DAbiContactSelection::All,
        );
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.point_count as u32);
        counts.set_index(2, out.required_count as u32);
        counts.set_index(3, out.required_point_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn read_joints(
    abi: u32,
    world: u32,
    ids: &js_sys::Uint32Array,
    flags: &js_sys::Uint32Array,
    values: &js_sys::Float64Array,
    counts: &js_sys::Uint32Array,
) -> bool {
    with_abi(abi, |a| {
        let capacity = ids.length() as usize;
        let mut out = create_physics3d_abi_joint_buffer(capacity);
        let success = read_physics3d_abi_joints(&mut out, a, world);

        copy_u32_to_js(ids, &out.ids, out.count);
        copy_u32_to_js(flags, &out.flags, out.count);
        copy_f64_to_js(
            values,
            &out.values,
            out.count * PHYSICS3D_ABI_JOINT_VALUE_STRIDE,
        );
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.required_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn step(abi: u32, world: u32, dt: f32, _has_hooks: bool) -> u32 {
    with_abi(abi, |a| {
        let status = step_physics3d_abi_world(a, world, dt, None);
        step_status_code(status)
    })
}

#[wasm_bindgen]
pub fn world_status(abi: u32, world: u32) -> u32 {
    with_abi(abi, |a| {
        let status = get_physics3d_abi_world_status(a, world);
        world_status_code(status)
    })
}

fn execution_status_code(status: Physics3DAbiExecutionStatus) -> u32 {
    match status {
        Physics3DAbiExecutionStatus::Complete => 0,
        Physics3DAbiExecutionStatus::BusyWorld => 1,
        Physics3DAbiExecutionStatus::InvalidBuffer => 2,
        Physics3DAbiExecutionStatus::InvalidCommand => 3,
        Physics3DAbiExecutionStatus::MissingBody => 4,
        Physics3DAbiExecutionStatus::MissingCollider => 5,
        Physics3DAbiExecutionStatus::MissingJoint => 6,
        Physics3DAbiExecutionStatus::RejectedMutation => 7,
        Physics3DAbiExecutionStatus::StaleWorld => 8,
        Physics3DAbiExecutionStatus::UnsupportedJoint => 9,
        Physics3DAbiExecutionStatus::UnsupportedShape => 10,
    }
}

fn step_status_code(status: Physics3DAbiStepStatus) -> u32 {
    match status {
        Physics3DAbiStepStatus::Complete => 0,
        Physics3DAbiStepStatus::BusyWorld => 1,
        Physics3DAbiStepStatus::Declined => 2,
        Physics3DAbiStepStatus::InsufficientHookBuffer => 3,
        Physics3DAbiStepStatus::StaleWorld => 4,
    }
}

fn world_status_code(status: Physics3DAbiWorldStatus) -> u32 {
    match status {
        Physics3DAbiWorldStatus::Stale => 0,
        Physics3DAbiWorldStatus::Ready => 1,
        Physics3DAbiWorldStatus::Busy => 2,
    }
}

fn copy_u32_to_js(target: &js_sys::Uint32Array, source: &[u32], count: usize) {
    for i in 0..count {
        target.set_index(i as u32, source[i]);
    }
}

fn copy_f64_to_js(target: &js_sys::Float64Array, source: &[f64], count: usize) {
    for i in 0..count {
        target.set_index(i as u32, source[i]);
    }
}
