use unicode_segmentation::UnicodeSegmentation;

use crate::text_segment_guards::report_text_segmenter_unavailable;
use crate::text_segmenter_backend::{
    has_intl_segmenter, segment_sentences_impl, web_text_segmenter_backend,
};
use crate::types::{
    HostTextSegmenterCapability, TextSegment, TextSegmentGranularity, TextSegmentRange,
};

// ---------------------------------------------------------------------------
// Public API (alphabetical)
// ---------------------------------------------------------------------------

pub fn get_next_grapheme_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_next_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Grapheme,
        locale,
    );
}

pub fn get_next_sentence_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_next_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Sentence,
        locale,
    );
}

pub fn get_next_word_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_next_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Word,
        locale,
    );
}

pub fn get_previous_grapheme_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_previous_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Grapheme,
        locale,
    );
}

pub fn get_previous_sentence_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_previous_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Sentence,
        locale,
    );
}

pub fn get_previous_word_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> usize {
    return get_previous_text_segment_boundary(
        text_segmenter,
        text,
        index,
        TextSegmentGranularity::Word,
        locale,
    );
}

pub fn get_word_range_at(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    locale: Option<&str>,
) -> Option<TextSegmentRange> {
    if text.is_empty() {
        return None;
    }
    let clamped = clamp_index(index, text.len());
    // At the trailing boundary there is no segment starting at text.len(); resolve
    // against the last character so a double-click at the end still selects the
    // final word.
    let lookup = if clamped == text.len() {
        text.len() - 1
    } else {
        clamped
    };
    if is_web_backend(text_segmenter) {
        if !get_boundary_segmenter(locale, TextSegmentGranularity::Word) {
            return None;
        }
        let mut pos = 0;
        for word in text.split_word_bounds() {
            let end = pos + word.len();
            if lookup >= pos && lookup < end {
                let is_word_like = word.chars().any(|c| c.is_alphanumeric());
                return if is_word_like {
                    Some(TextSegmentRange { start: pos, end })
                } else {
                    None
                };
            }
            pos = end;
        }
        return None;
    }
    let segments = (text_segmenter.segment)(text, TextSegmentGranularity::Word, locale);
    for segment in &segments {
        if lookup >= segment.start && lookup < segment.end {
            return if segment.is_word_like == Some(true) {
                Some(TextSegmentRange {
                    start: segment.start,
                    end: segment.end,
                })
            } else {
                None
            };
        }
    }
    return None;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn is_web_backend(text_segmenter: &HostTextSegmenterCapability) -> bool {
    return *text_segmenter == web_text_segmenter_backend();
}

fn get_boundary_segmenter(
    _locale: Option<&str>,
    _granularity: TextSegmentGranularity,
) -> bool {
    if !has_intl_segmenter() {
        report_text_segmenter_unavailable();
        return false;
    }
    return true;
}

fn get_next_text_segment_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> usize {
    let from = clamp_index(index, text.len());
    if from >= text.len() {
        return text.len();
    }
    if !is_web_backend(text_segmenter) {
        return next_segment_boundary(
            &(text_segmenter.segment)(text, granularity, locale),
            from,
            text.len(),
        );
    }
    if !get_boundary_segmenter(locale, granularity) {
        return text.len();
    }
    match granularity {
        TextSegmentGranularity::Grapheme => {
            let mut pos = 0;
            for grapheme in text.graphemes(true) {
                if pos > from {
                    return pos;
                }
                pos += grapheme.len();
            }
        }
        TextSegmentGranularity::Word => {
            let mut pos = 0;
            for word in text.split_word_bounds() {
                if pos > from {
                    return pos;
                }
                pos += word.len();
            }
        }
        TextSegmentGranularity::Sentence => {
            let segments = segment_sentences_impl(text);
            for segment in &segments {
                if segment.start > from {
                    return segment.start;
                }
            }
        }
        TextSegmentGranularity::Line => {}
    }
    return text.len();
}

fn get_previous_text_segment_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: isize,
    granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> usize {
    let from = clamp_index(index, text.len());
    if from == 0 {
        return 0;
    }
    if !is_web_backend(text_segmenter) {
        return previous_segment_boundary(
            &(text_segmenter.segment)(text, granularity, locale),
            from,
        );
    }
    if !get_boundary_segmenter(locale, granularity) {
        return 0;
    }
    let mut previous = 0;
    match granularity {
        TextSegmentGranularity::Grapheme => {
            let mut pos = 0;
            for grapheme in text.graphemes(true) {
                if pos >= from {
                    break;
                }
                previous = pos;
                pos += grapheme.len();
            }
        }
        TextSegmentGranularity::Word => {
            let mut pos = 0;
            for word in text.split_word_bounds() {
                if pos >= from {
                    break;
                }
                previous = pos;
                pos += word.len();
            }
        }
        TextSegmentGranularity::Sentence => {
            let segments = segment_sentences_impl(text);
            for segment in &segments {
                if segment.start >= from {
                    break;
                }
                previous = segment.start;
            }
        }
        TextSegmentGranularity::Line => {}
    }
    return previous;
}

fn clamp_index(index: isize, length: usize) -> usize {
    if index < 0 {
        return 0;
    }
    if index as usize > length {
        return length;
    }
    return index as usize;
}

fn next_segment_boundary(segments: &[TextSegment], index: usize, length: usize) -> usize {
    let from = if index > length { length } else { index };
    if from >= length {
        return length;
    }
    for segment in segments {
        if segment.start > from {
            return segment.start;
        }
    }
    return length;
}

fn previous_segment_boundary(segments: &[TextSegment], index: usize) -> usize {
    let length = if segments.is_empty() {
        0
    } else {
        segments[segments.len() - 1].end
    };
    let from = if index > length { length } else { index };
    if from == 0 {
        return 0;
    }
    let mut previous = 0;
    for segment in segments {
        if segment.start >= from {
            break;
        }
        previous = segment.start;
    }
    return previous;
}
