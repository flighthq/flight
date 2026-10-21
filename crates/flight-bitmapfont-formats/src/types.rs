use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use flight_bitmapfont::{BitmapFont, BitmapFontEncoding};
use flight_entity::{Kind, Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;
use flight_registry::KindMap;
use flight_textureatlas::TextureAtlas;

pub const BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY: &str = "BmFontBinary";
pub const BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON: &str = "BmFontJson";
pub const BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT: &str = "BmFontText";
pub const BITMAP_FONT_FORMAT_KIND_BM_FONT_XML: &str = "BmFontXml";

pub type BitmapFontFormatKind = Kind;
pub type BitmapFontPageResolver = Arc<dyn Fn(i32, &str) -> Option<Ref<TextureAtlas>> + Send + Sync>;

#[derive(Clone, Default)]
pub struct BitmapFontParseOptions {
    pub resolve_page: Option<BitmapFontPageResolver>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BitmapFontCharRecord {
    pub height: u32,
    pub id: u32,
    pub page: i32,
    pub width: u32,
    pub x: u32,
    pub xadvance: f32,
    pub xoffset: i32,
    pub y: u32,
    pub yoffset: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BitmapFontKerningRecord {
    pub amount: f32,
    pub first: u32,
    pub second: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BitmapFontPageRecord {
    pub file: String,
    pub id: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BitmapFontRecord {
    pub base: f32,
    pub chars: Vec<BitmapFontCharRecord>,
    pub encoding: BitmapFontEncoding,
    pub kernings: Vec<BitmapFontKerningRecord>,
    pub line_height: f32,
    pub pages: Vec<BitmapFontPageRecord>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapFontParseExplanationFormat {
    Fnt,
    Json,
    Unknown,
    Xml,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapFontParseExplanationReason {
    InvalidData,
    MissingChars,
    MissingCommon,
    Ok,
    UnresolvedPage,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BitmapFontParseExplanation {
    pub char_count: usize,
    pub detected_format: BitmapFontParseExplanationFormat,
    pub kerning_count: usize,
    pub page_count: usize,
    pub reason: BitmapFontParseExplanationReason,
    pub success: bool,
    pub unresolved_pages: Vec<i32>,
}

pub type BitmapFontFormatDetector = Arc<dyn Fn(&Uint8Array) -> bool + Send + Sync>;
pub type BitmapFontFormatParser = Arc<
    dyn Fn(
            &Uint8Array,
            Option<&BitmapFontParseOptions>,
            Option<&mut Vec<ImportDiagnostic>>,
        ) -> Option<Ref<BitmapFont>>
        + Send
        + Sync,
>;

#[derive(Clone)]
pub struct BitmapFontFormatEntry {
    pub detect: BitmapFontFormatDetector,
    pub parse: BitmapFontFormatParser,
}

#[derive(Clone)]
pub struct BitmapFontFormatDescriptor {
    pub entry: Arc<BitmapFontFormatEntry>,
    pub kind: BitmapFontFormatKind,
}

#[derive(Clone, Debug, Default)]
pub struct BitmapFontImportOptions {
    pub formats: Option<Vec<BitmapFontFormatDescriptor>>,
}

#[derive(Clone)]
pub(crate) struct RegisteredBitmapFontFormat {
    pub entry: Arc<BitmapFontFormatEntry>,
    pub order: usize,
}

#[derive(Clone)]
pub struct BitmapFontFormatRegistry {
    pub(crate) all_formats: Vec<BitmapFontFormatDescriptor>,
    pub(crate) formats: KindMap<RegisteredBitmapFontFormat>,
    pub(crate) next_format_order: usize,
}

pub(crate) fn empty_bitmap_font_format_map() -> KindMap<RegisteredBitmapFontFormat> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

// flight-lint: allow(conform-extra) D9: exact string table for the schema string union
pub fn get_bitmap_font_parse_explanation_format_string(
    value: BitmapFontParseExplanationFormat,
) -> &'static str {
    return match value {
        BitmapFontParseExplanationFormat::Fnt => "fnt",
        BitmapFontParseExplanationFormat::Json => "json",
        BitmapFontParseExplanationFormat::Unknown => "unknown",
        BitmapFontParseExplanationFormat::Xml => "xml",
    };
}

// flight-lint: allow(conform-extra) D9: exact string table for the schema string union
pub fn get_bitmap_font_parse_explanation_reason_string(
    value: BitmapFontParseExplanationReason,
) -> &'static str {
    return match value {
        BitmapFontParseExplanationReason::InvalidData => "invalid-data",
        BitmapFontParseExplanationReason::MissingChars => "missing-chars",
        BitmapFontParseExplanationReason::MissingCommon => "missing-common",
        BitmapFontParseExplanationReason::Ok => "ok",
        BitmapFontParseExplanationReason::UnresolvedPage => "unresolved-page",
    };
}

impl fmt::Debug for BitmapFontParseOptions {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("BitmapFontParseOptions")
            .field("resolve_page", &self.resolve_page.is_some())
            .finish();
    }
}

impl fmt::Debug for BitmapFontFormatEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("BitmapFontFormatEntry")
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for BitmapFontFormatDescriptor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("BitmapFontFormatDescriptor")
            .field("kind", &self.kind)
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for BitmapFontFormatRegistry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("BitmapFontFormatRegistry")
            .field("kinds", &self.formats.key_order)
            .finish();
    }
}
