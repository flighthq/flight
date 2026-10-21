use crate::types::*;

// flight-lint: allow(f64) measured 1e9 raycast domain needs double precision to distinguish origin from shape
const EPSILON: f64 = 1e-12;
// flight-lint: allow(f64) raycast adapter lane is double precision; segment/point tolerances follow it
const RELATIVE_EPSILON: f64 = 1e-9;

// flight-lint: allow(f64) measured 1e9 raycast adapter preserves double-precision query arithmetic
#[derive(Clone, Copy)]
struct RaycastAabb2D {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

// flight-lint: allow(f64) measured 1e9 raycast adapter preserves double-precision query arithmetic
#[derive(Clone, Copy)]
struct RaycastObb2D {
    x: f64,
    y: f64,
    half_w: f64,
    half_h: f64,
    rotation: f64,
}

// flight-lint: allow(f64) measured 1e9 raycast adapter preserves double-precision query arithmetic
#[derive(Clone, Copy)]
struct RaycastCapsule2D {
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    radius: f64,
}

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

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn raycast_aabb2d(
    aabb: &RaycastAabb2D,
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
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
        if t1 > t2 {
            let tmp = t1;
            t1 = t2;
            t2 = tmp;
            n1x = 1.0;
            n2x = -1.0;
        }
        if t1 > t_min {
            t_min = t1;
            normal_x = n1x;
            normal_y = 0.0;
        }
        if t2 < t_max {
            t_max = t2;
        }
        if t_min > t_max {
            return false;
        }
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
        if t1 > t2 {
            let tmp = t1;
            t1 = t2;
            t2 = tmp;
            n1y = 1.0;
            n2y = -1.0;
        }
        if t1 > t_min {
            t_min = t1;
            normal_x = 0.0;
            normal_y = n1y;
        }
        if t2 < t_max {
            t_max = t2;
        }
        if t_min > t_max {
            return false;
        }
    }

