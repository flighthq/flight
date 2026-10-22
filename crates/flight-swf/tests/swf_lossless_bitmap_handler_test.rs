use flight_swf::*;

mod swf_lossless_bitmap_handler {
    use super::*;

    #[test]
    fn claims_the_two_lossless_bitmap_tags() {
        let mut tags = SWF_LOSSLESS_BITMAP_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![20, 36]);
    }

    #[test]
    fn defines_only_parse() {
        assert!(SWF_LOSSLESS_BITMAP_HANDLER.resolve.is_none());
        assert!(SWF_LOSSLESS_BITMAP_HANDLER.finish_timeline.is_none());
        assert!(SWF_LOSSLESS_BITMAP_HANDLER.instantiate.is_none());
    }
}
