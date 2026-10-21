use crate::types::*;

fn contains_aabb2d(a: &CollisionAabb2D, x: f32, y: f32) -> bool {
    return x >= a.min_x && x <= a.max_x && y >= a.min_y && y <= a.max_y;
}

fn contains_capsule2d(c: &CollisionCapsule2D, x: f32, y: f32) -> bool {
    let dx = c.x1 - c.x0;
    let dy = c.y1 - c.y0;
    let len_sq = dx * dx + dy * dy;
    let t;
    if len_sq <= 0.0 {
        t = 0.0;
    } else {
        let raw = ((x - c.x0) * dx + (y - c.y0) * dy) / len_sq;
        t = if raw < 0.0 { 0.0 } else if raw > 1.0 { 1.0 } else { raw };
    }
    let cx = c.x0 + dx * t;
    let cy = c.y0 + dy * t;
    let ex = x - cx;
    let ey = y - cy;
    return ex * ex + ey * ey <= c.radius * c.radius;
}

fn contains_circle2d(c: &CollisionCircle2D, x: f32, y: f32) -> bool {
    let dx = x - c.x as f32;
    let dy = y - c.y as f32;
    let radius = c.radius as f32;
    return dx * dx + dy * dy <= radius * radius;
}

fn contains_obb2d(o: &CollisionObb2D, x: f32, y: f32) -> bool {
    let cos = o.rotation.cos();
    let sin = o.rotation.sin();
    let dx = x - o.x;
    let dy = y - o.y;
    let lx = dx * cos + dy * sin;
    let ly = -dx * sin + dy * cos;
    return lx.abs() <= o.half_w && ly.abs() <= o.half_h;
}

fn contains_polygon2d(p: &CollisionPolygon2D, x: f32, y: f32) -> bool {
    let count = p.points.len() / 2;
    if count < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = count - 1;
    for i in 0..count {
        let xi = p.points[i * 2] as f32;
        let yi = p.points[i * 2 + 1] as f32;
        let xj = p.points[j * 2] as f32;
        let yj = p.points[j * 2 + 1] as f32;
        if ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}

pub fn get_collision_shape_contains_point2d(
    shape: &CollisionShape2D,
    x: f32,
    y: f32,
) -> bool {
    match shape {
        CollisionShape2D::Circle(c) => contains_circle2d(c, x, y),
        CollisionShape2D::Aabb(a) => contains_aabb2d(a, x, y),
        CollisionShape2D::Obb(o) => contains_obb2d(o, x, y),
        CollisionShape2D::Polygon(p) => contains_polygon2d(p, x, y),
        CollisionShape2D::Capsule(c) => contains_capsule2d(c, x, y),
        CollisionShape2D::Segment(_) => false,
        CollisionShape2D::Point(pt) => pt.x == x && pt.y == y,
    }
}
