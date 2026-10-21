//! Joint reaction forces (TS `jointReactions.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a zeroed reaction (TS `createPhysics2DJointReaction`).
pub fn create_physics2d_joint_reaction() -> Physics2DJointReaction {
    let mut out: Physics2DJointReaction = allocate_entity();
    initialize_physics2d_joint_reaction(&mut out);
    return out;
}

/// The construction initializer of `create_physics2d_joint_reaction` (TS
/// `initializePhysics2DJointReaction`).
pub fn initialize_physics2d_joint_reaction(out: &mut Physics2DJointReaction) {
    out.force_x = 0.0;
    out.force_y = 0.0;
    out.torque = 0.0;
}

/// Writes the joint's reaction over the last step of length `dt` through its kind's solver, or
/// zeroes and returns `false` for an invalid `dt` or a kind without reactions (TS
/// `writePhysics2DJointReaction`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn write_physics2d_joint_reaction(
    out: &mut Physics2DJointReaction,
    world: &Physics2DWorld,
    joint: &dyn Physics2DJoint,
    dt: f32,
) -> bool {
    out.force_x = 0.0;
    out.force_y = 0.0;
    out.torque = 0.0;
    if !(dt > 0.0) || !dt.is_finite() {
        return false;
    }
    let Some(write) = world
        .joint_solvers
        .get(&joint.joint_fields().kind)
        .and_then(|solver| solver.write_reaction.clone())
    else {
        return false;
    };
    return write(world, joint, 1.0 / dt, out);
}
