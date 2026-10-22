use flight_requirement::RequirementFacet;
use flight_scene3d_formats::*;
use flight_shading::SHADED_MATERIAL_KIND;

mod awd2_block_scene_requirements {
    use super::*;

    #[test]
    fn maps_the_material_block_to_the_actual_shaded_kind_and_keeps_document_requirements_empty() {
        assert_eq!(AWD2_BLOCK_SCENE_REQUIREMENTS.len(), 1);
        let row = &AWD2_BLOCK_SCENE_REQUIREMENTS[0];
        assert_eq!(row.feature, "Material");
        assert_eq!(row.requirements.len(), 1);
        assert_eq!(
            row.requirements[0].facet,
            RequirementFacet::SceneMaterialKind
        );
        assert_eq!(row.requirements[0].key, SHADED_MATERIAL_KIND);
        assert!(AWD2_DOCUMENT_SCENE_REQUIREMENTS.is_empty());
    }
}
