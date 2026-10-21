use std::sync::Arc;

use crate::collision_support2d::register_collision_pair_test2d;
use crate::shape_collision2d::*;
use crate::types::*;

/// Registers the ten ordered built-in 2D pair specializations.
// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_built_in_collision_pair_tests2d(registry: &mut CollisionRegistry2D) {
    register_collision_pair_test2d(
        registry,
        "aabb",
        "aabb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Aabb(a), CollisionShape2D::Aabb(b)) => {
                test_aabb_aabb_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "aabb",
        "obb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Aabb(a), CollisionShape2D::Obb(b)) => {
                test_aabb_obb_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "aabb",
        "polygon",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Aabb(a), CollisionShape2D::Polygon(b)) => {
                test_aabb_polygon_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "circle",
        "aabb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Circle(a), CollisionShape2D::Aabb(b)) => {
                test_circle_aabb_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "circle",
        "circle",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Circle(a), CollisionShape2D::Circle(b)) => {
                test_circle_circle_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "circle",
        "obb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Circle(a), CollisionShape2D::Obb(b)) => {
                test_circle_obb_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "circle",
        "polygon",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Circle(a), CollisionShape2D::Polygon(b)) => {
                test_circle_polygon_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "obb",
        "obb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Obb(a), CollisionShape2D::Obb(b)) => {
                test_obb_obb_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "obb",
        "polygon",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Obb(a), CollisionShape2D::Polygon(b)) => {
                test_obb_polygon_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test2d(
        registry,
        "polygon",
        "polygon",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape2D::Polygon(a), CollisionShape2D::Polygon(b)) => {
                test_polygon_polygon_collision2d(a, b, out)
            }
            _ => false,
        }),
    );
}
