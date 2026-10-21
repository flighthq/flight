//! The built-in particle format descriptors and the explicit install step (TS
//! `registerBuiltInParticleFormats.ts`).

use std::sync::Arc;

use serde_json::Value;

use crate::format_registry::{ParticleFormatRegistry, register_particle_format};
use crate::libgdx_parse::{
    LibgdxParseOptions, parse_libgdx_particle, parse_libgdx_particle_document,
};
use crate::libgdx_serialize::serialize_libgdx_particle_document;
use crate::particle_designer_parse::{
    ParticleDesignerParseOptions, parse_particle_designer_plist,
    parse_particle_designer_plist_document,
};
use crate::particle_designer_serialize::serialize_particle_designer_plist_document;
use crate::pixi_parse::{parse_pixi_particle, parse_pixi_particle_document};
use crate::spine_parse::{parse_spine_particle, parse_spine_particle_document};
use crate::spine_serialize::serialize_spine_particle_document;
use crate::starling_pex_parse::{
    StarlingPexParseOptions, parse_starling_pex, parse_starling_pex_document,
};
use crate::starling_pex_serialize::serialize_starling_pex_document;
use crate::types::*;
use crate::unity_parse::{UnityParseOptions, parse_unity_particle, parse_unity_particle_document};
use crate::unity_serialize::serialize_unity_particle_document;

/// Every built-in particle format, in the order the registry consults them (TS
/// `particleAllFormats`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor array; Rust constructs it because the codecs hold callbacks
pub fn create_particle_all_formats() -> Vec<ParticleFormatDescriptor> {
    return vec![
        get_libgdx_particle_format(),
        get_starling_pex_particle_format(),
        get_particle_designer_particle_format(),
        get_unity_particle_format(),
        get_pixi_particle_format(),
        get_spine_particle_format(),
    ];
}

/// Installs the formats named in `options` into the registry, in list order (TS
/// `applyParticleImportOptions`). Applying a subset never reorders what was already installed.
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn apply_particle_import_options(
    registry: &mut ParticleFormatRegistry,
    options: &ParticleImportOptions,
) {
    if let Some(formats) = &options.formats {
        for format in formats {
            register_particle_format(registry, &format.kind, format.codec.as_ref().clone());
        }
    }
}

/// The built-in LibGDX descriptor (TS `libgdxParticleFormat`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_libgdx_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| {
                return text
                    .trim_start()
                    .lines()
                    .next()
                    .map(|line| line.trim() == "Particle Effect")
                    .unwrap_or(false);
            }),
            parse_to_config: Arc::new(|text, options| {
                return parse_libgdx_particle(text, Some(&libgdx_options(options)));
            }),
            parse_to_document: Arc::new(|text, options| {
                let result = parse_libgdx_particle_document(text, Some(&libgdx_options(options)));
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: Some(Arc::new(|config| {
                return serialize_libgdx_particle_document(config, None, None);
            })),
        }),
        kind: String::from(LIBGDX_PARTICLE_FORMAT_KIND),
    };
}

/// The built-in Particle Designer descriptor (TS `particleDesignerParticleFormat`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_particle_designer_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| {
                is_xml(text) && text.contains("<plist") && has_particle_designer_key(text)
            }),
            parse_to_config: Arc::new(|text, options| {
                return parse_particle_designer_plist(
                    text,
                    Some(&particle_designer_options(options)),
                );
            }),
            parse_to_document: Arc::new(|text, options| {
                let result = parse_particle_designer_plist_document(
                    text,
                    Some(&particle_designer_options(options)),
                );
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: Some(Arc::new(|config| {
                return serialize_particle_designer_plist_document(config, None, None);
            })),
        }),
        kind: String::from(PARTICLE_DESIGNER_FORMAT_KIND),
    };
}

/// The built-in Pixi descriptor (TS `pixiParticleFormat`); Pixi is parse-only.
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_pixi_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| {
                let Some(object) = parse_json_object(text) else {
                    return false;
                };
                let Some(alpha) = object.get("alpha").filter(|alpha| alpha.is_object()) else {
                    return false;
                };
                return object.get("pos").is_some()
                    && object.get("alpha").is_some()
                    && (alpha.get("start").is_some() || alpha.get("end").is_some());
            }),
            parse_to_config: Arc::new(|text, _options| {
                return parse_pixi_particle(text);
            }),
            parse_to_document: Arc::new(|text, _options| {
                let result = parse_pixi_particle_document(text);
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: None,
        }),
        kind: String::from(PIXI_PARTICLE_FORMAT_KIND),
    };
}

/// The built-in Spine descriptor (TS `spineParticleFormat`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_spine_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| {
                let Some(object) = parse_json_object(text) else {
                    return false;
                };
                return object
                    .get("continuous")
                    .map(|value| value.is_boolean())
                    .unwrap_or(false)
                    || is_range_object(object.get("emission"))
                    || is_range_object(object.get("life"));
            }),
            parse_to_config: Arc::new(|text, _options| {
                return parse_spine_particle(text);
            }),
            parse_to_document: Arc::new(|text, _options| {
                let result = parse_spine_particle_document(text);
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: Some(Arc::new(|config| {
                return serialize_spine_particle_document(config, None);
            })),
        }),
        kind: String::from(SPINE_PARTICLE_FORMAT_KIND),
    };
}

