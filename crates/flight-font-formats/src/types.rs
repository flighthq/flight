use std::collections::HashMap;
use std::sync::Arc;

use flight_buffer::ArrayBufferView;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CffIndex {
    pub end_offset: usize,
    pub entries: Vec<CffIndexEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CffIndexEntry {
    pub end: usize,
    pub start: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CffTable {
    pub charstrings: Vec<CffIndexEntry>,
    pub global_subrs: Vec<CffIndexEntry>,
    pub local_subrs: Arc<Vec<CffIndexEntry>>,
    pub local_subrs_by_glyph: Option<Vec<Arc<Vec<CffIndexEntry>>>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SfntTableDirectory {
    pub declared_table_count: usize,
    pub sfnt_version: u32,
    pub tables: HashMap<String, SfntTableRange>,
    /// D3 companion sequence: Map iteration follows first insertion, including overwritten tags.
    pub table_order: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SfntTableRange {
    pub length: usize,
    pub offset: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Woff2TableDirectory {
    pub entries: Vec<Woff2TableEntry>,
    pub stream_start: usize,
    pub total_uncompressed_length: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Woff2TableEntry {
    pub original_length: usize,
    pub tag: String,
    pub transform_length: usize,
    pub transform_version: u8,
    pub transformed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WoffChecksumMismatch {
    pub stored: u32,
    pub computed: u32,
    pub tag: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Woff2GlyfStreams {
    pub bbox_stream: ArrayBufferView,
    pub composite_stream: ArrayBufferView,
    pub flag_stream: ArrayBufferView,
    pub glyph_count: usize,
    pub glyph_stream: ArrayBufferView,
    pub index_format: i32,
    pub instruction_stream: ArrayBufferView,
    pub n_contour_stream: ArrayBufferView,
    pub n_points_stream: ArrayBufferView,
}
