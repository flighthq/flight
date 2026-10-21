use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_compression::HostDecompressDeflateCapability;
use flight_entity::{Int32Array, Ref, Uint8Array, Uint32Array, allocate_entity};
use flight_font::{
    FontFormatData, FontFormatUint8Array, GlyphOutlineMetrics, GlyphOutlineSource,
    detect_font_format, initialize_glyph_outline_source,
};
use flight_importdiagnostics::ImportDiagnostic;

use crate::cff_charstring::run_cff_charstring;
use crate::cff_table::read_cff_table;
use crate::open_type_cmap::read_open_type_codepoint_map;
use crate::open_type_glyf::{read_open_type_glyph_outline, read_open_type_glyph_ranges};
use crate::open_type_metrics::{
    read_open_type_advances, read_open_type_glyph_count, read_open_type_loca_format,
    read_open_type_metrics,
};
use crate::sfnt_table_directory::read_sfnt_table_directory;
use crate::types::{CffTable, SfntTableDirectory};
use crate::woff_font::read_woff_font;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OpenTypeFontExplanation {
    pub accepted: bool,
    pub reason: OpenTypeFontExplanationReason,
    pub format: String,
    pub table: String,
    pub table_count: usize,
    pub readable_table_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpenTypeFontExplanationReason {
    MalformedTable,
    MissingRequiredTable,
    Ok,
    TooShort,
    Unrecognized,
    UnsupportedContainer,
    UnsupportedOutlines,
}

#[derive(Clone)]
pub struct OpenTypeFontTables {
    pub advances: Ref<Box<Int32Array>>,
    pub bytes: ArrayBufferView,
    pub cff: Option<Arc<CffTable>>,
    pub codepoints: Ref<HashMap<u32, u32>>,
    pub directory: Arc<SfntTableDirectory>,
    pub glyph_count: usize,
    pub metrics: Arc<GlyphOutlineMetrics>,
    pub ranges: Option<Ref<Box<Uint32Array>>>,
}

pub fn create_glyph_outline_source_from_open_type_font(
    source: &ArrayBufferView,
    deflate: &HostDecompressDeflateCapability,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Arc<GlyphOutlineSource>> {
    crate::binary::assert_uint8_view(source);
    let storage = get_array_buffer_storage(&source.buffer);
    let guard = storage.read().unwrap();
    let source_bytes = &guard[source.byte_offset..source.byte_offset + source.byte_length];
    let parsed = read_open_type_font_tables(source_bytes, deflate, diagnostics, Some(source))?;
    let mut out: GlyphOutlineSource = allocate_entity();
    initialize_glyph_outline_source_from_open_type_font(&mut out, &parsed);
    return Some(Arc::new(out));
}

pub fn initialize_glyph_outline_source_from_open_type_font(
    out: &mut GlyphOutlineSource,
    tables: &OpenTypeFontTables,
) {
    crate::binary::assert_uint8_view(&tables.bytes);
    let glyph_count = tables.glyph_count;
    let bytes = tables.bytes.clone();
    let cff = tables.cff.clone();
    let ranges = tables.ranges.clone();
    let directory = Arc::clone(&tables.directory);
    let advances = Arc::clone(&tables.advances);
    let codepoints = Arc::clone(&tables.codepoints);
    let metrics = Arc::clone(&tables.metrics);
    initialize_glyph_outline_source(
        out,
        Arc::new(move |target, glyph_index| {
            if glyph_index < 0 || glyph_index as usize >= glyph_count {
                return false;
            }
            let storage = get_array_buffer_storage(&bytes.buffer);
            let guard = storage.read().unwrap();
            let bytes = &guard[bytes.byte_offset..bytes.byte_offset + bytes.byte_length];
            if let Some(cff) = &cff {
                let Some(charstring) = cff.charstrings.get(glyph_index as usize) else {
                    return false;
                };
                let local_subrs = cff
                    .local_subrs_by_glyph
                    .as_ref()
                    .and_then(|pools| pools.get(glyph_index as usize))
                    .unwrap_or(&cff.local_subrs);
                return run_cff_charstring(
                    target,
                    bytes,
                    charstring,
                    local_subrs,
                    &cff.global_subrs,
                );
            }
            let Some(ranges) = &ranges else {
                return false;
            };
            let ranges = ranges.read().unwrap();
            return read_open_type_glyph_outline(target, bytes, &directory, &ranges, glyph_index);
        }),
        Arc::new(move |glyph_index| {
            if glyph_index < 0 || glyph_index as usize >= glyph_count {
                return 0.0;
            }
            return advances.read().unwrap()[glyph_index as usize] as f32;
        }),
        Arc::new(move |code_point| {
            return codepoints
                .read()
                .unwrap()
                .get(&code_point)
                .map_or(-1, |index| *index as i32);
        }),
        Arc::new(move || Arc::clone(&metrics)),
    );
}

pub fn explain_open_type_font(
    bytes: &Uint8Array,
    deflate: &HostDecompressDeflateCapability,
) -> OpenTypeFontExplanation {
    let format = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }))
        .unwrap_or("")
        .to_string();
    let mut explanation = OpenTypeFontExplanation {
        accepted: false,
        reason: OpenTypeFontExplanationReason::TooShort,
        format: format.clone(),
        table: String::new(),
        table_count: 0,
        readable_table_count: 0,
    };
    if bytes.len() < 12 {
        return explanation;
    }
    if format.is_empty() {
        explanation.reason = OpenTypeFontExplanationReason::Unrecognized;
        return explanation;
    }
    if format != "truetype" && format != "opentype" && format != "woff" {
        explanation.reason = OpenTypeFontExplanationReason::UnsupportedContainer;
        return explanation;
    }
    let rebuilt;
    let unwrapped = if format == "woff" {
        let Some(value) = read_woff_font(bytes, &deflate.decompress, None) else {
            explanation.reason = OpenTypeFontExplanationReason::MalformedTable;
            return explanation;
        };
        rebuilt = value;
        &*rebuilt
    } else {
        bytes
    };
    let Some(directory) = read_sfnt_table_directory(unwrapped) else {
        return explanation;
    };
    explanation.readable_table_count = directory.tables.len();
    explanation.table_count = directory.declared_table_count;
    for tag in ["cmap", "head", "hhea", "hmtx", "maxp"] {
        if !directory.tables.contains_key(tag) {
            explanation.reason = OpenTypeFontExplanationReason::MissingRequiredTable;
            explanation.table = tag.to_string();
            return explanation;
        }
    }
    if !directory.tables.contains_key("glyf") {
        if directory.tables.contains_key("CFF2") && !directory.tables.contains_key("CFF ") {
            explanation.reason = OpenTypeFontExplanationReason::UnsupportedOutlines;
            explanation.table = "CFF2".to_string();
            return explanation;
        }
        if !directory.tables.contains_key("CFF ") {
            explanation.reason = OpenTypeFontExplanationReason::MissingRequiredTable;
            explanation.table = "glyf".to_string();
            return explanation;
        }
    } else if !directory.tables.contains_key("loca") {
        explanation.reason = OpenTypeFontExplanationReason::MissingRequiredTable;
        explanation.table = "loca".to_string();
        return explanation;
    }
    if read_open_type_font_tables(bytes, deflate, None, None).is_none() {
        explanation.reason = OpenTypeFontExplanationReason::MalformedTable;
        return explanation;
    }
    explanation.accepted = true;
    explanation.reason = OpenTypeFontExplanationReason::Ok;
    return explanation;
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the OpenTypeFontExplanationReason union
pub fn get_open_type_font_explanation_reason_string(
    value: OpenTypeFontExplanationReason,
) -> &'static str {
    return match value {
        OpenTypeFontExplanationReason::MalformedTable => "malformed-table",
        OpenTypeFontExplanationReason::MissingRequiredTable => "missing-required-table",
        OpenTypeFontExplanationReason::Ok => "ok",
        OpenTypeFontExplanationReason::TooShort => "too-short",
        OpenTypeFontExplanationReason::Unrecognized => "unrecognized",
        OpenTypeFontExplanationReason::UnsupportedContainer => "unsupported-container",
        OpenTypeFontExplanationReason::UnsupportedOutlines => "unsupported-outlines",
    };
}

