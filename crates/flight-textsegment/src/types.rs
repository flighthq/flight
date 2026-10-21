/// Text segment granularity levels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TextSegmentGranularity {
    Grapheme = 0,
    Word = 1,
    Sentence = 2,
    Line = 3,
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
pub type TextSegmentGuard = fn();

/// Temporary local log level retained until the explicit flight-log state API lands.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

/// Temporary local log entry retained until the explicit flight-log state API lands.
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub key: String,
    pub level: LogLevel,
    pub message: String,
    pub source: String,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextSegmenterKind string union; the TS type package exports the union only
pub fn get_text_segmenter_kind_string(value: TextSegmenterKind) -> &'static str {
    return match value {
        TextSegmenterKind::Custom => "custom",
        TextSegmenterKind::WebIntl => "web-intl",
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
        return std::ptr::fn_addr_eq(self.segment, other.segment);
    }
}

impl Eq for HostTextSegmenterCapability {}

impl std::fmt::Debug for HostTextSegmenterCapability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return f.debug_struct("HostTextSegmenterCapability").finish();
    }
}
