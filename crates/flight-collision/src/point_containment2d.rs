//! flight-compiler: rust-only

use crate::collision_shape_validation2d::get_collision_polygon_validation_status2d;
use crate::types::*;

const RELATIVE_EPSILON: f64 = 1e-9;

/// TS `Number.EPSILON` (2^-52), equal to `f64::EPSILON`; named after its source constant.
const NUMBER_EPSILON: f64 = 2.220446049250313e-16;

fn contains_aabb2d(a: &CollisionAabb2D, x: f64, y: f64) -> bool {
    return x >= a.min_x && x <= a.max_x && y >= a.min_y && y <= a.max_y;
}

fn contains_aabb2d_for_raycast(a: &CollisionAabb2D, x: f64, y: f64) -> bool {
    return x >= a.min_x && x <= a.max_x && y >= a.min_y && y <= a.max_y;
}

fn contains_capsule2d(c: &CollisionCapsule2D, x: f64, y: f64) -> bool {
    let dx = c.x1 - c.x0;
    let dy = c.y1 - c.y0;
    let len_sq = dx * dx + dy * dy;
    let t;
    if len_sq <= 0.0 {
        t = 0.0;
    } else {
        let raw = ((x - c.x0) * dx + (y - c.y0) * dy) / len_sq;
        t = if raw < 0.0 {
            0.0
        } else if raw > 1.0 {
            1.0
        } else {
            raw
        };
    }
    let cx = c.x0 + dx * t;
    let cy = c.y0 + dy * t;
    let ex = x - cx;
    let ey = y - cy;
    return ex * ex + ey * ey <= c.radius * c.radius;
}

fn contains_capsule2d_for_raycast(c: &CollisionCapsule2D, x: f64, y: f64) -> bool {
    let dx = c.x1 - c.x0;
    let dy = c.y1 - c.y0;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0_f64;
    if length_squared > 0.0 {
        t = ((x - c.x0) * dx + (y - c.y0) * dy) / length_squared;
        t = if t < 0.0 {
            0.0
        } else if t > 1.0 {
            1.0
        } else {
            t
        };
    }
    let cx = x - (c.x0 + t * dx);
    let cy = y - (c.y0 + t * dy);
    let radius = c.radius;
    return cx * cx + cy * cy <= radius * radius;
}

fn contains_circle2d(c: &CollisionCircle2D, x: f64, y: f64) -> bool {
    let dx = x - c.x;
    let dy = y - c.y;
    let radius = c.radius;
    return dx * dx + dy * dy <= radius * radius;
}

fn contains_circle2d_for_raycast(c: &CollisionCircle2D, x: f64, y: f64) -> bool {
    let dx = x - c.x;
    let dy = y - c.y;
    return dx * dx + dy * dy <= c.radius * c.radius;
}

fn contains_obb2d(o: &CollisionObb2D, x: f64, y: f64) -> bool {
    let cos = o.rotation.cos();
    let sin = o.rotation.sin();
    let dx = x - o.x;
    let dy = y - o.y;
    let lx = dx * cos + dy * sin;
    let ly = -dx * sin + dy * cos;
    return lx.abs() <= o.half_w && ly.abs() <= o.half_h;
}

fn contains_obb2d_for_raycast(o: &CollisionObb2D, x: f64, y: f64) -> bool {
    let rotation = o.rotation;
    let cos = rotation.cos();
    let sin = rotation.sin();
    let dx = x - o.x;
    let dy = y - o.y;
    let local_x = dx * cos + dy * sin;
    let local_y = -dx * sin + dy * cos;
    return local_x.abs() <= o.half_w && local_y.abs() <= o.half_h;
}

fn contains_point2d(p: &CollisionPoint2D, x: f64, y: f64) -> bool {
    let dx = x - p.x;
    let dy = y - p.y;
    let extent = 1.0_f64
        .max(x.abs())
        .max(y.abs())
        .max(p.x.abs())
        .max(p.y.abs());
    let epsilon = NUMBER_EPSILON * extent;
    return dx * dx + dy * dy <= epsilon * epsilon;
}

fn contains_polygon2d(p: &CollisionPolygon2D, x: f64, y: f64) -> bool {
    let count = p.points.len() / 2;
    if count < 3 {
        return false;
    }
    if get_collision_polygon_validation_status2d(&p.points).is_some() {
        return false;
    }
    // Convex point-in-polygon by sign consistency of edge cross products. Winding-agnostic: the
    // point is inside when it lies on the same side of (or on) every edge within the extent-scaled
    // tolerance.
    let epsilon = relative_epsilon(polygon_extent(p, count));
    let mut positive = false;
    let mut negative = false;
    for i in 0..count {
        let j = (i + 1) % count;
        let x0 = p.points[i * 2];
        let y0 = p.points[i * 2 + 1];
        let x1 = p.points[j * 2];
        let y1 = p.points[j * 2 + 1];
        let edge_x = x1 - x0;
        let edge_y = y1 - y0;
        let cross = edge_x * (y - y0) - edge_y * (x - x0);
        let edge_epsilon = (edge_x * edge_x + edge_y * edge_y).sqrt() * epsilon;
        if cross > edge_epsilon {
            positive = true;
        } else if cross < -edge_epsilon {
            negative = true;
        }
        if positive && negative {
            return false;
        }
    }
    return true;
}

