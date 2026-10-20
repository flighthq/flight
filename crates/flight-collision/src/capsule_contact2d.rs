use crate::contact_feature_id::*;
use crate::contact_manifold2d::*;
use crate::types::*;

const EPSILON: f64 = 1e-9;
const CONTACT_SPAN_EPSILON: f64 = 1e-6;
const PARALLEL_EPSILON: f64 = 1e-3;

pub fn collide_circle_capsule(
    circle: &CollisionCircle2D,
    capsule: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let (cx, cy) = closest_point_on_segment2d(
        capsule.x0, capsule.y0, capsule.x1, capsule.y1, circle.x, circle.y,
    );
    let dx = circle.x - cx;
    let dy = circle.y - cy;
    let dist_sq = dx * dx + dy * dy;
    let radius_sum = circle.radius + capsule.radius;
    if dist_sq >= radius_sum * radius_sum {
        return false;
    }
    let dist = dist_sq.sqrt();
    if dist > EPSILON {
        let inv = 1.0 / dist;
        out.normal_x = dx * inv;
        out.normal_y = dy * inv;
        out.depth = radius_sum - dist;
    } else {
        out.normal_x = 0.0;
        out.normal_y = -1.0;
        out.depth = radius_sum;
    }
    out.overlapping = true;
    out.point_count = 1;
    let contact_x = circle.x - out.normal_x * circle.radius;
    let contact_y = circle.y - out.normal_y * circle.radius;
    out.points[0].x = contact_x;
    out.points[0].y = contact_y;
    out.points[0].depth = out.depth;
    out.points[0].feature_id = 0;
    return true;
}

pub fn collide_capsule_capsule(
    a: &CollisionCapsule2D,
    b: &CollisionCapsule2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);

    let ax = a.x1 - a.x0;
    let ay = a.y1 - a.y0;
    let bx = b.x1 - b.x0;
    let by = b.y1 - b.y0;
    let a_len = (ax * ax + ay * ay).sqrt();
    let b_len = (bx * bx + by * by).sqrt();

    // Check for parallel axes
    let cross = if a_len > EPSILON && b_len > EPSILON {
        (ax / a_len) * (by / b_len) - (ay / a_len) * (bx / b_len)
    } else {
        1.0
    };

    let radius_sum = a.radius + b.radius;

    if cross.abs() < PARALLEL_EPSILON && a_len > EPSILON && b_len > EPSILON {
        // Parallel case: compute span overlap
        let axis_x = ax / a_len;
        let axis_y = ay / a_len;

        let a_min = a.x0 * axis_x + a.y0 * axis_y;
        let a_max = a.x1 * axis_x + a.y1 * axis_y;
        let b_min = b.x0 * axis_x + b.y0 * axis_y;
        let b_max = b.x1 * axis_x + b.y1 * axis_y;

        let (a_lo, a_hi) = if a_min < a_max { (a_min, a_max) } else { (a_max, a_min) };
        let (b_lo, b_hi) = if b_min < b_max { (b_min, b_max) } else { (b_max, b_min) };

        let overlap_lo = if a_lo > b_lo { a_lo } else { b_lo };
        let overlap_hi = if a_hi < b_hi { a_hi } else { b_hi };

        if overlap_hi - overlap_lo > CONTACT_SPAN_EPSILON {
            // Compute normal from segment-to-segment perpendicular distance
            let mid = (a.x0 + a.x1) * 0.5;
            let midy = (a.y0 + a.y1) * 0.5;
            let (cx, cy) = closest_point_on_segment2d(b.x0, b.y0, b.x1, b.y1, mid, midy);
            let dx = mid - cx;
            let dy_val = midy - cy;
            let d = (dx * dx + dy_val * dy_val).sqrt();
            if d >= radius_sum {
                return false;
            }
            if d > EPSILON {
                out.normal_x = dx / d;
                out.normal_y = dy_val / d;
                out.depth = radius_sum - d;
            } else {
                out.normal_x = -axis_y;
                out.normal_y = axis_x;
                out.depth = radius_sum;
            }
            out.overlapping = true;

            // Two contact points at span overlap boundaries
            let p1_t = overlap_lo;
            let p2_t = overlap_hi;
            let c1x = axis_x * p1_t;
            let c1y = axis_y * p1_t;
            let c2x = axis_x * p2_t;
            let c2y = axis_y * p2_t;

            out.point_count = 2;
            out.points[0].x = c1x - out.normal_x * a.radius;
            out.points[0].y = c1y - out.normal_y * a.radius;
            out.points[0].depth = out.depth;
            out.points[0].feature_id = pack_contact_feature_id(false, 0, 0, false);
            out.points[1].x = c2x - out.normal_x * a.radius;
            out.points[1].y = c2y - out.normal_y * a.radius;
            out.points[1].depth = out.depth;
            out.points[1].feature_id = pack_contact_feature_id(false, 1, 0, false);
            return true;
        }
    }

    // Non-parallel or no span overlap: closest point pair
    let (ca_x, ca_y, cb_x, cb_y) = closest_points_between_segments2d(
        a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1,
    );
    let dx = ca_x - cb_x;
    let dy = ca_y - cb_y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist >= radius_sum {
        return false;
    }
    if dist > EPSILON {
        out.normal_x = dx / dist;
        out.normal_y = dy / dist;
        out.depth = radius_sum - dist;
    } else {
        out.normal_x = 0.0;
        out.normal_y = -1.0;
        out.depth = radius_sum;
    }
    out.overlapping = true;
    out.point_count = 1;
    out.points[0].x = ca_x - out.normal_x * a.radius;
    out.points[0].y = ca_y - out.normal_y * a.radius;
    out.points[0].depth = out.depth;
    out.points[0].feature_id = 0;
    return true;
}

