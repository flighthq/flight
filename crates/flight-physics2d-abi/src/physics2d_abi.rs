// flight-lint: allow-file(f64) D1: the step dt is flight-physics2d's f64 timestep (TS number)
//! The ABI's world lifecycle, execution, step and readback entry points (TS `physics2DAbi.ts`):
//! thin free functions over the backend seam, so every caller is backend-neutral.

use flight_entity::{Uint32Array, allocate_entity};

use crate::reference_physics2d_abi::initialize_reference_physics2d_abi;
use crate::types::*;

/// Creates the executable reference ABI (TS `createPhysics2DAbi`). A drop-in backend shadows this
/// one constructor and returns the same seam over its own storage; every codec and wrapper stays
/// shared, which keeps the wire contract upstream-first.
pub fn create_physics2d_abi() -> Physics2DAbi {
    let mut out: Physics2DAbi = allocate_entity();
    initialize_physics2d_abi(&mut out);
    return out;
}

/// Allocates a world; `0` when the backend cannot (TS `createPhysics2DAbiWorld`).
pub fn create_physics2d_abi_world(abi: &Physics2DAbi) -> Physics2DAbiWorldHandle {
    return (abi.create_world)();
}

/// Installs the default backend into `out` (the construction initializer of
/// `create_physics2d_abi`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_physics2d_abi(out: &mut Physics2DAbi) {
    initialize_reference_physics2d_abi(out);
}

/// Destroys a world; false for a stale or busy handle (TS `destroyPhysics2DAbiWorld`).
pub fn destroy_physics2d_abi_world(abi: &Physics2DAbi, world: Physics2DAbiWorldHandle) -> bool {
    return (abi.destroy_world)(world);
}

/// Executes a command stream in order, stopping at the first failure, which `out` locates (TS
/// `executePhysics2DAbiCommands`).
// flight-lint: allow(conform-params) D9b: out first
pub fn execute_physics2d_abi_commands(
    out: &mut Physics2DAbiExecutionResult,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    commands: &Physics2DAbiCommandBuffer,
) -> bool {
    return (abi.execute)(world, commands, out);
}

/// Whether a handle names a live, idle world (TS `getPhysics2DAbiWorldStatus`).
pub fn get_physics2d_abi_world_status(
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
) -> Physics2DAbiWorldStatus {
    return (abi.get_world_status)(world);
}

/// Packs the selected bodies (all, in id order, for `None`) into `out` (TS
/// `readPhysics2DAbiBodies`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics2d_abi_bodies(
    out: &mut Physics2DAbiBodyBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    body_ids: Option<&Uint32Array>,
) -> bool {
    return (abi.read_bodies)(world, body_ids, out);
}

/// Packs the selected contacts and their points into `out` (TS `readPhysics2DAbiContacts`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics2d_abi_contacts(
    out: &mut Physics2DAbiContactBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    selection: Physics2DAbiContactSelection,
) -> bool {
    return (abi.read_contacts)(world, selection, out);
}

/// Packs joint reactions, then the joints broken by the last step, into `out` (TS
/// `readPhysics2DAbiJoints`).
// flight-lint: allow(conform-params) D9b: out first
pub fn read_physics2d_abi_joints(
    out: &mut Physics2DAbiJointBuffer,
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
) -> bool {
    return (abi.read_joints)(world, out);
}

/// Advances a world by `dt`, running the optional contact hooks synchronously (TS
/// `stepPhysics2DAbiWorld`).
pub fn step_physics2d_abi_world(
    abi: &Physics2DAbi,
    world: Physics2DAbiWorldHandle,
    dt: f64,
    hooks: Option<&Physics2DAbiContactHooks>,
) -> Physics2DAbiStepStatus {
    return (abi.step)(world, dt, hooks);
}
