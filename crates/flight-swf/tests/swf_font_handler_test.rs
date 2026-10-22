use flight_swf::*;

mod swf_font_handler {
    use super::*;

    #[test]
    fn claims_the_font_tags() {
        let mut tags = SWF_FONT_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![10, 13, 48, 62, 75]);
    }

    #[test]
    fn defers_code_point_composition_to_resolve() {
        assert!(SWF_FONT_HANDLER.resolve.is_some());
    }

    #[test]
    fn does_not_define_finish_timeline_or_instantiate() {
        assert!(SWF_FONT_HANDLER.finish_timeline.is_none());
        assert!(SWF_FONT_HANDLER.instantiate.is_none());
    }
}
