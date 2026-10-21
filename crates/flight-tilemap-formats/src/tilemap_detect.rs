//! Format detection and registry: maps text to its Tiled format kind, and manages the
//! two registries (map formats, tileset formats) with lazy built-in seeding
//! (TS `tilemapDetect.ts`).

use std::sync::Arc;

use flight_importdiagnostics::ImportDiagnostic;
use flight_registry::{KindMap, get_kind_map_keys, with_kind_map_entry, without_kind_map_entry};

use crate::tiled_json_parse::{parse_tiled_tileset_json, parse_tiled_tmj};
use crate::tiled_xml_parse::{parse_tiled_tileset, parse_tiled_tmx};
use crate::types::*;

pub fn apply_tilemap_import_options(
    tilemap_registry: &mut KindMap<TilemapFormatEntry>,
    tileset_registry: &mut KindMap<TilesetFormatEntry>,
    options: TilemapImportOptions,
) {
    if let Some(map_formats) = options.map_formats {
        for format in map_formats {
            *tilemap_registry = with_kind_map_entry(tilemap_registry, format.kind, format.entry);
        }
    }
    if let Some(tileset_formats) = options.tileset_formats {
        for format in tileset_formats {
            *tileset_registry = with_kind_map_entry(tileset_registry, format.kind, format.entry);
        }
    }
}

pub fn detect_tilemap_format(
    tilemap_registry: &KindMap<TilemapFormatEntry>,
    tileset_registry: &KindMap<TilesetFormatEntry>,
    text: &str,
) -> Option<TilemapFormatKind> {
    for (kind, entry) in &tilemap_registry.entries {
        if (entry.detect)(text) {
            return Some(kind.clone());
        }
    }
    for (kind, entry) in &tileset_registry.entries {
        if (entry.detect)(text) {
            return Some(kind.clone());
        }
    }
    return None;
}

pub fn get_tilemap_format<'a>(
    tilemap_registry: &'a KindMap<TilemapFormatEntry>,
    kind: &TilemapFormatKind,
) -> Option<&'a TilemapFormatEntry> {
    return tilemap_registry.entries.get(kind);
}

pub fn get_tilemap_format_kinds(
    tilemap_registry: &KindMap<TilemapFormatEntry>,
) -> Vec<TilemapFormatKind> {
    let mut kinds = Vec::new();
    get_kind_map_keys(&mut kinds, tilemap_registry);
    return kinds;
}

pub fn get_tileset_format<'a>(
    tileset_registry: &'a KindMap<TilesetFormatEntry>,
    kind: &TilemapFormatKind,
) -> Option<&'a TilesetFormatEntry> {
    return tileset_registry.entries.get(kind);
}

pub fn get_tileset_format_kinds(
    tileset_registry: &KindMap<TilesetFormatEntry>,
) -> Vec<TilemapFormatKind> {
    let mut kinds = Vec::new();
    get_kind_map_keys(&mut kinds, tileset_registry);
    return kinds;
}

