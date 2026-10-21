//! Particle Designer plist parsing (TS `particleDesignerParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{EmitterShape, ParticleEmitterConfig, create_particle_emitter_config};

use crate::text::{parse_js_float, parse_js_int};

/// The emitter type (TS `emitterType: 0 | 1`; 0 = gravity, 1 = radial).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ParticleDesignerEmitterType {
    #[default]
    Gravity,
    Radial,
}

/// Full Particle Designer document (TS `ParticleDesignerDocument`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ParticleDesignerDocument {
    pub angle: f32,
    pub angle_variance: f32,
    pub blend_func_destination: f32,
    pub blend_func_source: f32,
    pub duration: f32,
    pub emitter_type: ParticleDesignerEmitterType,
    pub finish_color_alpha: f32,
    pub finish_color_blue: f32,
    pub finish_color_green: f32,
    pub finish_color_red: f32,
    pub finish_color_variance_alpha: f32,
    pub finish_color_variance_blue: f32,
    pub finish_color_variance_green: f32,
    pub finish_color_variance_red: f32,
    pub finish_particle_size: f32,
    pub finish_particle_size_variance: f32,
    pub gravityx: f32,
    pub gravityy: f32,
    pub max_particles: f32,
    pub max_radius: f32,
    pub max_radius_variance: f32,
    pub min_radius: f32,
    pub min_radius_variance: f32,
    pub particle_lifespan: f32,
    pub particle_lifespan_variance: f32,
    pub rotate_per_second: f32,
    pub rotate_per_second_variance: f32,
    pub rotation_end: f32,
    pub rotation_end_variance: f32,
    pub rotation_start: f32,
    pub rotation_start_variance: f32,
    pub source_position_variancex: f32,
    pub source_position_variancey: f32,
    pub speed: f32,
    pub speed_variance: f32,
    pub start_color_alpha: f32,
    pub start_color_blue: f32,
    pub start_color_green: f32,
    pub start_color_red: f32,
    pub start_color_variance_alpha: f32,
    pub start_color_variance_blue: f32,
    pub start_color_variance_green: f32,
    pub start_color_variance_red: f32,
    pub start_particle_size: f32,
    pub start_particle_size_variance: f32,
    pub texture_file_name: String,
}

/// Parse options (TS `ParticleDesignerParseOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ParticleDesignerParseOptions {
    /// Texture side length used to normalize pixel sizes; defaults to 1.
    pub texture_size: Option<f32>,
}

/// Parse result carrying the full document (TS `ParticleDesignerParseResult`).
pub struct ParticleDesignerParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub document: ParticleDesignerDocument,
}

/// A raw plist property value (TS `ParticleDesignerRawDict` value).
#[derive(Clone, Debug, PartialEq)]
enum ParticleDesignerRawValue {
    Bool(bool),
    Number(f32),
    String(String),
}

#[derive(Default)]
struct ParticleDesignerRawDict {
    entries: Vec<(String, ParticleDesignerRawValue)>,
}

fn collect_particle_designer_diagnostics(dict: &ParticleDesignerRawDict) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let mut report = |severity: ImportDiagnosticSeverity, kind: &str| {
        report_import_diagnostic(
            Some(&mut diagnostics),
            severity,
            kind,
            "collectParticleDesignerDiagnostics",
            None,
        );
    };
    if num(dict, "emitterType", 0.0) == 1.0 {
        report(
            ImportDiagnosticSeverity::Recover,
            "particledesigner.radial-approximated",
        );
    }
    if num(dict, "radialAcceleration", 0.0) != 0.0 || num(dict, "radialAccelVariance", 0.0) != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "particledesigner.radial-acceleration-unsupported",
        );
    }
    if num(dict, "tangentialAcceleration", 0.0) != 0.0
        || num(dict, "tangentialAccelVariance", 0.0) != 0.0
    {
        report(
            ImportDiagnosticSeverity::Skip,
            "particledesigner.tangential-acceleration-unsupported",
        );
    }
    if num(dict, "finishParticleSizeVariance", 0.0) != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "particledesigner.finish-size-variance-unsupported",
        );
    }
    if num(dict, "startColorVarianceAlpha", 0.0) != 0.0
        || num(dict, "finishColorVarianceAlpha", 0.0) != 0.0
    {
        report(
            ImportDiagnosticSeverity::Skip,
            "particledesigner.alpha-variance-unsupported",
        );
    }
    return diagnostics;
}

