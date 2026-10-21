use crate::gjk2d::*;
use crate::manifold2d::*;
use crate::types::*;

const SWEEP_TOUCH_TOLERANCE: f64 = 1e-6;
const MAX_SWEEP_ITERATIONS: usize = 32;
const EPSILON: f64 = 1e-12;

pub fn create_collision_time_of_impact2d() -> CollisionTimeOfImpact2D {
    let mut out: CollisionTimeOfImpact2D = flight_entity::allocate_entity();
    initialize_collision_time_of_impact2d(&mut out);
    return out;
}

pub fn initialize_collision_time_of_impact2d(out: &mut CollisionTimeOfImpact2D) {
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
}

pub fn sweep_collision_shape2d(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    velocity_x: f64,
    velocity_y: f64,
    out: &mut CollisionTimeOfImpact2D,
) -> bool {
    initialize_collision_time_of_impact2d(out);

    // Check if already overlapping at t=0
    let mut manifold = create_collision_manifold2d();
    if test_collision_support2d(a, b, &mut manifold) {
        out.fraction = 0.0;
        out.normal_x = manifold.normal_x;
        out.normal_y = manifold.normal_y;
        return true;
    }

    let vel_len = (velocity_x * velocity_x + velocity_y * velocity_y).sqrt();
    if vel_len < EPSILON {
        return false;
    }

    // Conservative advancement: binary search along the velocity vector
    let mut t_low = 0.0_f64;
    let mut t_high = 1.0_f64;
    let mut last_normal_x = 0.0_f64;
    let mut last_normal_y = 0.0_f64;
    let mut found = false;

    for _iteration in 0..MAX_SWEEP_ITERATIONS {
        let t_mid = (t_low + t_high) * 0.5;
        let shifted_a = translate_shape2d(a, velocity_x * t_mid, velocity_y * t_mid);

        if test_collision_support2d(&shifted_a, b, &mut manifold) {
            t_high = t_mid;
            last_normal_x = manifold.normal_x;
            last_normal_y = manifold.normal_y;
            found = true;
            if manifold.depth < SWEEP_TOUCH_TOLERANCE {
                break;
            }
        } else {
            t_low = t_mid;
        }
    }

    if found {
        out.fraction = t_high;
        out.x = velocity_x * t_high;
        out.y = velocity_y * t_high;
        out.normal_x = last_normal_x;
        out.normal_y = last_normal_y;
        return true;
    }

    return false;
}

fn translate_shape2d(shape: &CollisionShape2D, dx: f64, dy: f64) -> CollisionShape2D {
    match shape {
        CollisionShape2D::Circle(c) => {
            CollisionShape2D::Circle(CollisionCircle2D {
                x: c.x + dx, y: c.y + dy, radius: c.radius,
            })
        }
        CollisionShape2D::Aabb(a) => {
            CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: a.min_x + dx, min_y: a.min_y + dy,
                max_x: a.max_x + dx, max_y: a.max_y + dy,
            })
        }
        CollisionShape2D::Obb(o) => {
            CollisionShape2D::Obb(CollisionObb2D {
                x: o.x + dx, y: o.y + dy,
                half_w: o.half_w, half_h: o.half_h,
                rotation: o.rotation,
            })
        }
        CollisionShape2D::Polygon(p) => {
            let mut pts = p.points.clone();
            let count = pts.len() / 2;
            for i in 0..count {
                pts[i * 2] += dx;
                pts[i * 2 + 1] += dy;
            }
            CollisionShape2D::Polygon(CollisionPolygon2D { points: pts })
        }
        CollisionShape2D::Capsule(c) => {
            CollisionShape2D::Capsule(CollisionCapsule2D {
                x0: c.x0 + dx, y0: c.y0 + dy,
                x1: c.x1 + dx, y1: c.y1 + dy,
                radius: c.radius,
            })
        }
        CollisionShape2D::Segment(s) => {
            CollisionShape2D::Segment(CollisionSegment2D {
                x0: s.x0 + dx, y0: s.y0 + dy,
                x1: s.x1 + dx, y1: s.y1 + dy,
            })
        }
        CollisionShape2D::Point(p) => {
            CollisionShape2D::Point(CollisionPoint2D {
                x: p.x + dx, y: p.y + dy,
            })
        }
    }
}
