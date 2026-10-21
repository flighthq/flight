// flight-lint: allow-file(conform-params) D5: collision registry is explicit caller-owned state
use std::collections::BTreeSet;

use flight_collision::{
    CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D, get_collision_support3d,
};

use crate::*;

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the explanation writes into a caller-owned out and reuses its collection storage
pub fn explain_physics_3d_collision(
    out: &mut Physics3DCollisionExplanation,
    world: &Physics3DWorld,
    registry: &CollisionRegistry3D,
) {
    let mut unsupported = BTreeSet::new();
    for body in &world.bodies {
        for collider in &body.read().unwrap().colliders {
            let collider = collider.read().unwrap();
            let CollisionColliderShape3D::BuiltIn(shape) = &collider.world else {
                continue;
            };
            let kind = shape_kind(shape);
            if get_collision_support3d(registry, kind).is_none() {
                unsupported.insert(kind.to_string());
            }
        }
    }
    out.unsupported_kinds.clear();
    out.unsupported_kinds.extend(unsupported);
    out.status = if out.unsupported_kinds.is_empty() {
        Physics3DCollisionStatus::Ready
    } else {
        Physics3DCollisionStatus::MissingSupport
    };
}

fn shape_kind(shape: &CollisionShape3D) -> &'static str {
    match shape {
        CollisionShape3D::Sphere(_) => "sphere",
        CollisionShape3D::Aabb(_) => "aabb",
        CollisionShape3D::Box(_) => "box",
        CollisionShape3D::Capsule(_) => "capsule",
        CollisionShape3D::Cylinder(_) => "cylinder",
        CollisionShape3D::Cone(_) => "cone",
        CollisionShape3D::Convex(_) => "convex",
    }
}
