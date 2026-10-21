use flight_collision::{
    CollisionColliderShape3D, CollisionShape3D, write_collision_convex_hull_faces3d,
};
use flight_entity::allocate_entity;

use crate::symmetric_tensor::{
    inverse_symmetric_tensor, rotate_symmetric_tensor, translate_symmetric_tensor,
};
use crate::{Physics3DBodyType, Physics3DCollider, Physics3DMassData, RigidBody3D};

pub fn create_physics_3d_mass_data() -> Physics3DMassData {
    let mut out = allocate_entity();
    initialize_physics_3d_mass_data(&mut out);
    return out;
}

pub fn initialize_physics_3d_mass_data(out: &mut Physics3DMassData) {
    *out = Physics3DMassData::default();
}

fn align_axis_to_y(out: &mut Physics3DMassData, x: f32, y: f32, z: f32) {
    let axial = out.inertia_yy;
    let transverse = out.inertia_xx;
    let difference = axial - transverse;
    out.inertia_xx = transverse + difference * x * x;
    out.inertia_yy = transverse + difference * y * y;
    out.inertia_zz = transverse + difference * z * z;
    out.inertia_xy = difference * x * y;
    out.inertia_xz = difference * x * z;
    out.inertia_yz = difference * y * z;
}

pub fn combine_physics_3d_mass_data(target: &mut Physics3DMassData, addend: &Physics3DMassData) {
    let total_mass = target.mass + addend.mass;
    if total_mass <= 0.0 {
        target.mass = 0.0;
        write_tensor(target, &[0.0; 6]);
        return;
    }
    let inverse_total = 1.0 / total_mass;
    let center_x = (target.center_x * target.mass + addend.center_x * addend.mass) * inverse_total;
    let center_y = (target.center_y * target.mass + addend.center_y * addend.mass) * inverse_total;
    let center_z = (target.center_z * target.mass + addend.center_z * addend.mass) * inverse_total;
    let mut a = [0.0; 6];
    let mut b = [0.0; 6];
    translate_symmetric_tensor(
        &mut a,
        &read_tensor(target),
        target.mass,
        target.center_x - center_x,
        target.center_y - center_y,
        target.center_z - center_z,
    );
    translate_symmetric_tensor(
        &mut b,
        &read_tensor(addend),
        addend.mass,
        addend.center_x - center_x,
        addend.center_y - center_y,
        addend.center_z - center_z,
    );
    target.mass = total_mass;
    target.center_x = center_x;
    target.center_y = center_y;
    target.center_z = center_z;
    for i in 0..6 {
        a[i] += b[i];
    }
    write_tensor(target, &a);
}

pub fn compute_physics_3d_box_mass_data(
    half_extent_x: f32,
    half_extent_y: f32,
    half_extent_z: f32,
    density: f32,
    out: &mut Physics3DMassData,
) {
    let mass = 8.0 * half_extent_x * half_extent_y * half_extent_z * density;
    write_diagonal(
        out,
        mass,
        mass * (half_extent_y * half_extent_y + half_extent_z * half_extent_z) / 3.0,
        mass * (half_extent_x * half_extent_x + half_extent_z * half_extent_z) / 3.0,
        mass * (half_extent_x * half_extent_x + half_extent_y * half_extent_y) / 3.0,
    );
}

pub fn compute_physics_3d_capsule_mass_data(
    radius: f32,
    half_height: f32,
    density: f32,
    out: &mut Physics3DMassData,
) {
    let height = half_height + half_height;
    let radius2 = radius * radius;
    let cylinder_mass = std::f32::consts::PI * radius2 * height * density;
    let hemisphere_mass = (2.0 / 3.0) * std::f32::consts::PI * radius2 * radius * density;
    let mass = cylinder_mass + 2.0 * hemisphere_mass;
    let axial = 0.5 * cylinder_mass * radius2 + 2.0 * ((2.0 / 5.0) * hemisphere_mass * radius2);
    let center = half_height + 0.375 * radius;
    let own = hemisphere_mass * radius2 * (2.0 / 5.0 - 9.0 / 64.0);
    let transverse = cylinder_mass * (height * height / 12.0 + radius2 / 4.0)
        + 2.0 * (own + hemisphere_mass * center * center);
    write_diagonal(out, mass, transverse, axial, transverse);
}

