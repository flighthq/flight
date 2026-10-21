// flight-lint: allow-file(conform-params) D9b: native geometry writer keeps the output parameter first
use flight_collision::{
    CollisionColliderShape3D, CollisionShape3D, write_collision_convex_hull_faces3d,
};
use flight_entity::allocate_entity;

use crate::*;

const BOX_EDGES: [(usize, usize); 12] = [
    (0, 1),
    (2, 3),
    (4, 5),
    (6, 7),
    (0, 2),
    (1, 3),
    (4, 6),
    (5, 7),
    (0, 4),
    (1, 5),
    (2, 6),
    (3, 7),
];

pub fn create_physics_3d_debug_geometry() -> Physics3DDebugGeometry {
    let mut out = allocate_entity();
    initialize_physics_3d_debug_geometry(&mut out);
    out
}

pub fn initialize_physics_3d_debug_geometry(out: &mut Physics3DDebugGeometry) {
    out.lines.clear();
    out.line_count = 0;
    out.spheres.clear();
    out.sphere_count = 0;
}

fn body_point(body: &RigidBody3D, p: [f32; 3]) -> [f32; 3] {
    let p = rotate(
        [
            body.orientation_x,
            body.orientation_y,
            body.orientation_z,
            body.orientation_w,
        ],
        p,
    );
    [body.x + p[0], body.y + p[1], body.z + p[2]]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn rotate(q: [f32; 4], p: [f32; 3]) -> [f32; 3] {
    let t = [
        2.0 * (q[1] * p[2] - q[2] * p[1]),
        2.0 * (q[2] * p[0] - q[0] * p[2]),
        2.0 * (q[0] * p[1] - q[1] * p[0]),
    ];
    [
        p[0] + q[3] * t[0] + q[1] * t[2] - q[2] * t[1],
        p[1] + q[3] * t[1] + q[2] * t[0] - q[0] * t[2],
        p[2] + q[3] * t[2] + q[0] * t[1] - q[1] * t[0],
    ]
}

fn surface_point(
    body: &RigidBody3D,
    offset: [f32; 3],
    rotation: [f32; 4],
    point: [f32; 3],
) -> [f32; 3] {
    let p = rotate(rotation, point);
    body_point(body, [offset[0] + p[0], offset[1] + p[1], offset[2] + p[2]])
}

fn write_box(
    out: &mut Physics3DDebugGeometry,
    body: &RigidBody3D,
    center: [f32; 3],
    half: [f32; 3],
    rotation: [f32; 4],
) {
    let mut corners = [[0.0; 3]; 8];
    for (i, p) in corners.iter_mut().enumerate() {
        let local = rotate(
            rotation,
            [
                (if i & 1 == 0 { -1.0 } else { 1.0 }) * half[0],
                (if i & 2 == 0 { -1.0 } else { 1.0 }) * half[1],
                (if i & 4 == 0 { -1.0 } else { 1.0 }) * half[2],
            ],
        );
        *p = body_point(
            body,
            [
                center[0] + local[0],
                center[1] + local[1],
                center[2] + local[2],
            ],
        );
    }
    for (a, b) in BOX_EDGES {
        write_line(
            out,
            Physics3DDebugFeature::Collider,
            body.index,
            -1,
            corners[a],
            corners[b],
        );
    }
}

fn write_collider(
    out: &mut Physics3DDebugGeometry,
    shape: &CollisionColliderShape3D,
    body: &RigidBody3D,
) {
    match shape {
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(s)) => {
            write_sphere(
                out,
                Physics3DDebugFeature::Collider,
                body.index,
                -1,
                body_point(body, [s.x, s.y, s.z]),
                s.radius,
            );
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(a)) => write_box(
            out,
            body,
            [
                (a.min_x + a.max_x) * 0.5,
                (a.min_y + a.max_y) * 0.5,
                (a.min_z + a.max_z) * 0.5,
            ],
            [
                (a.max_x - a.min_x) * 0.5,
                (a.max_y - a.min_y) * 0.5,
                (a.max_z - a.min_z) * 0.5,
            ],
            [0.0, 0.0, 0.0, 1.0],
        ),
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(b)) => write_box(
            out,
            body,
            [b.x, b.y, b.z],
            [b.half_x, b.half_y, b.half_z],
            [b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w],
        ),
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(c)) => {
            let a = body_point(body, [c.x0, c.y0, c.z0]);
            let b = body_point(body, [c.x1, c.y1, c.z1]);
            write_sphere(
                out,
                Physics3DDebugFeature::Collider,
                body.index,
                -1,
                a,
                c.radius,
            );
            write_sphere(
                out,
                Physics3DDebugFeature::Collider,
                body.index,
                -1,
                b,
                c.radius,
            );
            write_line(out, Physics3DDebugFeature::Collider, body.index, -1, a, b);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cylinder(c)) => {
            let a = body_point(body, [c.x0, c.y0, c.z0]);
            let b = body_point(body, [c.x1, c.y1, c.z1]);
            write_ring(out, body.index, a, b, c.radius, 0.0);
            write_ring(out, body.index, a, b, c.radius, 1.0);
            write_line(out, Physics3DDebugFeature::Collider, body.index, -1, a, b);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cone(c)) => {
            let a = body_point(body, [c.x0, c.y0, c.z0]);
            let b = body_point(body, [c.x1, c.y1, c.z1]);
            write_ring(out, body.index, a, b, c.radius, 1.0);
            write_line(out, Physics3DDebugFeature::Collider, body.index, -1, a, b);
        }
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(c)) => {
            let mut faces = Vec::new();
            let count = write_collision_convex_hull_faces3d(&mut faces, &c.points);
            if count == 0 {
                for point in c.points.chunks_exact(3) {
                    write_sphere(
                        out,
                        Physics3DDebugFeature::Collider,
                        body.index,
                        -1,
                        body_point(body, [point[0], point[1], point[2]]),
                        0.02,
                    );
                }
            } else {
                for face in faces.chunks_exact(3).take(count) {
                    for edge in 0..3 {
                        let a = face[edge] * 3;
                        let b = face[(edge + 1) % 3] * 3;
                        write_line(
                            out,
                            Physics3DDebugFeature::Collider,
                            body.index,
                            -1,
                            body_point(body, [c.points[a], c.points[a + 1], c.points[a + 2]]),
                            body_point(body, [c.points[b], c.points[b + 1], c.points[b + 2]]),
                        );
                    }
                }
            }
        }
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            let mesh = mesh.read().unwrap();
            for tri in mesh.indices.chunks_exact(3) {
                for edge in 0..3 {
                    let a = tri[edge] * 3;
                    let b = tri[(edge + 1) % 3] * 3;
                    let pa = surface_point(
                        body,
                        [mesh.x, mesh.y, mesh.z],
                        [
                            mesh.rotation_x,
                            mesh.rotation_y,
                            mesh.rotation_z,
                            mesh.rotation_w,
                        ],
                        [mesh.points[a], mesh.points[a + 1], mesh.points[a + 2]],
                    );
                    let pb = surface_point(
                        body,
                        [mesh.x, mesh.y, mesh.z],
                        [
                            mesh.rotation_x,
                            mesh.rotation_y,
                            mesh.rotation_z,
                            mesh.rotation_w,
                        ],
                        [mesh.points[b], mesh.points[b + 1], mesh.points[b + 2]],
                    );
                    write_line(out, Physics3DDebugFeature::Collider, body.index, -1, pa, pb);
                }
            }
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            let h = heightfield.read().unwrap();
            for row in 0..h.rows {
                for col in 0..h.columns {
                    let i = row * h.columns + col;
                    let p = |c: usize, r: usize| {
                        surface_point(
                            body,
                            [h.x, h.y, h.z],
                            [h.rotation_x, h.rotation_y, h.rotation_z, h.rotation_w],
                            [
                                c as f32 * h.cell_size_x,
                                h.heights[r * h.columns + c],
                                r as f32 * h.cell_size_z,
                            ],
                        )
                    };
                    if col + 1 < h.columns {
                        write_line(
                            out,
                            Physics3DDebugFeature::Collider,
                            body.index,
                            -1,
                            p(col, row),
                            p(col + 1, row),
                        );
                    }
                    if row + 1 < h.rows {
                        write_line(
                            out,
                            Physics3DDebugFeature::Collider,
                            body.index,
                            -1,
                            p(col, row),
                            p(col, row + 1),
                        );
                    }
                    if col + 1 < h.columns && row + 1 < h.rows {
                        write_line(
                            out,
                            Physics3DDebugFeature::Collider,
                            body.index,
                            -1,
                            p(col, row),
                            p(col + 1, row + 1),
                        );
                    }
                    let _ = i;
                }
            }
        }
    }
}