fn contains_polygon2d_for_raycast(p: &CollisionPolygon2D, x: f64, y: f64) -> bool {
    let count = p.points.len() / 2;
    if count < 3 {
        return false;
    }
    if get_collision_polygon_validation_status2d(&p.points).is_some() {
        return false;
    }
    let epsilon = relative_epsilon(polygon_points_extent(&p.points, count));
    let mut positive = false;
    let mut negative = false;
    for i in 0..count {
        let j = (i + 1) % count;
        let x0 = p.points[i * 2];
        let y0 = p.points[i * 2 + 1];
        let x1 = p.points[j * 2];
        let y1 = p.points[j * 2 + 1];
        let edge_x = x1 - x0;
        let edge_y = y1 - y0;
        let cross = edge_x * (y - y0) - edge_y * (x - x0);
        let edge_epsilon = (edge_x * edge_x + edge_y * edge_y).sqrt() * epsilon;
        if cross > edge_epsilon {
            positive = true;
        } else if cross < -edge_epsilon {
            negative = true;
        }
        if positive && negative {
            return false;
        }
    }
    return true;
}

fn contains_segment2d(s: &CollisionSegment2D, x: f64, y: f64) -> bool {
    let dx = s.x1 - s.x0;
    let dy = s.y1 - s.y0;
    let length_squared = dx * dx + dy * dy;
    let mut t = 0.0_f64;
    if length_squared > 0.0 {
        t = ((x - s.x0) * dx + (y - s.y0) * dy) / length_squared;
        t = if t < 0.0 {
            0.0
        } else if t > 1.0 {
            1.0
        } else {
            t
        };
    }
    let closest_x = s.x0 + t * dx;
    let closest_y = s.y0 + t * dy;
    let ddx = x - closest_x;
    let ddy = y - closest_y;
    let epsilon = relative_epsilon(length_squared.sqrt());
    return ddx * ddx + ddy * ddy <= epsilon * epsilon;
}

pub fn get_collision_shape_contains_point2d(shape: &CollisionShape2D, x: f64, y: f64) -> bool {
    match shape {
        CollisionShape2D::Circle(c) => contains_circle2d(c, x, y),
        CollisionShape2D::Aabb(a) => contains_aabb2d(a, x, y),
        CollisionShape2D::Obb(o) => contains_obb2d(o, x, y),
        CollisionShape2D::Polygon(p) => contains_polygon2d(p, x, y),
        CollisionShape2D::Capsule(c) => contains_capsule2d(c, x, y),
        CollisionShape2D::Segment(s) => contains_segment2d(s, x, y),
        CollisionShape2D::Point(pt) => contains_point2d(pt, x, y),
    }
}

fn polygon_extent(p: &CollisionPolygon2D, count: usize) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for i in 0..count {
        let x = p.points[i * 2];
        let y = p.points[i * 2 + 1];
        if x < min_x {
            min_x = x;
        }
        if x > max_x {
            max_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }
    }
    return (max_x - min_x).max(max_y - min_y);
}

fn polygon_points_extent(points: &[f64], count: usize) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for i in 0..count {
        let x = points[i * 2];
        let y = points[i * 2 + 1];
        if x < min_x {
            min_x = x;
        }
        if x > max_x {
            max_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }
    }
    return (max_x - min_x).max(max_y - min_y);
}

/// Whether the query origin lies inside `shape`, using the raycast adapter's containment formulas
/// (TS raycastCollisionShape2D.ts origin preamble over pointContainment2D.ts case formulas).
pub(crate) fn raycast_origin_inside_shape2d(shape: &CollisionShape2D, x: f64, y: f64) -> bool {
    return match shape {
        CollisionShape2D::Circle(c) => contains_circle2d_for_raycast(c, x, y),
        CollisionShape2D::Aabb(a) => contains_aabb2d_for_raycast(a, x, y),
        CollisionShape2D::Obb(o) => contains_obb2d_for_raycast(o, x, y),
        CollisionShape2D::Polygon(p) => contains_polygon2d_for_raycast(p, x, y),
        CollisionShape2D::Capsule(c) => contains_capsule2d_for_raycast(c, x, y),
        CollisionShape2D::Segment(s) => contains_segment2d(s, x, y),
        CollisionShape2D::Point(p) => contains_point2d(p, x, y),
    };
}

fn relative_epsilon(extent: f64) -> f64 {
    return if extent > 0.0 {
        extent * RELATIVE_EPSILON
    } else {
        NUMBER_EPSILON
    };
}
