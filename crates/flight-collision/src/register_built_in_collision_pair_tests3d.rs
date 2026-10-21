use std::sync::Arc;

use crate::collision_support3d::register_collision_pair_test3d;
use crate::shape_collision3d::*;
use crate::types::*;

/// Registers the seven ordered built-in 3D pair specializations.
// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_built_in_collision_pair_tests3d(registry: &mut CollisionRegistry3D) {
    register_collision_pair_test3d(
        registry,
        "aabb",
        "aabb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Aabb(a), CollisionShape3D::Aabb(b)) => {
                test_aabb_aabb_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "box",
        "box",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Box(a), CollisionShape3D::Box(b)) => {
                test_box_box_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "capsule",
        "capsule",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Capsule(a), CollisionShape3D::Capsule(b)) => {
                test_capsule_capsule_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "sphere",
        "aabb",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Sphere(a), CollisionShape3D::Aabb(b)) => {
                test_sphere_aabb_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "sphere",
        "box",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Sphere(a), CollisionShape3D::Box(b)) => {
                test_sphere_box_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "sphere",
        "capsule",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Sphere(a), CollisionShape3D::Capsule(b)) => {
                test_sphere_capsule_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
    register_collision_pair_test3d(
        registry,
        "sphere",
        "sphere",
        Arc::new(|a, b, out| match (a, b) {
            (CollisionShape3D::Sphere(a), CollisionShape3D::Sphere(b)) => {
                test_sphere_sphere_collision3d(a, b, out)
            }
            _ => false,
        }),
    );
}
