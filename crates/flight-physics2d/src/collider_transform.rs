//! Local-to-world collider shapes and their bounds (TS `colliderTransform.ts`). World shapes are
//! plain collision shapes (D12 recorded exception), so the `kind` parameter of each source
//! initializer is the enum variant itself.

use flight_collision::{
    CollisionCapsule2D, CollisionCircle2D, CollisionObb2D, CollisionPoint2D, CollisionPolygon2D,
    CollisionSegment2D, CollisionShape2D,
};
use flight_spatial::SpatialAabb2D;

use crate::material::{js_max, js_min};
use crate::types::*;

/// Allocates the world-space shape a local shape transforms into (TS
/// `createPhysics2DColliderWorldShape`). An aabb becomes an obb, because a rotated axis-aligned box
/// is no longer axis-aligned; dimensions that only the transform supplies start at zero.
pub fn create_physics2d_collider_world_shape(local: &CollisionShape2D) -> CollisionShape2D {
    return match local {
        CollisionShape2D::Circle(local) => {
            let mut out = CollisionCircle2D::default();
            initialize_collision_circle2d(&mut out, local.radius, local.x, local.y);
            CollisionShape2D::Circle(out)
        }
        CollisionShape2D::Aabb(_) | CollisionShape2D::Obb(_) => {
            let mut out = CollisionObb2D::default();
            initialize_collision_obb2d(&mut out, 0.0, 0.0, 0.0, 0.0, 0.0);
            CollisionShape2D::Obb(out)
        }
        CollisionShape2D::Capsule(local) => {
            let mut out = CollisionCapsule2D::default();
            initialize_collision_capsule2d(&mut out, local.radius, 0.0, 0.0, 0.0, 0.0);
            CollisionShape2D::Capsule(out)
        }
        CollisionShape2D::Polygon(local) => {
            let mut out = CollisionPolygon2D::default();
            initialize_collision_polygon2d(&mut out, local.points.clone());
            CollisionShape2D::Polygon(out)
        }
        CollisionShape2D::Segment(local) => {
            let mut out = CollisionSegment2D::default();
            initialize_collision_segment2d(&mut out, local.x0, local.x1, local.y0, local.y1);
            CollisionShape2D::Segment(out)
        }
        CollisionShape2D::Point(local) => {
            let mut out = CollisionPoint2D::default();
            initialize_collision_point2d(&mut out, local.x, local.y);
            CollisionShape2D::Point(out)
        }
    };
}

/// The construction initializer of a capsule world shape (TS `initializeCollisionCapsule2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
pub fn initialize_collision_capsule2d(out: &mut CollisionCapsule2D, radius: f32, x0: f32, x1: f32, y0: f32, y1: f32) {
    out.radius = radius;
    out.x0 = x0;
    out.x1 = x1;
    out.y0 = y0;
    out.y1 = y1;
}

/// The construction initializer of a circle world shape (TS `initializeCollisionCircle2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
// flight-lint: allow(f64) D1: the canonical CollisionCircle2D is f64 (measured in flight-collision)
pub fn initialize_collision_circle2d(out: &mut CollisionCircle2D, radius: f64, x: f64, y: f64) {
    out.radius = radius;
    out.x = x;
    out.y = y;
}

/// The construction initializer of an oriented-box world shape (TS `initializeCollisionObb2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
pub fn initialize_collision_obb2d(out: &mut CollisionObb2D, half_h: f32, half_w: f32, rotation: f32, x: f32, y: f32) {
    out.half_h = half_h;
    out.half_w = half_w;
    out.rotation = rotation;
    out.x = x;
    out.y = y;
}

/// The construction initializer of a point world shape (TS `initializeCollisionPoint2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
pub fn initialize_collision_point2d(out: &mut CollisionPoint2D, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}

/// The construction initializer of a polygon world shape (TS `initializeCollisionPolygon2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
// flight-lint: allow(f64) D1: the canonical CollisionPolygon2D points are f64 (measured in flight-collision)
pub fn initialize_collision_polygon2d(out: &mut CollisionPolygon2D, points: Vec<f64>) {
    out.points = points;
}

/// The construction initializer of a segment world shape (TS `initializeCollisionSegment2D`).
// flight-lint: allow(conform-params) D12: world shapes are plain collision shapes, so `kind` is the enum variant
pub fn initialize_collision_segment2d(out: &mut CollisionSegment2D, x0: f32, x1: f32, y0: f32, y1: f32) {
    out.x0 = x0;
    out.x1 = x1;
    out.y0 = y0;
    out.y1 = y1;
}

