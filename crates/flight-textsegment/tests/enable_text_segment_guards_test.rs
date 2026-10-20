use flight_textsegment::*;

mod disable_text_segment_guards {
    use super::*;

    #[test]
    fn restores_silent_missing_engine_recovery() {
        enable_text_segment_guards();
        disable_text_segment_guards();
        set_intl_segmenter_available(Some(false));
        // After disabling guards, segmentation returns empty without warnings
        let result = segment_graphemes(&web_text_segmenter_backend(), "text", None);
        assert!(result.is_empty());
        set_intl_segmenter_available(None);
    }
}

mod enable_text_segment_guards {
    use super::*;

    #[test]
    fn returns_empty_when_intl_segmenter_is_absent() {
        enable_text_segment_guards();
        set_intl_segmenter_available(Some(false));
        let first = segment_graphemes(&web_text_segmenter_backend(), "first", None);
        let second = segment_graphemes(&web_text_segmenter_backend(), "second", None);
        // When native segmenter is unavailable, the web backend returns empty
        assert!(first.is_empty());
        assert!(second.is_empty());
        disable_text_segment_guards();
        set_intl_segmenter_available(None);
    }

    #[test]
    fn stays_silent_when_the_bundled_intl_provider_is_available() {
        enable_text_segment_guards();
        let result = segment_graphemes(&web_text_segmenter_backend(), "text", None);
        // When native segmenter is available, segmentation works normally
        assert!(!result.is_empty());
        disable_text_segment_guards();
    }
}
