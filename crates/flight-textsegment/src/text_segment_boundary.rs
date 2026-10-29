//! flight-compiler: target-native
//! flight-compiler: nullable-option get_word_range_at

use unicode_segmentation::UnicodeSegmentation;

use crate::text_segmenter_backend::WEB_TEXT_SEGMENTER_BACKEND;
use crate::text_units::utf16_len;
use crate::types::{
    HostTextSegmenterCapability, TextSegment, TextSegmentGranularity, TextSegmentRange,
};

fn clamp_index(index: i32, length: usize) -> usize {
    if index < 0 {
        return 0;
    }
    if index as usize > length {
        return length;
    }
    return index as usize;
}

pub fn get_next_grapheme_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: i32,
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
    index: i32,
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

fn get_next_text_segment_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: i32,
    granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> usize {
    let length = utf16_len(text);
    let from = clamp_index(index, length);
    if from >= length {
        return length;
    }
    if !is_web_backend(text_segmenter) {
        return next_segment_boundary(
            &(text_segmenter.segment)(text, granularity, locale),
            from,
            length,
        );
    }
    match granularity {
        TextSegmentGranularity::Grapheme => {
            let mut pos = 0;
            for grapheme in text.graphemes(true) {
                if pos > from {
                    return pos;
                }
                pos += utf16_len(grapheme);
            }
        }
        TextSegmentGranularity::Word => {
            let mut pos = 0;
            for word in text.split_word_bounds() {
                if pos > from {
                    return pos;
                }
                pos += utf16_len(word);
            }
        }
        TextSegmentGranularity::Sentence => {
            let mut pos = 0;
            for sentence in text.split_sentence_bounds() {
                if pos > from {
                    return pos;
                }
                pos += utf16_len(sentence);
            }
        }
    }
    return length;
}

pub fn get_next_word_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: i32,
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
    index: i32,
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
    index: i32,
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

fn get_previous_text_segment_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: i32,
    granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> usize {
    let from = clamp_index(index, utf16_len(text));
    if from == 0 {
        return 0;
    }
    if !is_web_backend(text_segmenter) {
        return previous_segment_boundary(
            &(text_segmenter.segment)(text, granularity, locale),
            from,
        );
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
                pos += utf16_len(grapheme);
            }
        }
        TextSegmentGranularity::Word => {
            let mut pos = 0;
            for word in text.split_word_bounds() {
                if pos >= from {
                    break;
                }
                previous = pos;
                pos += utf16_len(word);
            }
        }
        TextSegmentGranularity::Sentence => {
            let mut pos = 0;
            for sentence in text.split_sentence_bounds() {
                if pos >= from {
                    break;
                }
                previous = pos;
                pos += utf16_len(sentence);
            }
        }
    }
    return previous;
}

pub fn get_previous_word_boundary(
    text_segmenter: &HostTextSegmenterCapability,
    text: &str,
    index: i32,
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
    index: i32,
    locale: Option<&str>,
) -> Option<TextSegmentRange> {
    if text.is_empty() {
        return None;
    }
    let length = utf16_len(text);
    let clamped = clamp_index(index, length);
    // At the trailing boundary there is no segment starting at the text length; resolve
    // against the last character so a double-click at the end still selects the
    // final word.
    let lookup = if clamped == length {
        length - 1
    } else {
        clamped
    };
    if is_web_backend(text_segmenter) {
        let mut pos = 0;
        for word in text.split_word_bounds() {
            let end = pos + utf16_len(word);
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

fn is_web_backend(text_segmenter: &HostTextSegmenterCapability) -> bool {
    return *text_segmenter == *WEB_TEXT_SEGMENTER_BACKEND;
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
