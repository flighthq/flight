use std::sync::Arc;

use crate::collision_support2d::*;
use crate::gjk2d::*;
use crate::manifold2d::*;
use crate::types::*;

const SWEEP_TOUCH_TOLERANCE: f32 = 1e-6;
const MAX_SWEEP_ITERATIONS: usize = 32;
const EPSILON: f32 = 1e-12;

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

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn sweep_collision_shape2d(
    out: &mut CollisionTimeOfImpact2D,
    registry: &CollisionRegistry2D,
    shape_a: &CollisionShape2D,
    translation_ax: f32,
    translation_ay: f32,
    shape_b: &CollisionShape2D,
    translation_bx: f32,
    translation_by: f32,
    max_fraction: Option<f32>,
) -> bool {
    initialize_collision_time_of_impact2d(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    if !translation_ax.is_finite()
        || !translation_ay.is_finite()
        || !translation_bx.is_finite()
        || !translation_by.is_finite()
        || !max_fraction.is_finite()
        || max_fraction < 0.0
        || crate::collision_shape_validation2d::get_collision_shape_validation_status2d(shape_a).is_some()
        || crate::collision_shape_validation2d::get_collision_shape_validation_status2d(shape_b).is_some()
    {
        return false;
    }
    let translation_x = translation_ax - translation_bx;
    let translation_y = translation_ay - translation_by;

    // The source sweep supports capsules through its dedicated analytic path even though capsules
    // are deliberately absent from the generic four-kind support registry. This IR implementation
    // retains its incumbent conservative-advancement algorithm, so give only this operation a local
    // capsule adapter while preserving a caller override when one is present.
    let mut sweep_registry = registry.clone();
    if get_collision_support2d(&sweep_registry, "capsule").is_none() {
        register_collision_support2d(
            &mut sweep_registry,
            "capsule",
            Arc::new(|shape, direction_x, direction_y, support_out| {
                if let CollisionShape2D::Capsule(shape) = shape {
                    support_collision_capsule2d(shape, direction_x, direction_y, support_out);
                }
            }),
        );
    }

    // Check if already overlapping at t=0
    let mut manifold = create_collision_manifold2d();
    if test_collision_support2d(&sweep_registry, shape_a, shape_b, &mut manifold) {
        out.fraction = 0.0;
        out.normal_x = manifold.normal_x;
        out.normal_y = manifold.normal_y;
        write_shape_a_support2d(&sweep_registry, shape_a, 0.0, 0.0, out);
        return true;
    }

    let vel_len = (translation_x * translation_x + translation_y * translation_y).sqrt();
    if vel_len < EPSILON {
        return false;
    }

    // Conservative advancement: binary search along the velocity vector
    let mut t_low = 0.0_f32;
    let mut t_high = max_fraction;
    let mut last_normal_x = 0.0_f32;
    let mut last_normal_y = 0.0_f32;
    let mut found = false;

    for _iteration in 0..MAX_SWEEP_ITERATIONS {
        let t_mid = (t_low + t_high) * 0.5;
        let shifted_a = translate_shape2d(shape_a, translation_x * t_mid, translation_y * t_mid);

        if test_collision_support2d(&sweep_registry, &shifted_a, shape_b, &mut manifold) {
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
        out.normal_x = last_normal_x;
        out.normal_y = last_normal_y;
        write_shape_a_support2d(
            &sweep_registry,
            shape_a,
            translation_ax * t_high,
            translation_ay * t_high,
            out,
        );
        return true;
    }

    return false;
}

// flight-lint: allow(f64) translation widens f32 deltas only when updating retained circle and polygon storage
fn translate_shape2d(shape: &CollisionShape2D, dx: f32, dy: f32) -> CollisionShape2D {
    match shape {
        CollisionShape2D::Circle(c) => {
            CollisionShape2D::Circle(CollisionCircle2D {
                x: c.x + dx as f64, y: c.y + dy as f64, radius: c.radius,
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
                pts[i * 2] += dx as f64;
                pts[i * 2 + 1] += dy as f64;
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

fn write_shape_a_support2d(
    registry: &CollisionRegistry2D,
    shape: &CollisionShape2D,
    translation_x: f32,
    translation_y: f32,
    out: &mut CollisionTimeOfImpact2D,
) {
    let kind = get_collision_shape2d_kind_key(shape);
    let Some(support) = get_collision_support2d(registry, kind) else {
        return;
    };
    let mut point = [0.0_f32; 2];
    support(shape, -out.normal_x, -out.normal_y, &mut point);
    out.x = point[0] + translation_x;
    out.y = point[1] + translation_y;
}
