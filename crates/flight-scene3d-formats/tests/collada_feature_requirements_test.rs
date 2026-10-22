use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::*;

mod collada_feature_scene_requirements {
    use super::*;

    #[test]
    fn maps_material_and_each_effect_model_to_standard_pbr_and_leaves_all_nonmaterial_features_unmapped()
     {
        for feature in ["Material", "Effect.Blinn", "Effect.Lambert", "Effect.Phong"] {
            let entry = COLLADA_FEATURE_SCENE_REQUIREMENTS
                .iter()
                .find(|entry| entry.feature == feature)
                .unwrap();
            assert!(entry.requirements.contains(&Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: STANDARD_PBR_MATERIAL_KIND.to_string()
            }));
        }
        for feature in ["Geometry", "Camera", "Light", "Animation", "Controller"] {
            assert!(
                !COLLADA_FEATURE_SCENE_REQUIREMENTS
                    .iter()
                    .any(|entry| entry.feature == feature)
            );
        }
    }
}
