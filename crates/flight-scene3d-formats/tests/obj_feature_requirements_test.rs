use flight_materials::{BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND};
use flight_requirement::RequirementFacet;
use flight_scene3d_formats::*;

mod obj_feature_scene_requirements {
    use super::*;
    #[test]
    fn each_model_implies_only_its_own_renderer_and_coarse_or_geometry_features_have_no_rows() {
        assert_eq!(OBJ_FEATURE_SCENE_REQUIREMENTS.len(), 2);
        for (feature, kind) in [
            (OBJ_MATERIAL_BLINN_PHONG_FEATURE, BLINN_PHONG_MATERIAL_KIND),
            (
                OBJ_MATERIAL_STANDARD_PBR_FEATURE,
                STANDARD_PBR_MATERIAL_KIND,
            ),
        ] {
            let entry = OBJ_FEATURE_SCENE_REQUIREMENTS
                .iter()
                .find(|entry| entry.feature == feature)
                .unwrap();
            assert_eq!(entry.requirements.len(), 1);
            assert_eq!(
                entry.requirements[0].facet,
                RequirementFacet::SceneMaterialKind
            );
            assert_eq!(entry.requirements[0].key, kind);
        }
        for feature in ["Material", "Face", "Line", "Point"] {
            assert!(
                !OBJ_FEATURE_SCENE_REQUIREMENTS
                    .iter()
                    .any(|entry| entry.feature == feature)
            );
        }
    }
}
