//! Starling / Sparrow PEX XML parsing (TS `starlingPexParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{
    EmitterShape, ParticleEmitterConfig, ParticleEmitterConfigOptions,
    create_particle_emitter_config,
};

use crate::text::parse_js_float;

/// A PEX color (TS `StarlingPexColor`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StarlingPexColor {
    pub red: f32,
    pub green: f32,
    pub blue: f32,
    pub alpha: f32,
}

/// The emitter type (TS `emitterType: 0 | 1`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum StarlingPexEmitterType {
    #[default]
    Gravity,
    Radial,
}

/// Full Starling PEX document (TS `StarlingPexDocument`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StarlingPexDocument {
    pub angle: f32,
    pub angle_variance: f32,
    pub blend_func_destination: f32,
    pub blend_func_source: f32,
    pub duration: f32,
    pub emitter_type: StarlingPexEmitterType,
    pub finish_color: StarlingPexColor,
    pub finish_color_variance: StarlingPexColor,
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
    pub radial_accel_variance: f32,
    pub radial_acceleration: f32,
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
    pub start_color: StarlingPexColor,
    pub start_color_variance: StarlingPexColor,
    pub start_particle_size: f32,
    pub start_particle_size_variance: f32,
    pub tangential_accel_variance: f32,
    pub tangential_acceleration: f32,
    pub texture_file_name: String,
}

/// Parse options (TS `StarlingPexParseOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StarlingPexParseOptions {
    /// Texture side length used to normalize pixel sizes; defaults to 1.
    pub texture_size: Option<f32>,
}

/// Parse result carrying the full document (TS `StarlingPexParseResult`).
pub struct StarlingPexParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub document: StarlingPexDocument,
}

#[derive(Default)]
struct PexDict {
    entries: Vec<(String, String)>,
}

fn attribute_tags(xml: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    let mut search = 0usize;
    while let Some(found) = xml[search..].find("<attribute") {
        let start = search + found;
        let rest = &xml[start + "<attribute".len()..];
        let boundary = rest
            .chars()
            .next()
            .map(|character| character.is_whitespace() || character == '>' || character == '/')
            .unwrap_or(false);
        if !boundary {
            search = start + 1;
            continue;
        }
        let Some(end_offset) = xml[start..].find("/>") else {
            break;
        };
        let end = start + end_offset + 2;
        tags.push(String::from(&xml[start..end]));
        search = end;
    }
    return tags;
}

fn collect_starling_pex_diagnostics(document: &StarlingPexDocument) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let mut report = |severity: ImportDiagnosticSeverity, kind: &str| {
        report_import_diagnostic(
            Some(&mut diagnostics),
            severity,
            kind,
            "collectStarlingPexDiagnostics",
            None,
        );
    };
    if document.emitter_type == StarlingPexEmitterType::Radial {
        report(
            ImportDiagnosticSeverity::Recover,
            "starlingpex.radial-approximated",
        );
    }
    if document.radial_acceleration != 0.0 || document.radial_accel_variance != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "starlingpex.radial-acceleration-unsupported",
        );
    }
    if document.tangential_acceleration != 0.0 || document.tangential_accel_variance != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "starlingpex.tangential-acceleration-unsupported",
        );
    }
    if document.finish_particle_size_variance != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "starlingpex.finish-size-variance-unsupported",
        );
    }
    if document.start_color_variance.alpha != 0.0 || document.finish_color_variance.alpha != 0.0 {
        report(
            ImportDiagnosticSeverity::Skip,
            "starlingpex.alpha-variance-unsupported",
        );
    }
    return diagnostics;
}

