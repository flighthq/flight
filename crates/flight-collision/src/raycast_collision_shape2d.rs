use crate::types::*;

const EPSILON: f64 = 1e-12;

pub fn create_collision_raycast_hit2d() -> CollisionRaycastHit2D {
    let mut out: CollisionRaycastHit2D = flight_entity::allocate_entity();
    initialize_collision_raycast_hit2d(&mut out);
    return out;
}

pub fn initialize_collision_raycast_hit2d(out: &mut CollisionRaycastHit2D) {
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
}

fn raycast_aabb2d(
    aabb: &CollisionAabb2D,
    ox: f64, oy: f64,
    dx: f64, dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let mut t_min = 0.0_f64;
    let mut t_max = max_fraction;
    let mut normal_x = 0.0_f64;
    let mut normal_y = 0.0_f64;

    if dx.abs() < EPSILON {
        if ox < aabb.min_x || ox > aabb.max_x {
            return false;
        }
    } else {
        let inv = 1.0 / dx;
        let mut t1 = (aabb.min_x - ox) * inv;
        let mut t2 = (aabb.max_x - ox) * inv;
        let mut n1x = -1.0_f64;
        let mut n2x = 1.0_f64;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; n1x = 1.0; n2x = -1.0; }
        if t1 > t_min { t_min = t1; normal_x = n1x; normal_y = 0.0; }
        if t2 < t_max { t_max = t2; }
        if t_min > t_max { return false; }
    }

    if dy.abs() < EPSILON {
        if oy < aabb.min_y || oy > aabb.max_y {
            return false;
        }
    } else {
        let inv = 1.0 / dy;
        let mut t1 = (aabb.min_y - oy) * inv;
        let mut t2 = (aabb.max_y - oy) * inv;
        let mut n1y = -1.0_f64;
        let mut n2y = 1.0_f64;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; n1y = 1.0; n2y = -1.0; }
        if t1 > t_min { t_min = t1; normal_x = 0.0; normal_y = n1y; }
        if t2 < t_max { t_max = t2; }
        if t_min > t_max { return false; }
    }

    out.fraction = t_min;
    out.x = ox + dx * t_min;
    out.y = oy + dy * t_min;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    return true;
}

fn raycast_capsule2d(
    capsule: &CollisionCapsule2D,
    ox: f64, oy: f64,
    dx: f64, dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    // Semicircle endpoints
    let c0 = CollisionCircle2D { x: capsule.x0, y: capsule.y0, radius: capsule.radius };
    let c1 = CollisionCircle2D { x: capsule.x1, y: capsule.y1, radius: capsule.radius };
    let mut temp = CollisionRaycastHit2D::default();

    if raycast_circle2d(&c0, ox, oy, dx, dy, max_fraction, &mut temp) && temp.fraction < best_t {
        best_t = temp.fraction;
        *out = temp.clone();
        hit = true;
    }
    if raycast_circle2d(&c1, ox, oy, dx, dy, max_fraction, &mut temp) && temp.fraction < best_t {
        best_t = temp.fraction;
        *out = temp.clone();
        hit = true;
    }

    // Side edges
    let sx = capsule.x1 - capsule.x0;
    let sy = capsule.y1 - capsule.y0;
    let seg_len = (sx * sx + sy * sy).sqrt();
    if seg_len > EPSILON {
        let nx = -sy / seg_len * capsule.radius;
        let ny = sx / seg_len * capsule.radius;
        for side in 0..2 {
            let sign = if side == 0 { 1.0 } else { -1.0 };
            let edge_x0 = capsule.x0 + nx * sign;
            let edge_y0 = capsule.y0 + ny * sign;
            let edge_x1 = capsule.x1 + nx * sign;
            let edge_y1 = capsule.y1 + ny * sign;

            let ex = edge_x1 - edge_x0;
            let ey = edge_y1 - edge_y0;
            let denom = dx * ey - dy * ex;
            if denom.abs() < EPSILON { continue; }
            let rx = edge_x0 - ox;
            let ry = edge_y0 - oy;
            let t = (rx * ey - ry * ex) / denom;
            let u = (rx * dy - ry * dx) / denom;
            if t >= 0.0 && t <= max_fraction && u >= 0.0 && u <= 1.0 && t < best_t {
                best_t = t;
                let normal_x = ey;
                let normal_y = -ex;
                let nlen = (normal_x * normal_x + normal_y * normal_y).sqrt();
                out.fraction = t;
                out.x = ox + dx * t;
                out.y = oy + dy * t;
                if nlen > EPSILON {
                    out.normal_x = normal_x / nlen;
                    out.normal_y = normal_y / nlen;
                }
                if out.normal_x * dx + out.normal_y * dy > 0.0 {
                    out.normal_x = -out.normal_x;
                    out.normal_y = -out.normal_y;
                }
                hit = true;
            }
        }
    }
    return hit;
}

