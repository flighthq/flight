use crate::types::*;

const EPSILON: f64 = 1e-12;

/// Test segment-segment intersection. Returns true and writes intersection info if they cross.
pub fn test_segment_segment_collision2d(
    a: &CollisionSegment2D,
    b: &CollisionSegment2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let d1x = a.x1 - a.x0;
    let d1y = a.y1 - a.y0;
    let d2x = b.x1 - b.x0;
    let d2y = b.y1 - b.y0;
    let denom = d1x * d2y - d1y * d2x;
    if denom.abs() < EPSILON {
        return false;
    }
    let rx = b.x0 - a.x0;
    let ry = b.y0 - a.y0;
    let t = (rx * d2y - ry * d2x) / denom;
    let u = (rx * d1y - ry * d1x) / denom;
    if t < 0.0 || t > 1.0 || u < 0.0 || u > 1.0 {
        return false;
    }
    *out_x = a.x0 + d1x * t;
    *out_y = a.y0 + d1y * t;
    *out_t = t;
    return true;
}

/// Test segment-circle intersection.
pub fn test_segment_circle_collision2d(
    seg: &CollisionSegment2D,
    circle: &CollisionCircle2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let dx = seg.x1 - seg.x0;
    let dy = seg.y1 - seg.y0;
    let fx = seg.x0 - circle.x;
    let fy = seg.y0 - circle.y;

    let a = dx * dx + dy * dy;
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - circle.radius * circle.radius;
    let discriminant = b * b - 4.0 * a * c;

    if discriminant < 0.0 || a < EPSILON {
        return false;
    }

    let sqrt_disc = discriminant.sqrt();
    let t1 = (-b - sqrt_disc) / (2.0 * a);

    if t1 >= 0.0 && t1 <= 1.0 {
        *out_x = seg.x0 + dx * t1;
        *out_y = seg.y0 + dy * t1;
        *out_t = t1;
        return true;
    }

    let t2 = (-b + sqrt_disc) / (2.0 * a);
    if t2 >= 0.0 && t2 <= 1.0 {
        *out_x = seg.x0 + dx * t2;
        *out_y = seg.y0 + dy * t2;
        *out_t = t2;
        return true;
    }

    return false;
}

/// Test segment-AABB intersection.
pub fn test_segment_aabb_collision2d(
    seg: &CollisionSegment2D,
    aabb: &CollisionAabb2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let dx = seg.x1 - seg.x0;
    let dy = seg.y1 - seg.y0;
    let mut t_min = 0.0_f64;
    let mut t_max = 1.0_f64;

    if dx.abs() < EPSILON {
        if seg.x0 < aabb.min_x || seg.x0 > aabb.max_x {
            return false;
        }
    } else {
        let inv = 1.0 / dx;
        let mut t1 = (aabb.min_x - seg.x0) * inv;
        let mut t2 = (aabb.max_x - seg.x0) * inv;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; }
        if t1 > t_min { t_min = t1; }
        if t2 < t_max { t_max = t2; }
        if t_min > t_max { return false; }
    }

    if dy.abs() < EPSILON {
        if seg.y0 < aabb.min_y || seg.y0 > aabb.max_y {
            return false;
        }
    } else {
        let inv = 1.0 / dy;
        let mut t1 = (aabb.min_y - seg.y0) * inv;
        let mut t2 = (aabb.max_y - seg.y0) * inv;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; }
        if t1 > t_min { t_min = t1; }
        if t2 < t_max { t_max = t2; }
        if t_min > t_max { return false; }
    }

    *out_t = t_min;
    *out_x = seg.x0 + dx * t_min;
    *out_y = seg.y0 + dy * t_min;
    return true;
}