fn write_line(
    out: &mut Physics3DDebugGeometry,
    feature: Physics3DDebugFeature,
    body_a: i32,
    body_b: i32,
    a: [f32; 3],
    b: [f32; 3],
) {
    let value = Physics3DDebugLine {
        feature,
        body_a,
        body_b,
        x0: a[0],
        y0: a[1],
        z0: a[2],
        x1: b[0],
        y1: b[1],
        z1: b[2],
    };
    if out.line_count == out.lines.len() {
        out.lines.push(value)
    } else {
        out.lines[out.line_count] = value
    }
    out.line_count += 1;
}

pub fn write_physics_3d_debug_geometry(
    out: &mut Physics3DDebugGeometry,
    world: &Physics3DWorld,
    options: Option<&Physics3DDebugGeometryOptions>,
) {
    out.line_count = 0;
    out.sphere_count = 0;
    let defaults = Physics3DDebugGeometryOptions::default();
    let options = options.unwrap_or(&defaults);
    if options.draw_colliders {
        for body in &world.bodies {
            let body = body.read().unwrap();
            for collider in &body.colliders {
                write_collider(out, &collider.read().unwrap().local, &body);
            }
        }
    }
    if options.draw_contacts {
        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            if !contact.touching {
                continue;
            }
            for point in contact.points.iter().take(contact.point_count) {
                write_line(
                    out,
                    Physics3DDebugFeature::ContactNormal,
                    contact.body_a,
                    contact.body_b,
                    [point.x, point.y, point.z],
                    [
                        point.x + contact.normal_x * options.contact_normal_length,
                        point.y + contact.normal_y * options.contact_normal_length,
                        point.z + contact.normal_z * options.contact_normal_length,
                    ],
                );
            }
        }
    }
    if options.draw_joints {
        for joint in &world.joints {
            let joint = joint.read().unwrap();
            let f = joint.fields();
            let (Some(a), Some(b)) = (
                world.body_by_index.get(&f.body_a),
                world.body_by_index.get(&f.body_b),
            ) else {
                continue;
            };
            let a = body_point(
                &a.read().unwrap(),
                [f.local_anchor_ax, f.local_anchor_ay, f.local_anchor_az],
            );
            let b = body_point(
                &b.read().unwrap(),
                [f.local_anchor_bx, f.local_anchor_by, f.local_anchor_bz],
            );
            write_line(out, Physics3DDebugFeature::Joint, f.body_a, f.body_b, a, b);
        }
    }
    if options.draw_centers_of_mass {
        for body in &world.bodies {
            let body = body.read().unwrap();
            let mut center = [0.0; 3];
            write_rigid_body_3d_world_center(&body, &mut center);
            write_sphere(
                out,
                Physics3DDebugFeature::CenterOfMass,
                body.index,
                -1,
                center,
                options.center_of_mass_radius,
            );
        }
    }
}