fn num(dict: &ParticleDesignerRawDict, key: &str, default: f32) -> f32 {
    return match dict.get(key) {
        Some(ParticleDesignerRawValue::Number(value)) if value.is_finite() => *value,
        _ => default,
    };
}

/// Parses a Particle Designer plist directly to a config (TS
/// `parseParticleDesignerPlist`).
pub fn parse_particle_designer_plist(
    plist_xml: &str,
    options: Option<&ParticleDesignerParseOptions>,
) -> ParticleEmitterConfig {
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return raw_dict_to_config(&parse_plist_raw_dict(plist_xml), texture_size);
}

/// Parses a Particle Designer plist and preserves the full document (TS
/// `parseParticleDesignerPlistDocument`).
pub fn parse_particle_designer_plist_document(
    plist_xml: &str,
    options: Option<&ParticleDesignerParseOptions>,
) -> ParticleDesignerParseResult {
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    let dict = parse_plist_raw_dict(plist_xml);
    let emitter_type = if num(&dict, "emitterType", 0.0) == 1.0 {
        ParticleDesignerEmitterType::Radial
    } else {
        ParticleDesignerEmitterType::Gravity
    };
    let document = ParticleDesignerDocument {
        angle: num(&dict, "angle", 90.0),
        angle_variance: num(&dict, "angleVariance", 0.0),
        blend_func_destination: num(&dict, "blendFuncDestination", 771.0),
        blend_func_source: num(&dict, "blendFuncSource", 770.0),
        duration: num(&dict, "duration", -1.0),
        emitter_type,
        finish_color_alpha: num(&dict, "finishColorAlpha", 0.0),
        finish_color_blue: num(&dict, "finishColorBlue", 1.0),
        finish_color_green: num(&dict, "finishColorGreen", 1.0),
        finish_color_red: num(&dict, "finishColorRed", 1.0),
        finish_color_variance_alpha: num(&dict, "finishColorVarianceAlpha", 0.0),
        finish_color_variance_blue: num(&dict, "finishColorVarianceBlue", 0.0),
        finish_color_variance_green: num(&dict, "finishColorVarianceGreen", 0.0),
        finish_color_variance_red: num(&dict, "finishColorVarianceRed", 0.0),
        finish_particle_size: num(&dict, "finishParticleSize", 16.0),
        finish_particle_size_variance: num(&dict, "finishParticleSizeVariance", 0.0),
        gravityx: num(&dict, "gravityx", 0.0),
        gravityy: num(&dict, "gravityy", 0.0),
        max_particles: num(&dict, "maxParticles", 200.0),
        max_radius: num(&dict, "maxRadius", 0.0),
        max_radius_variance: num(&dict, "maxRadiusVariance", 0.0),
        min_radius: num(&dict, "minRadius", 0.0),
        min_radius_variance: num(&dict, "minRadiusVariance", 0.0),
        particle_lifespan: num(&dict, "particleLifespan", 1.0),
        particle_lifespan_variance: num(&dict, "particleLifespanVariance", 0.0),
        rotate_per_second: num(&dict, "rotatePerSecond", 0.0),
        rotate_per_second_variance: num(&dict, "rotatePerSecondVariance", 0.0),
        rotation_end: num(&dict, "rotationEnd", 0.0),
        rotation_end_variance: num(&dict, "rotationEndVariance", 0.0),
        rotation_start: num(&dict, "rotationStart", 0.0),
        rotation_start_variance: num(&dict, "rotationStartVariance", 0.0),
        source_position_variancex: num(&dict, "sourcePositionVariancex", 0.0),
        source_position_variancey: num(&dict, "sourcePositionVariancey", 0.0),
        speed: num(&dict, "speed", 100.0),
        speed_variance: num(&dict, "speedVariance", 0.0),
        start_color_alpha: num(&dict, "startColorAlpha", 1.0),
        start_color_blue: num(&dict, "startColorBlue", 1.0),
        start_color_green: num(&dict, "startColorGreen", 1.0),
        start_color_red: num(&dict, "startColorRed", 1.0),
        start_color_variance_alpha: num(&dict, "startColorVarianceAlpha", 0.0),
        start_color_variance_blue: num(&dict, "startColorVarianceBlue", 0.0),
        start_color_variance_green: num(&dict, "startColorVarianceGreen", 0.0),
        start_color_variance_red: num(&dict, "startColorVarianceRed", 0.0),
        start_particle_size: num(&dict, "startParticleSize", 32.0),
        start_particle_size_variance: num(&dict, "startParticleSizeVariance", 0.0),
        texture_file_name: str_value(&dict, "textureFileName", ""),
    };
    return ParticleDesignerParseResult {
        config: raw_dict_to_config(&dict, texture_size),
        diagnostics: collect_particle_designer_diagnostics(&dict),
        document,
    };
}

