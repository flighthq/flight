use std::sync::Arc;

use flight_bitmapfont::{BitmapFont, BitmapFontGuardStateRef};
use flight_encoding::decode_utf8;
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;
use flight_registry::{get_kind_map_keys, with_kind_map_entry, without_kind_map_entry};

use crate::bitmap_font_binary::parse_bitmap_font_binary;
use crate::bitmap_font_fnt::parse_bitmap_font_fnt;
use crate::bitmap_font_format_kind::read_bitmap_font_format_kind;
use crate::bitmap_font_json::parse_bitmap_font_json;
use crate::bitmap_font_xml::parse_bitmap_font_xml;
use crate::types::*;

// flight-lint: allow(conform-extra) D5: explicit registry and guard state replace source module state
pub fn create_bitmap_font_format_registry(
    guard_state: &BitmapFontGuardStateRef,
) -> BitmapFontFormatRegistry {
    let binary_guard = guard_state.clone();
    let binary = BitmapFontFormatDescriptor {
        entry: Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|bytes| {
                read_bitmap_font_format_kind(bytes).as_deref()
                    == Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY)
            }),
            parse: Arc::new(move |bytes, options, diagnostics| {
                parse_bitmap_font_binary(&binary_guard, bytes, options, diagnostics)
            }),
        }),
        kind: BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string(),
    };
    let json_guard = guard_state.clone();
    let json = BitmapFontFormatDescriptor {
        entry: Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|bytes| {
                read_bitmap_font_format_kind(bytes).as_deref()
                    == Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON)
            }),
            parse: Arc::new(move |bytes, options, diagnostics| {
                parse_bitmap_font_json(
                    &json_guard,
                    &decode_utf8(bytes, None, None),
                    options,
                    diagnostics,
                )
            }),
        }),
        kind: BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON.to_string(),
    };
    let text_guard = guard_state.clone();
    let text = BitmapFontFormatDescriptor {
        entry: Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|bytes| {
                read_bitmap_font_format_kind(bytes).as_deref()
                    == Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT)
            }),
            parse: Arc::new(move |bytes, options, diagnostics| {
                parse_bitmap_font_fnt(
                    &text_guard,
                    &decode_utf8(bytes, None, None),
                    options,
                    diagnostics,
                )
            }),
        }),
        kind: BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string(),
    };
    let xml_guard = guard_state.clone();
    let xml = BitmapFontFormatDescriptor {
        entry: Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|bytes| {
                read_bitmap_font_format_kind(bytes).as_deref()
                    == Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_XML)
            }),
            parse: Arc::new(move |bytes, options, diagnostics| {
                parse_bitmap_font_xml(
                    &xml_guard,
                    &decode_utf8(bytes, None, None),
                    options,
                    diagnostics,
                )
            }),
        }),
        kind: BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string(),
    };
    let all_formats = vec![binary, json, text, xml];
    let mut registry = BitmapFontFormatRegistry {
        all_formats: all_formats.clone(),
        formats: empty_bitmap_font_format_map(),
        next_format_order: 0,
    };
    apply_bitmap_font_import_options(
        &mut registry,
        &BitmapFontImportOptions {
            formats: Some(all_formats),
        },
    );
    return registry;
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn apply_bitmap_font_import_options(
    registry: &mut BitmapFontFormatRegistry,
    options: &BitmapFontImportOptions,
) {
    let Some(formats) = &options.formats else {
        return;
    };
    for format in formats {
        bind_bitmap_font_format(registry, &format.kind, format.entry.clone());
    }
}

fn bind_bitmap_font_format(
    registry: &mut BitmapFontFormatRegistry,
    kind: &BitmapFontFormatKind,
    entry: Arc<BitmapFontFormatEntry>,
) {
    let order = registry.formats.entries.get(kind).map_or_else(
        || {
            let order = registry.next_format_order;
            registry.next_format_order += 1;
            order
        },
        |registered| registered.order,
    );
    registry.formats = with_kind_map_entry(
        &registry.formats,
        kind.clone(),
        RegisteredBitmapFontFormat { entry, order },
    );
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn bitmap_font_all_formats(
    registry: &BitmapFontFormatRegistry,
) -> &[BitmapFontFormatDescriptor] {
    return &registry.all_formats;
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn bm_font_binary_format(registry: &BitmapFontFormatRegistry) -> &BitmapFontFormatDescriptor {
    return built_in_descriptor(registry, BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn bm_font_json_format(registry: &BitmapFontFormatRegistry) -> &BitmapFontFormatDescriptor {
    return built_in_descriptor(registry, BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn bm_font_text_format(registry: &BitmapFontFormatRegistry) -> &BitmapFontFormatDescriptor {
    return built_in_descriptor(registry, BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn bm_font_xml_format(registry: &BitmapFontFormatRegistry) -> &BitmapFontFormatDescriptor {
    return built_in_descriptor(registry, BITMAP_FONT_FORMAT_KIND_BM_FONT_XML);
}

fn built_in_descriptor<'a>(
    registry: &'a BitmapFontFormatRegistry,
    kind: &str,
) -> &'a BitmapFontFormatDescriptor {
    for descriptor in &registry.all_formats {
        if descriptor.kind == kind {
            return descriptor;
        }
    }
    unreachable!("the registry constructor retains every built-in descriptor");
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn detect_bitmap_font_format(
    registry: &BitmapFontFormatRegistry,
    bytes: &Uint8Array,
) -> Option<BitmapFontFormatKind> {
    let mut order = Vec::new();
    for kind in &registry.formats.key_order {
        if let Some(registered) = registry.formats.entries.get(kind) {
            order.push((kind.clone(), registered.order));
        }
    }
    order.sort_by_key(|(_, position)| *position);
    for (kind, _) in order {
        if registry
            .formats
            .entries
            .get(&kind)
            .is_some_and(|registered| (registered.entry.detect)(bytes))
        {
            return Some(kind);
        }
    }
    return None;
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn get_bitmap_font_format(
    registry: &BitmapFontFormatRegistry,
    kind: &BitmapFontFormatKind,
) -> Option<Arc<BitmapFontFormatEntry>> {
    return registry
        .formats
        .entries
        .get(kind)
        .map(|registered| registered.entry.clone());
}

// flight-lint: allow(conform-params) D5/D9: caller-owned registry and explicit output replace hidden state and returned array
pub fn get_bitmap_font_format_kinds(
    out: &mut Vec<BitmapFontFormatKind>,
    registry: &BitmapFontFormatRegistry,
) {
    get_kind_map_keys(out, &registry.formats);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn parse_bitmap_font(
    registry: &BitmapFontFormatRegistry,
    bytes: &Uint8Array,
    format_kind: Option<&BitmapFontFormatKind>,
    options: Option<&BitmapFontParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<BitmapFont>> {
    let detected;
    let kind = match format_kind {
        Some(kind) => kind,
        None => {
            detected = detect_bitmap_font_format(registry, bytes);
            detected.as_ref()?
        }
    };
    let entry = registry.formats.entries.get(kind)?;
    return (entry.entry.parse)(bytes, options, diagnostics);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn register_bitmap_font_format(
    registry: &mut BitmapFontFormatRegistry,
    kind: &BitmapFontFormatKind,
    entry: Arc<BitmapFontFormatEntry>,
) {
    bind_bitmap_font_format(registry, kind, entry);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn unregister_bitmap_font_format(
    registry: &mut BitmapFontFormatRegistry,
    kind: &BitmapFontFormatKind,
) {
    registry.formats = without_kind_map_entry(&registry.formats, kind.clone());
}
