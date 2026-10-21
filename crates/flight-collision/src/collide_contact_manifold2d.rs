use crate::capsule_contact2d::*;
use crate::contact_manifold2d::*;
use crate::shape_contact2d::*;
use crate::types::*;

pub fn collide_contact_manifold2d(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);

    let rank_a = contact_shape_kind_rank(a.kind());
    let rank_b = contact_shape_kind_rank(b.kind());

    // Area-less kinds cannot produce contact manifolds
    if rank_a < 0 || rank_b < 0 {
        return false;
    }

    // Ensure a has lower or equal rank
    if rank_a <= rank_b {
        return dispatch_contact(a, b, false, out);
    } else {
        let result = dispatch_contact(b, a, true, out);
        if result {
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
        }
        return result;
    }
}

/// Rank for shape dispatch ordering. Lower rank shapes go as the first argument.
fn contact_shape_kind_rank(kind: CollisionShapeKind2D) -> i32 {
    match kind {
        CollisionShapeKind2D::Circle => 0,
        CollisionShapeKind2D::Capsule => 1,
        CollisionShapeKind2D::Aabb => 2,
        CollisionShapeKind2D::Obb => 3,
        CollisionShapeKind2D::Polygon => 4,
        _ => -1,
    }
}

fn dispatch_contact(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    _swapped: bool,
    out: &mut CollisionContactManifold2D,
) -> bool {
    match (a, b) {
        // Circle pairs
        (CollisionShape2D::Circle(ca), CollisionShape2D::Circle(cb)) => {
            collide_circle_circle_contact(ca, cb, out)
        }
        (CollisionShape2D::Circle(ca), CollisionShape2D::Capsule(cb)) => {
            collide_circle_capsule(ca, cb, out)
        }
        (CollisionShape2D::Circle(ca), CollisionShape2D::Aabb(ab)) => {
            collide_circle_aabb_contact(ca, ab, out)
        }
        (CollisionShape2D::Circle(ca), CollisionShape2D::Obb(ob)) => {
            collide_circle_obb_contact(ca, ob, out)
        }
        (CollisionShape2D::Circle(ca), CollisionShape2D::Polygon(pb)) => {
            collide_circle_polygon_contact(ca, pb, out)
        }
        // Capsule pairs
        (CollisionShape2D::Capsule(ca), CollisionShape2D::Capsule(cb)) => {
            collide_capsule_capsule(ca, cb, out)
        }
        (CollisionShape2D::Capsule(ca), CollisionShape2D::Aabb(ab)) => {
            collide_capsule_aabb(ca, ab, out)
        }
        (CollisionShape2D::Capsule(ca), CollisionShape2D::Obb(ob)) => {
            collide_capsule_obb(ca, ob, out)
        }
        (CollisionShape2D::Capsule(ca), CollisionShape2D::Polygon(pb)) => {
            collide_capsule_polygon(ca, pb, out)
        }
        // Convex pairs (AABB, OBB, Polygon)
        (CollisionShape2D::Aabb(aa), CollisionShape2D::Aabb(ab)) => {
            collide_aabb_aabb_contact(aa, ab, out)
        }
        (CollisionShape2D::Aabb(aa), CollisionShape2D::Obb(ob)) => {
            collide_aabb_obb_contact(aa, ob, out)
        }
        (CollisionShape2D::Aabb(aa), CollisionShape2D::Polygon(pb)) => {
            collide_aabb_polygon_contact(aa, pb, out)
        }
        (CollisionShape2D::Obb(oa), CollisionShape2D::Obb(ob)) => {
            collide_obb_obb_contact(oa, ob, out)
        }
        (CollisionShape2D::Obb(oa), CollisionShape2D::Polygon(pb)) => {
            collide_obb_polygon_contact(oa, pb, out)
        }
        (CollisionShape2D::Polygon(pa), CollisionShape2D::Polygon(pb)) => {
            collide_polygon_polygon_contact(pa, pb, out)
        }
        _ => false,
    }
}
