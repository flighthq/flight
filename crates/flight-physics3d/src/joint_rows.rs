// flight-lint: allow-file(conform-array) D9: borrowed native row workspaces are slices instead of owned arrays
// flight-lint: allow-file(conform-params) D5/D9b: hidden source scratch is explicit and output parameters stay first
use crate::*;

pub const ROW_LENGTH: usize = 9;
pub const POINT_MASS: usize = 0;
pub const POINT_BIAS: usize = 6;
pub const POINT_LENGTH: usize = 9;
const BAUMGARTE: f32 = 0.2;

pub fn apply_row(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    state: &[f32],
    offset: usize,
    impulse: f32,
) {
    if impulse == 0.0 {
        return;
    }
    apply_physics_3d_joint_row_impulse(
        a,
        b,
        state[offset],
        state[offset + 1],
        state[offset + 2],
        state[offset + 3],
        state[offset + 4],
        state[offset + 5],
        state[offset + 6],
        state[offset + 7],
        state[offset + 8],
        impulse,
    );
}

pub fn begin_joint_solve(joint: &mut dyn Physics3DJoint, length: usize) -> &mut Vec<f32> {
    let f = joint.fields_mut();
    let state = f.solve_state.get_or_insert_with(Vec::new);
    state.resize(length, 0.0);
    state
}

pub fn clear_joint_solve(joint: &mut dyn Physics3DJoint) {
    joint.fields_mut().solve_state = None;
}

pub fn get_joint_solve_state(joint: &dyn Physics3DJoint) -> Option<&[f32]> {
    joint.fields().solve_state.as_deref()
}

pub fn get_row_mass(a: &RigidBody3D, b: &RigidBody3D, state: &[f32], offset: usize) -> f32 {
    get_physics_3d_joint_row_mass(
        a,
        b,
        state[offset],
        state[offset + 1],
        state[offset + 2],
        state[offset + 3],
        state[offset + 4],
        state[offset + 5],
        state[offset + 6],
        state[offset + 7],
        state[offset + 8],
    )
}

pub fn get_row_velocity(a: &RigidBody3D, b: &RigidBody3D, state: &[f32], offset: usize) -> f32 {
    get_physics_3d_joint_row_velocity(
        a,
        b,
        state[offset],
        state[offset + 1],
        state[offset + 2],
        state[offset + 3],
        state[offset + 4],
        state[offset + 5],
        state[offset + 6],
        state[offset + 7],
        state[offset + 8],
    )
}

pub fn prepare_angular_block(
    state: &mut [f32],
    mass_offset: usize,
    bias_offset: usize,
    a: &RigidBody3D,
    b: &RigidBody3D,
    frame_a: &[f32; 4],
    frame_b: &[f32; 4],
    dt: f32,
) {
    let mut tensor = [0.0; 6];
    let mut inverse = [0.0; 6];
    write_physics_3d_joint_angular_mass(&mut tensor, a, b);
    inverse_symmetric_tensor(&mut inverse, &tensor);
    state[mass_offset..mass_offset + 6].copy_from_slice(&inverse);
    let mut error = [0.0; 3];
    write_physics_3d_joint_rotation_error(
        &mut error, frame_a[0], frame_a[1], frame_a[2], frame_a[3], frame_b[0], frame_b[1],
        frame_b[2], frame_b[3],
    );
    let bias = BAUMGARTE / dt;
    for i in 0..3 {
        state[bias_offset + i] = error[i] * bias;
    }
}

pub fn prepare_point_block(
    a: &RigidBody3D,
    b: &RigidBody3D,
    joint: &mut dyn Physics3DJoint,
    state: &mut [f32],
    dt: f32,
) {
    write_physics_3d_joint_anchors(joint, a, b);
    let f = joint.fields();
    let mut tensor = [0.0; 6];
    let mut inverse = [0.0; 6];
    write_physics_3d_joint_point_mass(
        &mut tensor,
        a,
        b,
        f.r_ax,
        f.r_ay,
        f.r_az,
        f.r_bx,
        f.r_by,
        f.r_bz,
    );
    inverse_symmetric_tensor(&mut inverse, &tensor);
    state[POINT_MASS..POINT_MASS + 6].copy_from_slice(&inverse);
    let mut separation = [0.0; 3];
    write_physics_3d_joint_separation(&mut separation, a, b, joint);
    for i in 0..3 {
        state[POINT_BIAS + i] = separation[i] * BAUMGARTE / dt;
    }
}

