// flight-lint: allow-file(conform-params) D12: collision enum variants carry the kind instead of a separate string
use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionColliderShape3D, CollisionCone3D,
    CollisionConvex3D, CollisionCylinder3D, CollisionShape3D, CollisionSphere3D,
    write_collision_heightfield_bounds3d, write_collision_triangle_mesh_bounds3d,
};
use flight_spatial::SpatialAabb3D;

use crate::{Physics3DCollider, RigidBody3D};

pub fn create_physics_3d_collider_world_shape(
    local: &CollisionColliderShape3D,
) -> CollisionColliderShape3D {
    return match local {
        CollisionColliderShape3D::BuiltIn(shape) => {
            CollisionColliderShape3D::BuiltIn(match shape {
                CollisionShape3D::Sphere(shape) => CollisionShape3D::Sphere(*shape),
                CollisionShape3D::Aabb(_) | CollisionShape3D::Box(_) => {
                    CollisionShape3D::Box(CollisionBox3D {
                        rotation_w: 1.0,
                        ..CollisionBox3D::default()
                    })
                }
                CollisionShape3D::Capsule(shape) => CollisionShape3D::Capsule(*shape),
                CollisionShape3D::Cylinder(shape) => CollisionShape3D::Cylinder(*shape),
                CollisionShape3D::Cone(shape) => CollisionShape3D::Cone(*shape),
                CollisionShape3D::Convex(shape) => CollisionShape3D::Convex(shape.clone()),
            })
        }
        CollisionColliderShape3D::TriangleMesh(shape) => CollisionColliderShape3D::TriangleMesh(
            Arc::new(RwLock::new(shape.read().unwrap().clone())),
        ),
        CollisionColliderShape3D::Heightfield(shape) => CollisionColliderShape3D::Heightfield(
            Arc::new(RwLock::new(shape.read().unwrap().clone())),
        ),
    };
}

pub fn initialize_collision_box_3d(out: &mut CollisionBox3D) {
    *out = CollisionBox3D {
        rotation_w: 1.0,
        ..CollisionBox3D::default()
    };
}

pub fn initialize_collision_capsule_3d(
    out: &mut CollisionCapsule3D,
    radius: f32,
    x0: f32,
    x1: f32,
    y0: f32,
    y1: f32,
    z0: f32,
    z1: f32,
) {
    *out = CollisionCapsule3D {
        radius,
        x0,
        x1,
        y0,
        y1,
        z0,
        z1,
    };
}

#[allow(clippy::too_many_arguments)]
pub fn initialize_collision_cone_3d(
    out: &mut CollisionCone3D,
    apex_x: f32,
    apex_y: f32,
    apex_z: f32,
    base_x: f32,
    base_y: f32,
    base_z: f32,
    radius: f32,
) {
    *out = CollisionCone3D {
        x0: apex_x,
        y0: apex_y,
        z0: apex_z,
        x1: base_x,
        y1: base_y,
        z1: base_z,
        radius,
    };
}

pub fn initialize_collision_convex_3d(out: &mut CollisionConvex3D, points: Vec<f32>) {
    out.points = points;
}

#[allow(clippy::too_many_arguments)]
pub fn initialize_collision_cylinder_3d(
    out: &mut CollisionCylinder3D,
    radius: f32,
    x0: f32,
    x1: f32,
    y0: f32,
    y1: f32,
    z0: f32,
    z1: f32,
) {
    *out = CollisionCylinder3D {
        radius,
        x0,
        x1,
        y0,
        y1,
        z0,
        z1,
    };
}

pub fn initialize_collision_sphere_3d(
    out: &mut CollisionSphere3D,
    radius: f32,
    x: f32,
    y: f32,
    z: f32,
) {
    *out = CollisionSphere3D { radius, x, y, z };
}

#[allow(clippy::too_many_arguments)]
fn compose_rotation(body: &RigidBody3D, lx: f32, ly: f32, lz: f32, lw: f32) -> [f32; 4] {
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    return [
        qw * lx + qx * lw + qy * lz - qz * ly,
        qw * ly - qx * lz + qy * lw + qz * lx,
        qw * lz + qx * ly - qy * lx + qz * lw,
        qw * lw - qx * lx - qy * ly - qz * lz,
    ];
}

