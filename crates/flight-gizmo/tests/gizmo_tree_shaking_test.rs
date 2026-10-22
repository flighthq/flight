use flight_gizmo::create_node2d_gizmo_features;

mod gizmo_feature_tree_shaking {
    use super::*;

    #[test]
    fn node2d_feature_only_surface_constructs_without_controller_state() {
        let features = create_node2d_gizmo_features();

        assert!(std::sync::Arc::strong_count(&features.get_world_bounds_rectangle) >= 1);
        assert!(std::sync::Arc::strong_count(&features.get_world_origin) >= 1);
        assert!(std::sync::Arc::strong_count(&features.get_world_rotation) >= 1);
    }
}
