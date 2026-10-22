use flight_swf::*;

mod is_known_swf_tag {
    use super::*;

    #[test]
    fn matches_the_named_vocabulary_throughout_the_tag_code_range() {
        assert_eq!(SWF_TAG_NAMES.len(), 69);
        for code in 0..1024 {
            assert_eq!(
                is_known_swf_tag(code),
                SWF_TAG_NAMES.iter().any(|(known, _)| *known == code as u32),
                "tag {code}"
            );
        }
        assert!(!is_known_swf_tag(-1));
    }
}
