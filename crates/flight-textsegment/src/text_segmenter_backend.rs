use std::sync::LazyLock;

use unicode_segmentation::UnicodeSegmentation;

use crate::text_units::utf16_len;
use crate::types::{
    HostTextSegmenterCapability, TextSegment, TextSegmentGranularity, TextSegmenterExplanation,
    TextSegmenterKind,
};

#[cfg(test)]
mod source_tests {
    use super::*;
    use std::cell::Cell;

    // flight-lint: allow(hidden-state) Test-only thread-local spy observes calls to the actual bundled backend without changing production capabilities or sharing counters between parallel tests
    thread_local! {
        static SEGMENT_CALLS: Cell<usize> = const { Cell::new(0) };
    }

    pub(super) fn record_segment_call() {
        SEGMENT_CALLS.with(|calls| calls.set(calls.get() + 1));
    }

    #[test]
    fn stops_the_bundled_iterator_without_calling_the_backend_segment_function() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        SEGMENT_CALLS.with(|calls| calls.set(0));
        let records = (backend.segment)("First. Second!", TextSegmentGranularity::Sentence, None);
        assert_eq!(records.len(), 2);
        SEGMENT_CALLS.with(|calls| assert_eq!(calls.get(), 1));
        SEGMENT_CALLS.with(|calls| calls.set(0));
        assert_eq!(
            crate::get_next_sentence_boundary(&backend, "First. Second!", 0, None),
            7
        );
        SEGMENT_CALLS.with(|calls| assert_eq!(calls.get(), 0));
    }
}

/// Stable bundled web provider, mirroring the TypeScript exported constant.
pub static WEB_TEXT_SEGMENTER_BACKEND: LazyLock<HostTextSegmenterCapability> =
    LazyLock::new(|| HostTextSegmenterCapability {
        segment: segment_with_intl_segmenter,
    });

/// Describes which provider an operation would use.
///
/// The Rust backend always has `unicode-segmentation` compiled in, so unlike
/// the browser implementation there is no runtime availability state.
pub fn explain_text_segmenter_backend(
    text_segmenter: &HostTextSegmenterCapability,
) -> TextSegmenterExplanation {
    let web = *text_segmenter == *WEB_TEXT_SEGMENTER_BACKEND;
    return TextSegmenterExplanation {
        available: true,
        backend: if web {
            TextSegmenterKind::WebIntl
        } else {
            TextSegmenterKind::Custom
        },
        intl_segmenter_available: true,
    };
}

pub(crate) fn segment_graphemes_impl(text: &str) -> Vec<TextSegment> {
    let mut segments = Vec::new();
    let mut pos = 0;
    for grapheme in text.graphemes(true) {
        let end = pos + utf16_len(grapheme);
        segments.push(TextSegment {
            start: pos,
            end,
            text: grapheme.to_string(),
            is_word_like: None,
        });
        pos = end;
    }
    return segments;
}

pub(crate) fn segment_sentences_impl(text: &str) -> Vec<TextSegment> {
    let mut segments = Vec::new();
    let mut start_byte = 0;
    let mut start_utf16 = 0;
    let mut chars = text.char_indices().peekable();

    while let Some((i, c)) = chars.next() {
        if c == '.' || c == '!' || c == '?' {
            let mut end = i + c.len_utf8();
            while let Some(&(_, next_c)) = chars.peek() {
                if next_c == ' ' || next_c == '\t' || next_c == '\n' || next_c == '\r' {
                    end += next_c.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            // Sentence boundary when whitespace follows the punctuation or at end of text
            if end > i + c.len_utf8() || chars.peek().is_none() {
                let segment_text = &text[start_byte..end];
                let end_utf16 = start_utf16 + utf16_len(segment_text);
                segments.push(TextSegment {
                    start: start_utf16,
                    end: end_utf16,
                    text: segment_text.to_string(),
                    is_word_like: None,
                });
                start_byte = end;
                start_utf16 = end_utf16;
            }
        }
    }

    if start_byte < text.len() {
        let segment_text = &text[start_byte..];
        segments.push(TextSegment {
            start: start_utf16,
            end: start_utf16 + utf16_len(segment_text),
            text: segment_text.to_string(),
            is_word_like: None,
        });
    }

    return segments;
}

fn segment_with_intl_segmenter(
    text: &str,
    granularity: TextSegmentGranularity,
    _locale: Option<&str>,
) -> Vec<TextSegment> {
    #[cfg(test)]
    source_tests::record_segment_call();
    match granularity {
        TextSegmentGranularity::Grapheme => segment_graphemes_impl(text),
        TextSegmentGranularity::Word => segment_words_impl(text),
        TextSegmentGranularity::Sentence => segment_sentences_impl(text),
    }
}

pub(crate) fn segment_words_impl(text: &str) -> Vec<TextSegment> {
    let mut segments = Vec::new();
    let mut pos = 0;
    for word in text.split_word_bounds() {
        let end = pos + utf16_len(word);
        let is_word_like = word.chars().any(|c| c.is_alphanumeric());
        segments.push(TextSegment {
            start: pos,
            end,
            text: word.to_string(),
            is_word_like: Some(is_word_like),
        });
        pos = end;
    }
    return segments;
}
