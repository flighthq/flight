// flight-lint: allow-file(conform-params) D9b: native writers keep outputs first and scalar component names compact
use crate::*;

fn add_skew(t: &[f32; 6], x: f32, y: f32, z: f32, out: &mut [f32; 6]) {
    let (mut r0, mut r1, mut r2) = ([0.0; 3], [0.0; 3], [0.0; 3]);
    apply_symmetric_tensor(&mut r0, t, 0.0, -z, y);
    apply_symmetric_tensor(&mut r1, t, z, 0.0, -x);
    apply_symmetric_tensor(&mut r2, t, -y, x, 0.0);
    out[TENSOR_XX] += -z * r0[1] + y * r0[2];
    out[TENSOR_YY] += z * r1[0] - x * r1[2];
    out[TENSOR_ZZ] += -y * r2[0] + x * r2[1];
    out[TENSOR_XY] += -z * r1[1] + y * r1[2];
    out[TENSOR_XZ] += -z * r2[1] + y * r2[2];
    out[TENSOR_YZ] += z * r2[0] - x * r2[2];
}

fn apply_body_impulse(b: &mut RigidBody3D, rx: f32, ry: f32, rz: f32, x: f32, y: f32, z: f32) {
    b.velocity_x += x * b.inverse_mass;
    b.velocity_y += y * b.inverse_mass;
    b.velocity_z += z * b.inverse_mass;
    let mut v = [0.0; 3];
    apply_symmetric_tensor(
        &mut v,
        &inertia(b),
        ry * z - rz * y,
        rz * x - rx * z,
        rx * y - ry * x,
    );
    b.angular_velocity_x += v[0];
    b.angular_velocity_y += v[1];
    b.angular_velocity_z += v[2];
}

pub fn apply_physics_3d_joint_angular_impulse(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    x: f32,
    y: f32,
    z: f32,
) {
    let mut v = [0.0; 3];
    apply_symmetric_tensor(&mut v, &inertia(a), x, y, z);
    a.angular_velocity_x -= v[0];
    a.angular_velocity_y -= v[1];
    a.angular_velocity_z -= v[2];
    apply_symmetric_tensor(&mut v, &inertia(b), x, y, z);
    b.angular_velocity_x += v[0];
    b.angular_velocity_y += v[1];
    b.angular_velocity_z += v[2];
}

#[allow(clippy::too_many_arguments)]
pub fn apply_physics_3d_joint_impulse(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    rax: f32,
    ray: f32,
    raz: f32,
    rbx: f32,
    rby: f32,
    rbz: f32,
    x: f32,
    y: f32,
    z: f32,
) {
    apply_body_impulse(a, rax, ray, raz, -x, -y, -z);
    apply_body_impulse(b, rbx, rby, rbz, x, y, z);
}

#[allow(clippy::too_many_arguments)]
pub fn apply_physics_3d_joint_row_impulse(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    dx: f32,
    dy: f32,
    dz: f32,
    aax: f32,
    aay: f32,
    aaz: f32,
    abx: f32,
    aby: f32,
    abz: f32,
    impulse: f32,
) {
    a.velocity_x -= impulse * dx * a.inverse_mass;
    a.velocity_y -= impulse * dy * a.inverse_mass;
    a.velocity_z -= impulse * dz * a.inverse_mass;
    let mut v = [0.0; 3];
    apply_symmetric_tensor(
        &mut v,
        &inertia(a),
        aax * impulse,
        aay * impulse,
        aaz * impulse,
    );
    a.angular_velocity_x -= v[0];
    a.angular_velocity_y -= v[1];
    a.angular_velocity_z -= v[2];
    b.velocity_x += impulse * dx * b.inverse_mass;
    b.velocity_y += impulse * dy * b.inverse_mass;
    b.velocity_z += impulse * dz * b.inverse_mass;
    apply_symmetric_tensor(
        &mut v,
        &inertia(b),
        abx * impulse,
        aby * impulse,
        abz * impulse,
    );
    b.angular_velocity_x += v[0];
    b.angular_velocity_y += v[1];
    b.angular_velocity_z += v[2];
}

#[allow(clippy::too_many_arguments)]
pub fn get_physics_3d_joint_row_mass(
    a: &RigidBody3D,
    b: &RigidBody3D,
    dx: f32,
    dy: f32,
    dz: f32,
    aax: f32,
    aay: f32,
    aaz: f32,
    abx: f32,
    aby: f32,
    abz: f32,
) -> f32 {
    let mut denominator = (a.inverse_mass + b.inverse_mass) * (dx * dx + dy * dy + dz * dz);
    let mut v = [0.0; 3];
    apply_symmetric_tensor(&mut v, &inertia(a), aax, aay, aaz);
    denominator += aax * v[0] + aay * v[1] + aaz * v[2];
    apply_symmetric_tensor(&mut v, &inertia(b), abx, aby, abz);
    denominator += abx * v[0] + aby * v[1] + abz * v[2];
    if denominator > 0.0 {
        1.0 / denominator
    } else {
        0.0
    }
}

