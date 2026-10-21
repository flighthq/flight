//! Which collider kinds generate no contacts (TS `explainPhysics2DCollision.ts`).

use flight_collision::CollisionShape2D;

use crate::types::*;

/// The sorted distinct world-shape kinds that enclose no area and so produce no contacts (TS
/// `explainPhysics2DCollision`).
pub fn explain_physics2d_collision(world: &Physics2DWorld) -> Physics2DCollisionExplanation {
    let mut unsupported_kinds: Vec<String> = Vec::new();
    for body in &world.bodies {
        for collider in &body.read().unwrap().colliders {
            let collider = collider.read().unwrap();
            let kind = match &collider.world {
                CollisionShape2D::Circle(_)
                | CollisionShape2D::Capsule(_)
                | CollisionShape2D::Aabb(_)
                | CollisionShape2D::Obb(_)
                | CollisionShape2D::Polygon(_) => continue,
                CollisionShape2D::Segment(_) => "segment",
                CollisionShape2D::Point(_) => "point",
            };
            if !unsupported_kinds.iter().any(|existing| existing == kind) {
                unsupported_kinds.push(kind.to_string());
            }
        }
    }
    unsupported_kinds.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let status = if unsupported_kinds.is_empty() {
        Physics2DCollisionStatus::Ready
    } else {
        Physics2DCollisionStatus::MissingContactSupport
    };
    return Physics2DCollisionExplanation { status, unsupported_kinds };
}
