use flight_requirement::contract::RequirementFacet;
use flight_skeleton2d_formats::contract::*;

mod is_readable_dragon_bones {
    use super::*;
    #[test]
    fn recognizes_only_dragon_bones_containers() {
        assert!(!is_readable_dragon_bones("not-json"));
        assert!(is_readable_dragon_bones(r#"{"armature":[]}"#));
        assert!(!is_readable_dragon_bones(r#"{"bones":[]}"#));
    }
}

mod parse_dragon_bones_requirements {
    use super::*;
    #[test]
    fn emits_namespaced_document_format_requirements() {
        let set = parse_dragon_bones_requirements(r#"{"armature":[{"bone":[{}],"slot":[{}]}]}"#);
        assert_eq!(set.covers, [RequirementFacet::DocumentFormat]);
        assert_eq!(
            set.requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            ["dragonbones.bones", "dragonbones.slots"]
        );
        assert!(
            set.requirements
                .iter()
                .all(|r| r.facet == RequirementFacet::DocumentFormat)
        );
    }
}