fn raycast_circle2d(
    circle: &CollisionCircle2D,
    ox: f64, oy: f64,
    dx: f64, dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let fx = ox - circle.x;
    let fy = oy - circle.y;
    let a = dx * dx + dy * dy;
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - circle.radius * circle.radius;

    if a < EPSILON {
        return false;
    }

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return false;
    }

    let sqrt_disc = disc.sqrt();
    let t = (-b - sqrt_disc) / (2.0 * a);
    if t < 0.0 || t > max_fraction {
        return false;
    }

    let hx = ox + dx * t;
    let hy = oy + dy * t;
    let nx = hx - circle.x;
    let ny = hy - circle.y;
    let len = (nx * nx + ny * ny).sqrt();
    out.fraction = t;
    out.x = hx;
    out.y = hy;
    if len > EPSILON {
        out.normal_x = nx / len;
        out.normal_y = ny / len;
    } else {
        out.normal_x = -dx;
        out.normal_y = -dy;
        let dl = (out.normal_x * out.normal_x + out.normal_y * out.normal_y).sqrt();
        if dl > EPSILON {
            out.normal_x /= dl;
            out.normal_y /= dl;
        }
    }
    return true;
}

// flight-lint: allow(f64) measured 1e9 center: f32 aliases the ray origin two units away and changes hit to miss
pub fn raycast_collision_shape2d(
    shape: &CollisionShape2D,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    match shape {
        CollisionShape2D::Circle(c) => {
            raycast_circle2d(c, origin_x, origin_y, direction_x, direction_y, max_fraction, out)
        }
        CollisionShape2D::Aabb(a) => {
            raycast_aabb2d(a, origin_x, origin_y, direction_x, direction_y, max_fraction, out)
        }
        CollisionShape2D::Obb(o) => {
            raycast_obb2d(o, origin_x, origin_y, direction_x, direction_y, max_fraction, out)
        }
        CollisionShape2D::Polygon(p) => {
            raycast_polygon2d(p, origin_x, origin_y, direction_x, direction_y, max_fraction, out)
        }
        CollisionShape2D::Capsule(c) => {
            raycast_capsule2d(c, origin_x, origin_y, direction_x, direction_y, max_fraction, out)
        }
        _ => false,
    }
}

fn raycast_obb2d(
    obb: &CollisionObb2D,
    ox: f64, oy: f64,
    dx: f64, dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let cos = obb.rotation.cos();
    let sin = obb.rotation.sin();
    let rel_ox = ox - obb.x;
    let rel_oy = oy - obb.y;
    let local_ox = rel_ox * cos + rel_oy * sin;
    let local_oy = -rel_ox * sin + rel_oy * cos;
    let local_dx = dx * cos + dy * sin;
    let local_dy = -dx * sin + dy * cos;

    let local_aabb = CollisionAabb2D {
        min_x: -obb.half_w, min_y: -obb.half_h,
        max_x: obb.half_w, max_y: obb.half_h,
    };

    let mut local_hit = CollisionRaycastHit2D::default();
    if !raycast_aabb2d(&local_aabb, local_ox, local_oy, local_dx, local_dy, max_fraction, &mut local_hit) {
        return false;
    }

    out.fraction = local_hit.fraction;
    out.x = obb.x + local_hit.x * cos - local_hit.y * sin;
    out.y = obb.y + local_hit.x * sin + local_hit.y * cos;
    out.normal_x = local_hit.normal_x * cos - local_hit.normal_y * sin;
    out.normal_y = local_hit.normal_x * sin + local_hit.normal_y * cos;
    return true;
}

fn raycast_polygon2d(
    poly: &CollisionPolygon2D,
    ox: f64, oy: f64,
    dx: f64, dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let count = poly.points.len() / 2;
    if count < 3 {
        return false;
    }

    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    for i in 0..count {
        let j = (i + 1) % count;
        let ex = poly.points[j * 2] - poly.points[i * 2];
        let ey = poly.points[j * 2 + 1] - poly.points[i * 2 + 1];
        let denom = dx * ey - dy * ex;
        if denom.abs() < EPSILON { continue; }
        let rx = poly.points[i * 2] - ox;
        let ry = poly.points[i * 2 + 1] - oy;
        let t = (rx * ey - ry * ex) / denom;
        let u = (rx * dy - ry * dx) / denom;
        if t >= 0.0 && t <= max_fraction && u >= 0.0 && u <= 1.0 && t < best_t {
            best_t = t;
            let nx = ey;
            let ny = -ex;
            let len = (nx * nx + ny * ny).sqrt();
            out.fraction = t;
            out.x = ox + dx * t;
            out.y = oy + dy * t;
            if len > EPSILON {
                out.normal_x = nx / len;
                out.normal_y = ny / len;
            } else {
                out.normal_x = 0.0;
                out.normal_y = 0.0;
            }
            // Ensure normal points toward ray origin
            if out.normal_x * dx + out.normal_y * dy > 0.0 {
                out.normal_x = -out.normal_x;
                out.normal_y = -out.normal_y;
            }
            hit = true;
        }
    }
    return hit;
}
