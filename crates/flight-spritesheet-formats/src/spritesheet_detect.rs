use std::sync::Arc;

use flight_registry::{get_kind_map_keys, with_kind_map_entry, without_kind_map_entry};
use flight_spritesheet::SpritesheetData;
use regex::Regex;

use crate::aseprite_parse::parse_aseprite_spritesheet;
use crate::cocos_plist_parse::parse_cocos_plist_spritesheet;
use crate::libgdx_atlas_parse::parse_libgdx_atlas_spritesheet;
use crate::starling_parse::parse_starling_spritesheet;
use crate::texture_packer_parse::parse_texture_packer_spritesheet;
use crate::types::*;

// flight-lint: allow(conform-extra) D5: explicit registry state replaces the source hidden singleton
pub fn create_spritesheet_format_registry() -> SpritesheetFormatRegistry {
    let aseprite = SpritesheetFormatDescriptor {
        entry: Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(z_c_detect_aseprite),
            parse: Arc::new(|text, _options| parse_aseprite_spritesheet(text, None)),
        }),
        kind: SPRITESHEET_FORMAT_KIND_ASEPRITE.to_string(),
    };
    let cocos = SpritesheetFormatDescriptor {
        entry: Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(z_d_detect_cocos_plist),
            parse: Arc::new(|text, _options| parse_cocos_plist_spritesheet(text, None)),
        }),
        kind: SPRITESHEET_FORMAT_KIND_COCOS_PLIST.to_string(),
    };
    let texture_packer = SpritesheetFormatDescriptor {
        entry: Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(z_g_detect_texture_packer),
            parse: Arc::new(|text, _options| parse_texture_packer_spritesheet(text, None)),
        }),
        kind: SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER.to_string(),
    };
    let starling = SpritesheetFormatDescriptor {
        entry: Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(z_f_detect_starling),
            parse: Arc::new(|text, options| {
                parse_starling_spritesheet(
                    text,
                    Some(&StarlingParseOptions {
                        frame_duration: options.frame_duration,
                        image_height: options.image_height,
                        image_width: options.image_width,
                    }),
                    None,
                )
            }),
        }),
        kind: SPRITESHEET_FORMAT_KIND_STARLING.to_string(),
    };
    let libgdx = SpritesheetFormatDescriptor {
        entry: Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(z_e_detect_libgdx_atlas),
            parse: Arc::new(|text, options| {
                parse_libgdx_atlas_spritesheet(
                    text,
                    Some(&LibgdxAtlasParseOptions {
                        frame_duration: options.frame_duration,
                    }),
                    None,
                )
            }),
        }),
        kind: SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS.to_string(),
    };
    let all_formats = vec![aseprite, cocos, texture_packer, starling, libgdx];
    let mut registry = SpritesheetFormatRegistry {
        all_formats: all_formats.clone(),
        formats: empty_spritesheet_format_map(),
        next_format_order: 0,
    };
    apply_spritesheet_import_options(
        &mut registry,
        &SpritesheetImportOptions {
            formats: Some(all_formats),
        },
    );
    return registry;
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn apply_spritesheet_import_options(
    registry: &mut SpritesheetFormatRegistry,
    options: &SpritesheetImportOptions,
) {
    let Some(formats) = &options.formats else {
        return;
    };
    for format in formats {
        z_a_bind_spritesheet_format(registry, &format.kind, format.entry.clone());
    }
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn aseprite_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
) -> &SpritesheetFormatDescriptor {
    return z_b_built_in_descriptor(registry, SPRITESHEET_FORMAT_KIND_ASEPRITE);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn cocos_plist_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
) -> &SpritesheetFormatDescriptor {
    return z_b_built_in_descriptor(registry, SPRITESHEET_FORMAT_KIND_COCOS_PLIST);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn detect_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
    text: &str,
) -> Option<SpritesheetFormatKind> {
    let mut ordered = registry
        .formats
        .key_order
        .iter()
        .filter_map(|kind| {
            registry
                .formats
                .entries
                .get(kind)
                .map(|entry| (kind.clone(), entry.order))
        })
        .collect::<Vec<_>>();
    ordered.sort_by_key(|(_, order)| *order);
    for (kind, _) in ordered {
        if registry
            .formats
            .entries
            .get(&kind)
            .is_some_and(|registered| (registered.entry.detect)(text))
        {
            return Some(kind);
        }
    }
    return None;
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn get_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
    kind: &SpritesheetFormatKind,
) -> Option<Arc<SpritesheetFormatEntry>> {
    return registry
        .formats
        .entries
        .get(kind)
        .map(|registered| registered.entry.clone());
}

