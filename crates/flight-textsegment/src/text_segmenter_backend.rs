use std::cell::Cell;

use unicode_segmentation::UnicodeSegmentation;

use crate::text_segment_guards::report_text_segmenter_unavailable;
use crate::text_units::utf16_len;
use crate::types::{
    HostTextSegmenterCapability, TextSegment, TextSegmentGranularity, TextSegmenterExplanation,
    TextSegmenterKind,
};

thread_local! {
    static INTL_SEGMENTER_OVERRIDE: Cell<Option<bool>> = const { Cell::new(None) };
}

// ---------------------------------------------------------------------------
// create_* / initialize_*
// ---------------------------------------------------------------------------

pub fn create_web_text_segmenter_backend() -> HostTextSegmenterCapability {
    let mut out = HostTextSegmenterCapability {
        segment: segment_with_intl_segmenter,
    };
    initialize_web_text_segmenter_backend(&mut out);
    return out;
}

fn initialize_web_text_segmenter_backend(out: &mut HostTextSegmenterCapability) {
    out.segment = segment_with_intl_segmenter;
}

/// Describes which provider an operation would use and whether the native
/// segmenter is present.
pub fn explain_text_segmenter_backend(
    text_segmenter: &HostTextSegmenterCapability,
) -> TextSegmenterExplanation {
    let web = *text_segmenter == web_text_segmenter_backend();
    let intl_segmenter_available = has_intl_segmenter();
    return TextSegmenterExplanation {
        available: !web || intl_segmenter_available,
        backend: if web {
            TextSegmenterKind::WebIntl
        } else {
            TextSegmenterKind::Custom
        },
        intl_segmenter_available,
    };
}

fn get_cached_segmenter(_locale: Option<&str>, _granularity: TextSegmentGranularity) -> bool {
    if !has_intl_segmenter() {
        report_text_segmenter_unavailable();
        return false;
    }
    return true;
}

/// Returns whether the native segmenter runtime primitive is available.
/// In the TS source this checks `typeof Intl.Segmenter !== 'undefined'`.
/// In Rust the unicode-segmentation crate is always compiled in, so this
/// returns true by default. Tests can override via [`set_intl_segmenter_available`].
pub fn has_intl_segmenter() -> bool {
    return INTL_SEGMENTER_OVERRIDE.with(|v| v.get()).unwrap_or(true);
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
    locale: Option<&str>,
) -> Vec<TextSegment> {
    if !get_cached_segmenter(locale, granularity) {
        return vec![];
    }
    match granularity {
        TextSegmentGranularity::Grapheme => segment_graphemes_impl(text),
        TextSegmentGranularity::Word => segment_words_impl(text),
        TextSegmentGranularity::Sentence => segment_sentences_impl(text),
        TextSegmentGranularity::Line => vec![],
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

/// Testing utility: override the return value of [`has_intl_segmenter`].
/// Pass `None` to restore the default (always available).
pub fn set_intl_segmenter_available(available: Option<bool>) {
    INTL_SEGMENTER_OVERRIDE.with(|v| v.set(available));
}

/// Stable bundled web provider. Hosts can call this directly when composing
/// their explicit capability object.
pub fn web_text_segmenter_backend() -> HostTextSegmenterCapability {
    return create_web_text_segmenter_backend();
}
