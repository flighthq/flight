//! The ABI's world lifecycle, execution, step and readback entry points (TS `physics3DAbi.ts`):
//! thin free functions over the backend seam, so every caller is backend-neutral.

use flight_entity::{Uint32Array, allocate_entity};

use crate::reference_physics3d_abi::initialize_reference_physics3d_abi;
use crate::types::*;

/// Creates the executable reference ABI (TS `createPhysics3DAbi`). A drop-in backend shadows this
/// one constructor and returns the same seam over its own storage; every codec and wrapper stays
/// shared, which keeps the wire contract upstream-first.
pub fn create_physics3d_abi() -> Physics3DAbi {
    let mut out: Physics3DAbi = allocate_entity();
    initialize_physics3d_abi(&mut out);
    return out;
}

/// Allocates a world; `0` when the backend cannot (TS `createPhysics3DAbiWorld`).
pub fn create_physics3d_abi_world(abi: &Physics3DAbi) -> Physics3DAbiWorldHandle {
    return (abi.create_world)();
}

/// Installs the default backend into `out` (the construction initializer of
/// `create_physics3d_abi`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_physics3d_abi(out: &mut Physics3DAbi) {
    initialize_reference_physics3d_abi(out);
}

/// Destroys a world; false for a stale or busy handle (TS `destroyPhysics3DAbiWorld`).
pub fn destroy_physics3d_abi_world(abi: &Physics3DAbi, world: Physics3DAbiWorldHandle) -> bool {
    return (abi.destroy_world)(world);
}

/// Executes a command stream in order, stopping at the first failure, which `out` locates (TS
/// `executePhysics3DAbiCommands`).
// flight-lint: allow(conform-params) D9b: out first
pub fn execute_physics3d_abi_commands(
    out: &mut Physics3DAbiExecutionResult,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    commands: &Physics3DAbiCommandBuffer,
) -> bool {
    return (abi.execute)(world, commands, out);
}

/// Whether a handle names a live, idle world (TS `getPhysics3DAbiWorldStatus`).
pub fn get_physics3d_abi_world_status(
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
) -> Physics3DAbiWorldStatus {
    return (abi.get_world_status)(world);
}

/// Packs the selected bodies (all, in id order, for `None`) into `out` (TS
/// `readPhysics3DAbiBodies`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics3d_abi_bodies(
    out: &mut Physics3DAbiBodyBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    body_ids: Option<&Uint32Array>,
) -> bool {
    return (abi.read_bodies)(world, body_ids, out);
}

/// Packs the selected contacts and their points into `out` (TS `readPhysics3DAbiContacts`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics3d_abi_contacts(
    out: &mut Physics3DAbiContactBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    selection: Physics3DAbiContactSelection,
) -> bool {
    return (abi.read_contacts)(world, selection, out);
}

/// Packs joint reactions in caller-id order, flagging broken joints, into `out` (TS
/// `readPhysics3DAbiJoints`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics3d_abi_joints(
    out: &mut Physics3DAbiJointBuffer,
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
) -> bool {
    return (abi.read_joints)(world, out);
}

/// Advances a world by `dt`, running the optional contact hooks synchronously (TS
/// `stepPhysics3DAbiWorld`).
pub fn step_physics3d_abi_world(
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    dt: f32,
    hooks: Option<&Physics3DAbiContactHooks>,
) -> Physics3DAbiStepStatus {
    return (abi.step)(world, dt, hooks);
}