fn parse_plist_raw_dict(xml: &str) -> ParticleDesignerRawDict {
    let mut result = ParticleDesignerRawDict::default();
    let mut current_key: Option<String> = None;
    let mut in_tag: Option<String> = None;
    let mut last_tag_end = 0usize;
    let mut search = 0usize;
    while let Some(open) = xml[search..].find('<') {
        let open = search + open;
        let Some(close_offset) = xml[open..].find('>') else {
            break;
        };
        let close = open + close_offset;
        let full = &xml[open..=close];
        let inner = &xml[open + 1..close];
        let is_close = inner.starts_with('/');
        let content = if is_close { &inner[1..] } else { inner };
        let name_end = content
            .find(|character: char| !(character.is_alphanumeric() || character == '_'))
            .unwrap_or(content.len());
        let name = &content[..name_end];
        let attrs = &content[name_end..];
        let is_self_close = attrs.trim_end().ends_with('/') || full.ends_with("/>");
        let text = xml[last_tag_end..open].trim();
        last_tag_end = close + 1;
        search = close + 1;
        if !is_close && !is_self_close {
            if name == "key" || name == "integer" || name == "real" || name == "string" {
                in_tag = Some(String::from(name));
            }
        } else if is_self_close {
            if (name == "true" || name == "false") && current_key.is_some() {
                result.set(
                    current_key.take().unwrap_or_default(),
                    ParticleDesignerRawValue::Bool(name == "true"),
                );
            }
        } else if name == "key" && in_tag.as_deref() == Some("key") {
            current_key = if text.is_empty() {
                None
            } else {
                Some(String::from(text))
            };
            in_tag = None;
        } else if let Some(key) = current_key.clone() {
            match name {
                "integer" if in_tag.as_deref() == Some("integer") => {
                    if let Some(value) = parse_js_int(text) {
                        result.set(key, ParticleDesignerRawValue::Number(value as f32));
                    }
                }
                "real" if in_tag.as_deref() == Some("real") => {
                    if let Some(value) = parse_js_float(text).filter(|value| value.is_finite()) {
                        result.set(key, ParticleDesignerRawValue::Number(value));
                    }
                }
                "string" if in_tag.as_deref() == Some("string") => {
                    result.set(key, ParticleDesignerRawValue::String(unescape_xml(text)));
                }
                _ => {}
            }
            if name == "integer" || name == "real" || name == "string" {
                current_key = None;
                in_tag = None;
            }
        }
    }
    return result;
}

fn pd_blend_mode(source: f32, destination: f32) -> Option<String> {
    if (source == 770.0 || source == 1.0) && destination == 1.0 {
        return Some(String::from("add"));
    }
    if (source == 770.0 || source == 1.0) && destination == 771.0 {
        return Some(String::from("normal"));
    }
    return None;
}

