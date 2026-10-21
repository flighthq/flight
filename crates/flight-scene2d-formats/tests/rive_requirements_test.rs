use flight_requirement::RequirementFacet;
use flight_scene2d_formats::contract::*;

use crate::rive_test_bytes::{build_rive, object};

mod parse_rive_requirements {
    use super::*;

    #[test]
    fn covers_the_document_format_facet() {
        let result = parse_rive_requirements(&rive_file(&[3]), None);
        assert_eq!(result.covers, [RequirementFacet::DocumentFormat]);
    }

    #[test]
    fn emits_every_distinct_family_a_mixed_document_needs() {
        assert_eq!(
            keys(&[134, 18, 3]),
            ["riv.Shape", "riv.SolidColor", "riv.Text"]
        );
    }

    #[test]
    fn emits_nothing_for_a_file_it_cannot_read() {
        let result = parse_rive_requirements(&[0x4e, 0x4f, 0x50, 0x45], None);
        assert!(result.requirements.is_empty());
    }

    #[test]
    fn emits_nothing_for_a_readable_document_with_no_objects() {
        assert!(keys(&[]).is_empty());
    }

    #[test]
    fn emits_one_namespaced_requirement_per_family() {
        assert_eq!(keys(&[3]), ["riv.Shape"]);
    }

    #[test]
    fn keeps_a_defined_type_that_reaches_no_registered_family() {
        assert_eq!(keys(&[2]), ["riv.Node"]);
    }

    #[test]
    fn labels_a_key_the_object_model_does_not_define() {
        assert_eq!(keys(&[9999]), ["riv.Unknown(9999)"]);
    }

    #[test]
    fn names_each_family_once() {
        assert_eq!(keys(&[12, 7, 12]), ["riv.Path"]);
    }

    #[test]
    fn namespaces_every_key() {
        for key in keys(&[3, 134]) {
            assert!(key.starts_with(&format!("{RIVE_REQUIREMENT_KEY_NAMESPACE}.")));
        }
    }

    #[test]
    fn resolves_an_artboard_to_the_layout_family() {
        assert_eq!(keys(&[1]), ["riv.LayoutComponent"]);
    }

    #[test]
    fn resolves_an_inherited_type_to_the_family_that_reads_it() {
        assert_eq!(keys(&[7]), ["riv.Path"]);
    }

    fn keys(type_keys: &[u64]) -> Vec<String> {
        return parse_rive_requirements(&rive_file(type_keys), None)
            .requirements
            .into_iter()
            .map(|requirement| requirement.key)
            .collect();
    }

    fn rive_file(type_keys: &[u64]) -> Vec<u8> {
        return build_rive(
            type_keys
                .iter()
                .map(|type_key| object(*type_key, Vec::new()))
                .collect(),
        );
    }
}
