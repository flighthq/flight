use std::collections::HashMap;
use std::sync::Arc;

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
