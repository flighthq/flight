mod enable_text_segment_guards;
mod text_segment;
mod text_segment_boundary;
mod text_segment_guards;
mod text_segmenter_backend;
mod text_units;
mod types;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types their public
// signatures require. Guard installation internals and test seams stay in `contract`.
pub use contract::disable_text_segment_guards;
pub use contract::enable_text_segment_guards;
pub use contract::explain_text_segmenter_backend;
pub use contract::get_next_grapheme_boundary;
pub use contract::get_next_sentence_boundary;
pub use contract::get_next_word_boundary;
pub use contract::get_previous_grapheme_boundary;
pub use contract::get_previous_sentence_boundary;
pub use contract::get_previous_word_boundary;
pub use contract::get_word_range_at;
pub use contract::segment_graphemes;
pub use contract::segment_sentences;
pub use contract::segment_words;
pub use contract::web_text_segmenter_backend;

pub use contract::HostTextSegmenterCapability;
pub use contract::TextSegment;
pub use contract::TextSegmentGranularity;
pub use contract::TextSegmentRange;
pub use contract::TextSegmenterExplanation;
pub use contract::TextSegmenterKind;
