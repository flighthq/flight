use crate::flight_scene3d_formats_md2_features_test::build_md2_header;
use flight_materials::BLINN_PHONG_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::contract::*;

mod feature_requirements {
    use super::*;
    #[test]
    fn maps_only_the_material_feature_to_the_canonical_blinn_phong_kind() {
        assert_eq!(MD2_FEATURE_SCENE_REQUIREMENTS.len(), 1);
        assert_eq!(MD2_FEATURE_SCENE_REQUIREMENTS[0].feature, "Material");
        assert_eq!(
            MD2_FEATURE_SCENE_REQUIREMENTS[0].requirements,
            vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: BLINN_PHONG_MATERIAL_KIND.to_string()
            }]
        );
    }
}

mod parse_md2_requirements {
    use super::*;
    #[test]
    fn claims_skin_material_and_animation_from_independent_headers() {
        let set = parse_md2_requirements(&build_md2_header(1, 10, 1));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::SceneMaterialKind,
            key: BLINN_PHONG_MATERIAL_KIND.to_string()
        }));
        let set = parse_md2_requirements(&build_md2_header(0, 10, 5));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: "md2.Animation".to_string()
        }));
    }
    #[test]
    fn emits_only_mesh_without_materials_and_declares_both_covered_facets() {
        let set = parse_md2_requirements(&build_md2_header(0, 10, 1));
        assert_eq!(
            set.requirements,
            vec![Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: "md2.Mesh".to_string()
            }]
        );
        assert_eq!(
            set.covers,
            vec![
                RequirementFacet::DocumentFormat,
                RequirementFacet::SceneMaterialKind
            ]
        );
    }
    #[test]
    fn emits_all_full_model_features_and_material_requirement_deterministically() {
        let bytes = build_md2_header(1, 50, 10);
        let set = parse_md2_requirements(&bytes);
        assert_eq!(
            set.requirements,
            parse_md2_requirements(&bytes).requirements
        );
        assert_eq!(
            set.requirements
                .iter()
                .filter(|r| r.facet == RequirementFacet::DocumentFormat)
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            vec!["md2.Animation", "md2.Material", "md2.Mesh"]
        );
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::SceneMaterialKind,
            key: BLINN_PHONG_MATERIAL_KIND.to_string()
        }));
    }
    #[test]
    fn emits_no_unreadable_requirements_but_retains_covered_facets() {
        let set = parse_md2_requirements(&[0; 10]);
        assert!(set.requirements.is_empty());
        assert_eq!(
            set.covers,
            vec![
                RequirementFacet::DocumentFormat,
                RequirementFacet::SceneMaterialKind
            ]
        );
    }
}