fn copy_collision_bounds(source: &CollisionAabb3D, out: &mut SpatialAabb3D) {
    *out = SpatialAabb3D {
        min_x: source.min_x,
        min_y: source.min_y,
        min_z: source.min_z,
        max_x: source.max_x,
        max_y: source.max_y,
        max_z: source.max_z,
    };
}

fn disc_extent(x: f32, y: f32, z: f32, r: f32) -> [f32; 3] {
    let l = x * x + y * y + z * z;
    if l <= 0.0 {
        return [r, r, r];
    }
    let inv = 1.0 / l.sqrt();
    let (nx, ny, nz) = (x * inv, y * inv, z * inv);
    [
        r * (1.0 - nx * nx).max(0.0).sqrt(),
        r * (1.0 - ny * ny).max(0.0).sqrt(),
        r * (1.0 - nz * nz).max(0.0).sqrt(),
    ]
}

fn rotate_point(qx: f32, qy: f32, qz: f32, qw: f32, x: f32, y: f32, z: f32) -> [f32; 3] {
    let tx = 2.0 * (qy * z - qz * y);
    let ty = 2.0 * (qz * x - qx * z);
    let tz = 2.0 * (qx * y - qy * x);
    [
        x + qw * tx + qy * tz - qz * ty,
        y + qw * ty + qz * tx - qx * tz,
        z + qw * tz + qx * ty - qy * tx,
    ]
}

fn transform_cone(
    body: &RigidBody3D,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    local: &CollisionCone3D,
    world: &mut CollisionCone3D,
) {
    let a = rotate_point(qx, qy, qz, qw, local.x0, local.y0, local.z0);
    let b = rotate_point(qx, qy, qz, qw, local.x1, local.y1, local.z1);
    *world = CollisionCone3D {
        x0: body.x + a[0],
        y0: body.y + a[1],
        z0: body.z + a[2],
        x1: body.x + b[0],
        y1: body.y + b[1],
        z1: body.z + b[2],
        radius: local.radius,
    };
}

fn transform_cylinder(
    body: &RigidBody3D,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    local: &CollisionCylinder3D,
    world: &mut CollisionCylinder3D,
) {
    let a = rotate_point(qx, qy, qz, qw, local.x0, local.y0, local.z0);
    let b = rotate_point(qx, qy, qz, qw, local.x1, local.y1, local.z1);
    *world = CollisionCylinder3D {
        x0: body.x + a[0],
        y0: body.y + a[1],
        z0: body.z + a[2],
        x1: body.x + b[0],
        y1: body.y + b[1],
        z1: body.z + b[2],
        radius: local.radius,
    };
}

fn transform_segment_shape(
    body: &RigidBody3D,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    local: &CollisionCapsule3D,
    world: &mut CollisionCapsule3D,
) {
    let a = rotate_point(qx, qy, qz, qw, local.x0, local.y0, local.z0);
    let b = rotate_point(qx, qy, qz, qw, local.x1, local.y1, local.z1);
    *world = CollisionCapsule3D {
        x0: body.x + a[0],
        y0: body.y + a[1],
        z0: body.z + a[2],
        x1: body.x + b[0],
        y1: body.y + b[1],
        z1: body.z + b[2],
        radius: local.radius,
    };
}

