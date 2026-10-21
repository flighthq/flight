/// Text segment granularity levels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TextSegmentGranularity {
    Grapheme = 0,
    Word = 1,
    Sentence = 2,
    Line = 3,
}

/// A single text segment with position and content information.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextSegment {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub is_word_like: Option<bool>,
}

/// A range within text defined by start and end positions.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextSegmentRange {
    pub start: usize,
    pub end: usize,
}

/// Backend capability for text segmentation.
///
/// In TypeScript this is an interface with a `segment` method. In the Rust IR it is
/// a struct holding a function pointer. Identity comparison (used to detect the
/// bundled web backend) works through fn-pointer equality.
#[derive(Clone, Copy)]
pub struct HostTextSegmenterCapability {
    pub segment: fn(&str, TextSegmentGranularity, Option<&str>) -> Vec<TextSegment>,
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

/// Explanation of which segmenter backend is active.
#[derive(Clone, Debug, PartialEq)]
pub struct TextSegmenterExplanation {
    pub available: bool,
    pub backend: String,
    pub intl_segmenter_available: bool,
}

/// Guard callback type for text segmenter warnings.
pub type TextSegmentGuard = fn();