fn dict_to_document(dict: &PexDict) -> StarlingPexDocument {
    let white = StarlingPexColor {
        red: 1.0,
        green: 1.0,
        blue: 1.0,
        alpha: 1.0,
    };
    let clear = StarlingPexColor {
        red: 1.0,
        green: 1.0,
        blue: 1.0,
        alpha: 0.0,
    };
    let zero = StarlingPexColor {
        red: 0.0,
        green: 0.0,
        blue: 0.0,
        alpha: 0.0,
    };
    return StarlingPexDocument {
        angle: p_num(dict, "angle", 90.0),
        angle_variance: p_num(dict, "angleVariance", 0.0),
        blend_func_destination: p_num(dict, "blendFuncDestination", 771.0),
        blend_func_source: p_num(dict, "blendFuncSource", 770.0),
        duration: p_num(dict, "duration", -1.0),
        emitter_type: if p_num(dict, "emitterType", 0.0) == 1.0 {
            StarlingPexEmitterType::Radial
        } else {
            StarlingPexEmitterType::Gravity
        },
        finish_color: p_color(dict, "finishColor", clear),
        finish_color_variance: p_color(dict, "finishColorVariance", zero),
        finish_particle_size: p_num(dict, "finishParticleSize", 16.0),
        finish_particle_size_variance: p_num(dict, "finishParticleSizeVariance", 0.0),
        gravityx: p_num(dict, "gravityx", 0.0),
        gravityy: p_num(dict, "gravityy", 0.0),
        max_particles: (p_num(dict, "maxParticles", 200.0) as i32) as f32,
        max_radius: p_num(dict, "maxRadius", 0.0),
        max_radius_variance: p_num(dict, "maxRadiusVariance", 0.0),
        min_radius: p_num(dict, "minRadius", 0.0),
        min_radius_variance: p_num(dict, "minRadiusVariance", 0.0),
        particle_lifespan: p_num(dict, "particleLifespan", 1.0),
        particle_lifespan_variance: p_num(dict, "particleLifespanVariance", 0.0),
        radial_accel_variance: p_num(dict, "radialAccelVariance", 0.0),
        radial_acceleration: p_num(dict, "radialAcceleration", 0.0),
        rotate_per_second: p_num(dict, "rotatePerSecond", 0.0),
        rotate_per_second_variance: p_num(dict, "rotatePerSecondVariance", 0.0),
        rotation_end: p_num(dict, "rotationEnd", 0.0),
        rotation_end_variance: p_num(dict, "rotationEndVariance", 0.0),
        rotation_start: p_num(dict, "rotationStart", 0.0),
        rotation_start_variance: p_num(dict, "rotationStartVariance", 0.0),
        source_position_variancex: p_num(dict, "sourcePositionVariancex", 0.0),
        source_position_variancey: p_num(dict, "sourcePositionVariancey", 0.0),
        speed: p_num(dict, "speed", 100.0),
        speed_variance: p_num(dict, "speedVariance", 0.0),
        start_color: p_color(dict, "startColor", white),
        start_color_variance: p_color(dict, "startColorVariance", zero),
        start_particle_size: p_num(dict, "startParticleSize", 32.0),
        start_particle_size_variance: p_num(dict, "startParticleSizeVariance", 0.0),
        tangential_accel_variance: p_num(dict, "tangentialAccelVariance", 0.0),
        tangential_acceleration: p_num(dict, "tangentialAcceleration", 0.0),
        texture_file_name: p_str(dict, "textureFileName", ""),
    };
}