// flight-lint: allow(conform-params) D5/D9: explicit output and caller-owned registry replace source array/module state
pub fn get_spritesheet_format_kinds(
    out: &mut Vec<SpritesheetFormatKind>,
    registry: &SpritesheetFormatRegistry,
) {
    get_kind_map_keys(out, &registry.formats);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn libgdx_atlas_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
) -> &SpritesheetFormatDescriptor {
    return z_b_built_in_descriptor(registry, SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn parse_spritesheet(
    registry: &SpritesheetFormatRegistry,
    text: &str,
    format_kind: Option<&SpritesheetFormatKind>,
    options: Option<&SpritesheetParseOptions>,
) -> Option<SpritesheetData> {
    let detected;
    let kind = match format_kind {
        Some(kind) => kind,
        None => {
            detected = detect_spritesheet_format(registry, text);
            detected.as_ref()?
        }
    };
    let registered = registry.formats.entries.get(kind)?;
    let defaults = SpritesheetParseOptions::default();
    return Some((registered.entry.parse)(text, options.unwrap_or(&defaults)));
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn register_spritesheet_format(
    registry: &mut SpritesheetFormatRegistry,
    kind: &SpritesheetFormatKind,
    entry: Arc<SpritesheetFormatEntry>,
) {
    z_a_bind_spritesheet_format(registry, kind, entry);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn spritesheet_all_formats(
    registry: &SpritesheetFormatRegistry,
) -> &[SpritesheetFormatDescriptor] {
    return &registry.all_formats;
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn starling_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
) -> &SpritesheetFormatDescriptor {
    return z_b_built_in_descriptor(registry, SPRITESHEET_FORMAT_KIND_STARLING);
}

// flight-lint: allow(conform-extra) D5: immutable source const is retained inside caller-owned registry state
pub fn texture_packer_spritesheet_format(
    registry: &SpritesheetFormatRegistry,
) -> &SpritesheetFormatDescriptor {
    return z_b_built_in_descriptor(registry, SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER);
}

// flight-lint: allow(conform-params) D5: caller-owned registry replaces source hidden state
pub fn unregister_spritesheet_format(
    registry: &mut SpritesheetFormatRegistry,
    kind: &SpritesheetFormatKind,
) {
    registry.formats = without_kind_map_entry(&registry.formats, kind.clone());
}

fn z_a_bind_spritesheet_format(
    registry: &mut SpritesheetFormatRegistry,
    kind: &SpritesheetFormatKind,
    entry: Arc<SpritesheetFormatEntry>,
) {
    let order = registry.formats.entries.get(kind).map_or_else(
        || {
            let order = registry.next_format_order;
            registry.next_format_order += 1;
            order
        },
        |current| current.order,
    );
    registry.formats = with_kind_map_entry(
        &registry.formats,
        kind.clone(),
        RegisteredSpritesheetFormat { entry, order },
    );
}

fn z_b_built_in_descriptor<'a>(
    registry: &'a SpritesheetFormatRegistry,
    kind: &str,
) -> &'a SpritesheetFormatDescriptor {
    for descriptor in &registry.all_formats {
        if descriptor.kind == kind {
            return descriptor;
        }
    }
    unreachable!("the registry constructor retains every built-in descriptor");
}

fn z_c_detect_aseprite(text: &str) -> bool {
    return text.trim_start().starts_with('{')
        && Regex::new(r#"\"meta\"\s*:"#).unwrap().is_match(text)
        && Regex::new(r"(?i)aseprite\.org").unwrap().is_match(text);
}

fn z_d_detect_cocos_plist(text: &str) -> bool {
    let trimmed = text.trim_start();
    return trimmed.starts_with('<')
        && Regex::new(r"(?i)<plist\b").unwrap().is_match(text)
        && Regex::new(r"(?i)<key>\s*frames\s*</key>\s*<dict\b")
            .unwrap()
            .is_match(text);
}

fn z_e_detect_libgdx_atlas(text: &str) -> bool {
    let trimmed = text.trim_start();
    if trimmed.starts_with('<') || trimmed.starts_with('{') {
        return false;
    }
    return Regex::new(r"(?m)^\s*rotate\s*:").unwrap().is_match(text)
        || Regex::new(r"(?m)^\s*xy\s*:").unwrap().is_match(text);
}

fn z_f_detect_starling(text: &str) -> bool {
    return Regex::new(r"(?i)<TextureAtlas\b").unwrap().is_match(text);
}

fn z_g_detect_texture_packer(text: &str) -> bool {
    return text.trim_start().starts_with('{')
        && Regex::new(r#"\"meta\"\s*:"#).unwrap().is_match(text)
        && Regex::new(r#"\"app\"\s*:"#).unwrap().is_match(text);
}
