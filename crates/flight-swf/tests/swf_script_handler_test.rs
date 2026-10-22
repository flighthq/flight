use flight_swf::*;

mod swf_script_handler {
    use super::*;

    #[test]
    fn claims_the_script_tags() {
        let mut tags = SWF_SCRIPT_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![12, 59, 72, 82]);
    }

    #[test]
    fn defers_abc_frame_script_binding_to_resolve() {
        assert!(SWF_SCRIPT_HANDLER.resolve.is_some());
    }

    #[test]
    fn does_not_define_finish_timeline_or_instantiate() {
        assert!(SWF_SCRIPT_HANDLER.finish_timeline.is_none());
        assert!(SWF_SCRIPT_HANDLER.instantiate.is_none());
    }
}
