use std::cell::RefCell;

use wasm_bindgen::prelude::*;

use flight_physics2d_abi::{
    PHYSICS2D_ABI_BODY_VALUE_STRIDE, PHYSICS2D_ABI_JOINT_VALUE_STRIDE, PHYSICS2D_ABI_VERSION,
    Physics2DAbiExecutionStatus, Physics2DAbiStepStatus, Physics2DAbiWorldStatus,
    create_physics2d_abi, create_physics2d_abi_body_buffer, create_physics2d_abi_command_buffer,
    create_physics2d_abi_contact_buffer, create_physics2d_abi_execution_result,
    create_physics2d_abi_joint_buffer, create_physics2d_abi_query_buffer,
    destroy_physics2d_abi_world, execute_physics2d_abi_commands, get_physics2d_abi_world_status,
    read_physics2d_abi_bodies, read_physics2d_abi_contacts, read_physics2d_abi_joints,
    step_physics2d_abi_world,
};

type Physics2DAbi = flight_physics2d_abi::Physics2DAbi;

thread_local! {
    static INSTANCES: RefCell<Vec<Option<Physics2DAbi>>> = RefCell::new(Vec::new());
}

#[wasm_bindgen]
pub fn create_abi() -> u32 {
    let abi = create_physics2d_abi();
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
pub fn abi_capabilities() -> u32 {
    with_abi(0, |abi| abi.capabilities)
}

#[wasm_bindgen]
pub fn abi_version() -> u32 {
    PHYSICS2D_ABI_VERSION
}

fn copy_f64_to_js(target: &js_sys::Float64Array, source: &[f64], count: usize) {
    for i in 0..count {
        target.set_index(i as u32, source[i]);
    }
}

fn copy_u32_to_js(target: &js_sys::Uint32Array, source: &[u32], count: usize) {
    for i in 0..count {
        target.set_index(i as u32, source[i]);
    }
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
    with_abi(abi, |a| destroy_physics2d_abi_world(a, world))
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
        let mut cmd_buf = create_physics2d_abi_command_buffer(Some(commands.len()));
        cmd_buf.data[..commands.len()].copy_from_slice(commands);
        cmd_buf.byte_length = byte_length as usize;
        cmd_buf.command_count = command_count;

        let mut exec_result = create_physics2d_abi_execution_result();
        let success = execute_physics2d_abi_commands(&mut exec_result, a, world, &cmd_buf);

        result.set_index(0, execution_status_code(exec_result.status));
        result.set_index(1, exec_result.command_index);
        result.set_index(2, exec_result.byte_offset as u32);
        result.set_index(3, exec_result.command_kind);
        success
    })
}

fn execution_status_code(status: Physics2DAbiExecutionStatus) -> u32 {
    match status {
        Physics2DAbiExecutionStatus::Complete => 0,
        Physics2DAbiExecutionStatus::BusyWorld => 1,
        Physics2DAbiExecutionStatus::InvalidBuffer => 2,
        Physics2DAbiExecutionStatus::InvalidCommand => 3,
        Physics2DAbiExecutionStatus::MissingBody => 4,
        Physics2DAbiExecutionStatus::MissingCollider => 5,
        Physics2DAbiExecutionStatus::MissingJoint => 6,
        Physics2DAbiExecutionStatus::RejectedMutation => 7,
        Physics2DAbiExecutionStatus::StaleWorld => 8,
        Physics2DAbiExecutionStatus::UnsupportedJoint => 9,
        Physics2DAbiExecutionStatus::UnsupportedShape => 10,
    }
}

#[wasm_bindgen]
pub fn query(abi: u32, world: u32, counts: &js_sys::Uint32Array) -> bool {
    with_abi(abi, |a| {
        let mut out = create_physics2d_abi_query_buffer(0);
        let success = (a.query_point)(world, 0.0, 0.0, None, &mut out);
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
        let mut out = create_physics2d_abi_body_buffer(capacity);

        let sel_vec: Option<Vec<u32>> = if has_selection {
            let mut v = vec![0u32; selection.length() as usize];
            selection.copy_to(&mut v);
            Some(v)
        } else {
            None
        };

        let success = read_physics2d_abi_bodies(&mut out, a, world, sel_vec.as_deref());

        copy_u32_to_js(ids, &out.ids, out.count);
        copy_u32_to_js(flags, &out.flags, out.count);
        copy_f64_to_js(
            values,
            &out.values,
            out.count * PHYSICS2D_ABI_BODY_VALUE_STRIDE,
        );
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.required_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn read_contacts(abi: u32, world: u32, counts: &js_sys::Uint32Array) -> bool {
    with_abi(abi, |a| {
        let mut out = create_physics2d_abi_contact_buffer(0, 0);
        let success = read_physics2d_abi_contacts(
            &mut out,
            a,
            world,
            flight_physics2d_abi::Physics2DAbiContactSelection::All,
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
        let mut out = create_physics2d_abi_joint_buffer(capacity);
        let success = read_physics2d_abi_joints(&mut out, a, world);

        copy_u32_to_js(ids, &out.ids, out.count);
        copy_u32_to_js(flags, &out.flags, out.count);
        copy_f64_to_js(
            values,
            &out.values,
            out.count * PHYSICS2D_ABI_JOINT_VALUE_STRIDE,
        );
        counts.set_index(0, out.count as u32);
        counts.set_index(1, out.required_count as u32);
        success
    })
}

#[wasm_bindgen]
pub fn step(abi: u32, world: u32, dt: f64, _has_hooks: bool) -> u32 {
    with_abi(abi, |a| {
        let status = step_physics2d_abi_world(a, world, dt, None);
        step_status_code(status)
    })
}

fn step_status_code(status: Physics2DAbiStepStatus) -> u32 {
    match status {
        Physics2DAbiStepStatus::Complete => 0,
        Physics2DAbiStepStatus::BusyWorld => 1,
        Physics2DAbiStepStatus::Declined => 2,
        Physics2DAbiStepStatus::InsufficientHookBuffer => 3,
        Physics2DAbiStepStatus::StaleWorld => 4,
    }
}

fn with_abi<R>(handle: u32, f: impl FnOnce(&Physics2DAbi) -> R) -> R {
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
pub fn world_status(abi: u32, world: u32) -> u32 {
    with_abi(abi, |a| {
        let status = get_physics2d_abi_world_status(a, world);
        world_status_code(status)
    })
}

fn world_status_code(status: Physics2DAbiWorldStatus) -> u32 {
    match status {
        Physics2DAbiWorldStatus::Stale => 0,
        Physics2DAbiWorldStatus::Ready => 1,
        Physics2DAbiWorldStatus::Busy => 2,
    }
}
