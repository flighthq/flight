use flight_requirement::RequirementFacet;
use flight_scene3d_formats::contract::*;

mod parse_md5_anim_requirements {
    use super::*;
    #[test]
    fn emits_only_namespaced_document_features_with_no_material_claim() {
        let set =
            parse_md5_anim_requirements("hierarchy {\n\"root\" -1 63 0\n}\nframe 0 {\n0 0 0\n}\n");
        assert_eq!(
            set.requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            vec!["md5.Animation", "md5.Hierarchy"]
        );
        assert!(
            set.requirements
                .iter()
                .all(|r| r.facet == RequirementFacet::DocumentFormat)
        );
        assert_eq!(
            parse_md5_anim_requirements("hierarchy {\n}\nbaseframe {\n}\n").requirements[0].key,
            "md5.Hierarchy"
        );
        assert_eq!(
            parse_md5_anim_requirements("frame 0 {\n}\n").requirements[0].key,
            "md5.Animation"
        );
    }
    #[test]
    fn keeps_covered_facets_for_empty_content_and_is_order_independent() {
        for source in ["", "// just a comment\n// another one"] {
            let set = parse_md5_anim_requirements(source);
            assert!(set.requirements.is_empty());
            assert_eq!(
                set.covers,
                vec![
                    RequirementFacet::DocumentFormat,
                    RequirementFacet::SceneMaterialKind
                ]
            );
        }
        assert_eq!(
            parse_md5_anim_requirements("hierarchy {\n}\nframe 0 {\n}\n").requirements,
            parse_md5_anim_requirements("frame 0 {\n}\nhierarchy {\n}\n").requirements
        );
    }
}