pub fn collide_capsule_aabb(
    capsule: &CollisionCapsule2D,
    aabb: &CollisionAabb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    // Convert AABB to polygon and use capsule-polygon
    let poly = CollisionPolygon2D {
        points: vec![
            aabb.min_x, aabb.min_y,
            aabb.max_x, aabb.min_y,
            aabb.max_x, aabb.max_y,
            aabb.min_x, aabb.max_y,
        ],
    };
    return collide_capsule_polygon(capsule, &poly, out);
}

pub fn collide_capsule_obb(
    capsule: &CollisionCapsule2D,
    obb: &CollisionObb2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let cos = obb.rotation.cos();
    let sin = obb.rotation.sin();
    let poly = CollisionPolygon2D {
        points: vec![
            obb.x + (-obb.half_w) * cos - (-obb.half_h) * sin,
            obb.y + (-obb.half_w) * sin + (-obb.half_h) * cos,
            obb.x + obb.half_w * cos - (-obb.half_h) * sin,
            obb.y + obb.half_w * sin + (-obb.half_h) * cos,
            obb.x + obb.half_w * cos - obb.half_h * sin,
            obb.y + obb.half_w * sin + obb.half_h * cos,
            obb.x + (-obb.half_w) * cos - obb.half_h * sin,
            obb.y + (-obb.half_w) * sin + obb.half_h * cos,
        ],
    };
    return collide_capsule_polygon(capsule, &poly, out);
}

