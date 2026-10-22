use flight_swf::*;

mod swf_control_handler {
    use super::*;

    #[test]
    fn claims_the_control_tags() {
        let mut tags = SWF_CONTROL_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![7, 9, 34, 43, 56, 76, 78, 86]);
    }

    #[test]
    fn defines_only_parse() {
        assert!(SWF_CONTROL_HANDLER.resolve.is_none());
        assert!(SWF_CONTROL_HANDLER.finish_timeline.is_none());
        assert!(SWF_CONTROL_HANDLER.instantiate.is_none());
    }
}