fn raw_dict_to_config(dict: &ParticleDesignerRawDict, texture_size: f32) -> ParticleEmitterConfig {
    let angle_rad = num(dict, "angle", 90.0) * DEG_TO_RAD;
    let lifespan = num(dict, "particleLifespan", 1.0);
    let lifespan_variance = num(dict, "particleLifespanVariance", 0.0);
    let speed = num(dict, "speed", 100.0);
    let speed_variance = num(dict, "speedVariance", 0.0);
    let variance_x = num(dict, "sourcePositionVariancex", 0.0);
    let variance_y = num(dict, "sourcePositionVariancey", 0.0);
    let emitter_shape = if variance_x == 0.0 && variance_y == 0.0 {
        EmitterShape::Point
    } else if variance_x == variance_y {
        EmitterShape::Circle
    } else {
        EmitterShape::Rect
    };
    let start_size = num(dict, "startParticleSize", 32.0) / texture_size;
    let start_variance = num(dict, "startParticleSizeVariance", 0.0) / texture_size;
    let finish_size = num(dict, "finishParticleSize", 16.0) / texture_size;
    let rotation_start = num(dict, "rotationStart", 0.0);
    let rotation_end = num(dict, "rotationEnd", 0.0);
    let rotation_start_variance = num(dict, "rotationStartVariance", 0.0);
    let rotation_end_variance = num(dict, "rotationEndVariance", 0.0);
    let lifetime_sum = lifespan + lifespan_variance * 0.5;
    let lifetime_mid = if lifetime_sum != 0.0 {
        lifetime_sum
    } else {
        1.0
    };
    let rotation_speed_mid = ((rotation_start + rotation_end) * 0.5 * DEG_TO_RAD) / lifetime_mid;
    let rotation_speed_variance =
        (rotation_start_variance.max(rotation_end_variance) * DEG_TO_RAD) / lifetime_mid;
    let duration = num(dict, "duration", -1.0);
    let defaults = create_particle_emitter_config(None);
    return create_particle_emitter_config(Some(&ParticleEmitterConfig {
        alpha_end: num(dict, "finishColorAlpha", 0.0),
        alpha_start: num(dict, "startColorAlpha", 1.0),
        blend_mode: pd_blend_mode(
            num(dict, "blendFuncSource", 770.0),
            num(dict, "blendFuncDestination", 771.0),
        ),
        color_end_b: num(dict, "finishColorBlue", 1.0),
        color_end_g: num(dict, "finishColorGreen", 1.0),
        color_end_r: num(dict, "finishColorRed", 1.0),
        color_end_variance_b: num(dict, "finishColorVarianceBlue", 0.0),
        color_end_variance_g: num(dict, "finishColorVarianceGreen", 0.0),
        color_end_variance_r: num(dict, "finishColorVarianceRed", 0.0),
        color_start_b: num(dict, "startColorBlue", 1.0),
        color_start_g: num(dict, "startColorGreen", 1.0),
        color_start_r: num(dict, "startColorRed", 1.0),
        color_start_variance_b: num(dict, "startColorVarianceBlue", 0.0),
        color_start_variance_g: num(dict, "startColorVarianceGreen", 0.0),
        color_start_variance_r: num(dict, "startColorVarianceRed", 0.0),
        direction_x: angle_rad.cos(),
        direction_y: -angle_rad.sin(),
        duration: if duration > 0.0 { duration } else { 0.0 },
        emitter_height: if emitter_shape == EmitterShape::Rect {
            variance_y * 2.0
        } else {
            0.0
        },
        emitter_radius: if emitter_shape == EmitterShape::Circle {
            variance_x
        } else {
            0.0
        },
        emitter_shape,
        emitter_width: if emitter_shape == EmitterShape::Rect {
            variance_x * 2.0
        } else {
            0.0
        },
        gravity_x: num(dict, "gravityx", 0.0),
        gravity_y: num(dict, "gravityy", 0.0),
        lifetime_max: lifespan + lifespan_variance,
        lifetime_min: (lifespan - lifespan_variance).max(0.0),
        looping: duration <= 0.0,
        max_particles: (num(dict, "maxParticles", 200.0) as i32) as f32,
        rotation_speed_max: rotation_speed_mid + rotation_speed_variance,
        rotation_speed_min: rotation_speed_mid - rotation_speed_variance,
        scale_end: if start_size > 0.0 {
            finish_size / start_size
        } else {
            1.0
        },
        scale_max: start_size + start_variance,
        scale_min: (start_size - start_variance).max(0.0),
        speed_max: speed + speed_variance,
        speed_min: (speed - speed_variance).max(0.0),
        spread: num(dict, "angleVariance", 0.0) * DEG_TO_RAD,
        ..defaults
    }));
}

fn str_value(dict: &ParticleDesignerRawDict, key: &str, default: &str) -> String {
    return match dict.get(key) {
        Some(ParticleDesignerRawValue::String(value)) => value.clone(),
        _ => String::from(default),
    };
}

fn unescape_xml(text: &str) -> String {
    return text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&");
}

// flight-lint: allow(sugar-delegates) private ordered-section map helper; its accessors are internal plumbing, not contract sugar
impl ParticleDesignerRawDict {
    fn get(&self, key: &str) -> Option<&ParticleDesignerRawValue> {
        return self
            .entries
            .iter()
            .find(|(entry, _)| entry == key)
            .map(|(_, value)| value);
    }

    fn set(&mut self, key: String, value: ParticleDesignerRawValue) {
        if let Some((_, existing)) = self.entries.iter_mut().find(|(entry, _)| *entry == key) {
            *existing = value;
            return;
        }
        self.entries.push((key, value));
    }
}