fn document_to_config(document: &StarlingPexDocument, texture_size: f32) -> ParticleEmitterConfig {
    let angle_rad = document.angle * DEG_TO_RAD;
    let lifespan = document.particle_lifespan;
    let lifespan_variance = document.particle_lifespan_variance;
    let speed = document.speed;
    let speed_variance = document.speed_variance;
    let variance_x = document.source_position_variancex;
    let variance_y = document.source_position_variancey;
    let emitter_shape = if variance_x == 0.0 && variance_y == 0.0 {
        EmitterShape::Point
    } else if variance_x == variance_y {
        EmitterShape::Circle
    } else {
        EmitterShape::Rect
    };
    let start_size = document.start_particle_size / texture_size;
    let start_variance = document.start_particle_size_variance / texture_size;
    let finish_size = document.finish_particle_size / texture_size;
    let lifetime_sum = lifespan + lifespan_variance * 0.5;
    let lifetime_mid = if lifetime_sum != 0.0 {
        lifetime_sum
    } else {
        1.0
    };
    let rotation_speed_mid =
        ((document.rotation_start + document.rotation_end) * 0.5 * DEG_TO_RAD) / lifetime_mid;
    let rotation_speed_variance = (document
        .rotation_start_variance
        .max(document.rotation_end_variance)
        * DEG_TO_RAD)
        / lifetime_mid;
    let duration = document.duration;
    return create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
        alpha_end: Some(document.finish_color.alpha),
        alpha_start: Some(document.start_color.alpha),
        blend_mode: Some(pex_blend_mode(document.blend_func_source, document.blend_func_destination)),
        color_end_b: Some(document.finish_color.blue),
        color_end_g: Some(document.finish_color.green),
        color_end_r: Some(document.finish_color.red),
        color_end_variance_b: Some(document.finish_color_variance.blue),
        color_end_variance_g: Some(document.finish_color_variance.green),
        color_end_variance_r: Some(document.finish_color_variance.red),
        color_start_b: Some(document.start_color.blue),
        color_start_g: Some(document.start_color.green),
        color_start_r: Some(document.start_color.red),
        color_start_variance_b: Some(document.start_color_variance.blue),
        color_start_variance_g: Some(document.start_color_variance.green),
        color_start_variance_r: Some(document.start_color_variance.red),
        direction_x: Some(angle_rad.cos()),
        direction_y: Some(-angle_rad.sin()),
        duration: Some(if duration > 0.0 { duration } else { 0.0 }),
        emitter_height: Some(if emitter_shape == EmitterShape::Rect {
            variance_y * 2.0
        } else {
            0.0
        }),
        emitter_radius: Some(if emitter_shape == EmitterShape::Circle {
            variance_x
        } else {
            0.0
        }),
        emitter_shape: Some(emitter_shape),
        emitter_width: Some(if emitter_shape == EmitterShape::Rect {
            variance_x * 2.0
        } else {
            0.0
        }),
        gravity_x: Some(document.gravityx),
        gravity_y: Some(document.gravityy),
        lifetime_max: Some(lifespan + lifespan_variance),
        lifetime_min: Some((lifespan - lifespan_variance).max(0.0)),
        looping: Some(duration <= 0.0),
        max_particles: Some(document.max_particles),
        rotation_speed_max: Some(rotation_speed_mid + rotation_speed_variance),
        rotation_speed_min: Some(rotation_speed_mid - rotation_speed_variance),
        scale_end: Some(if start_size > 0.0 {
            finish_size / start_size
        } else {
            1.0
        }),
        scale_max: Some(start_size + start_variance),
        scale_min: Some((start_size - start_variance).max(0.0)),
        speed_max: Some(speed + speed_variance),
        speed_min: Some((speed - speed_variance).max(0.0)),
        spread: Some(document.angle_variance * DEG_TO_RAD),
        ..Default::default()
    }));
}

fn extract_attribute(tag: &str, attribute: &str) -> Option<String> {
    let mut search = 0usize;
    while let Some(found) = tag[search..].find(attribute) {
        let start = search + found;
        let after = &tag[start + attribute.len()..];
        let after = after.trim_start();
        if let Some(rest) = after.strip_prefix('=') {
            let rest = rest.trim_start();
            let quote = rest.chars().next()?;
            if quote == '"' || quote == '\'' {
                let value = &rest[1..];
                if let Some(end) = value.find(quote) {
                    return Some(String::from(&value[..end]));
                }
            }
        }
        search = start + attribute.len();
    }
    return None;
}

fn p_color(dict: &PexDict, prefix: &str, default: StarlingPexColor) -> StarlingPexColor {
    let red = p_num(
        dict,
        &format!("{}.red", prefix),
        p_num(dict, &format!("{}Red", prefix), default.red),
    );
    let green = p_num(
        dict,
        &format!("{}.green", prefix),
        p_num(dict, &format!("{}Green", prefix), default.green),
    );
    let blue = p_num(
        dict,
        &format!("{}.blue", prefix),
        p_num(dict, &format!("{}Blue", prefix), default.blue),
    );
    let alpha = p_num(
        dict,
        &format!("{}.alpha", prefix),
        p_num(dict, &format!("{}Alpha", prefix), default.alpha),
    );
    return StarlingPexColor {
        red,
        green,
        blue,
        alpha,
    };
}

