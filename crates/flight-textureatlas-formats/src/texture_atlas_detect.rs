use std::collections::HashMap;
use std::sync::Arc;

use flight_registry::{KindMap, get_kind_map_keys, with_kind_map_entry, without_kind_map_entry};
use flight_textureatlas::TextureAtlas;

use crate::json::{RawAtlasDocument, RawFrames};
use crate::texture_atlas_aseprite_parse::parse_texture_atlas_aseprite_json;
use crate::texture_atlas_libgdx_parse::parse_texture_atlas_libgdx_atlas;
use crate::texture_atlas_starling_parse::parse_texture_atlas_starling_xml;
use crate::texture_packer_atlas_parse::parse_texture_packer_atlas_json;
use crate::types::*;

/// Creates caller-owned registry state seeded with the four built-in mutually exclusive formats.
// flight-lint: allow(conform-extra) D5: explicit registry state replaces the source hidden singleton
pub fn create_texture_atlas_format_registry() -> TextureAtlasFormatRegistry {
    let aseprite = TextureAtlasFormatDescriptor {
        entry: Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(detect_aseprite),
            parse: Arc::new(|atlas, content, _options| {
                parse_texture_atlas_aseprite_json(atlas, content)
            }),
        }),
        kind: TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE.to_string(),
    };
    let libgdx = TextureAtlasFormatDescriptor {
        entry: Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(detect_libgdx_atlas),
            parse: Arc::new(|atlas, content, _options| {
                parse_texture_atlas_libgdx_atlas(atlas, content)
            }),
        }),
        kind: TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS.to_string(),
    };
    let starling = TextureAtlasFormatDescriptor {
        entry: Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(detect_starling),
            parse: Arc::new(|atlas, content, _options| {
                parse_texture_atlas_starling_xml(atlas, content)
            }),
        }),
        kind: TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string(),
    };
    let texture_packer = TextureAtlasFormatDescriptor {
        entry: Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(detect_texture_packer),
            parse: Arc::new(|atlas, content, options| {
                parse_texture_packer_atlas_json(atlas, content, Some(options))
            }),
        }),
        kind: TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER.to_string(),
    };
    let all_formats = vec![aseprite, libgdx, starling, texture_packer];
    let mut registry = TextureAtlasFormatRegistry {
        all_formats: all_formats.clone(),
        formats: KindMap {
            entries: HashMap::new(),
            key_order: Vec::new(),
        },
        next_format_order: 0,
    };
    apply_texture_atlas_import_options(
        &mut registry,
        &TextureAtlasImportOptions {
            formats: Some(all_formats),
        },
    );
    return registry;
}

/// Applies exactly the named descriptors. Missing `formats` installs nothing.
// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn apply_texture_atlas_import_options(
    registry: &mut TextureAtlasFormatRegistry,
    options: &TextureAtlasImportOptions,
) {
    let Some(formats) = &options.formats else {
        return;
    };
    for format in formats {
        bind_texture_atlas_format(registry, &format.kind, format.entry.clone());
    }
}

/// Returns the caller-owned Aseprite descriptor retained by this registry.
// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn aseprite_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
) -> &TextureAtlasFormatDescriptor {
    return built_in_descriptor(registry, TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE);
}

/// Detects a registered format, or `None` for empty, malformed or unknown content.
// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn detect_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
    content: &str,
) -> Option<TextureAtlasFormatKind> {
    if content.trim_start().is_empty() {
        return None;
    }
    let mut order: Vec<(TextureAtlasFormatKind, usize)> = Vec::new();
    for kind in &registry.formats.key_order {
        let Some(registered) = registry.formats.entries.get(kind) else {
            continue;
        };
        order.push((kind.clone(), registered.order));
    }
    order.sort_by_key(|(_, order)| *order);
    for (kind, _) in order {
        let Some(registered) = registry.formats.entries.get(&kind) else {
            continue;
        };
        if (registered.entry.detect)(content) {
            return Some(kind);
        }
    }
    return None;
}

/// Returns the registered entry without projecting or cloning its callback record.
// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn get_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
    kind: &TextureAtlasFormatKind,
) -> Option<Arc<TextureAtlasFormatEntry>> {
    return registry
        .formats
        .entries
        .get(kind)
        .map(|registered| registered.entry.clone());
}

/// Writes the sorted registered kind snapshot to `out`.
// flight-lint: allow(conform-params) D5/D9: caller-owned registry and explicit output replace hidden state and returned array
pub fn get_texture_atlas_format_kinds(
    out: &mut Vec<TextureAtlasFormatKind>,
    registry: &TextureAtlasFormatRegistry,
) {
    get_kind_map_keys(out, &registry.formats);
}

/// Returns the caller-owned libGDX descriptor retained by this registry.
// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn libgdx_atlas_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
) -> &TextureAtlasFormatDescriptor {
    return built_in_descriptor(registry, TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS);
}