fn owned_font_bytes(bytes: Box<Uint8Array>) -> ArrayBufferView {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes);
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}

// flight-lint: allow(conform-extra) D9 exact serialized string table for the OpenTypeFontExplanationReason union
pub fn parse_open_type_font_explanation_reason(
    value: &str,
) -> Option<OpenTypeFontExplanationReason> {
    return match value {
        "malformed-table" => Some(OpenTypeFontExplanationReason::MalformedTable),
        "missing-required-table" => Some(OpenTypeFontExplanationReason::MissingRequiredTable),
        "ok" => Some(OpenTypeFontExplanationReason::Ok),
        "too-short" => Some(OpenTypeFontExplanationReason::TooShort),
        "unrecognized" => Some(OpenTypeFontExplanationReason::Unrecognized),
        "unsupported-container" => Some(OpenTypeFontExplanationReason::UnsupportedContainer),
        "unsupported-outlines" => Some(OpenTypeFontExplanationReason::UnsupportedOutlines),
        _ => None,
    };
}

fn read_open_type_font_tables(
    source: &Uint8Array,
    deflate: &HostDecompressDeflateCapability,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    retained_source: Option<&ArrayBufferView>,
) -> Option<OpenTypeFontTables> {
    let format = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array {
        bytes: source,
    }))?;
    let bytes = if format == "truetype" || format == "opentype" {
        if let Some(retained_source) = retained_source {
            retained_source.clone()
        } else {
            owned_font_bytes(source.to_vec().into_boxed_slice())
        }
    } else if format == "woff" {
        owned_font_bytes(read_woff_font(source, &deflate.decompress, diagnostics)?)
    } else {
        return None;
    };
    let storage = get_array_buffer_storage(&bytes.buffer);
    let guard = storage.read().unwrap();
    let font = &guard[bytes.byte_offset..bytes.byte_offset + bytes.byte_length];
    let directory = read_sfnt_table_directory(font)?;
    let glyph_count = read_open_type_glyph_count(font, &directory);
    if glyph_count <= 0 {
        return None;
    }
    let glyph_count = glyph_count as usize;
    let metrics = read_open_type_metrics(font, &directory)?;
    let advances = read_open_type_advances(font, &directory, glyph_count)?;
    let codepoints = read_open_type_codepoint_map(font, &directory)?;
    let cff;
    let ranges;
    if directory.tables.contains_key("glyf") {
        let loca_format = read_open_type_loca_format(font, &directory);
        if loca_format == -1 {
            return None;
        }
        ranges = Some(Arc::new(RwLock::new(read_open_type_glyph_ranges(
            font,
            &directory,
            glyph_count,
            loca_format,
        )?)));
        cff = None;
    } else {
        cff = Some(Arc::new(read_cff_table(font, &directory)?));
        ranges = None;
    }
    return Some(OpenTypeFontTables {
        advances: Arc::new(RwLock::new(advances)),
        bytes: bytes.clone(),
        cff,
        codepoints: Arc::new(RwLock::new(codepoints)),
        directory: Arc::new(directory),
        glyph_count,
        metrics: Arc::new(metrics),
        ranges,
    });
}
