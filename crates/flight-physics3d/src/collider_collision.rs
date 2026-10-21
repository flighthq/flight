// flight-lint: allow-file(conform-params) D5/D9b: collision registry is explicit and native result writers keep output first
use flight_collision::{
    CollisionColliderShape3D, CollisionContactManifold3D, CollisionRaycastHit3D,
    CollisionRegistry3D, CollisionTimeOfImpact3D, collide_collision_heightfield3d,
    collide_collision_triangle_mesh3d, collide_contact_manifold3d, raycast_collision_heightfield3d,
    raycast_collision_shape3d, raycast_collision_triangle_mesh3d, sweep_collision_heightfield3d,
    sweep_collision_shape3d, sweep_collision_triangle_mesh3d,
};

pub fn collide_physics_3d_collider_shapes(
    out: &mut CollisionContactManifold3D,
    registry: &CollisionRegistry3D,
    shape_a: &CollisionColliderShape3D,
    shape_b: &CollisionColliderShape3D,
) -> bool {
    let hit = match (shape_a, shape_b) {
        (CollisionColliderShape3D::TriangleMesh(_), CollisionColliderShape3D::TriangleMesh(_))
        | (CollisionColliderShape3D::TriangleMesh(_), CollisionColliderShape3D::Heightfield(_))
        | (CollisionColliderShape3D::Heightfield(_), CollisionColliderShape3D::TriangleMesh(_))
        | (CollisionColliderShape3D::Heightfield(_), CollisionColliderShape3D::Heightfield(_)) => {
            false
        }
        (CollisionColliderShape3D::TriangleMesh(a), CollisionColliderShape3D::BuiltIn(b)) => {
            let hit = collide_collision_triangle_mesh3d(out, registry, b, &a.read().unwrap());
            if hit {
                reverse_manifold_normal(out);
            }
            hit
        }
        (CollisionColliderShape3D::Heightfield(a), CollisionColliderShape3D::BuiltIn(b)) => {
            let hit = collide_collision_heightfield3d(out, registry, b, &a.read().unwrap());
            if hit {
                reverse_manifold_normal(out);
            }
            hit
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::TriangleMesh(b)) => {
            collide_collision_triangle_mesh3d(out, registry, a, &b.read().unwrap())
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::Heightfield(b)) => {
            collide_collision_heightfield3d(out, registry, a, &b.read().unwrap())
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::BuiltIn(b)) => {
            collide_contact_manifold3d(registry, a, b, out)
        }
    };
    return hit;
}

#[allow(clippy::too_many_arguments)]
pub fn raycast_physics_3d_collider_shape(
    out: &mut CollisionRaycastHit3D,
    shape: &CollisionColliderShape3D,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
) -> bool {
    return match shape {
        CollisionColliderShape3D::BuiltIn(shape) => raycast_collision_shape3d(
            out,
            shape,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
        ),
        CollisionColliderShape3D::TriangleMesh(shape) => raycast_collision_triangle_mesh3d(
            out,
            &shape.read().unwrap(),
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
        ),
        CollisionColliderShape3D::Heightfield(shape) => raycast_collision_heightfield3d(
            out,
            &shape.read().unwrap(),
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
        ),
    };
}

fn reverse_manifold_normal(out: &mut CollisionContactManifold3D) {
    out.normal_x = -out.normal_x;
    out.normal_y = -out.normal_y;
    out.normal_z = -out.normal_z;
}

fn reverse_toi_normal(out: &mut CollisionTimeOfImpact3D) {
    out.normal_x = -out.normal_x;
    out.normal_y = -out.normal_y;
    out.normal_z = -out.normal_z;
}

#[allow(clippy::too_many_arguments)]
pub fn sweep_physics_3d_collider_shapes(
    out: &mut CollisionTimeOfImpact3D,
    registry: &CollisionRegistry3D,
    shape_a: &CollisionColliderShape3D,
    delta_ax: f32,
    delta_ay: f32,
    delta_az: f32,
    shape_b: &CollisionColliderShape3D,
    delta_bx: f32,
    delta_by: f32,
    delta_bz: f32,
    max_fraction: Option<f32>,
) -> bool {
    let hit = match (shape_a, shape_b) {
        (CollisionColliderShape3D::TriangleMesh(_), CollisionColliderShape3D::TriangleMesh(_))
        | (CollisionColliderShape3D::TriangleMesh(_), CollisionColliderShape3D::Heightfield(_))
        | (CollisionColliderShape3D::Heightfield(_), CollisionColliderShape3D::TriangleMesh(_))
        | (CollisionColliderShape3D::Heightfield(_), CollisionColliderShape3D::Heightfield(_)) => {
            false
        }
        (CollisionColliderShape3D::TriangleMesh(a), CollisionColliderShape3D::BuiltIn(b)) => {
            let hit = sweep_collision_triangle_mesh3d(
                out,
                registry,
                b,
                delta_bx - delta_ax,
                delta_by - delta_ay,
                delta_bz - delta_az,
                &a.read().unwrap(),
                max_fraction,
            );
            if hit {
                reverse_toi_normal(out);
            }
            hit
        }
        (CollisionColliderShape3D::Heightfield(a), CollisionColliderShape3D::BuiltIn(b)) => {
            let hit = sweep_collision_heightfield3d(
                out,
                registry,
                b,
                delta_bx - delta_ax,
                delta_by - delta_ay,
                delta_bz - delta_az,
                &a.read().unwrap(),
                max_fraction,
            );
            if hit {
                reverse_toi_normal(out);
            }
            hit
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::TriangleMesh(b)) => {
            sweep_collision_triangle_mesh3d(
                out,
                registry,
                a,
                delta_ax - delta_bx,
                delta_ay - delta_by,
                delta_az - delta_bz,
                &b.read().unwrap(),
                max_fraction,
            )
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::Heightfield(b)) => {
            sweep_collision_heightfield3d(
                out,
                registry,
                a,
                delta_ax - delta_bx,
                delta_ay - delta_by,
                delta_az - delta_bz,
                &b.read().unwrap(),
                max_fraction,
            )
        }
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::BuiltIn(b)) => {
            sweep_collision_shape3d(
                out,
                registry,
                a,
                delta_ax,
                delta_ay,
                delta_az,
                b,
                delta_bx,
                delta_by,
                delta_bz,
                max_fraction,
            )
        }
    };
    return hit;
}
