use super::awd2_test_helper::{block, file};
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::contract::*;

mod parse_awd2_requirements {
    use super::*;

    #[test]
    fn canonicalizes_namespaced_requirements_and_declares_only_the_inspected_format_facet() {
        let result = parse_awd2_requirements(
            &file(&[
                block(81, 0, 1, &[]),
                block(42, 0, 2, &[]),
                block(81, 0, 3, &[]),
            ]),
            None,
            None,
        );
        assert_eq!(result.covers, [RequirementFacet::DocumentFormat]);
        assert_eq!(
            result.requirements,
            [
                Requirement {
                    facet: RequirementFacet::DocumentFormat,
                    key: "awd2.Camera".to_string()
                },
                Requirement {
                    facet: RequirementFacet::DocumentFormat,
                    key: "awd2.Material".to_string()
                },
            ]
        );
    }

    #[test]
    fn retains_unknown_and_namespace_qualified_types_and_coverage_when_unreadable_or_empty() {
        let result = parse_awd2_requirements(
            &file(&[block(200, 0, 1, &[]), block(81, 1, 2, &[])]),
            None,
            None,
        );
        assert_eq!(
            result
                .requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            ["awd2.Namespace1Block(81)", "awd2.Unknown(200)"]
        );
        for bytes in [vec![], file(&[])] {
            let result = parse_awd2_requirements(&bytes, None, None);
            assert!(result.requirements.is_empty());
            assert_eq!(result.covers, [RequirementFacet::DocumentFormat]);
        }
    }
}
