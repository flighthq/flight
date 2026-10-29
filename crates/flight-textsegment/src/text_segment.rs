use crate::types::{HostTextSegmenterCapability, TextSegment, TextSegmentGranularity};

// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned output clears/fills retained capacity; host callback protocol and returned records are unchanged
pub fn segment_graphemes(
    out: &mut Vec<TextSegment>,
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) {
    out.clear();
    let segments: Vec<TextSegment> =
        (host_text_segmenter.segment)(text, TextSegmentGranularity::Grapheme, locale);
    out.extend(segments);
    return;
}

// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned output clears/fills retained capacity; host callback protocol and returned records are unchanged
pub fn segment_sentences(
    out: &mut Vec<TextSegment>,
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) {
    out.clear();
    let segments: Vec<TextSegment> =
        (host_text_segmenter.segment)(text, TextSegmentGranularity::Sentence, locale);
    out.extend(segments);
    return;
}

// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned output clears/fills retained capacity; host callback protocol and returned records are unchanged
pub fn segment_words(
    out: &mut Vec<TextSegment>,
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) {
    out.clear();
    let segments: Vec<TextSegment> =
        (host_text_segmenter.segment)(text, TextSegmentGranularity::Word, locale);
    out.extend(segments);
    return;
}