#[allow(clippy::too_many_arguments)]
pub fn get_physics_3d_joint_row_velocity(
    a: &RigidBody3D,
    b: &RigidBody3D,
    dx: f32,
    dy: f32,
    dz: f32,
    aax: f32,
    aay: f32,
    aaz: f32,
    abx: f32,
    aby: f32,
    abz: f32,
) -> f32 {
    (b.velocity_x - a.velocity_x) * dx
        + (b.velocity_y - a.velocity_y) * dy
        + (b.velocity_z - a.velocity_z) * dz
        + b.angular_velocity_x * abx
        + b.angular_velocity_y * aby
        + b.angular_velocity_z * abz
        - a.angular_velocity_x * aax
        - a.angular_velocity_y * aay
        - a.angular_velocity_z * aaz
}

fn inertia(b: &RigidBody3D) -> [f32; 6] {
    [
        b.inverse_inertia_world_xx,
        b.inverse_inertia_world_yy,
        b.inverse_inertia_world_zz,
        b.inverse_inertia_world_xy,
        b.inverse_inertia_world_xz,
        b.inverse_inertia_world_yz,
    ]
}

fn multiply(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}

fn rotate(q: [f32; 4], v: [f32; 3]) -> [f32; 3] {
    let t = [
        q[1] * v[2] - q[2] * v[1] + q[3] * v[0],
        q[2] * v[0] - q[0] * v[2] + q[3] * v[1],
        q[0] * v[1] - q[1] * v[0] + q[3] * v[2],
    ];
    [
        v[0] + 2.0 * (q[1] * t[2] - q[2] * t[1]),
        v[1] + 2.0 * (q[2] * t[0] - q[0] * t[2]),
        v[2] + 2.0 * (q[0] * t[1] - q[1] * t[0]),
    ]
}

pub fn swap_physics_3d_joint_frames(frames: &mut Physics3DJointFrames) {
    std::mem::swap(&mut frames.local_rotation_ax, &mut frames.local_rotation_bx);
    std::mem::swap(&mut frames.local_rotation_ay, &mut frames.local_rotation_by);
    std::mem::swap(&mut frames.local_rotation_az, &mut frames.local_rotation_bz);
    std::mem::swap(&mut frames.local_rotation_aw, &mut frames.local_rotation_bw);
}

fn world_center(b: &RigidBody3D) -> [f32; 3] {
    let c = rotate(
        [
            b.orientation_x,
            b.orientation_y,
            b.orientation_z,
            b.orientation_w,
        ],
        [b.center_x, b.center_y, b.center_z],
    );
    [b.x + c[0], b.y + c[1], b.z + c[2]]
}

pub fn write_physics_3d_joint_anchor_velocity(
    out: &mut [f32; 3],
    a: &RigidBody3D,
    b: &RigidBody3D,
    joint: &dyn Physics3DJoint,
) {
    let f = joint.fields();
    let av = [
        a.velocity_x + a.angular_velocity_y * f.r_az - a.angular_velocity_z * f.r_ay,
        a.velocity_y + a.angular_velocity_z * f.r_ax - a.angular_velocity_x * f.r_az,
        a.velocity_z + a.angular_velocity_x * f.r_ay - a.angular_velocity_y * f.r_ax,
    ];
    out[0] = b.velocity_x + b.angular_velocity_y * f.r_bz - b.angular_velocity_z * f.r_by - av[0];
    out[1] = b.velocity_y + b.angular_velocity_z * f.r_bx - b.angular_velocity_x * f.r_bz - av[1];
    out[2] = b.velocity_z + b.angular_velocity_x * f.r_by - b.angular_velocity_y * f.r_bx - av[2];
}

pub fn write_physics_3d_joint_anchors(
    joint: &mut dyn Physics3DJoint,
    a: &RigidBody3D,
    b: &RigidBody3D,
) {
    let f = joint.fields_mut();
    let ra = rotate(
        [
            a.orientation_x,
            a.orientation_y,
            a.orientation_z,
            a.orientation_w,
        ],
        [
            f.local_anchor_ax - a.center_x,
            f.local_anchor_ay - a.center_y,
            f.local_anchor_az - a.center_z,
        ],
    );
    f.r_ax = ra[0];
    f.r_ay = ra[1];
    f.r_az = ra[2];
    let rb = rotate(
        [
            b.orientation_x,
            b.orientation_y,
            b.orientation_z,
            b.orientation_w,
        ],
        [
            f.local_anchor_bx - b.center_x,
            f.local_anchor_by - b.center_y,
            f.local_anchor_bz - b.center_z,
        ],
    );
    f.r_bx = rb[0];
    f.r_by = rb[1];
    f.r_bz = rb[2];
}

