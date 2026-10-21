use flight_requirement::contract::RequirementFacet;
use flight_skeleton2d_formats::contract::*;

mod is_readable_spine_json {
    use super::*;
    #[test]
    fn recognizes_only_spine_documents() {
        assert!(!is_readable_spine_json("not-json"));
        assert!(is_readable_spine_json(r#"{"skeleton":{}}"#));
        assert!(!is_readable_spine_json(r#"{"armature":[]}"#));
    }
}

mod parse_spine_json_requirements {
    use super::*;
    #[test]
    fn emits_namespaced_document_format_requirements() {
        let set = parse_spine_json_requirements(r#"{"bones":[{}],"slots":[{}]}"#);
        assert_eq!(set.covers, [RequirementFacet::DocumentFormat]);
        assert_eq!(
            set.requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            ["spine-json.bones", "spine-json.slots"]
        );
    }
}
