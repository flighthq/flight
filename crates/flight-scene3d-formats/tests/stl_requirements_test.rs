use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::contract::*;

mod parse_stl_requirements {
    use super::*;

    #[test]
    fn emits_only_stl_mesh_for_every_encoding_and_triangle_count() {
        let expected = vec![Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: "stl.Mesh".to_string(),
        }];
        for bytes in [
            build_binary_stl(&STL_SQUARE_FACETS, None).to_vec(),
            build_ascii_stl(&STL_SQUARE_FACETS, None).into_bytes(),
            build_binary_stl(&STL_SQUARE_FACETS[..1], None).to_vec(),
        ] {
            let set = parse_stl_requirements(&bytes);
            assert_eq!(set.requirements, expected);
            assert_eq!(set.covers, vec![RequirementFacet::DocumentFormat]);
            assert_eq!(
                set.requirements[0].key,
                format!("{STL_REQUIREMENT_KEY_NAMESPACE}.Mesh")
            );
        }
        assert_eq!(STL_REQUIREMENT_KEY_NAMESPACE, "stl");
    }

    #[test]
    fn emits_no_requirements_for_unreadable_or_truncated_input() {
        for text in [
            "",
            "this solid object is not a model",
            "solid empty\nendsolid empty",
            "v 0 0 0\nf 1 1 1\n",
        ] {
            let set = parse_stl_requirements(text.as_bytes());
            assert!(set.requirements.is_empty());
            assert_eq!(set.covers, vec![RequirementFacet::DocumentFormat]);
        }
        assert!(
            parse_stl_requirements(&build_binary_stl(&STL_SQUARE_FACETS, None)[..120])
                .requirements
                .is_empty()
        );
    }
}