/// Parses into the same caller-owned atlas. False is the source `null` sentinel for no format.
// flight-lint: allow(conform-params) D5/D9: mutable output is first and caller-owned registry replaces hidden state
pub fn parse_texture_atlas(
    atlas: &mut TextureAtlas,
    registry: &TextureAtlasFormatRegistry,
    content: &str,
    format_kind: Option<&TextureAtlasFormatKind>,
    options: Option<&TextureAtlasParseOptions>,
) -> bool {
    let detected;
    let kind = match format_kind {
        Some(kind) => kind,
        None => {
            detected = detect_texture_atlas_format(registry, content);
            let Some(kind) = detected.as_ref() else {
                return false;
            };
            kind
        }
    };
    let Some(registered) = registry.formats.entries.get(kind) else {
        return false;
    };
    let defaults = TextureAtlasParseOptions::default();
    (registered.entry.parse)(atlas, content, options.unwrap_or(&defaults));
    return true;
}

/// Registers or replaces an entry; replacement retains the kind's detection position.
// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn register_texture_atlas_format(
    registry: &mut TextureAtlasFormatRegistry,
    kind: &TextureAtlasFormatKind,
    entry: Arc<TextureAtlasFormatEntry>,
) {
    bind_texture_atlas_format(registry, kind, entry);
}

/// Returns the caller-owned Starling descriptor retained by this registry.
// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn starling_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
) -> &TextureAtlasFormatDescriptor {
    return built_in_descriptor(registry, TEXTURE_ATLAS_FORMAT_KIND_STARLING);
}

/// Returns the full preset in its stable alphabetical-by-kind source order.
// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn texture_atlas_all_formats(
    registry: &TextureAtlasFormatRegistry,
) -> &[TextureAtlasFormatDescriptor] {
    return &registry.all_formats;
}

/// Returns the caller-owned TexturePacker descriptor retained by this registry.
// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn texture_packer_texture_atlas_format(
    registry: &TextureAtlasFormatRegistry,
) -> &TextureAtlasFormatDescriptor {
    return built_in_descriptor(registry, TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER);
}

/// Removes a registered kind, including a caller override of a built-in.
// flight-lint: allow(conform-params) D5: caller-owned registry replaces the source hidden singleton
pub fn unregister_texture_atlas_format(
    registry: &mut TextureAtlasFormatRegistry,
    kind: &TextureAtlasFormatKind,
) {
    registry.formats = without_kind_map_entry(&registry.formats, kind.clone());
}

fn bind_texture_atlas_format(
    registry: &mut TextureAtlasFormatRegistry,
    kind: &TextureAtlasFormatKind,
    entry: Arc<TextureAtlasFormatEntry>,
) {
    let order = match registry.formats.entries.get(kind) {
        Some(current) => current.order,
        None => {
            let order = registry.next_format_order;
            registry.next_format_order += 1;
            order
        }
    };
    registry.formats = with_kind_map_entry(
        &registry.formats,
        kind.clone(),
        RegisteredTextureAtlasFormat { entry, order },
    );
}

fn built_in_descriptor<'a>(
    registry: &'a TextureAtlasFormatRegistry,
    kind: &str,
) -> &'a TextureAtlasFormatDescriptor {
    for descriptor in &registry.all_formats {
        if descriptor.kind == kind {
            return descriptor;
        }
    }
    unreachable!("the registry constructor installs every built-in descriptor");
}

fn detect_aseprite(content: &str) -> bool {
    return read_json_atlas_kind(content).as_deref() == Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE);
}

fn detect_libgdx_atlas(content: &str) -> bool {
    let trimmed = content.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('<') || trimmed.starts_with('{') {
        return false;
    }
    let mut has_page_field = false;
    let mut has_region_field = false;
    for line in trimmed.lines() {
        let line = line.trim_start();
        has_page_field |= ["size", "format", "filter", "repeat"].iter().any(|key| {
            line.strip_prefix(key)
                .is_some_and(|tail| tail.trim_start().starts_with(':'))
        });
        has_region_field |= ["xy", "orig"].iter().any(|key| {
            line.strip_prefix(key)
                .is_some_and(|tail| tail.trim_start().starts_with(':'))
        });
    }
    return has_page_field && has_region_field;
}

fn detect_starling(content: &str) -> bool {
    let trimmed = content.trim_start();
    return trimmed.starts_with('<') && trimmed.contains("<TextureAtlas");
}

fn detect_texture_packer(content: &str) -> bool {
    return read_json_atlas_kind(content).as_deref()
        == Some(TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER);
}

fn read_json_atlas_kind(content: &str) -> Option<TextureAtlasFormatKind> {
    if !content.trim_start().starts_with('{') {
        return None;
    }
    let doc = serde_json::from_str::<RawAtlasDocument>(content).ok()?;
    let app = doc
        .meta
        .as_ref()
        .and_then(|meta| meta.app.as_ref())
        .map_or_else(String::new, |app| app.to_lowercase());
    if app.contains("aseprite") {
        return Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE.to_string());
    }
    if app.contains("texturepacker") || app.contains("codeandweb") {
        return Some(TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER.to_string());
    }
    let first = match &doc.frames {
        RawFrames::Array(frames) => frames.values.first(),
        RawFrames::Hash(frames) => frames.values.first().map(|frame| &frame.value),
    };
    if first.is_some_and(|frame| frame.duration.is_some()) {
        return Some(TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE.to_string());
    }
    return Some(TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER.to_string());
}