fn write_ring(
    out: &mut Physics3DDebugGeometry,
    index: i32,
    a: [f32; 3],
    b: [f32; 3],
    radius: f32,
    t: f32,
) {
    let axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let len = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
    if len <= 0.0 {
        return;
    }
    let n = [axis[0] / len, axis[1] / len, axis[2] / len];
    let seed = if n[0].abs() <= n[1].abs() && n[0].abs() <= n[2].abs() {
        [1.0, 0.0, 0.0]
    } else if n[1].abs() <= n[2].abs() {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    let mut u = cross(n, seed);
    let ul = (u[0] * u[0] + u[1] * u[1] + u[2] * u[2]).sqrt();
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    let v = cross(n, u);
    let c = [a[0] + axis[0] * t, a[1] + axis[1] * t, a[2] + axis[2] * t];
    let mut prev = [
        c[0] + u[0] * radius,
        c[1] + u[1] * radius,
        c[2] + u[2] * radius,
    ];
    for i in 1..=16 {
        let angle = i as f32 / 16.0 * std::f32::consts::TAU;
        let next = [
            c[0] + (u[0] * angle.cos() + v[0] * angle.sin()) * radius,
            c[1] + (u[1] * angle.cos() + v[1] * angle.sin()) * radius,
            c[2] + (u[2] * angle.cos() + v[2] * angle.sin()) * radius,
        ];
        write_line(out, Physics3DDebugFeature::Collider, index, -1, prev, next);
        prev = next;
    }
}

fn write_sphere(
    out: &mut Physics3DDebugGeometry,
    feature: Physics3DDebugFeature,
    body_a: i32,
    body_b: i32,
    p: [f32; 3],
    radius: f32,
) {
    let value = Physics3DDebugSphere {
        feature,
        body_a,
        body_b,
        x: p[0],
        y: p[1],
        z: p[2],
        radius,
    };
    if out.sphere_count == out.spheres.len() {
        out.spheres.push(value)
    } else {
        out.spheres[out.sphere_count] = value
    }
    out.sphere_count += 1;
}