pub fn parse_tilemap(
    tilemap_registry: &KindMap<TilemapFormatEntry>,
    tileset_registry: &KindMap<TilesetFormatEntry>,
    text: &str,
    format_kind: Option<&TilemapFormatKind>,
    options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledMap> {
    let kind = match format_kind {
        Some(k) => Some(k.clone()),
        None => detect_tilemap_format(tilemap_registry, tileset_registry, text),
    };
    let kind = kind?;
    let entry = get_tilemap_format(tilemap_registry, &kind)?;
    return (entry.parse)(text, options, diagnostics);
}

pub fn parse_tileset(
    tilemap_registry: &KindMap<TilemapFormatEntry>,
    tileset_registry: &KindMap<TilesetFormatEntry>,
    text: &str,
    format_kind: Option<&TilemapFormatKind>,
    options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledTileset> {
    let kind = match format_kind {
        Some(k) => Some(k.clone()),
        None => detect_tilemap_format(tilemap_registry, tileset_registry, text),
    };
    let kind = kind?;
    let entry = get_tileset_format(tileset_registry, &kind)?;
    return (entry.parse)(text, options, diagnostics);
}

pub fn register_tilemap_format(
    tilemap_registry: &mut KindMap<TilemapFormatEntry>,
    kind: TilemapFormatKind,
    entry: TilemapFormatEntry,
) {
    *tilemap_registry = with_kind_map_entry(tilemap_registry, kind, entry);
}

pub fn register_tileset_format(
    tileset_registry: &mut KindMap<TilesetFormatEntry>,
    kind: TilemapFormatKind,
    entry: TilesetFormatEntry,
) {
    *tileset_registry = with_kind_map_entry(tileset_registry, kind, entry);
}

pub fn unregister_tilemap_format(
    tilemap_registry: &mut KindMap<TilemapFormatEntry>,
    kind: &TilemapFormatKind,
) {
    *tilemap_registry = without_kind_map_entry(tilemap_registry, kind.clone());
}

pub fn unregister_tileset_format(
    tileset_registry: &mut KindMap<TilesetFormatEntry>,
    kind: &TilemapFormatKind,
) {
    *tileset_registry = without_kind_map_entry(tileset_registry, kind.clone());
}

pub fn tiled_tmx_tilemap_format() -> TilemapFormatDescriptor {
    return TilemapFormatDescriptor {
        kind: TILEMAP_FORMAT_KIND_TILED_TMX.to_string(),
        entry: TilemapFormatEntry {
            detect: Arc::new(|text| {
                read_tilemap_format_kind(text).as_deref() == Some(TILEMAP_FORMAT_KIND_TILED_TMX)
            }),
            parse: Arc::new(|text, options, diagnostics| parse_tiled_tmx(text, options, diagnostics)),
        },
    };
}

pub fn tiled_tmj_tilemap_format() -> TilemapFormatDescriptor {
    return TilemapFormatDescriptor {
        kind: TILEMAP_FORMAT_KIND_TILED_TMJ.to_string(),
        entry: TilemapFormatEntry {
            detect: Arc::new(|text| {
                read_tilemap_format_kind(text).as_deref() == Some(TILEMAP_FORMAT_KIND_TILED_TMJ)
            }),
            parse: Arc::new(|text, options, diagnostics| parse_tiled_tmj(text, options, diagnostics)),
        },
    };
}

pub fn tiled_tsx_tileset_format() -> TilesetFormatDescriptor {
    return TilesetFormatDescriptor {
        kind: TILEMAP_FORMAT_KIND_TILED_TSX.to_string(),
        entry: TilesetFormatEntry {
            detect: Arc::new(|text| {
                read_tilemap_format_kind(text).as_deref() == Some(TILEMAP_FORMAT_KIND_TILED_TSX)
            }),
            parse: Arc::new(|text, options, diagnostics| parse_tiled_tileset(text, options, diagnostics)),
        },
    };
}

pub fn tiled_tsj_tileset_format() -> TilesetFormatDescriptor {
    return TilesetFormatDescriptor {
        kind: TILEMAP_FORMAT_KIND_TILED_TSJ.to_string(),
        entry: TilesetFormatEntry {
            detect: Arc::new(|text| {
                read_tilemap_format_kind(text).as_deref() == Some(TILEMAP_FORMAT_KIND_TILED_TSJ)
            }),
            parse: Arc::new(|text, options, diagnostics| {
                parse_tiled_tileset_json(text, options, diagnostics)
            }),
        },
    };
}

pub fn tilemap_all_map_formats() -> Vec<TilemapFormatDescriptor> {
    return vec![tiled_tmj_tilemap_format(), tiled_tmx_tilemap_format()];
}

pub fn tilemap_all_tileset_formats() -> Vec<TilesetFormatDescriptor> {
    return vec![tiled_tsj_tileset_format(), tiled_tsx_tileset_format()];
}

pub fn create_default_tilemap_registry() -> KindMap<TilemapFormatEntry> {
    let mut registry = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    apply_tilemap_import_options(
        &mut registry,
        &mut KindMap {
            entries: std::collections::HashMap::new(),
            key_order: Vec::new(),
        },
        TilemapImportOptions {
            map_formats: Some(tilemap_all_map_formats()),
            tileset_formats: None,
        },
    );
    return registry;
}

pub fn create_default_tileset_registry() -> KindMap<TilesetFormatEntry> {
    let mut tilemap_reg = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    let mut registry = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    apply_tilemap_import_options(
        &mut tilemap_reg,
        &mut registry,
        TilemapImportOptions {
            map_formats: None,
            tileset_formats: Some(tilemap_all_tileset_formats()),
        },
    );
    return registry;
}

fn read_tilemap_format_kind(text: &str) -> Option<String> {
    let trimmed = text.trim_start();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('<') {
        let root = read_xml_root_element_name(trimmed)?;
        if root == "map" {
            return Some(TILEMAP_FORMAT_KIND_TILED_TMX.to_string());
        }
        if root == "tileset" {
            return Some(TILEMAP_FORMAT_KIND_TILED_TSX.to_string());
        }
        return None;
    }
    if !trimmed.starts_with('{') {
        return None;
    }
    let raw: serde_json::Value = serde_json::from_str(text).ok()?;
    let obj = raw.as_object()?;
    if let Some(type_val) = obj.get("type").and_then(|v| v.as_str()) {
        if type_val == "map" {
            return Some(TILEMAP_FORMAT_KIND_TILED_TMJ.to_string());
        }
        if type_val == "tileset" {
            return Some(TILEMAP_FORMAT_KIND_TILED_TSJ.to_string());
        }
        return None;
    }
    let tile_width = obj.get("tilewidth").and_then(|v| v.as_f64());
    let tile_height = obj.get("tileheight").and_then(|v| v.as_f64());
    if tile_width.is_none() || tile_height.is_none() {
        return None;
    }
    if obj.get("layers").and_then(|v| v.as_array()).is_some() {
        return Some(TILEMAP_FORMAT_KIND_TILED_TMJ.to_string());
    }
    let tileset_shaped = obj.get("tilecount").and_then(|v| v.as_f64()).is_some()
        || obj.get("image").and_then(|v| v.as_str()).is_some()
        || obj.get("tiles").and_then(|v| v.as_array()).is_some();
    if tileset_shaped {
        return Some(TILEMAP_FORMAT_KIND_TILED_TSJ.to_string());
    }
    return None;
}

fn read_xml_root_element_name(trimmed: &str) -> Option<String> {
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            let next = trimmed[index..].find('<');
            let Some(next) = next else {
                return None;
            };
            index += next;
            continue;
        }
        if trimmed[index..].starts_with("<?") || trimmed[index..].starts_with("<!") {
            let close = if trimmed[index..].starts_with("<!--") {
                trimmed[index..].find("-->").map(|p| p + 3)
            } else {
                trimmed[index..].find('>').map(|p| p + 1)
            };
            let Some(close) = close else {
                return None;
            };
            index += close;
            continue;
        }
        let rest = &trimmed[index..];
        let mut end = 1;
        if end >= rest.len() {
            return None;
        }
        let first = rest.as_bytes()[end];
        if !(first.is_ascii_alphabetic() || first == b'_') {
            return None;
        }
        end += 1;
        while end < rest.len() {
            let c = rest.as_bytes()[end];
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'.' || c == b':' || c == b'-' {
                end += 1;
            } else {
                break;
            }
        }
        return Some(rest[1..end].to_string());
    }
    return None;
}