pub fn compute_physics_3d_collider_mass_data(
    collider: &Physics3DCollider,
    out: &mut Physics3DMassData,
) {
    let density = collider.material.density;
    match &collider.local {
        CollisionColliderShape3D::BuiltIn(shape) => match shape {
            CollisionShape3D::Sphere(s) => {
                compute_physics_3d_sphere_mass_data(s.radius, density, out);
                [out.center_x, out.center_y, out.center_z] = [s.x, s.y, s.z];
            }
            CollisionShape3D::Aabb(a) => {
                compute_physics_3d_box_mass_data(
                    (a.max_x - a.min_x) / 2.0,
                    (a.max_y - a.min_y) / 2.0,
                    (a.max_z - a.min_z) / 2.0,
                    density,
                    out,
                );
                out.center_x = (a.min_x + a.max_x) / 2.0;
                out.center_y = (a.min_y + a.max_y) / 2.0;
                out.center_z = (a.min_z + a.max_z) / 2.0;
            }
            CollisionShape3D::Box(b) => {
                compute_physics_3d_box_mass_data(b.half_x, b.half_y, b.half_z, density, out);
                let mut rotated = [0.0; 6];
                rotate_symmetric_tensor(
                    &mut rotated,
                    &read_tensor(out),
                    b.rotation_x,
                    b.rotation_y,
                    b.rotation_z,
                    b.rotation_w,
                );
                write_tensor(out, &rotated);
                [out.center_x, out.center_y, out.center_z] = [b.x, b.y, b.z];
            }
            CollisionShape3D::Capsule(s) => {
                let axis = [s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0];
                let length = length(axis);
                compute_physics_3d_capsule_mass_data(s.radius, length / 2.0, density, out);
                if length > 0.0 {
                    align_axis_to_y(out, axis[0] / length, axis[1] / length, axis[2] / length);
                }
                [out.center_x, out.center_y, out.center_z] = [
                    (s.x0 + s.x1) / 2.0,
                    (s.y0 + s.y1) / 2.0,
                    (s.z0 + s.z1) / 2.0,
                ];
            }
            CollisionShape3D::Cylinder(s) => {
                let axis = [s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0];
                let length = length(axis);
                compute_physics_3d_cylinder_mass_data(s.radius, length / 2.0, density, out);
                if length > 0.0 {
                    align_axis_to_y(out, axis[0] / length, axis[1] / length, axis[2] / length);
                }
                [out.center_x, out.center_y, out.center_z] = [
                    (s.x0 + s.x1) / 2.0,
                    (s.y0 + s.y1) / 2.0,
                    (s.z0 + s.z1) / 2.0,
                ];
            }
            CollisionShape3D::Cone(s) => {
                let axis = [s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0];
                let length = length(axis);
                compute_physics_3d_cone_mass_data(s.radius, length, density, out);
                if length > 0.0 {
                    align_axis_to_y(out, axis[0] / length, axis[1] / length, axis[2] / length);
                }
                out.center_x = s.x0 + axis[0] * 0.75;
                out.center_y = s.y0 + axis[1] * 0.75;
                out.center_z = s.z0 + axis[2] * 0.75;
            }
            CollisionShape3D::Convex(s) => {
                compute_physics_3d_convex_hull_mass_data(&s.points, density, out)
            }
        },
        CollisionColliderShape3D::TriangleMesh(_) | CollisionColliderShape3D::Heightfield(_) => {
            initialize_physics_3d_mass_data(out)
        }
    }
}

pub fn compute_physics_3d_cone_mass_data(
    radius: f32,
    height: f32,
    density: f32,
    out: &mut Physics3DMassData,
) {
    let radius2 = radius * radius;
    let mass = (std::f32::consts::PI / 3.0) * radius2 * height * density;
    let transverse = mass * ((3.0 / 20.0) * radius2 + (3.0 / 80.0) * height * height);
    write_diagonal(out, mass, transverse, 0.3 * mass * radius2, transverse);
}

