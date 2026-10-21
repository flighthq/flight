use crate::transform_feature_fixture::{TransformFeatureFixture, transform_feature_fixture};
use flight_geometry::create_vector3;
use flight_node::contract::{get_node_local_matrix4, is_node_local_matrix4_detached};
use flight_scene3d::*;

mod set_node3d_look_at {
    use super::*;

    #[test]
    fn authors_a_model_matrix_on_an_actual_canonical_transform_feature_node() {
        let node = transform_feature_fixture();
        set_node3d_look_at(
            &node,
            &create_vector3(3.0, 4.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        let matrix = get_node_local_matrix4(&node);
        assert_eq!(&matrix.m[12..], &[3.0, 4.0, 5.0, 1.0]);
        assert_eq!([matrix.m[3], matrix.m[7], matrix.m[11]], [0.0; 3]);
        assert!(is_node_local_matrix4_detached(&node));
        let length = (3.0f32 * 3.0 + 4.0 * 4.0 + 5.0 * 5.0).sqrt();
        assert_eq!(matrix.m[8], 3.0 / length);
        assert_eq!(matrix.m[9], 4.0 / length);
        assert_eq!(matrix.m[10], 5.0 / length);
    }

    #[test]
    fn preserves_source_coincident_eye_fallback_and_parallel_up_degeneracy() {
        let node = transform_feature_fixture();
        let zero = create_vector3(0.0, 0.0, 0.0);
        set_node3d_look_at(&node, &zero, &zero, &create_vector3(0.0, 1.0, 0.0));
        assert_eq!(
            get_node_local_matrix4(&node).m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
        set_node3d_look_at(
            &node,
            &create_vector3(0.0, 0.0, 5.0),
            &zero,
            &create_vector3(0.0, 0.0, 1.0),
        );
        assert_eq!(&get_node_local_matrix4(&node).m[..8], &[0.0; 8]);
    }

    #[test]
    fn safe_any_trait_upcast_can_recover_the_original_mutable_node_without_a_new_node_api() {
        let node = transform_feature_fixture();
        let mut guard = node.write().unwrap();
        let erased: &mut dyn std::any::Any = &mut *guard;
        let concrete = erased.downcast_mut::<TransformFeatureFixture>().unwrap();
        flight_node::Node::node_fields_mut(concrete).name = Some("original".to_string());
        drop(guard);
        assert_eq!(
            node.read().unwrap().node_fields().name.as_deref(),
            Some("original")
        );
    }
}