pub fn collide_capsule_polygon(
    capsule: &CollisionCapsule2D,
    poly: &CollisionPolygon2D,
    out: &mut CollisionContactManifold2D,
) -> bool {
    clear_collision_contact_manifold2d(out);
    let count = poly.points.len() / 2;
    if count < 3 {
        return false;
    }

    // Find closest point on polygon to capsule segment
    let mut min_dist = f64::INFINITY;
    let mut best_nx = 0.0_f64;
    let mut best_ny = 0.0_f64;
    let mut best_cx = 0.0_f64;
    let mut best_cy = 0.0_f64;

    for i in 0..count {
        let j = (i + 1) % count;
        let ex0 = poly.points[i * 2];
        let ey0 = poly.points[i * 2 + 1];
        let ex1 = poly.points[j * 2];
        let ey1 = poly.points[j * 2 + 1];

        let (ca_x, ca_y, cb_x, cb_y) = closest_points_between_segments2d(
            capsule.x0, capsule.y0, capsule.x1, capsule.y1,
            ex0, ey0, ex1, ey1,
        );
        let dx = ca_x - cb_x;
        let dy = ca_y - cb_y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist < min_dist {
            min_dist = dist;
            best_cx = ca_x;
            best_cy = ca_y;
            if dist > EPSILON {
                best_nx = dx / dist;
                best_ny = dy / dist;
            } else {
                let edge_x = ex1 - ex0;
                let edge_y = ey1 - ey0;
                let edge_len = (edge_x * edge_x + edge_y * edge_y).sqrt();
                if edge_len > EPSILON {
                    best_nx = -edge_y / edge_len;
                    best_ny = edge_x / edge_len;
                }
            }
        }
    }

    if min_dist >= capsule.radius {
        return false;
    }

    out.overlapping = true;
    out.normal_x = best_nx;
    out.normal_y = best_ny;
    out.depth = capsule.radius - min_dist;
    out.point_count = 1;
    out.points[0].x = best_cx - best_nx * capsule.radius;
    out.points[0].y = best_cy - best_ny * capsule.radius;
    out.points[0].depth = out.depth;
    out.points[0].feature_id = 0;
    return true;
}

fn closest_point_on_segment2d(
    sx: f64, sy: f64, ex: f64, ey: f64, px: f64, py: f64,
) -> (f64, f64) {
    let dx = ex - sx;
    let dy = ey - sy;
    let len_sq = dx * dx + dy * dy;
    if len_sq <= 0.0 {
        return (sx, sy);
    }
    let mut t = ((px - sx) * dx + (py - sy) * dy) / len_sq;
    if t < 0.0 { t = 0.0; }
    if t > 1.0 { t = 1.0; }
    return (sx + dx * t, sy + dy * t);
}

fn closest_points_between_segments2d(
    a0x: f64, a0y: f64, a1x: f64, a1y: f64,
    b0x: f64, b0y: f64, b1x: f64, b1y: f64,
) -> (f64, f64, f64, f64) {
    let dax = a1x - a0x;
    let day = a1y - a0y;
    let dbx = b1x - b0x;
    let dby = b1y - b0y;
    let rx = a0x - b0x;
    let ry = a0y - b0y;
    let aa = dax * dax + day * day;
    let bb = dbx * dbx + dby * dby;
    let f = dbx * rx + dby * ry;
    let epsilon = 1e-12;

    let s;
    let t;

    if aa <= epsilon && bb <= epsilon {
        return (a0x, a0y, b0x, b0y);
    }
    if aa <= epsilon {
        s = 0.0;
        t = clamp01(f / bb);
    } else {
        let c = dax * rx + day * ry;
        if bb <= epsilon {
            t = 0.0;
            s = clamp01(-c / aa);
        } else {
            let b_val = dax * dbx + day * dby;
            let denom = aa * bb - b_val * b_val;
            let raw_s = if denom > epsilon { clamp01((b_val * f - c * bb) / denom) } else { 0.0 };
            let raw_t = (b_val * raw_s + f) / bb;
            if raw_t < 0.0 {
                t = 0.0;
                s = clamp01(-c / aa);
            } else if raw_t > 1.0 {
                t = 1.0;
                s = clamp01((b_val - c) / aa);
            } else {
                s = raw_s;
                t = raw_t;
            }
        }
    }
    return (a0x + dax * s, a0y + day * s, b0x + dbx * t, b0y + dby * t);
}

fn clamp01(v: f64) -> f64 {
    if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v }
}
