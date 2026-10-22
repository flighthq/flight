// Integration tests for flight-collision.

fn collision_registry2d() -> flight_collision::CollisionRegistry2D {
    return flight_collision::CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
}

fn collision_registry2d_with_built_ins() -> flight_collision::CollisionRegistry2D {
    let mut registry = collision_registry2d();
    flight_collision::register_built_in_collision_supports2d(&mut registry);
    flight_collision::register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn collision_registry2d_with_supports() -> flight_collision::CollisionRegistry2D {
    let mut registry = collision_registry2d();
    flight_collision::register_built_in_collision_supports2d(&mut registry);
    return registry;
}

fn collision_registry3d() -> flight_collision::CollisionRegistry3D {
    return flight_collision::CollisionRegistry3D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        face_queries: std::collections::HashMap::new(),
        test_guard: None,
    };
}

fn collision_registry3d_with_built_ins() -> flight_collision::CollisionRegistry3D {
    let mut registry = collision_registry3d();
    flight_collision::register_built_in_collision_supports3d(&mut registry);
    flight_collision::register_built_in_collision_pair_tests3d(&mut registry);
    flight_collision::register_built_in_collision_face_queries3d(&mut registry);
    return registry;
}

fn collision_registry3d_with_supports() -> flight_collision::CollisionRegistry3D {
    let mut registry = collision_registry3d();
    flight_collision::register_built_in_collision_supports3d(&mut registry);
    return registry;
}

#[path = "capsule_contact2d_test.rs"]
mod flight_collision_capsule_contact2d_test;
#[path = "collide_contact_manifold2d_test.rs"]
mod flight_collision_collide_contact_manifold2d_test;
#[path = "collide_contact_manifold3d_test.rs"]
mod flight_collision_collide_contact_manifold3d_test;
#[path = "collision_face3d_test.rs"]
mod flight_collision_collision_face3d_test;
#[path = "collision_shape_validation2d_test.rs"]
mod flight_collision_collision_shape_validation2d_test;
#[path = "collision_shape_validation3d_test.rs"]
mod flight_collision_collision_shape_validation3d_test;
#[path = "collision_support2d_test.rs"]
mod flight_collision_collision_support2d_test;
#[path = "collision_support3d_test.rs"]
mod flight_collision_collision_support3d_test;
#[path = "contact_feature_id_test.rs"]
mod flight_collision_contact_feature_id_test;
#[path = "contact_manifold2d_test.rs"]
mod flight_collision_contact_manifold2d_test;
#[path = "contact_manifold3d_test.rs"]
mod flight_collision_contact_manifold3d_test;
#[path = "convex_hull3d_test.rs"]
mod flight_collision_convex_hull3d_test;
#[path = "convex_vertices2d_test.rs"]
mod flight_collision_convex_vertices2d_test;
#[path = "cylinder_cone3d_test.rs"]
mod flight_collision_cylinder_cone3d_test;
#[path = "enable_collision_guards_test.rs"]
mod flight_collision_enable_collision_guards_test;
#[path = "explain_collision_test2d_test.rs"]
mod flight_collision_explain_collision_test2d_test;
#[path = "explain_collision_test3d_test.rs"]
mod flight_collision_explain_collision_test3d_test;
#[path = "gjk2d_test.rs"]
mod flight_collision_gjk2d_test;
#[path = "gjk3d_test.rs"]
mod flight_collision_gjk3d_test;
#[path = "gjk_distance3d_test.rs"]
mod flight_collision_gjk_distance3d_test;
#[path = "manifold2d_test.rs"]
mod flight_collision_manifold2d_test;
#[path = "manifold3d_test.rs"]
mod flight_collision_manifold3d_test;
#[path = "point_containment2d_test.rs"]
mod flight_collision_point_containment2d_test;
#[path = "point_containment3d_test.rs"]
mod flight_collision_point_containment3d_test;
#[path = "precision_test.rs"]
mod flight_collision_precision_test;
#[path = "raycast_collision_shape2d_test.rs"]
mod flight_collision_raycast_collision_shape2d_test;
#[path = "raycast_collision_shape3d_test.rs"]
mod flight_collision_raycast_collision_shape3d_test;
#[path = "register_built_in_collision_pair_tests2d_test.rs"]
mod flight_collision_register_built_in_collision_pair_tests2d_test;
#[path = "register_built_in_collision_pair_tests3d_test.rs"]
mod flight_collision_register_built_in_collision_pair_tests3d_test;
#[path = "segment_collision2d_test.rs"]
mod flight_collision_segment_collision2d_test;
#[path = "shape_collision2d_test.rs"]
mod flight_collision_shape_collision2d_test;
#[path = "shape_collision3d_test.rs"]
mod flight_collision_shape_collision3d_test;
#[path = "shape_contact2d_test.rs"]
mod flight_collision_shape_contact2d_test;
#[path = "sweep_collision_shape2d_test.rs"]
mod flight_collision_sweep_collision_shape2d_test;
#[path = "sweep_collision_shape3d_test.rs"]
mod flight_collision_sweep_collision_shape3d_test;
#[path = "test_collision2d_test.rs"]
mod flight_collision_test_collision2d_test;
#[path = "test_collision3d_test.rs"]
mod flight_collision_test_collision3d_test;
#[path = "triangle_mesh3d_test.rs"]
mod flight_collision_triangle_mesh3d_test;
#[path = "types_test.rs"]
mod flight_collision_types_test;
