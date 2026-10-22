use flight_swf::*;

mod swf_static_text_handler {
    use super::*;

    #[test]
    fn claims_the_static_text_tags() {
        let mut tags = SWF_STATIC_TEXT_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![11, 33]);
    }

    #[test]
    fn defers_text_composition_to_resolve() {
        assert!(SWF_STATIC_TEXT_HANDLER.resolve.is_some());
    }

    #[test]
    fn does_not_define_finish_timeline_or_instantiate() {
        assert!(SWF_STATIC_TEXT_HANDLER.finish_timeline.is_none());
        assert!(SWF_STATIC_TEXT_HANDLER.instantiate.is_none());
    }
}