/// The built-in Starling PEX descriptor (TS `starlingPexParticleFormat`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_starling_pex_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| is_xml(text) && text.contains("<particleEmitterConfig")),
            parse_to_config: Arc::new(|text, options| {
                return parse_starling_pex(text, Some(&starling_options(options)));
            }),
            parse_to_document: Arc::new(|text, options| {
                let result = parse_starling_pex_document(text, Some(&starling_options(options)));
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: Some(Arc::new(|config| {
                return serialize_starling_pex_document(config, None, None);
            })),
        }),
        kind: String::from(STARLING_PEX_FORMAT_KIND),
    };
}

/// The built-in Unity descriptor (TS `unityParticleFormat`).
// flight-lint: allow(conform-extra) TS exposes this as a constant descriptor value; Rust constructs the callback-bearing descriptor with a getter
pub fn get_unity_particle_format() -> ParticleFormatDescriptor {
    return ParticleFormatDescriptor {
        codec: Arc::new(ParticleFormatCodec {
            detect: Arc::new(|text| {
                let Some(object) = parse_json_object(text) else {
                    return false;
                };
                return has_min_max_curve_mode(object.get("startLifetime"))
                    || has_min_max_curve_mode(object.get("startSpeed"))
                    || has_min_max_curve_mode(object.get("startSize"))
                    || object
                        .get("gravityModifier")
                        .map(|value| value.is_number())
                        .unwrap_or(false)
                    || (object
                        .get("looping")
                        .map(|value| value.is_boolean())
                        .unwrap_or(false)
                        && object.get("startLifetime").is_some());
            }),
            parse_to_config: Arc::new(|text, options| {
                return parse_unity_particle(text, Some(&unity_options(options)));
            }),
            parse_to_document: Arc::new(|text, options| {
                let result = parse_unity_particle_document(text, Some(&unity_options(options)));
                return ParticleFormatParseDocumentResult {
                    config: result.config,
                    diagnostics: result.diagnostics,
                };
            }),
            serialize: Some(Arc::new(|config| {
                return serialize_unity_particle_document(config, None, None);
            })),
        }),
        kind: String::from(UNITY_PARTICLE_FORMAT_KIND),
    };
}

fn has_min_max_curve_mode(value: Option<&Value>) -> bool {
    return value
        .filter(|value| value.is_object())
        .and_then(|value| value.get("mode"))
        .map(|mode| mode.is_string())
        .unwrap_or(false);
}

fn has_particle_designer_key(text: &str) -> bool {
    let mut search = 0usize;
    while let Some(found) = text[search..].find("<key>") {
        let start = search + found + "<key>".len();
        let Some(end_offset) = text[start..].find("</key>") else {
            break;
        };
        let key = text[start..start + end_offset].trim();
        if key == "maxParticles" || key == "particleLifespan" || key == "emitterType" {
            return true;
        }
        search = start + end_offset + "</key>".len();
    }
    return false;
}

fn is_range_object(value: Option<&Value>) -> bool {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return false;
    };
    return value
        .get("low")
        .map(|value| value.is_number())
        .unwrap_or(false)
        && value
            .get("high")
            .map(|value| value.is_number())
            .unwrap_or(false);
}

fn is_xml(text: &str) -> bool {
    let trimmed = text.trim_start();
    return trimmed.starts_with('<') || trimmed.starts_with("<?xml");
}

fn libgdx_options(options: Option<&ParseParticleConfigOptions>) -> LibgdxParseOptions {
    return LibgdxParseOptions {
        texture_size: options.and_then(|options| options.texture_size),
    };
}

fn parse_json_object(text: &str) -> Option<Value> {
    let value: Value = serde_json::from_str(text).ok()?;
    return if value.is_object() { Some(value) } else { None };
}

fn particle_designer_options(
    options: Option<&ParseParticleConfigOptions>,
) -> ParticleDesignerParseOptions {
    return ParticleDesignerParseOptions {
        texture_size: options.and_then(|options| options.texture_size),
    };
}

/// Explicitly installs the built-in particle format codecs (TS
/// `registerBuiltInParticleFormats`).
// flight-lint: allow(conform-params) D5: the source's module registry is explicit caller-owned state
pub fn register_built_in_particle_formats(registry: &mut ParticleFormatRegistry) {
    let options = ParticleImportOptions {
        formats: Some(create_particle_all_formats()),
    };
    apply_particle_import_options(registry, &options);
}

fn starling_options(options: Option<&ParseParticleConfigOptions>) -> StarlingPexParseOptions {
    return StarlingPexParseOptions {
        texture_size: options.and_then(|options| options.texture_size),
    };
}

fn unity_options(options: Option<&ParseParticleConfigOptions>) -> UnityParseOptions {
    return UnityParseOptions {
        pixels_per_unit: options.and_then(|options| options.pixels_per_unit),
    };
}
