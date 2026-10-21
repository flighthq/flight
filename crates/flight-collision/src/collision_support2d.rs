use crate::types::*;

pub fn get_collision_pair_test2d(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionManifold2D,
) -> Option<bool> {
    use crate::shape_collision2d::*;
    match (a, b) {
        (CollisionShape2D::Circle(a), CollisionShape2D::Circle(b)) => {
            Some(test_circle_circle_collision2d(a, b, out))
        }
        (CollisionShape2D::Circle(a), CollisionShape2D::Aabb(b)) => {
            Some(test_circle_aabb_collision2d(a, b, out))
        }
        (CollisionShape2D::Circle(a), CollisionShape2D::Obb(b)) => {
            Some(test_circle_obb_collision2d(a, b, out))
        }
        (CollisionShape2D::Circle(a), CollisionShape2D::Polygon(b)) => {
            Some(test_circle_polygon_collision2d(a, b, out))
        }
        (CollisionShape2D::Aabb(a), CollisionShape2D::Aabb(b)) => {
            Some(test_aabb_aabb_collision2d(a, b, out))
        }
        (CollisionShape2D::Aabb(a), CollisionShape2D::Obb(b)) => {
            Some(test_aabb_obb_collision2d(a, b, out))
        }
        (CollisionShape2D::Aabb(a), CollisionShape2D::Polygon(b)) => {
            Some(test_aabb_polygon_collision2d(a, b, out))
        }
        (CollisionShape2D::Obb(a), CollisionShape2D::Obb(b)) => {
            Some(test_obb_obb_collision2d(a, b, out))
        }
        (CollisionShape2D::Obb(a), CollisionShape2D::Polygon(b)) => {
            Some(test_obb_polygon_collision2d(a, b, out))
        }
        (CollisionShape2D::Polygon(a), CollisionShape2D::Polygon(b)) => {
            Some(test_polygon_polygon_collision2d(a, b, out))
        }
        _ => None,
    }
}

pub fn get_collision_support2d(
    shape: &CollisionShape2D,
    direction_x: f64,
    direction_y: f64,
    out: &mut [f64; 2],
) -> bool {
    match shape {
        CollisionShape2D::Circle(s) => {
            support_collision_circle2d(s, direction_x, direction_y, out);
            return true;
        }
        CollisionShape2D::Aabb(s) => {
            support_collision_aabb2d(s, direction_x, direction_y, out);
            return true;
        }
        CollisionShape2D::Obb(s) => {
            support_collision_obb2d(s, direction_x, direction_y, out);
            return true;
        }
        CollisionShape2D::Polygon(s) => {
            support_collision_polygon2d(s, direction_x, direction_y, out);
            return true;
        }
        CollisionShape2D::Capsule(s) => {
            support_collision_capsule2d(s, direction_x, direction_y, out);
            return true;
        }
        _ => {
            return false;
        }
    }
}

pub fn has_collision_support2d(kind: CollisionShapeKind2D) -> bool {
    match kind {
        CollisionShapeKind2D::Circle
        | CollisionShapeKind2D::Aabb
        | CollisionShapeKind2D::Obb
        | CollisionShapeKind2D::Polygon
        | CollisionShapeKind2D::Capsule => true,
        _ => false,
    }
}

pub fn register_built_in_collision_supports2d() {
    // No-op: dispatch is static via match in Rust.
}

pub fn register_collision_pair_test2d(
    _kind_a: CollisionShapeKind2D,
    _kind_b: CollisionShapeKind2D,
) {
    // No-op: dispatch is static via match in Rust.
}

pub fn register_collision_support2d(_kind: CollisionShapeKind2D) {
    // No-op: dispatch is static via match in Rust.
}

pub fn support_collision_aabb2d(
    shape: &CollisionAabb2D,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    out[0] = if dir_x >= 0.0 { shape.max_x } else { shape.min_x };
    out[1] = if dir_y >= 0.0 { shape.max_y } else { shape.min_y };
}

pub fn support_collision_capsule2d(
    shape: &CollisionCapsule2D,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    let len = (dir_x * dir_x + dir_y * dir_y).sqrt();
    let (nx, ny) = if len > 0.0 {
        (dir_x / len, dir_y / len)
    } else {
        (1.0, 0.0)
    };
    let proj0 = shape.x0 * dir_x + shape.y0 * dir_y;
    let proj1 = shape.x1 * dir_x + shape.y1 * dir_y;
    if proj0 >= proj1 {
        out[0] = shape.x0 + nx * shape.radius;
        out[1] = shape.y0 + ny * shape.radius;
    } else {
        out[0] = shape.x1 + nx * shape.radius;
        out[1] = shape.y1 + ny * shape.radius;
    }
}

pub fn support_collision_circle2d(
    shape: &CollisionCircle2D,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    let len = (dir_x * dir_x + dir_y * dir_y).sqrt();
    if len > 0.0 {
        let inv = shape.radius / len;
        out[0] = shape.x + dir_x * inv;
        out[1] = shape.y + dir_y * inv;
    } else {
        out[0] = shape.x + shape.radius;
        out[1] = shape.y;
    }
}

pub fn support_collision_obb2d(
    shape: &CollisionObb2D,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    let cos = shape.rotation.cos();
    let sin = shape.rotation.sin();
    let local_x = dir_x * cos + dir_y * sin;
    let local_y = -dir_x * sin + dir_y * cos;
    let sx = if local_x >= 0.0 { shape.half_w } else { -shape.half_w };
    let sy = if local_y >= 0.0 { shape.half_h } else { -shape.half_h };
    out[0] = shape.x + sx * cos - sy * sin;
    out[1] = shape.y + sx * sin + sy * cos;
}

pub fn support_collision_polygon2d(
    shape: &CollisionPolygon2D,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    write_vertex_list_support2d(&shape.points, shape.points.len() / 2, dir_x, dir_y, out);
}

pub fn write_vertex_list_support2d(
    vertices: &[f64],
    count: usize,
    dir_x: f64,
    dir_y: f64,
    out: &mut [f64; 2],
) {
    let mut best = f64::NEG_INFINITY;
    let mut best_x = 0.0_f64;
    let mut best_y = 0.0_f64;
    for i in 0..count {
        let x = vertices[i * 2];
        let y = vertices[i * 2 + 1];
        let projection = x * dir_x + y * dir_y;
        if projection > best {
            best = projection;
            best_x = x;
            best_y = y;
        }
    }
    out[0] = best_x;
    out[1] = best_y;
}