fn p_num(dict: &PexDict, key: &str, default: f32) -> f32 {
    return match dict.get(key) {
        Some(value) => parse_js_float(value)
            .filter(|parsed| parsed.is_finite())
            .unwrap_or(default),
        None => default,
    };
}

fn p_str(dict: &PexDict, key: &str, default: &str) -> String {
    return dict
        .get(key)
        .cloned()
        .unwrap_or_else(|| String::from(default));
}

fn parse_pex_xml(xml: &str) -> PexDict {
    let mut dict = PexDict::default();
    for tag in attribute_tags(xml) {
        let name = extract_attribute(&tag, "name");
        let value = extract_attribute(&tag, "value");
        if let (Some(name), Some(value)) = (name, value) {
            dict.insert(name, value);
        }
    }
    for tag in attribute_tags(xml) {
        let Some(name) = extract_attribute(&tag, "name") else {
            continue;
        };
        if let Some(red) = extract_attribute(&tag, "red") {
            dict.insert(format!("{}.red", name), red);
        }
        if let Some(green) = extract_attribute(&tag, "green") {
            dict.insert(format!("{}.green", name), green);
        }
        if let Some(blue) = extract_attribute(&tag, "blue") {
            dict.insert(format!("{}.blue", name), blue);
        }
        if let Some(alpha) = extract_attribute(&tag, "alpha") {
            dict.insert(format!("{}.alpha", name), alpha);
        }
    }
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
            if (name == "true" || name == "false")
                && let Some(key) = current_key.clone()
                && !dict.contains(&key)
            {
                dict.insert(key, String::from(name));
                current_key = None;
            }
        } else if name == "key" && in_tag.as_deref() == Some("key") {
            current_key = if text.is_empty() {
                None
            } else {
                Some(String::from(text))
            };
            in_tag = None;
        } else if let Some(key) = current_key.clone()
            && !dict.contains(&key)
            && (name == "integer" || name == "real" || name == "string")
            && in_tag.as_deref() == Some(name)
        {
            dict.insert(key, String::from(text));
            current_key = None;
            in_tag = None;
        }
    }
    return dict;
}

/// Parses a Starling PEX XML string directly to a config (TS `parseStarlingPex`).
pub fn parse_starling_pex(
    xml: &str,
    options: Option<&StarlingPexParseOptions>,
) -> ParticleEmitterConfig {
    if !xml.trim_start().starts_with('<') {
        panic!("Invalid Starling PEX: input must be an XML string beginning with <");
    }
    let document = dict_to_document(&parse_pex_xml(xml));
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return document_to_config(&document, texture_size);
}

/// Parses a Starling PEX XML string and preserves the document (TS
/// `parseStarlingPexDocument`).
pub fn parse_starling_pex_document(
    xml: &str,
    options: Option<&StarlingPexParseOptions>,
) -> StarlingPexParseResult {
    if !xml.trim_start().starts_with('<') {
        panic!("Invalid Starling PEX: input must be an XML string beginning with <");
    }
    let document = dict_to_document(&parse_pex_xml(xml));
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return StarlingPexParseResult {
        config: document_to_config(&document, texture_size),
        diagnostics: collect_starling_pex_diagnostics(&document),
        document,
    };
}

fn pex_blend_mode(source: f32, destination: f32) -> Option<String> {
    if (source == 770.0 || source == 1.0) && destination == 1.0 {
        return Some(String::from("add"));
    }
    if (source == 770.0 || source == 1.0) && destination == 771.0 {
        return Some(String::from("normal"));
    }
    return None;
}

// flight-lint: allow(sugar-delegates) private ordered-section map helper; its accessors are internal plumbing, not contract sugar
impl PexDict {
    fn contains(&self, key: &str) -> bool {
        return self.entries.iter().any(|(entry, _)| entry == key);
    }

    fn get(&self, key: &str) -> Option<&String> {
        return self
            .entries
            .iter()
            .find(|(entry, _)| entry == key)
            .map(|(_, value)| value);
    }

    fn insert(&mut self, key: String, value: String) {
        if let Some((_, existing)) = self.entries.iter_mut().find(|(entry, _)| *entry == key) {
            *existing = value;
            return;
        }
        self.entries.push((key, value));
    }
}
