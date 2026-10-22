use crate::gltf_original_test_helper::*;
use flight_entity::Unknown;
use flight_scene3d::is_mesh;
use flight_scene3d_formats::contract::*;
use std::sync::Arc;

mod create_scene3d_from_glb_with_core_feature_handlers {
    use super::*;

    #[test]
    fn case_001_builds_the_default_scene_with_exactly_the_handlers_it_is_given() {
        let glb = original_byte_view(original_glb_bytes(
            &original_gltf_fixture("animatedMultiScene"),
            &[],
        ));
        let bare = create_scene3d_from_glb_with_core_feature_handlers(&glb, &[], None, None);
        assert!(bare.animations.is_empty());
        let animated = create_scene3d_from_glb_with_core_feature_handlers(
            &glb,
            &[GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone()],
            None,
            None,
        );
        assert_eq!(animated.animations.len(), 1);
        assert!(animated.animations.contains_key("spin"));
    }

    #[test]
    fn case_002_returns_an_empty_scene_for_a_malformed_container() {
        let scene = create_scene3d_from_glb_with_core_feature_handlers(
            &original_byte_view(vec![1, 2, 3]),
            &[],
            None,
            None,
        );
        assert!(original_children(&scene).is_empty());
    }
}

mod create_scene3d_from_gltf_with_core_feature_handlers {
    use super::*;

    #[test]
    fn case_003_builds_the_files_default_scene_rather_than_scene_zero() {
        let mut source = original_gltf_fixture("animatedMultiScene");
        source["scene"] = serde_json::json!(1);
        let source = source.to_string();
        let scene = create_scene3d_from_gltf_with_core_feature_handlers(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            &[],
            None,
            None,
        );
        let children = original_children(&scene);
        assert_eq!(children.len(), 1);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(is_mesh(&node));
    }

    #[test]
    fn case_004_selects_only_the_families_it_is_handed_leaving_the_rest_unread() {
        let source = original_gltf_fixture("animatedMultiScene").to_string();
        let source = GltfSource::Json(GltfJsonSource { source: &source });
        let bare = create_scene3d_from_gltf_with_core_feature_handlers(&source, &[], None, None);
        assert!(bare.animations.is_empty());
        let animated = create_scene3d_from_gltf_with_core_feature_handlers(
            &source,
            &[GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone()],
            None,
            None,
        );
        assert_eq!(animated.animations.len(), 1);
        assert!(animated.animations.contains_key("spin"));
    }

    #[test]
    fn case_005_returns_an_empty_scene_for_a_malformed_json_string() {
        let scene = create_scene3d_from_gltf_with_core_feature_handlers(
            &GltfSource::Json(GltfJsonSource { source: "{" }),
            &[],
            None,
            None,
        );
        assert!(original_children(&scene).is_empty());
    }
}
