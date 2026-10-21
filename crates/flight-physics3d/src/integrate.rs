use crate::symmetric_tensor::{apply_symmetric_tensor, rotate_symmetric_tensor};
use crate::{Physics3DBodyType, RigidBody3D};

pub fn clear_rigid_body_3d_forces(body: &mut RigidBody3D) {
    body.force_x = 0.0;
    body.force_y = 0.0;
    body.force_z = 0.0;
    body.torque_x = 0.0;
    body.torque_y = 0.0;
    body.torque_z = 0.0;
}

pub fn integrate_rigid_body_3d_pose(body: &mut RigidBody3D, dt: f32) {
    if body.body_type == Physics3DBodyType::Static || body.sleeping {
        return;
    }
    body.x += body.velocity_x * dt;
    body.y += body.velocity_y * dt;
    body.z += body.velocity_z * dt;
    let (wx, wy, wz) = (
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
    );
    if wx == 0.0 && wy == 0.0 && wz == 0.0 {
        return;
    }
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    let (cx, cy, cz) = (body.center_x, body.center_y, body.center_z);
    let offset = cx != 0.0 || cy != 0.0 || cz != 0.0;
    let mut old_center = [0.0; 3];
    if offset {
        let tx = 2.0 * (qy * cz - qz * cy);
        let ty = 2.0 * (qz * cx - qx * cz);
        let tz = 2.0 * (qx * cy - qy * cx);
        old_center = [
            cx + qw * tx + qy * tz - qz * ty,
            cy + qw * ty + qz * tx - qx * tz,
            cz + qw * tz + qx * ty - qy * tx,
        ];
    }
    let half = dt * 0.5;
    let nx = qx + half * (wx * qw + wy * qz - wz * qy);
    let ny = qy + half * (wy * qw + wz * qx - wx * qz);
    let nz = qz + half * (wz * qw + wx * qy - wy * qx);
    let nw = qw + half * (-wx * qx - wy * qy - wz * qz);
    let length_squared = nx * nx + ny * ny + nz * nz + nw * nw;
    if length_squared <= 0.0 || !length_squared.is_finite() {
        return;
    }
    let scale = 1.0 / length_squared.sqrt();
    let (next_x, next_y, next_z, next_w) = (nx * scale, ny * scale, nz * scale, nw * scale);
    if offset {
        let tx = 2.0 * (next_y * cz - next_z * cy);
        let ty = 2.0 * (next_z * cx - next_x * cz);
        let tz = 2.0 * (next_x * cy - next_y * cx);
        body.x += old_center[0] - (cx + next_w * tx + next_y * tz - next_z * ty);
        body.y += old_center[1] - (cy + next_w * ty + next_z * tx - next_x * tz);
        body.z += old_center[2] - (cz + next_w * tz + next_x * ty - next_y * tx);
    }
    body.orientation_x = next_x;
    body.orientation_y = next_y;
    body.orientation_z = next_z;
    body.orientation_w = next_w;
}

pub fn integrate_rigid_body_3d_velocity(
    body: &mut RigidBody3D,
    gravity_x: f32,
    gravity_y: f32,
    gravity_z: f32,
    dt: f32,
) {
    if body.body_type != Physics3DBodyType::Dynamic || body.sleeping {
        return;
    }
    body.velocity_x += (body.force_x * body.inverse_mass + gravity_x * body.gravity_scale) * dt;
    body.velocity_y += (body.force_y * body.inverse_mass + gravity_y * body.gravity_scale) * dt;
    body.velocity_z += (body.force_z * body.inverse_mass + gravity_z * body.gravity_scale) * dt;
    let (wx, wy, wz) = (
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
    );
    let (mut torque_x, mut torque_y, mut torque_z) = (body.torque_x, body.torque_y, body.torque_z);
    if wx != 0.0 || wy != 0.0 || wz != 0.0 {
        let local = [
            body.inertia_xx,
            body.inertia_yy,
            body.inertia_zz,
            body.inertia_xy,
            body.inertia_xz,
            body.inertia_yz,
        ];
        let mut world = [0.0; 6];
        rotate_symmetric_tensor(
            &mut world,
            &local,
            body.orientation_x,
            body.orientation_y,
            body.orientation_z,
            body.orientation_w,
        );
        let mut momentum = [0.0; 3];
        apply_symmetric_tensor(&mut momentum, &world, wx, wy, wz);
        torque_x -= wy * momentum[2] - wz * momentum[1];
        torque_y -= wz * momentum[0] - wx * momentum[2];
        torque_z -= wx * momentum[1] - wy * momentum[0];
    }
    let inverse = [
        body.inverse_inertia_world_xx,
        body.inverse_inertia_world_yy,
        body.inverse_inertia_world_zz,
        body.inverse_inertia_world_xy,
        body.inverse_inertia_world_xz,
        body.inverse_inertia_world_yz,
    ];
    let mut angular_acceleration = [0.0; 3];
    apply_symmetric_tensor(
        &mut angular_acceleration,
        &inverse,
        torque_x,
        torque_y,
        torque_z,
    );
    body.angular_velocity_x = wx + angular_acceleration[0] * dt;
    body.angular_velocity_y = wy + angular_acceleration[1] * dt;
    body.angular_velocity_z = wz + angular_acceleration[2] * dt;
    if body.linear_damping > 0.0 {
        let damping = 1.0 / (1.0 + dt * body.linear_damping);
        body.velocity_x *= damping;
        body.velocity_y *= damping;
        body.velocity_z *= damping;
    }
    if body.angular_damping > 0.0 {
        let damping = 1.0 / (1.0 + dt * body.angular_damping);
        body.angular_velocity_x *= damping;
        body.angular_velocity_y *= damping;
        body.angular_velocity_z *= damping;
    }
}

pub fn refresh_rigid_body_3d_world_inertia(body: &mut RigidBody3D) {
    let local = [
        body.inverse_inertia_xx,
        body.inverse_inertia_yy,
        body.inverse_inertia_zz,
        body.inverse_inertia_xy,
        body.inverse_inertia_xz,
        body.inverse_inertia_yz,
    ];
    let mut world = [0.0; 6];
    rotate_symmetric_tensor(
        &mut world,
        &local,
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    body.inverse_inertia_world_xx = world[0];
    body.inverse_inertia_world_yy = world[1];
    body.inverse_inertia_world_zz = world[2];
    body.inverse_inertia_world_xy = world[3];
    body.inverse_inertia_world_xz = world[4];
    body.inverse_inertia_world_yz = world[5];
}
