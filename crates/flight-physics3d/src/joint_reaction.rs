// flight-lint: allow-file(conform-params) D9b: native result writers keep the output parameter first
use flight_entity::allocate_entity;

use crate::*;

pub fn create_physics_3d_joint_reaction() -> Physics3DJointReaction {
    let mut out = allocate_entity();
    initialize_physics_3d_joint_reaction(&mut out);
    out
}

pub fn initialize_physics_3d_joint_reaction(out: &mut Physics3DJointReaction) {
    *out = Physics3DJointReaction::default();
}

pub fn accumulate_physics_3d_joint_row_reaction(
    out: &mut Physics3DJointReaction,
    joint: &dyn Physics3DJoint,
    state: &[f32],
    offset: usize,
    impulse: f32,
) {
    if impulse == 0.0 {
        return;
    }
    let direction_x = state[offset];
    let direction_y = state[offset + 1];
    let direction_z = state[offset + 2];
    out.force_x += direction_x * impulse;
    out.force_y += direction_y * impulse;
    out.force_z += direction_z * impulse;
    let f = joint.fields();
    let lever_x = f.r_by * direction_z - f.r_bz * direction_y;
    let lever_y = f.r_bz * direction_x - f.r_bx * direction_z;
    let lever_z = f.r_bx * direction_y - f.r_by * direction_x;
    out.torque_x += (state[offset + 6] - lever_x) * impulse;
    out.torque_y += (state[offset + 7] - lever_y) * impulse;
    out.torque_z += (state[offset + 8] - lever_z) * impulse;
}

pub fn clear_physics_3d_joint_reaction(out: &mut Physics3DJointReaction) {
    out.force_x = 0.0;
    out.force_y = 0.0;
    out.force_z = 0.0;
    out.torque_x = 0.0;
    out.torque_y = 0.0;
    out.torque_z = 0.0;
}

pub fn get_physics_3d_joint_reaction_force(reaction: &Physics3DJointReaction) -> f32 {
    (reaction.force_x * reaction.force_x
        + reaction.force_y * reaction.force_y
        + reaction.force_z * reaction.force_z)
        .sqrt()
}

pub fn get_physics_3d_joint_reaction_torque(reaction: &Physics3DJointReaction) -> f32 {
    (reaction.torque_x * reaction.torque_x
        + reaction.torque_y * reaction.torque_y
        + reaction.torque_z * reaction.torque_z)
        .sqrt()
}

pub fn write_physics_3d_joint_reaction(
    out: &mut Physics3DJointReaction,
    world: &Physics3DWorld,
    joint: &Physics3DJointRef,
    dt: f32,
) -> bool {
    clear_physics_3d_joint_reaction(out);
    if dt <= 0.0 {
        return false;
    }
    let kind = joint.read().unwrap().fields().kind.clone();
    let Some(write) = world
        .joint_solvers
        .get(&kind)
        .and_then(|solver| solver.write_reaction.as_ref())
    else {
        return false;
    };
    write(joint, 1.0 / dt, out)
}