/// Test segment-OBB intersection.
pub fn test_segment_obb_collision2d(
    seg: &CollisionSegment2D,
    obb: &CollisionObb2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let cos = obb.rotation.cos();
    let sin = obb.rotation.sin();
    let lx0 = (seg.x0 - obb.x) * cos + (seg.y0 - obb.y) * sin;
    let ly0 = -(seg.x0 - obb.x) * sin + (seg.y0 - obb.y) * cos;
    let lx1 = (seg.x1 - obb.x) * cos + (seg.y1 - obb.y) * sin;
    let ly1 = -(seg.x1 - obb.x) * sin + (seg.y1 - obb.y) * cos;

    let local_seg = CollisionSegment2D { x0: lx0, y0: ly0, x1: lx1, y1: ly1 };
    let local_aabb = CollisionAabb2D {
        min_x: -obb.half_w, min_y: -obb.half_h,
        max_x: obb.half_w, max_y: obb.half_h,
    };
    let mut local_x = 0.0_f64;
    let mut local_y = 0.0_f64;
    if !test_segment_aabb_collision2d(&local_seg, &local_aabb, &mut local_x, &mut local_y, out_t) {
        return false;
    }
    *out_x = obb.x + local_x * cos - local_y * sin;
    *out_y = obb.y + local_x * sin + local_y * cos;
    return true;
}

/// Test segment-polygon intersection.
pub fn test_segment_polygon_collision2d(
    seg: &CollisionSegment2D,
    poly: &CollisionPolygon2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let count = poly.points.len() / 2;
    if count < 2 {
        return false;
    }
    let mut best_t = f64::INFINITY;
    let mut hit = false;

    for i in 0..count {
        let j = (i + 1) % count;
        let edge = CollisionSegment2D {
            x0: poly.points[i * 2],
            y0: poly.points[i * 2 + 1],
            x1: poly.points[j * 2],
            y1: poly.points[j * 2 + 1],
        };
        let mut ix = 0.0_f64;
        let mut iy = 0.0_f64;
        let mut it = 0.0_f64;
        if test_segment_segment_collision2d(seg, &edge, &mut ix, &mut iy, &mut it) {
            if it < best_t {
                best_t = it;
                *out_x = ix;
                *out_y = iy;
                hit = true;
            }
        }
    }
    if hit {
        *out_t = best_t;
    }
    return hit;
}

/// Test segment-capsule intersection.
pub fn test_segment_capsule_collision2d(
    seg: &CollisionSegment2D,
    capsule: &CollisionCapsule2D,
    out_x: &mut f64,
    out_y: &mut f64,
    out_t: &mut f64,
) -> bool {
    let dx = capsule.x1 - capsule.x0;
    let dy = capsule.y1 - capsule.y0;
    let len = (dx * dx + dy * dy).sqrt();

    // Check against the two semicircles
    let c0 = CollisionCircle2D { x: capsule.x0, y: capsule.y0, radius: capsule.radius };
    let c1 = CollisionCircle2D { x: capsule.x1, y: capsule.y1, radius: capsule.radius };

    let mut best_t = f64::INFINITY;
    let mut bx = 0.0_f64;
    let mut by = 0.0_f64;
    let mut hit = false;

    let mut ix = 0.0_f64;
    let mut iy = 0.0_f64;
    let mut it = 0.0_f64;

    if test_segment_circle_collision2d(seg, &c0, &mut ix, &mut iy, &mut it) && it < best_t {
        best_t = it;
        bx = ix;
        by = iy;
        hit = true;
    }
    if test_segment_circle_collision2d(seg, &c1, &mut ix, &mut iy, &mut it) && it < best_t {
        best_t = it;
        bx = ix;
        by = iy;
        hit = true;
    }

    // Check against the two side edges if the capsule has length
    if len > EPSILON {
        let nx = -dy / len * capsule.radius;
        let ny = dx / len * capsule.radius;
        let side1 = CollisionSegment2D {
            x0: capsule.x0 + nx, y0: capsule.y0 + ny,
            x1: capsule.x1 + nx, y1: capsule.y1 + ny,
        };
        let side2 = CollisionSegment2D {
            x0: capsule.x0 - nx, y0: capsule.y0 - ny,
            x1: capsule.x1 - nx, y1: capsule.y1 - ny,
        };
        if test_segment_segment_collision2d(seg, &side1, &mut ix, &mut iy, &mut it) && it < best_t {
            best_t = it;
            bx = ix;
            by = iy;
            hit = true;
        }
        if test_segment_segment_collision2d(seg, &side2, &mut ix, &mut iy, &mut it) && it < best_t {
            best_t = it;
            bx = ix;
            by = iy;
            hit = true;
        }
    }

    if hit {
        *out_x = bx;
        *out_y = by;
        *out_t = best_t;
    }
    return hit;
}
