use crate::types::{HostTextSegmenterCapability, TextSegment, TextSegmentGranularity};

pub fn segment_graphemes(
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    return (host_text_segmenter.segment)(text, TextSegmentGranularity::Grapheme, locale);
}

pub fn segment_sentences(
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    return (host_text_segmenter.segment)(text, TextSegmentGranularity::Sentence, locale);
}

pub fn segment_words(
    host_text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    return (host_text_segmenter.segment)(text, TextSegmentGranularity::Word, locale);
}
