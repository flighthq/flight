use std::sync::Arc;

use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_pair_test2d<'a>(
    registry: &'a CollisionRegistry2D,
    kind_a: &str,
    kind_b: &str,
) -> Option<&'a CollisionPairTest2D> {
    return registry
        .pair_tests
        .get(&format!("{kind_a}\0{kind_b}"));
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_support2d<'a>(
    registry: &'a CollisionRegistry2D,
    kind: &str,
) -> Option<&'a CollisionSupport2D> {
    return registry.supports.get(kind);
}

// flight-lint: allow(conform-extra) Rust lookup convenience for the caller-owned registry
pub fn has_collision_support2d(registry: &CollisionRegistry2D, kind: &str) -> bool {
    return registry.supports.contains_key(kind);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_built_in_collision_supports2d(registry: &mut CollisionRegistry2D) {
    register_collision_support2d(
        registry,
        "aabb",
        Arc::new(|shape, dir_x, dir_y, out| {
            if let CollisionShape2D::Aabb(shape) = shape {
                support_collision_aabb2d(shape, dir_x, dir_y, out);
            }
        }),
    );
    register_collision_support2d(
        registry,
        "circle",
        Arc::new(|shape, dir_x, dir_y, out| {
            if let CollisionShape2D::Circle(shape) = shape {
                support_collision_circle2d(shape, dir_x, dir_y, out);
            }
        }),
    );
    register_collision_support2d(
        registry,
        "obb",
        Arc::new(|shape, dir_x, dir_y, out| {
            if let CollisionShape2D::Obb(shape) = shape {
                support_collision_obb2d(shape, dir_x, dir_y, out);
            }
        }),
    );
    register_collision_support2d(
        registry,
        "polygon",
        Arc::new(|shape, dir_x, dir_y, out| {
            if let CollisionShape2D::Polygon(shape) = shape {
                support_collision_polygon2d(shape, dir_x, dir_y, out);
            }
        }),
    );
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_collision_pair_test2d(
    registry: &mut CollisionRegistry2D,
    kind_a: &str,
    kind_b: &str,
    test: CollisionPairTest2D,
) {
    registry
        .pair_tests
        .insert(format!("{kind_a}\0{kind_b}"), test);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_collision_support2d(
    registry: &mut CollisionRegistry2D,
    kind: &str,
    support: CollisionSupport2D,
) {
    registry.supports.insert(kind.to_string(), support);
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