pub fn update_physics_3d_collider_world_shape(
    collider: &mut Physics3DCollider,
    body: &RigidBody3D,
) {
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    match (&collider.local, &mut collider.world) {
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(world)),
        ) => {
            let p = rotate_point(qx, qy, qz, qw, local.x, local.y, local.z);
            *world = CollisionSphere3D {
                x: body.x + p[0],
                y: body.y + p[1],
                z: body.z + p[2],
                radius: local.radius,
            };
        }
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(world)),
        ) => {
            let center = [
                (local.min_x + local.max_x) * 0.5,
                (local.min_y + local.max_y) * 0.5,
                (local.min_z + local.max_z) * 0.5,
            ];
            let p = rotate_point(qx, qy, qz, qw, center[0], center[1], center[2]);
            *world = CollisionBox3D {
                x: body.x + p[0],
                y: body.y + p[1],
                z: body.z + p[2],
                half_x: (local.max_x - local.min_x) * 0.5,
                half_y: (local.max_y - local.min_y) * 0.5,
                half_z: (local.max_z - local.min_z) * 0.5,
                rotation_x: qx,
                rotation_y: qy,
                rotation_z: qz,
                rotation_w: qw,
            };
        }
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(world)),
        ) => {
            let p = rotate_point(qx, qy, qz, qw, local.x, local.y, local.z);
            *world = CollisionBox3D {
                x: body.x + p[0],
                y: body.y + p[1],
                z: body.z + p[2],
                half_x: local.half_x,
                half_y: local.half_y,
                half_z: local.half_z,
                rotation_x: qw * local.rotation_x + qx * local.rotation_w + qy * local.rotation_z
                    - qz * local.rotation_y,
                rotation_y: qw * local.rotation_y - qx * local.rotation_z
                    + qy * local.rotation_w
                    + qz * local.rotation_x,
                rotation_z: qw * local.rotation_z + qx * local.rotation_y - qy * local.rotation_x
                    + qz * local.rotation_w,
                rotation_w: qw * local.rotation_w
                    - qx * local.rotation_x
                    - qy * local.rotation_y
                    - qz * local.rotation_z,
            };
        }
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(world)),
        ) => transform_segment_shape(body, qx, qy, qz, qw, local, world),
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cylinder(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cylinder(world)),
        ) => transform_cylinder(body, qx, qy, qz, qw, local, world),
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cone(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Cone(world)),
        ) => transform_cone(body, qx, qy, qz, qw, local, world),
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(local)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(world)),
        ) => {
            world.points.resize(local.points.len(), 0.0);
            for (source, target) in local
                .points
                .chunks_exact(3)
                .zip(world.points.chunks_exact_mut(3))
            {
                let p = rotate_point(qx, qy, qz, qw, source[0], source[1], source[2]);
                target.copy_from_slice(&[body.x + p[0], body.y + p[1], body.z + p[2]]);
            }
        }
        (
            CollisionColliderShape3D::TriangleMesh(local),
            CollisionColliderShape3D::TriangleMesh(world),
        ) => {
            let local = local.read().unwrap();
            let mut world = world.write().unwrap();
            let p = rotate_point(qx, qy, qz, qw, local.x, local.y, local.z);
            world.x = body.x + p[0];
            world.y = body.y + p[1];
            world.z = body.z + p[2];
            let rotation = compose_rotation(
                body,
                local.rotation_x,
                local.rotation_y,
                local.rotation_z,
                local.rotation_w,
            );
            world.rotation_x = rotation[0];
            world.rotation_y = rotation[1];
            world.rotation_z = rotation[2];
            world.rotation_w = rotation[3];
            world.points.clone_from(&local.points);
            world.indices.clone_from(&local.indices);
            world.version = local.version;
        }
        (
            CollisionColliderShape3D::Heightfield(local),
            CollisionColliderShape3D::Heightfield(world),
        ) => {
            let local = local.read().unwrap();
            let mut world = world.write().unwrap();
            let p = rotate_point(qx, qy, qz, qw, local.x, local.y, local.z);
            world.x = body.x + p[0];
            world.y = body.y + p[1];
            world.z = body.z + p[2];
            let rotation = compose_rotation(
                body,
                local.rotation_x,
                local.rotation_y,
                local.rotation_z,
                local.rotation_w,
            );
            world.rotation_x = rotation[0];
            world.rotation_y = rotation[1];
            world.rotation_z = rotation[2];
            world.rotation_w = rotation[3];
            world.columns = local.columns;
            world.rows = local.rows;
            world.heights.clone_from(&local.heights);
            world.cell_size_x = local.cell_size_x;
            world.cell_size_z = local.cell_size_z;
            world.version = local.version;
        }
        _ => {}
    }
}

#[allow(clippy::too_many_arguments)]
fn write_axial_bounds(
    x0: f32,
    y0: f32,
    z0: f32,
    x1: f32,
    y1: f32,
    z1: f32,
    r: f32,
    cone: bool,
    out: &mut SpatialAabb3D,
) {
    let e = disc_extent(x1 - x0, y1 - y0, z1 - z0, r);
    if cone {
        *out = SpatialAabb3D {
            min_x: x0.min(x1 - e[0]),
            min_y: y0.min(y1 - e[1]),
            min_z: z0.min(z1 - e[2]),
            max_x: x0.max(x1 + e[0]),
            max_y: y0.max(y1 + e[1]),
            max_z: z0.max(z1 + e[2]),
        };
    } else {
        *out = SpatialAabb3D {
            min_x: x0.min(x1) - e[0],
            min_y: y0.min(y1) - e[1],
            min_z: z0.min(z1) - e[2],
            max_x: x0.max(x1) + e[0],
            max_y: y0.max(y1) + e[1],
            max_z: z0.max(z1) + e[2],
        };
    }
}