    out.fraction = t_min;
    out.x = ox + dx * t_min;
    out.y = oy + dy * t_min;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    return true;
}

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn raycast_capsule2d(
    capsule: &RaycastCapsule2D,
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    // Semicircle endpoints
    let c0 = CollisionCircle2D {
        x: capsule.x0,
        y: capsule.y0,
        radius: capsule.radius,
    };
    let c1 = CollisionCircle2D {
        x: capsule.x1,
        y: capsule.y1,
        radius: capsule.radius,
    };
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
            if denom.abs() < EPSILON {
                continue;
            }
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

// flight-lint: allow(f64) measured 1e9 circle raycast changes hit to miss under f32 aliasing
fn raycast_circle2d(
    circle: &CollisionCircle2D,
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
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
// flight-lint: allow(conform-params) D9 requires caller-owned outputs first; max_fraction remains optional after source inputs
pub fn raycast_collision_shape2d(
    out: &mut CollisionRaycastHit2D,
    shape: &CollisionShape2D,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: Option<f64>,
) -> bool {
    let max_fraction = max_fraction.unwrap_or(f64::INFINITY);
    match shape {
        CollisionShape2D::Circle(c) => raycast_circle2d(
            c,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            out,
        ),
        CollisionShape2D::Aabb(a) => {
            let aabb = RaycastAabb2D {
                min_x: a.min_x as f64,
                min_y: a.min_y as f64,
                max_x: a.max_x as f64,
                max_y: a.max_y as f64,
            };
            raycast_aabb2d(
                &aabb,
                origin_x,
                origin_y,
                direction_x,
                direction_y,
                max_fraction,
                out,
            )
        }
        CollisionShape2D::Obb(o) => {
            let obb = RaycastObb2D {
                x: o.x as f64,
                y: o.y as f64,
                half_w: o.half_w as f64,
                half_h: o.half_h as f64,
                rotation: o.rotation as f64,
            };
            raycast_obb2d(
                &obb,
                origin_x,
                origin_y,
                direction_x,
                direction_y,
                max_fraction,
                out,
            )
        }
        CollisionShape2D::Polygon(p) => raycast_polygon2d(
            p,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            out,
        ),
        CollisionShape2D::Capsule(c) => {
            let capsule = RaycastCapsule2D {
                x0: c.x0 as f64,
                y0: c.y0 as f64,
                x1: c.x1 as f64,
                y1: c.y1 as f64,
                radius: c.radius as f64,
            };
            raycast_capsule2d(
                &capsule,
                origin_x,
                origin_y,
                direction_x,
                direction_y,
                max_fraction,
                out,
            )
        }
        CollisionShape2D::Segment(s) => raycast_segment2d(
            s.x0 as f64,
            s.y0 as f64,
            s.x1 as f64,
            s.y1 as f64,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            out,
        ),
        CollisionShape2D::Point(p) => raycast_point2d(
            p.x as f64,
            p.y as f64,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            out,
        ),
        _ => false,
    }
}

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn raycast_obb2d(
    obb: &RaycastObb2D,
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
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

    let local_aabb = RaycastAabb2D {
        min_x: -obb.half_w,
        min_y: -obb.half_h,
        max_x: obb.half_w,
        max_y: obb.half_h,
    };

    let mut local_hit = CollisionRaycastHit2D::default();
    if !raycast_aabb2d(
        &local_aabb,
        local_ox,
        local_oy,
        local_dx,
        local_dy,
        max_fraction,
        &mut local_hit,
    ) {
        return false;
    }

    out.fraction = local_hit.fraction;
    out.x = obb.x + local_hit.x * cos - local_hit.y * sin;
    out.y = obb.y + local_hit.x * sin + local_hit.y * cos;
    out.normal_x = local_hit.normal_x * cos - local_hit.normal_y * sin;
    out.normal_y = local_hit.normal_x * sin + local_hit.normal_y * cos;
    return true;
}

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn raycast_point2d(
    point_x: f64,
    point_y: f64,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    if !point_x.is_finite() || !point_y.is_finite() {
        return false;
    }
    let direction_length_squared = direction_x * direction_x + direction_y * direction_y;
    let offset_x = point_x - origin_x;
    let offset_y = point_y - origin_y;
    let fraction = (offset_x * direction_x + offset_y * direction_y) / direction_length_squared;
    if fraction < 0.0 || fraction > max_fraction {
        return false;
    }
    let hit_x = origin_x + direction_x * fraction;
    let hit_y = origin_y + direction_y * fraction;
    // Tolerance follows world extent, not direction magnitude.
    let epsilon =
        1.0_f64.max((offset_x * offset_x + offset_y * offset_y).sqrt()) * RELATIVE_EPSILON;
    let miss_x = hit_x - point_x;
    let miss_y = hit_y - point_y;
    if (miss_x * miss_x + miss_y * miss_y).sqrt() > epsilon {
        return false;
    }
    write_raycast_hit2d(
        out,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        fraction,
        0.0,
        0.0,
    );
    return true;
}

// flight-lint: allow(f64) measured polygon storage stays coherent with the retained raycast query domain
fn raycast_polygon2d(
    poly: &CollisionPolygon2D,
    ox: f64,
    oy: f64,
    dx: f64,
    dy: f64,
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
        if denom.abs() < EPSILON {
            continue;
        }
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

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn raycast_segment2d(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit2D,
) -> bool {
    if !x0.is_finite() || !y0.is_finite() || !x1.is_finite() || !y1.is_finite() {
        return false;
    }
    let direction_length_squared = direction_x * direction_x + direction_y * direction_y;
    let Some(fraction) = write_ray_segment_fraction(
        x0,
        y0,
        x1,
        y1,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        direction_length_squared,
        max_fraction,
    ) else {
        return false;
    };
    let edge_x = x1 - x0;
    let edge_y = y1 - y0;
    let edge_length = (edge_x * edge_x + edge_y * edge_y).sqrt();
    let mut normal_x = if edge_length > 0.0 {
        edge_y / edge_length
    } else {
        0.0
    };
    let mut normal_y = if edge_length > 0.0 {
        -edge_x / edge_length
    } else {
        0.0
    };
    if normal_x * direction_x + normal_y * direction_y > 0.0 {
        normal_x = -normal_x;
        normal_y = -normal_y;
    }
    write_raycast_hit2d(
        out,
        origin_x,
        origin_y,
        direction_x,
        direction_y,
        fraction,
        normal_x,
        normal_y,
    );
    return true;
}

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
#[allow(clippy::too_many_arguments)]
fn write_ray_segment_fraction(
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    direction_length_squared: f64,
    max_fraction: f64,
) -> Option<f64> {
    let edge_x = x1 - x0;
    let edge_y = y1 - y0;
    let offset_x = x0 - origin_x;
    let offset_y = y0 - origin_y;
    let denominator = direction_x * edge_y - direction_y * edge_x;
    let scale = (direction_length_squared * (edge_x * edge_x + edge_y * edge_y)).sqrt();
    if denominator.abs() <= scale * RELATIVE_EPSILON {
        let cross = offset_x * direction_y - offset_y * direction_x;
        if cross.abs() > direction_length_squared.sqrt() * RELATIVE_EPSILON {
            return None;
        }
        let first = (offset_x * direction_x + offset_y * direction_y) / direction_length_squared;
        let second = ((x1 - origin_x) * direction_x + (y1 - origin_y) * direction_y)
            / direction_length_squared;
        let far = first.max(second);
        let fraction = 0.0_f64.max(first.min(second));
        if far < 0.0 || fraction > max_fraction {
            return None;
        }
        return Some(fraction);
    }
    let fraction = (offset_x * edge_y - offset_y * edge_x) / denominator;
    let edge_fraction = (offset_x * direction_y - offset_y * direction_x) / denominator;
    if fraction < -RELATIVE_EPSILON
        || fraction > max_fraction
        || edge_fraction < -RELATIVE_EPSILON
        || edge_fraction > 1.0 + RELATIVE_EPSILON
    {
        return None;
    }
    return Some(if fraction < 0.0 { 0.0 } else { fraction });
}

// flight-lint: allow(f64) measured 1e9 raycast query changes hit to miss under f32 aliasing
fn write_raycast_hit2d(
    out: &mut CollisionRaycastHit2D,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    fraction: f64,
    normal_x: f64,
    normal_y: f64,
) {
    out.fraction = fraction;
    out.x = origin_x + direction_x * fraction;
    out.y = origin_y + direction_y * fraction;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
}