pub fn compute_physics_3d_convex_hull_mass_data(
    points: &Vec<f32>,
    density: f32,
    out: &mut Physics3DMassData,
) {
    initialize_physics_3d_mass_data(out);
    let mut faces = Vec::new();
    let triangle_count = write_collision_convex_hull_faces3d(&mut faces, points);
    if triangle_count == 0 {
        return;
    }
    let (mut volume, mut mx, mut my, mut mz) = (0.0, 0.0, 0.0, 0.0);
    let mut moments = [0.0; 6];
    for face in faces.chunks_exact(3).take(triangle_count) {
        let a = face[0] * 3;
        let b = face[1] * 3;
        let c = face[2] * 3;
        let (ax, ay, az) = (points[a], points[a + 1], points[a + 2]);
        let (bx, by, bz) = (points[b], points[b + 1], points[b + 2]);
        let (cx, cy, cz) = (points[c], points[c + 1], points[c + 2]);
        let determinant =
            ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
        let tetra = determinant / 6.0;
        volume += tetra;
        mx += tetra * (ax + bx + cx) / 4.0;
        my += tetra * (ay + by + cy) / 4.0;
        mz += tetra * (az + bz + cz) / 4.0;
        let scale = determinant / 120.0;
        let (sx, sy, sz) = (ax + bx + cx, ay + by + cy, az + bz + cz);
        moments[0] += scale * (ax * ax + bx * bx + cx * cx + sx * sx);
        moments[1] += scale * (ay * ay + by * by + cy * cy + sy * sy);
        moments[2] += scale * (az * az + bz * bz + cz * cz + sz * sz);
        moments[3] += scale * (ax * ay + bx * by + cx * cy + sx * sy);
        moments[4] += scale * (ax * az + bx * bz + cx * cz + sx * sz);
        moments[5] += scale * (ay * az + by * bz + cy * cz + sy * sz);
    }
    if volume <= 0.0 {
        return;
    }
    let mass = volume * density;
    let center = [mx / volume, my / volume, mz / volume];
    let mut inertia = [
        (moments[1] + moments[2]) * density,
        (moments[0] + moments[2]) * density,
        (moments[0] + moments[1]) * density,
        -moments[3] * density,
        -moments[4] * density,
        -moments[5] * density,
    ];
    let input = inertia;
    translate_symmetric_tensor(&mut inertia, &input, -mass, center[0], center[1], center[2]);
    out.mass = mass;
    [out.center_x, out.center_y, out.center_z] = center;
    write_tensor(out, &inertia);
}

pub fn compute_physics_3d_cylinder_mass_data(
    radius: f32,
    half_height: f32,
    density: f32,
    out: &mut Physics3DMassData,
) {
    let height = half_height + half_height;
    let radius2 = radius * radius;
    let mass = std::f32::consts::PI * radius2 * height * density;
    write_diagonal(
        out,
        mass,
        mass * (height * height / 12.0 + radius2 / 4.0),
        0.5 * mass * radius2,
        mass * (height * height / 12.0 + radius2 / 4.0),
    );
}

pub fn compute_physics_3d_sphere_mass_data(radius: f32, density: f32, out: &mut Physics3DMassData) {
    let mass = (4.0 / 3.0) * std::f32::consts::PI * radius * radius * radius * density;
    let moment = 0.4 * mass * radius * radius;
    write_diagonal(out, mass, moment, moment, moment);
}

fn length(v: [f32; 3]) -> f32 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn read_tensor(d: &Physics3DMassData) -> [f32; 6] {
    [
        d.inertia_xx,
        d.inertia_yy,
        d.inertia_zz,
        d.inertia_xy,
        d.inertia_xz,
        d.inertia_yz,
    ]
}

pub fn set_rigid_body_3d_mass_data(body: &mut RigidBody3D, data: &Physics3DMassData) {
    body.mass = data.mass;
    body.center_x = data.center_x;
    body.center_y = data.center_y;
    body.center_z = data.center_z;
    body.inertia_xx = data.inertia_xx;
    body.inertia_yy = data.inertia_yy;
    body.inertia_zz = data.inertia_zz;
    body.inertia_xy = data.inertia_xy;
    body.inertia_xz = data.inertia_xz;
    body.inertia_yz = data.inertia_yz;
    let movable = body.body_type == Physics3DBodyType::Dynamic && data.mass > 0.0;
    body.inverse_mass = if movable { 1.0 / data.mass } else { 0.0 };
    let mut inverse = [0.0; 6];
    if movable && !body.fixed_rotation {
        inverse_symmetric_tensor(&mut inverse, &read_tensor(data));
    }
    body.inverse_inertia_xx = inverse[0];
    body.inverse_inertia_yy = inverse[1];
    body.inverse_inertia_zz = inverse[2];
    body.inverse_inertia_xy = inverse[3];
    body.inverse_inertia_xz = inverse[4];
    body.inverse_inertia_yz = inverse[5];
}

pub fn update_rigid_body_3d_mass_data(body: &mut RigidBody3D) {
    let mut total = create_physics_3d_mass_data();
    for collider in &body.colliders {
        let collider = collider.read().unwrap();
        let mut one = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider, &mut one);
        combine_physics_3d_mass_data(&mut total, &one);
    }
    set_rigid_body_3d_mass_data(body, &total);
}

fn write_diagonal(out: &mut Physics3DMassData, mass: f32, xx: f32, yy: f32, zz: f32) {
    initialize_physics_3d_mass_data(out);
    out.mass = mass;
    out.inertia_xx = xx;
    out.inertia_yy = yy;
    out.inertia_zz = zz;
}

fn write_tensor(d: &mut Physics3DMassData, t: &[f32; 6]) {
    d.inertia_xx = t[0];
    d.inertia_yy = t[1];
    d.inertia_zz = t[2];
    d.inertia_xy = t[3];
    d.inertia_xz = t[4];
    d.inertia_yz = t[5];
}