pub fn read_frame_bases(
    out_a: &mut [f32; 9],
    out_b: &mut [f32; 9],
    a: &RigidBody3D,
    b: &RigidBody3D,
    frames: &Physics3DJointFrames,
) {
    write_physics_3d_joint_frame_basis(
        out_a,
        a,
        frames.local_rotation_ax,
        frames.local_rotation_ay,
        frames.local_rotation_az,
        frames.local_rotation_aw,
    );
    write_physics_3d_joint_frame_basis(
        out_b,
        b,
        frames.local_rotation_bx,
        frames.local_rotation_by,
        frames.local_rotation_bz,
        frames.local_rotation_bw,
    );
}

pub fn read_frame_rotations(
    out_a: &mut [f32; 4],
    out_b: &mut [f32; 4],
    a: &RigidBody3D,
    b: &RigidBody3D,
    frames: &Physics3DJointFrames,
) {
    write_physics_3d_joint_frame_rotation(
        out_a,
        a,
        frames.local_rotation_ax,
        frames.local_rotation_ay,
        frames.local_rotation_az,
        frames.local_rotation_aw,
    );
    write_physics_3d_joint_frame_rotation(
        out_b,
        b,
        frames.local_rotation_bx,
        frames.local_rotation_by,
        frames.local_rotation_bz,
        frames.local_rotation_bw,
    );
}

pub fn read_joint_impulse(joint: &dyn Physics3DJoint, slot: usize) -> f32 {
    let f = joint.fields();
    match slot {
        0 => f.impulse0,
        1 => f.impulse1,
        2 => f.impulse2,
        3 => f.impulse3,
        4 => f.impulse4,
        _ => f.impulse5,
    }
}

pub fn solve_angular_block(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    joint: &mut dyn Physics3DJoint,
    state: &[f32],
    mass_offset: usize,
    bias_offset: usize,
) {
    let tensor: [f32; 6] = state[mass_offset..mass_offset + 6].try_into().unwrap();
    let mut result = [0.0; 3];
    apply_symmetric_tensor(
        &mut result,
        &tensor,
        b.angular_velocity_x - a.angular_velocity_x + state[bias_offset],
        b.angular_velocity_y - a.angular_velocity_y + state[bias_offset + 1],
        b.angular_velocity_z - a.angular_velocity_z + state[bias_offset + 2],
    );
    let impulse = [-result[0], -result[1], -result[2]];
    let f = joint.fields_mut();
    f.impulse3 += impulse[0];
    f.impulse4 += impulse[1];
    f.impulse5 += impulse[2];
    apply_physics_3d_joint_angular_impulse(a, b, impulse[0], impulse[1], impulse[2]);
}

#[allow(clippy::too_many_arguments)]
pub fn solve_equality_row(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    joint: &mut dyn Physics3DJoint,
    slot: usize,
    state: &[f32],
    offset: usize,
    mass: f32,
    error: f32,
    bias_factor: f32,
) {
    let impulse = -mass * (get_row_velocity(a, b, state, offset) + error * bias_factor);
    let previous = read_joint_impulse(joint, slot);
    write_joint_impulse(joint, slot, previous + impulse);
    apply_row(a, b, state, offset, impulse);
}

#[allow(clippy::too_many_arguments)]
pub fn solve_lower_limit_row(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    state: &mut [f32],
    offset: usize,
    mass: f32,
    error: f32,
    bias_factor: f32,
    accumulator_slot: usize,
    gamma: Option<f32>,
) {
    let previous = state[accumulator_slot];
    let total = (previous
        - mass
            * (get_row_velocity(a, b, state, offset)
                + error * bias_factor
                + gamma.unwrap_or(0.0) * previous))
        .max(0.0);
    state[accumulator_slot] = total;
    apply_row(a, b, state, offset, total - previous);
}

#[allow(clippy::too_many_arguments)]
pub fn solve_motor_row(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    state: &[f32],
    offset: usize,
    mass: f32,
    speed: f32,
    max_impulse: f32,
    previous: f32,
) -> f32 {
    let total = (previous - mass * (get_row_velocity(a, b, state, offset) - speed))
        .clamp(-max_impulse, max_impulse);
    apply_row(a, b, state, offset, total - previous);
    total
}