fn write_builtin_bounds(shape: &CollisionShape3D, out: &mut SpatialAabb3D) {
    match shape {
        CollisionShape3D::Sphere(s) => {
            *out = SpatialAabb3D {
                min_x: s.x - s.radius,
                min_y: s.y - s.radius,
                min_z: s.z - s.radius,
                max_x: s.x + s.radius,
                max_y: s.y + s.radius,
                max_z: s.z + s.radius,
            }
        }
        CollisionShape3D::Aabb(a) => {
            *out = SpatialAabb3D {
                min_x: a.min_x,
                min_y: a.min_y,
                min_z: a.min_z,
                max_x: a.max_x,
                max_y: a.max_y,
                max_z: a.max_z,
            }
        }
        CollisionShape3D::Box(b) => {
            let (x, y, z, w) = (b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w);
            let ex = (1.0 - 2.0 * (y * y + z * z)).abs() * b.half_x
                + (2.0 * (x * y - w * z)).abs() * b.half_y
                + (2.0 * (x * z + w * y)).abs() * b.half_z;
            let ey = (2.0 * (x * y + w * z)).abs() * b.half_x
                + (1.0 - 2.0 * (x * x + z * z)).abs() * b.half_y
                + (2.0 * (y * z - w * x)).abs() * b.half_z;
            let ez = (2.0 * (x * z - w * y)).abs() * b.half_x
                + (2.0 * (y * z + w * x)).abs() * b.half_y
                + (1.0 - 2.0 * (x * x + y * y)).abs() * b.half_z;
            *out = SpatialAabb3D {
                min_x: b.x - ex,
                min_y: b.y - ey,
                min_z: b.z - ez,
                max_x: b.x + ex,
                max_y: b.y + ey,
                max_z: b.z + ez,
            };
        }
        CollisionShape3D::Capsule(s) => {
            write_segment_bounds(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.radius, out)
        }
        CollisionShape3D::Cylinder(s) => {
            write_axial_bounds(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.radius, false, out)
        }
        CollisionShape3D::Cone(s) => {
            write_axial_bounds(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.radius, true, out)
        }
        CollisionShape3D::Convex(c) => {
            let Some(first) = c.points.get(0..3) else {
                *out = SpatialAabb3D::default();
                return;
            };
            *out = SpatialAabb3D {
                min_x: first[0],
                min_y: first[1],
                min_z: first[2],
                max_x: first[0],
                max_y: first[1],
                max_z: first[2],
            };
            for p in c.points[3..].chunks_exact(3) {
                out.min_x = out.min_x.min(p[0]);
                out.max_x = out.max_x.max(p[0]);
                out.min_y = out.min_y.min(p[1]);
                out.max_y = out.max_y.max(p[1]);
                out.min_z = out.min_z.min(p[2]);
                out.max_z = out.max_z.max(p[2]);
            }
        }
    }
}

pub fn write_physics_3d_collider_bounds(collider: &Physics3DCollider, out: &mut SpatialAabb3D) {
    match &collider.world {
        CollisionColliderShape3D::BuiltIn(shape) => write_builtin_bounds(shape, out),
        CollisionColliderShape3D::TriangleMesh(shape) => {
            let mut bounds = CollisionAabb3D::default();
            write_collision_triangle_mesh_bounds3d(&shape.read().unwrap(), &mut bounds);
            copy_collision_bounds(&bounds, out);
        }
        CollisionColliderShape3D::Heightfield(shape) => {
            let mut bounds = CollisionAabb3D::default();
            write_collision_heightfield_bounds3d(&shape.read().unwrap(), &mut bounds);
            copy_collision_bounds(&bounds, out);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn write_segment_bounds(
    x0: f32,
    y0: f32,
    z0: f32,
    x1: f32,
    y1: f32,
    z1: f32,
    r: f32,
    out: &mut SpatialAabb3D,
) {
    *out = SpatialAabb3D {
        min_x: x0.min(x1) - r,
        min_y: y0.min(y1) - r,
        min_z: z0.min(z1) - r,
        max_x: x0.max(x1) + r,
        max_y: y0.max(y1) + r,
        max_z: z0.max(z1) + r,
    };
}
