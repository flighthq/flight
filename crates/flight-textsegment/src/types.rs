//! flight-compiler: target-native

use std::sync::Arc;

/// Text segment granularity levels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TextSegmentGranularity {
    Grapheme = 0,
    Word = 1,
    Sentence = 2,
}

/// A single text segment whose half-open `start..end` range uses UTF-16 code-unit offsets.
/// The text itself remains UTF-8 in Rust.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextSegment {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub is_word_like: Option<bool>,
}

/// A half-open range within text, measured in UTF-16 code units.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextSegmentRange {
    pub start: usize,
    pub end: usize,
}

/// The text segmentation capability group (TS `HostTextSegmentCapabilities`). An omitted slot is
/// capability absence.
#[derive(Clone, Default)]
pub struct HostTextSegmentCapabilities {
    pub segmenter: Option<HostTextSegmenterCapability>,
}

/// Backend capability for text segmentation.
///
/// In TypeScript this is an interface with a `segment` method. In the Rust IR it is
/// a struct holding a function pointer. Returned segment offsets use UTF-16 code units.
/// Identity comparison (used to detect the bundled web backend) works through fn-pointer equality.
#[derive(Clone, Copy)]
pub struct HostTextSegmenterCapability {
    pub segment: fn(&str, TextSegmentGranularity, Option<&str>) -> Vec<TextSegment>,
}

/// Provider category reported by [`TextSegmenterExplanation`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TextSegmenterKind {
    Custom = 0,
    WebIntl = 1,
}

/// Explanation of which segmenter backend is active.
#[derive(Clone, Debug, PartialEq)]
pub struct TextSegmenterExplanation {
    pub available: bool,
    pub backend: TextSegmenterKind,
    pub intl_segmenter_available: bool,
}

/// Guard callback type for text segmenter warnings.
pub type TextSegmentGuard = Arc<dyn Fn() + Send + Sync>;

fn are_host_text_segmenter_capabilities_equal(
    capability: &HostTextSegmenterCapability,
    other: &HostTextSegmenterCapability,
) -> bool {
    return std::ptr::fn_addr_eq(capability.segment, other.segment);
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextSegmentGranularity string union; the TS type package exports the union only
pub fn get_text_segment_granularity_string(value: TextSegmentGranularity) -> &'static str {
    return match value {
        TextSegmentGranularity::Grapheme => "grapheme",
        TextSegmentGranularity::Word => "word",
        TextSegmentGranularity::Sentence => "sentence",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextSegmenterKind string union; the TS type package exports the union only
pub fn get_text_segmenter_kind_string(value: TextSegmenterKind) -> &'static str {
    return match value {
        TextSegmenterKind::Custom => "custom",
        TextSegmenterKind::WebIntl => "web-intl",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextSegmentGranularity string union; the TS type package exports the union only
pub fn parse_text_segment_granularity(value: &str) -> Option<TextSegmentGranularity> {
    return match value {
        "grapheme" => Some(TextSegmentGranularity::Grapheme),
        "word" => Some(TextSegmentGranularity::Word),
        "sentence" => Some(TextSegmentGranularity::Sentence),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextSegmenterKind string union; the TS type package exports the union only
pub fn parse_text_segmenter_kind(value: &str) -> Option<TextSegmenterKind> {
    return match value {
        "custom" => Some(TextSegmenterKind::Custom),
        "web-intl" => Some(TextSegmenterKind::WebIntl),
        _ => None,
    };
}

impl PartialEq for HostTextSegmenterCapability {
    fn eq(&self, other: &Self) -> bool {
        return are_host_text_segmenter_capabilities_equal(self, other);
    }
}

impl Eq for HostTextSegmenterCapability {}

impl std::fmt::Debug for HostTextSegmenterCapability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f.debug_struct("HostTextSegmenterCapability").finish();
    }
}
