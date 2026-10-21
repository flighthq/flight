use std::sync::Arc;

use flight_entity::Kind;
use flight_requirement::{Requirement, RequirementFacet};

/// Whether a direct parser consumes raw bytes or decoded text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContentParserInputKind {
    Bytes,
    String,
}

/// One factual ownership row. Backend and provider names remain inert data.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementCatalogEntry {
    pub backend: String,
    pub facet: RequirementFacet,
    pub implementation_import: String,
    pub implementation_symbol: String,
    pub kind: Kind,
    pub family_order: Option<usize>,
    pub parser_field: Option<String>,
    pub parser_export: Option<String>,
    pub content_parser_input_kind: Option<ContentParserInputKind>,
    pub registrar_import: Option<String>,
    pub registrar_symbol: Option<String>,
}

/// Immutable shared identity for one catalog row. A caller's plain record is wrapped once when it
/// enters a catalog; queries and plans clone this reference rather than the record.
// flight-lint: allow(contract-vocabulary) Principal-approved Arc<T> row: immutable shared Readonly<T> object identity / shared_ptr<const T>; the vocabulary/lint row is pending
pub type RequirementCatalogEntryRef = Arc<RequirementCatalogEntry>;

/// One format-to-render implication.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementTranslation {
    pub from: Requirement,
    pub to: Vec<Requirement>,
}

/// Backend infrastructure needed beyond content-derived handlers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementBackend {
    pub infrastructure_import: String,
    pub infrastructure_symbol: String,
    pub name: String,
}

/// One exact backend/facet/kind gap that was deliberately declined.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementDisposition {
    pub backend: String,
    pub facet: RequirementFacet,
    pub kind: Kind,
    pub reason: String,
}

/// A caller-owned, open inventory. Built-in content is exposed separately.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequirementCatalog {
    pub entries: Vec<RequirementCatalogEntryRef>,
    pub backends: Option<Vec<RequirementBackend>>,
    pub dispositions: Option<Vec<RequirementDisposition>>,
    pub translations: Option<Vec<RequirementTranslation>>,
}