/// Rewrites the collider's world shape from its local shape and the body's pose (TS
/// `updatePhysics2DColliderWorldShape`). A world shape of the wrong kind is left untouched.
// flight-lint: allow(f64) D1: circle and polygon world coordinates are the canonical f64 collision fields
pub fn update_physics2d_collider_world_shape(collider: &mut Physics2DCollider, body: &RigidBody2D) {
    let cos = body.angle.cos();
    let sin = body.angle.sin();
    let local = &collider.local;
    match (local, &mut collider.world) {
        (CollisionShape2D::Circle(local), CollisionShape2D::Circle(world)) => {
            let (cos, sin) = ((body.angle as f64).cos(), (body.angle as f64).sin());
            world.x = body.x as f64 + local.x * cos - local.y * sin;
            world.y = body.y as f64 + local.x * sin + local.y * cos;
            world.radius = local.radius;
        }
        (CollisionShape2D::Aabb(local), CollisionShape2D::Obb(world)) => {
            let center_x = (local.min_x + local.max_x) / 2.0;
            let center_y = (local.min_y + local.max_y) / 2.0;
            world.x = body.x + center_x * cos - center_y * sin;
            world.y = body.y + center_x * sin + center_y * cos;
            world.half_w = (local.max_x - local.min_x) / 2.0;
            world.half_h = (local.max_y - local.min_y) / 2.0;
            world.rotation = body.angle;
        }
        (CollisionShape2D::Obb(local), CollisionShape2D::Obb(world)) => {
            world.x = body.x + local.x * cos - local.y * sin;
            world.y = body.y + local.x * sin + local.y * cos;
            world.half_w = local.half_w;
            world.half_h = local.half_h;
            world.rotation = body.angle + local.rotation;
        }
        (CollisionShape2D::Polygon(local), CollisionShape2D::Polygon(world)) => {
            let (cos, sin) = ((body.angle as f64).cos(), (body.angle as f64).sin());
            let (body_x, body_y) = (body.x as f64, body.y as f64);
            let mut i = 0;
            while i + 1 < local.points.len() {
                let x = local.points[i];
                let y = local.points[i + 1];
                if world.points.len() < i + 2 {
                    world.points.resize(i + 2, 0.0);
                }
                world.points[i] = body_x + x * cos - y * sin;
                world.points[i + 1] = body_y + x * sin + y * cos;
                i += 2;
            }
        }
        (CollisionShape2D::Capsule(local), CollisionShape2D::Capsule(world)) => {
            world.x0 = body.x + local.x0 * cos - local.y0 * sin;
            world.y0 = body.y + local.x0 * sin + local.y0 * cos;
            world.x1 = body.x + local.x1 * cos - local.y1 * sin;
            world.y1 = body.y + local.x1 * sin + local.y1 * cos;
            world.radius = local.radius;
        }
        (CollisionShape2D::Segment(local), CollisionShape2D::Segment(world)) => {
            world.x0 = body.x + local.x0 * cos - local.y0 * sin;
            world.y0 = body.y + local.x0 * sin + local.y0 * cos;
            world.x1 = body.x + local.x1 * cos - local.y1 * sin;
            world.y1 = body.y + local.x1 * sin + local.y1 * cos;
        }
        (CollisionShape2D::Point(local), CollisionShape2D::Point(world)) => {
            world.x = body.x + local.x * cos - local.y * sin;
            world.y = body.y + local.x * sin + local.y * cos;
        }
        _ => {}
    }
}

/// Writes the world shape's axis-aligned bounds (TS `writePhysics2DColliderBounds`).
// flight-lint: allow(conform-params) D9b: out-first
// flight-lint: allow(f64) D1: circle and polygon world coordinates are the canonical f64 collision fields
pub fn write_physics2d_collider_bounds(out: &mut SpatialAabb2D, collider: &Physics2DCollider) {
    match &collider.world {
        CollisionShape2D::Circle(shape) => {
            out.min_x = (shape.x - shape.radius) as f32;
            out.min_y = (shape.y - shape.radius) as f32;
            out.max_x = (shape.x + shape.radius) as f32;
            out.max_y = (shape.y + shape.radius) as f32;
        }
        CollisionShape2D::Aabb(shape) => {
            out.min_x = shape.min_x;
            out.min_y = shape.min_y;
            out.max_x = shape.max_x;
            out.max_y = shape.max_y;
        }
        CollisionShape2D::Obb(shape) => {
            let cos = shape.rotation.cos().abs();
            let sin = shape.rotation.sin().abs();
            let extent_x = shape.half_w * cos + shape.half_h * sin;
            let extent_y = shape.half_w * sin + shape.half_h * cos;
            out.min_x = shape.x - extent_x;
            out.min_y = shape.y - extent_y;
            out.max_x = shape.x + extent_x;
            out.max_y = shape.y + extent_y;
        }
        CollisionShape2D::Polygon(shape) => {
            let points = &shape.points;
            if points.len() < 2 {
                out.min_x = 0.0;
                out.min_y = 0.0;
                out.max_x = 0.0;
                out.max_y = 0.0;
                return;
            }
            let mut min_x = points[0];
            let mut min_y = points[1];
            let mut max_x = min_x;
            let mut max_y = min_y;
            let mut i = 2;
            while i < points.len() {
                let x = points[i];
                let y = points.get(i + 1).copied().unwrap_or(f64::NAN);
                if x < min_x {
                    min_x = x;
                } else if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                } else if y > max_y {
                    max_y = y;
                }
                i += 2;
            }
            out.min_x = min_x as f32;
            out.min_y = min_y as f32;
            out.max_x = max_x as f32;
            out.max_y = max_y as f32;
        }
        CollisionShape2D::Capsule(shape) => {
            out.min_x = js_min(shape.x0, shape.x1) - shape.radius;
            out.min_y = js_min(shape.y0, shape.y1) - shape.radius;
            out.max_x = js_max(shape.x0, shape.x1) + shape.radius;
            out.max_y = js_max(shape.y0, shape.y1) + shape.radius;
        }
        CollisionShape2D::Segment(shape) => {
            out.min_x = js_min(shape.x0, shape.x1);
            out.min_y = js_min(shape.y0, shape.y1);
            out.max_x = js_max(shape.x0, shape.x1);
            out.max_y = js_max(shape.y0, shape.y1);
        }
        CollisionShape2D::Point(shape) => {
            out.min_x = shape.x;
            out.min_y = shape.y;
            out.max_x = shape.x;
            out.max_y = shape.y;
        }
    }
}
