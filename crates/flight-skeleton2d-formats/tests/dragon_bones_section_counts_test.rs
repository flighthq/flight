use flight_skeleton2d_formats::contract::*;

mod collect_dragon_bones_section_counts {
    use super::*;

    #[test]
    fn distinguishes_unreadable_empty_and_populated_documents() {
        assert!(collect_dragon_bones_section_counts("not-json").is_none());
        assert!(collect_dragon_bones_section_counts("{}").is_none());
        assert!(
            collect_dragon_bones_section_counts(r#"{"armature":[]}"#)
                .unwrap()
                .is_empty()
        );
        let counts = collect_dragon_bones_section_counts(
            r#"{"armature":[{"bone":[{},{}],"slot":[{}],"skin":[{}],"ik":[{}],"animation":[{"bone":[{}],"slot":[{}],"ffd":[{}],"ik":[{}],"zOrder":[{}]}]}]}"#,
        )
        .unwrap();
        assert_eq!(counts.get("bones"), Some(&2));
        assert_eq!(counts.get("animations"), Some(&1));
        assert_eq!(counts.get("bone"), Some(&1));
        assert_eq!(counts.get("zOrder"), Some(&1));
    }
}