pub fn write_physics_3d_joint_angular_mass(out: &mut [f32; 6], a: &RigidBody3D, b: &RigidBody3D) {
    let ia = inertia(a);
    let ib = inertia(b);
    for i in 0..6 {
        out[i] = ia[i] + ib[i];
    }
}

#[allow(clippy::too_many_arguments)]
pub fn write_physics_3d_joint_frame_basis(
    out: &mut [f32; 9],
    body: &RigidBody3D,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) {
    let q = multiply(
        [
            body.orientation_x,
            body.orientation_y,
            body.orientation_z,
            body.orientation_w,
        ],
        [x, y, z, w],
    );
    let (x, y, z, w) = (q[0], q[1], q[2], q[3]);
    let (x2, y2, z2) = (x + x, y + y, z + z);
    let (xx2, yy2, zz2) = (x * x2, y * y2, z * z2);
    let (xy2, xz2, yz2) = (x * y2, x * z2, y * z2);
    let (wx2, wy2, wz2) = (w * x2, w * y2, w * z2);
    *out = [
        1.0 - yy2 - zz2,
        xy2 + wz2,
        xz2 - wy2,
        xy2 - wz2,
        1.0 - xx2 - zz2,
        yz2 + wx2,
        xz2 + wy2,
        yz2 - wx2,
        1.0 - xx2 - yy2,
    ];
}

#[allow(clippy::too_many_arguments)]
pub fn write_physics_3d_joint_frame_rotation(
    out: &mut [f32; 4],
    body: &RigidBody3D,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) {
    *out = multiply(
        [
            body.orientation_x,
            body.orientation_y,
            body.orientation_z,
            body.orientation_w,
        ],
        [x, y, z, w],
    );
}

#[allow(clippy::too_many_arguments)]
pub fn write_physics_3d_joint_point_mass(
    out: &mut [f32; 6],
    a: &RigidBody3D,
    b: &RigidBody3D,
    rax: f32,
    ray: f32,
    raz: f32,
    rbx: f32,
    rby: f32,
    rbz: f32,
) {
    let d = a.inverse_mass + b.inverse_mass;
    *out = [d, d, d, 0.0, 0.0, 0.0];
    add_skew(&inertia(a), rax, ray, raz, out);
    add_skew(&inertia(b), rbx, rby, rbz, out);
}

#[allow(clippy::too_many_arguments)]
pub fn write_physics_3d_joint_relative_rotation(
    out: &mut [f32; 4],
    ax: f32,
    ay: f32,
    az: f32,
    aw: f32,
    bx: f32,
    by: f32,
    bz: f32,
    bw: f32,
) {
    *out = multiply([-ax, -ay, -az, aw], [bx, by, bz, bw]);
    if out[3] < 0.0 {
        for value in out.iter_mut() {
            *value = -*value;
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn write_physics_3d_joint_rotation_error(
    out: &mut [f32; 3],
    ax: f32,
    ay: f32,
    az: f32,
    aw: f32,
    bx: f32,
    by: f32,
    bz: f32,
    bw: f32,
) {
    let mut relative = [0.0; 4];
    write_physics_3d_joint_relative_rotation(&mut relative, ax, ay, az, aw, bx, by, bz, bw);
    let sine =
        (relative[0] * relative[0] + relative[1] * relative[1] + relative[2] * relative[2]).sqrt();
    if sine < 1e-12 {
        *out = [0.0; 3];
        return;
    }
    let scale = 2.0 * sine.atan2(relative[3]) / sine;
    *out = rotate(
        [ax, ay, az, aw],
        [
            relative[0] * scale,
            relative[1] * scale,
            relative[2] * scale,
        ],
    );
}

pub fn write_physics_3d_joint_separation(
    out: &mut [f32; 3],
    a: &RigidBody3D,
    b: &RigidBody3D,
    joint: &dyn Physics3DJoint,
) {
    let f = joint.fields();
    let ca = world_center(a);
    let cb = world_center(b);
    out[0] = cb[0] + f.r_bx - ca[0] - f.r_ax;
    out[1] = cb[1] + f.r_by - ca[1] - f.r_ay;
    out[2] = cb[2] + f.r_bz - ca[2] - f.r_az;
}
