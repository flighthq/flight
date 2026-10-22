use super::three_ds_test_helper::*;
use flight_materials::BLINN_PHONG_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::*;

mod parse_three_ds_requirements {
    use super::*;

    #[test]
    fn emits_namespaced_features_and_content_aware_blinn_phong_requirements() {
        let set = parse_three_ds_requirements(&build_minimal_three_ds(&[
            write_chunk(THREE_DS_MATERIAL, &[0; 4]),
            write_object_chunk("Box", THREE_DS_TRIMESH, &[0; 4]),
        ]));
        for key in ["3ds.Material", "3ds.Trimesh"] {
            assert!(set.requirements.contains(&Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: key.to_string()
            }));
        }
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::SceneMaterialKind,
            key: BLINN_PHONG_MATERIAL_KIND.to_string()
        }));
        let set = parse_three_ds_requirements(&build_minimal_three_ds(&[write_object_chunk(
            "Box",
            THREE_DS_TRIMESH,
            &[0; 4],
        )]));
        assert!(
            set.requirements
                .iter()
                .all(|req| req.facet != RequirementFacet::SceneMaterialKind)
        );
    }

    #[test]
    fn empty_or_unreadable_sources_keep_both_covered_facets() {
        for bytes in [build_minimal_three_ds(&[]), vec![].into_boxed_slice()] {
            let set = parse_three_ds_requirements(&bytes);
            assert!(set.requirements.is_empty());
            assert_eq!(
                set.covers,
                [
                    RequirementFacet::DocumentFormat,
                    RequirementFacet::SceneMaterialKind
                ]
            );
        }
    }

    #[test]
    fn light_and_camera_features_are_present_without_claiming_materials() {
        let set = parse_three_ds_requirements(&build_minimal_three_ds(&[
            write_object_chunk("Lamp", THREE_DS_LIGHT, &[0; 12]),
            write_object_chunk("Cam", THREE_DS_CAMERA, &[0; 32]),
        ]));
        let keys: Vec<_> = set
            .requirements
            .iter()
            .filter(|req| req.facet == RequirementFacet::DocumentFormat)
            .map(|req| req.key.as_str())
            .collect();
        assert_eq!(keys, ["3ds.Camera", "3ds.Light"]);
    }
}
