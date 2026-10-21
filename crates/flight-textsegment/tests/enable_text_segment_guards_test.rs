use flight_textsegment::contract::report_text_segmenter_unavailable;
use flight_textsegment::*;

mod disable_text_segment_guards {
    use super::*;

    #[test]
    fn restores_silent_missing_engine_recovery() {
        enable_text_segment_guards();
        disable_text_segment_guards();
        // After disabling guards, the reporting seam is silent.
        report_text_segmenter_unavailable();
    }
}

mod enable_text_segment_guards {
    use super::*;

    #[test]
    fn stays_silent_when_the_bundled_intl_provider_is_available() {
        enable_text_segment_guards();
        let result = segment_graphemes(&WEB_TEXT_SEGMENTER_BACKEND, "text", None);
        // When native segmenter is available, segmentation works normally
        assert!(!result.is_empty());
        disable_text_segment_guards();
    }
}
