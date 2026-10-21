use flight_skeleton2d_formats::contract::*;

mod collect_spine_json_section_counts {
    use super::*;

    #[test]
    fn distinguishes_unreadable_empty_and_populated_documents() {
        assert!(collect_spine_json_section_counts("not-json").is_none());
        assert!(collect_spine_json_section_counts("{}").is_none());
        assert!(
            collect_spine_json_section_counts(r#"{"skeleton":{}}"#)
                .unwrap()
                .is_empty()
        );
        let counts = collect_spine_json_section_counts(
            r#"{"bones":[{},{}],"slots":[{}],"skins":{"default":{}},"events":{"e":{}},"ik":[{}],"path":[{}],"transform":[{}],"animations":{"walk":{"bones":{"root":{}},"slots":{"s":{}},"draworder":[{}]}}}"#,
        )
        .unwrap();
        assert_eq!(counts.get("bones"), Some(&2));
        assert_eq!(counts.get("animations"), Some(&1));
        assert_eq!(counts.get("bone"), Some(&1));
        assert_eq!(counts.get("drawOrder"), Some(&1));
    }
}