pub fn solve_point_block(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    joint: &mut dyn Physics3DJoint,
    state: &[f32],
) {
    let mut velocity = [0.0; 3];
    write_physics_3d_joint_anchor_velocity(&mut velocity, a, b, joint);
    let tensor: [f32; 6] = state[POINT_MASS..POINT_MASS + 6].try_into().unwrap();
    let mut result = [0.0; 3];
    apply_symmetric_tensor(
        &mut result,
        &tensor,
        velocity[0] + state[POINT_BIAS],
        velocity[1] + state[POINT_BIAS + 1],
        velocity[2] + state[POINT_BIAS + 2],
    );
    let impulse = [-result[0], -result[1], -result[2]];
    let f = joint.fields_mut();
    f.impulse0 += impulse[0];
    f.impulse1 += impulse[1];
    f.impulse2 += impulse[2];
    apply_physics_3d_joint_impulse(
        a, b, f.r_ax, f.r_ay, f.r_az, f.r_bx, f.r_by, f.r_bz, impulse[0], impulse[1], impulse[2],
    );
}

#[allow(clippy::too_many_arguments)]
pub fn solve_upper_limit_row(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    state: &mut [f32],
    offset: usize,
    mass: f32,
    error: f32,
    bias_factor: f32,
    accumulator_slot: usize,
    gamma: Option<f32>,
) {
    let previous = state[accumulator_slot];
    let total = (previous
        - mass
            * (-get_row_velocity(a, b, state, offset)
                + error * bias_factor
                + gamma.unwrap_or(0.0) * previous))
        .max(0.0);
    state[accumulator_slot] = total;
    apply_row(a, b, state, offset, -(total - previous));
}

pub fn warm_start_angular_block(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    joint: &dyn Physics3DJoint,
) {
    let f = joint.fields();
    apply_physics_3d_joint_angular_impulse(a, b, f.impulse3, f.impulse4, f.impulse5);
}

pub fn warm_start_point_block(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    joint: &dyn Physics3DJoint,
) {
    let f = joint.fields();
    apply_physics_3d_joint_impulse(
        a, b, f.r_ax, f.r_ay, f.r_az, f.r_bx, f.r_by, f.r_bz, f.impulse0, f.impulse1, f.impulse2,
    );
}

pub fn write_angular_row(state: &mut [f32], offset: usize, x: f32, y: f32, z: f32) {
    write_row(state, offset, 0.0, 0.0, 0.0, x, y, z, x, y, z);
}

pub fn write_joint_impulse(joint: &mut dyn Physics3DJoint, slot: usize, value: f32) {
    let f = joint.fields_mut();
    match slot {
        0 => f.impulse0 = value,
        1 => f.impulse1 = value,
        2 => f.impulse2 = value,
        3 => f.impulse3 = value,
        4 => f.impulse4 = value,
        _ => f.impulse5 = value,
    }
}

pub fn write_physics_3d_soft_row_parameters(
    out: &mut [f32; 3],
    mass: f32,
    frequency_hz: f32,
    damping_ratio: f32,
    dt: f32,
    hard_bias_factor: f32,
) {
    if frequency_hz <= 0.0 || dt <= 0.0 {
        *out = [mass, hard_bias_factor, 0.0];
        return;
    }
    let angular = std::f32::consts::TAU * frequency_hz;
    let damping = 2.0 * mass * damping_ratio * angular;
    let stiffness = mass * angular * angular;
    let denominator = dt * (damping + dt * stiffness);
    let gamma = if denominator > 0.0 {
        1.0 / denominator
    } else {
        0.0
    };
    let softened = (if mass > 0.0 { 1.0 / mass } else { 0.0 }) + gamma;
    *out = [
        if softened > 0.0 { 1.0 / softened } else { 0.0 },
        dt * stiffness * gamma,
        gamma,
    ];
}

#[allow(clippy::too_many_arguments)]
pub fn write_row(
    state: &mut [f32],
    offset: usize,
    dx: f32,
    dy: f32,
    dz: f32,
    aax: f32,
    aay: f32,
    aaz: f32,
    abx: f32,
    aby: f32,
    abz: f32,
) {
    state[offset..offset + 9].copy_from_slice(&[dx, dy, dz, aax, aay, aaz, abx, aby, abz]);
}
