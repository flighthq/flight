// Integration tests for flight-collision.
mod capsule_contact2d_test;
mod collide_contact_manifold2d_test;
mod collide_contact_manifold3d_test;
mod collision_face3d_test;
mod collision_shape_validation2d_test;
mod collision_shape_validation3d_test;
mod collision_support2d_test;
mod collision_support3d_test;
mod contact_feature_id_test;
mod contact_manifold2d_test;
mod contact_manifold3d_test;
mod convex_hull3d_test;
mod convex_vertices2d_test;
mod cylinder_cone3d_test;
mod enable_collision_guards_test;
mod explain_collision_test2d_test;
mod explain_collision_test3d_test;
mod gjk2d_test;
mod gjk3d_test;
mod gjk_distance3d_test;
mod manifold2d_test;
mod manifold3d_test;
mod point_containment2d_test;
mod point_containment3d_test;
mod precision_test;
mod raycast_collision_shape2d_test;
mod raycast_collision_shape3d_test;
mod register_built_in_collision_pair_tests2d_test;
mod register_built_in_collision_pair_tests3d_test;
mod segment_collision2d_test;
mod shape_collision2d_test;
mod shape_collision3d_test;
mod shape_contact2d_test;
mod sweep_collision_shape2d_test;
mod sweep_collision_shape3d_test;
mod test_collision2d_test;
mod test_collision3d_test;
mod triangle_mesh3d_test;
mod types_test;

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
