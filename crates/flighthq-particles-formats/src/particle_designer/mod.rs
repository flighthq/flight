//! Particle Designer plist XML format support.
//!
//! Targets Particle Designer 3.x and cocos2d-compatible plist files.
//! Reference: <https://www.71squared.com/particledesigner>

use std::collections::HashMap;
use std::f32::consts::PI;

use flighthq_particles::create_particle_emitter_config;
use flighthq_types::{ParticleBlendMode, ParticleEmitterConfig, ParticleEmitterShape};

const DEG2RAD: f32 = PI / 180.0;
const RAD2DEG: f32 = 180.0 / PI;

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/// Emitter type in a Particle Designer document.
/// `0` = gravity, `1` = radial (approximated on import as gravity).
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ParticleDesignerEmitterType {
    #[default]
    Gravity = 0,
    Radial = 1,
}

/// Full Particle Designer plist document, preserving all fields for
/// round-trip serialisation.
#[derive(Clone, Debug)]
pub struct ParticleDesignerDocument {
    // Core
    pub max_particles: u32,
    pub emitter_type: ParticleDesignerEmitterType,
    /// Seconds; `-1.0` = infinite.
    pub duration: f32,

    // Lifetime (seconds)
    pub particle_lifespan: f32,
    pub particle_lifespan_variance: f32,

    // Speed (points/sec)
    pub speed: f32,
    pub speed_variance: f32,

    // Direction (degrees: 0=right, 90=up-screen, in Y-down screen space)
    pub angle: f32,
    pub angle_variance: f32,

    // Gravity (points/sec²; positive Y = down on screen)
    pub gravityx: f32,
    pub gravityy: f32,

    // Emitter position variance (used as spawn area half-extents)
    pub source_position_variance_x: f32,
    pub source_position_variance_y: f32,

    // Scale — absolute pixel size at birth and death
    pub start_particle_size: f32,
    pub start_particle_size_variance: f32,
    pub finish_particle_size: f32,
    pub finish_particle_size_variance: f32,

    // Color at birth (0–1 each channel)
    pub start_color_red: f32,
    pub start_color_green: f32,
    pub start_color_blue: f32,
    pub start_color_alpha: f32,
    pub start_color_variance_red: f32,
    pub start_color_variance_green: f32,
    pub start_color_variance_blue: f32,
    pub start_color_variance_alpha: f32,

    // Color at death
    pub finish_color_red: f32,
    pub finish_color_green: f32,
    pub finish_color_blue: f32,
    pub finish_color_alpha: f32,
    pub finish_color_variance_red: f32,
    pub finish_color_variance_green: f32,
    pub finish_color_variance_blue: f32,
    pub finish_color_variance_alpha: f32,

    // Rotation spin (degrees/sec, applies at spawn, constant)
    pub rotation_start: f32,
    pub rotation_start_variance: f32,
    pub rotation_end: f32,
    pub rotation_end_variance: f32,

    // Radial mode (emitter_type == Radial) — approximated on import
    pub max_radius: f32,
    pub max_radius_variance: f32,
    pub min_radius: f32,
    pub min_radius_variance: f32,
    pub rotate_per_second: f32,
    pub rotate_per_second_variance: f32,

    // Blend function (OpenGL constants)
    pub blend_func_source: u32,
    pub blend_func_destination: u32,

    // Misc
    pub texture_file_name: String,
}

// ---------------------------------------------------------------------------
// Parse options / result types
// ---------------------------------------------------------------------------

/// Options for parsing a Particle Designer plist.
#[derive(Clone, Debug, Default)]
pub struct ParticleDesignerParseOptions {
    /// Side length of the particle texture in pixels, used to normalise pixel
    /// sizes to dimensionless scale multipliers.  Defaults to `1` (no
    /// normalisation).
    pub texture_size: Option<f32>,
}

/// Result of parsing a Particle Designer plist with the round-trip path.
#[derive(Debug)]
pub struct ParticleDesignerParsed {
    pub config: ParticleEmitterConfig,
    pub document: ParticleDesignerDocument,
    /// Features present in the source that cannot be represented in the
    /// common-subset config and were silently dropped.
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Serialize options
// ---------------------------------------------------------------------------

/// Options for serialising a config to a Particle Designer plist.
#[derive(Clone, Debug, Default)]
pub struct ParticleDesignerSerializeOptions {
    /// Side length of the particle texture in pixels — reverses the
    /// normalisation applied during parsing.  Defaults to `1`.
    pub texture_size: Option<f32>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse a Particle Designer plist XML string directly to a
/// `ParticleEmitterConfig`.
///
/// Single-pass: no intermediate document object is allocated.  Use
/// [`parse_particle_designer_plist_document`] when you need round-trip
/// serialisation.
pub fn parse_particle_designer_plist(
    plist_xml: &str,
    options: Option<&ParticleDesignerParseOptions>,
) -> ParticleEmitterConfig {
    let texture_size = options.and_then(|o| o.texture_size).unwrap_or(1.0);
    raw_dict_to_config(&parse_plist_raw_dict(plist_xml), texture_size)
}

/// Parse a Particle Designer plist XML string and preserve the full document
/// for round-trip serialisation via [`serialize_particle_designer_plist`].
pub fn parse_particle_designer_plist_document(
    plist_xml: &str,
    options: Option<&ParticleDesignerParseOptions>,
) -> ParticleDesignerParsed {
    let texture_size = options.and_then(|o| o.texture_size).unwrap_or(1.0);
    let d = parse_plist_raw_dict(plist_xml);
    let document = ParticleDesignerDocument {
        max_particles: num(&d, "maxParticles", 200.0) as i64 as u32,
        emitter_type: if num(&d, "emitterType", 0.0) == 1.0 {
            ParticleDesignerEmitterType::Radial
        } else {
            ParticleDesignerEmitterType::Gravity
        },
        duration: num(&d, "duration", -1.0),
        particle_lifespan: num(&d, "particleLifespan", 1.0),
        particle_lifespan_variance: num(&d, "particleLifespanVariance", 0.0),
        speed: num(&d, "speed", 100.0),
        speed_variance: num(&d, "speedVariance", 0.0),
        angle: num(&d, "angle", 90.0),
        angle_variance: num(&d, "angleVariance", 0.0),
        gravityx: num(&d, "gravityx", 0.0),
        gravityy: num(&d, "gravityy", 0.0),
        source_position_variance_x: num(&d, "sourcePositionVariancex", 0.0),
        source_position_variance_y: num(&d, "sourcePositionVariancey", 0.0),
        start_particle_size: num(&d, "startParticleSize", 32.0),
        start_particle_size_variance: num(&d, "startParticleSizeVariance", 0.0),
        finish_particle_size: num(&d, "finishParticleSize", 16.0),
        finish_particle_size_variance: num(&d, "finishParticleSizeVariance", 0.0),
        start_color_red: num(&d, "startColorRed", 1.0),
        start_color_green: num(&d, "startColorGreen", 1.0),
        start_color_blue: num(&d, "startColorBlue", 1.0),
        start_color_alpha: num(&d, "startColorAlpha", 1.0),
        start_color_variance_red: num(&d, "startColorVarianceRed", 0.0),
        start_color_variance_green: num(&d, "startColorVarianceGreen", 0.0),
        start_color_variance_blue: num(&d, "startColorVarianceBlue", 0.0),
        start_color_variance_alpha: num(&d, "startColorVarianceAlpha", 0.0),
        finish_color_red: num(&d, "finishColorRed", 1.0),
        finish_color_green: num(&d, "finishColorGreen", 1.0),
        finish_color_blue: num(&d, "finishColorBlue", 1.0),
        finish_color_alpha: num(&d, "finishColorAlpha", 0.0),
        finish_color_variance_red: num(&d, "finishColorVarianceRed", 0.0),
        finish_color_variance_green: num(&d, "finishColorVarianceGreen", 0.0),
        finish_color_variance_blue: num(&d, "finishColorVarianceBlue", 0.0),
        finish_color_variance_alpha: num(&d, "finishColorVarianceAlpha", 0.0),
        rotation_start: num(&d, "rotationStart", 0.0),
        rotation_start_variance: num(&d, "rotationStartVariance", 0.0),
        rotation_end: num(&d, "rotationEnd", 0.0),
        rotation_end_variance: num(&d, "rotationEndVariance", 0.0),
        max_radius: num(&d, "maxRadius", 0.0),
        max_radius_variance: num(&d, "maxRadiusVariance", 0.0),
        min_radius: num(&d, "minRadius", 0.0),
        min_radius_variance: num(&d, "minRadiusVariance", 0.0),
        rotate_per_second: num(&d, "rotatePerSecond", 0.0),
        rotate_per_second_variance: num(&d, "rotatePerSecondVariance", 0.0),
        blend_func_source: num(&d, "blendFuncSource", 770.0) as i64 as u32,
        blend_func_destination: num(&d, "blendFuncDestination", 771.0) as i64 as u32,
        texture_file_name: str_field(&d, "textureFileName", ""),
    };
    ParticleDesignerParsed {
        config: raw_dict_to_config(&d, texture_size),
        document,
        warnings: collect_particle_designer_warnings(&d),
    }
}

/// Serialise a `ParticleEmitterConfig` to a Particle Designer plist XML string.
///
/// Pass the `document` returned by [`parse_particle_designer_plist_document`]
/// to preserve fields that don't round-trip through the config (texture name,
/// blend function, emitter type, duration, color variances).
pub fn serialize_particle_designer_plist(
    config: &ParticleEmitterConfig,
    existing: Option<&ParticleDesignerDocument>,
    options: Option<&ParticleDesignerSerializeOptions>,
) -> String {
    let texture_size = options.and_then(|o| o.texture_size).unwrap_or(1.0);
    let doc = config_to_document(config, existing, texture_size);
    document_to_plist(&doc)
}

// ---------------------------------------------------------------------------
// Raw plist value model + minimal XML parser
// ---------------------------------------------------------------------------

/// A value read out of a plist `<dict>`: a number, a boolean, or a string.
#[derive(Clone, Debug)]
enum RawValue {
    Number(f32),
    // Plist booleans are recorded for completeness even though no Particle
    // Designer field the config consumes is boolean-typed.
    #[allow(dead_code)]
    Bool(bool),
    Text(String),
}

type RawDict = HashMap<String, RawValue>;

fn num(d: &RawDict, key: &str, def: f32) -> f32 {
    // Reject NaN (e.g. from an empty `<integer>`/`<real>`) so a corrupt field
    // falls back to its default instead of poisoning the config.
    match d.get(key) {
        Some(RawValue::Number(v)) if v.is_finite() => *v,
        _ => def,
    }
}

fn str_field(d: &RawDict, key: &str, def: &str) -> String {
    match d.get(key) {
        Some(RawValue::Text(s)) => s.clone(),
        _ => def.to_string(),
    }
}

/// Parse the key/value pairs of a Particle Designer plist `<dict>` into a flat
/// map. Mirrors the single-pass tag scanner in the TS reference: an `<integer>`,
/// `<real>`, or `<string>` element following a `<key>` becomes that key's value,
/// and a self-closing `<true/>`/`<false/>` becomes a boolean.
fn parse_plist_raw_dict(xml: &str) -> RawDict {
    let mut result: RawDict = HashMap::new();
    let mut current_key: Option<String> = None;
    let mut in_tag: Option<String> = None;
    let bytes: Vec<char> = xml.chars().collect();
    let mut i = 0;
    let mut last_tag_end = 0;
    while i < bytes.len() {
        if bytes[i] != '<' {
            i += 1;
            continue;
        }
        // Capture text between the previous tag and this one.
        let text: String = bytes[last_tag_end..i].iter().collect();
        let text = text.trim().to_string();
        // Find the end of this tag.
        let mut j = i + 1;
        while j < bytes.len() && bytes[j] != '>' {
            j += 1;
        }
        if j >= bytes.len() {
            break;
        }
        let inner: String = bytes[i + 1..j].iter().collect();
        last_tag_end = j + 1;
        i = j + 1;

        let is_close = inner.starts_with('/');
        let is_self_close = inner.trim_end().ends_with('/');
        let name_src = inner.trim_start_matches('/');
        let name: String = name_src
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect();

        if !is_close && !is_self_close {
            if name == "key" {
                in_tag = Some("key".to_string());
            } else if name == "integer" || name == "real" || name == "string" {
                in_tag = Some(name.clone());
            }
        } else if is_self_close {
            if (name == "true" || name == "false") && current_key.is_some() {
                let key = current_key.take().unwrap();
                result.insert(key, RawValue::Bool(name == "true"));
            }
        } else {
            // Closing tag.
            if name == "key" && in_tag.as_deref() == Some("key") {
                current_key = if text.is_empty() {
                    None
                } else {
                    Some(text.clone())
                };
                in_tag = None;
            } else if let Some(key) = current_key.clone() {
                if name == "integer" && in_tag.as_deref() == Some("integer") {
                    result.insert(key, RawValue::Number(parse_int(&text)));
                } else if name == "real" && in_tag.as_deref() == Some("real") {
                    result.insert(key, RawValue::Number(parse_real(&text)));
                } else if name == "string" && in_tag.as_deref() == Some("string") {
                    result.insert(key, RawValue::Text(unescape_xml(&text)));
                }
                if name == "integer" || name == "real" || name == "string" {
                    current_key = None;
                    in_tag = None;
                }
            }
        }
    }
    result
}

fn parse_int(text: &str) -> f32 {
    // An empty or malformed tag yields NaN so `num` falls back to its default.
    text.trim()
        .parse::<i64>()
        .map(|v| v as f32)
        .unwrap_or(f32::NAN)
}

fn parse_real(text: &str) -> f32 {
    text.trim().parse::<f32>().unwrap_or(f32::NAN)
}

fn unescape_xml(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

// ---------------------------------------------------------------------------
// Raw dict → config mapping
// ---------------------------------------------------------------------------

fn raw_dict_to_config(d: &RawDict, texture_size: f32) -> ParticleEmitterConfig {
    let angle_rad = num(d, "angle", 90.0) * DEG2RAD;
    let lifespan = num(d, "particleLifespan", 1.0);
    let lifespan_var = num(d, "particleLifespanVariance", 0.0);
    let speed = num(d, "speed", 100.0);
    let speed_var = num(d, "speedVariance", 0.0);
    let vx = num(d, "sourcePositionVariancex", 0.0);
    let vy = num(d, "sourcePositionVariancey", 0.0);
    let emitter_shape = if vx == 0.0 && vy == 0.0 {
        ParticleEmitterShape::Point
    } else if vx == vy {
        ParticleEmitterShape::Circle
    } else {
        ParticleEmitterShape::Rect
    };
    let start_size = num(d, "startParticleSize", 32.0) / texture_size;
    let start_var = num(d, "startParticleSizeVariance", 0.0) / texture_size;
    let finish_size = num(d, "finishParticleSize", 16.0) / texture_size;
    let rot_start = num(d, "rotationStart", 0.0);
    let rot_end = num(d, "rotationEnd", 0.0);
    let rot_start_var = num(d, "rotationStartVariance", 0.0);
    let rot_end_var = num(d, "rotationEndVariance", 0.0);
    // `|| 1` in the TS guards a zero midpoint; replicate by falling back to 1.
    let lifetime_mid_raw = lifespan + lifespan_var * 0.5;
    let lifetime_mid = if lifetime_mid_raw == 0.0 {
        1.0
    } else {
        lifetime_mid_raw
    };
    let rot_speed_mid = (rot_start + rot_end) * 0.5 * DEG2RAD / lifetime_mid;
    let rot_speed_var = rot_start_var.max(rot_end_var) * DEG2RAD / lifetime_mid;

    let pd_duration = num(d, "duration", -1.0);

    create_particle_emitter_config(Some(ParticleEmitterConfig {
        max_particles: num(d, "maxParticles", 200.0) as i64 as u32,
        loop_: pd_duration <= 0.0,
        duration: if pd_duration > 0.0 { pd_duration } else { 0.0 },
        lifetime_min: (lifespan - lifespan_var).max(0.0),
        lifetime_max: lifespan + lifespan_var,
        speed_min: (speed - speed_var).max(0.0),
        speed_max: speed + speed_var,
        direction_x: angle_rad.cos(),
        direction_y: -angle_rad.sin(),
        spread: num(d, "angleVariance", 0.0) * DEG2RAD,
        gravity_x: num(d, "gravityx", 0.0),
        gravity_y: num(d, "gravityy", 0.0),
        emitter_shape,
        emitter_radius: if emitter_shape == ParticleEmitterShape::Circle {
            vx
        } else {
            0.0
        },
        emitter_width: if emitter_shape == ParticleEmitterShape::Rect {
            vx * 2.0
        } else {
            0.0
        },
        emitter_height: if emitter_shape == ParticleEmitterShape::Rect {
            vy * 2.0
        } else {
            0.0
        },
        scale_min: (start_size - start_var).max(0.0),
        scale_max: start_size + start_var,
        scale_end: if start_size > 0.0 {
            finish_size / start_size
        } else {
            1.0
        },
        color_start_r: num(d, "startColorRed", 1.0),
        color_start_g: num(d, "startColorGreen", 1.0),
        color_start_b: num(d, "startColorBlue", 1.0),
        color_start_variance_r: num(d, "startColorVarianceRed", 0.0),
        color_start_variance_g: num(d, "startColorVarianceGreen", 0.0),
        color_start_variance_b: num(d, "startColorVarianceBlue", 0.0),
        color_end_r: num(d, "finishColorRed", 1.0),
        color_end_g: num(d, "finishColorGreen", 1.0),
        color_end_b: num(d, "finishColorBlue", 1.0),
        color_end_variance_r: num(d, "finishColorVarianceRed", 0.0),
        color_end_variance_g: num(d, "finishColorVarianceGreen", 0.0),
        color_end_variance_b: num(d, "finishColorVarianceBlue", 0.0),
        alpha_start: num(d, "startColorAlpha", 1.0),
        alpha_end: num(d, "finishColorAlpha", 0.0),
        rotation_speed_min: rot_speed_mid - rot_speed_var,
        rotation_speed_max: rot_speed_mid + rot_speed_var,
        blend_mode: pd_blend_mode(
            num(d, "blendFuncSource", 770.0) as i64,
            num(d, "blendFuncDestination", 771.0) as i64,
        ),
        ..ParticleEmitterConfig::default()
    }))
}

fn pd_blend_mode(src: i64, dst: i64) -> Option<ParticleBlendMode> {
    // GL_ONE=1, GL_SRC_ALPHA=770, GL_ONE_MINUS_SRC_ALPHA=771
    if (src == 770 || src == 1) && dst == 1 {
        Some(ParticleBlendMode::Add)
    } else if src == 770 && dst == 771 {
        Some(ParticleBlendMode::Normal)
    } else if src == 1 && dst == 771 {
        Some(ParticleBlendMode::Normal) // premultiplied alpha
    } else {
        None
    }
}

fn collect_particle_designer_warnings(d: &RawDict) -> Vec<String> {
    let mut warnings = Vec::new();
    if num(d, "emitterType", 0.0) == 1.0 {
        warnings.push(
            "Radial (emitterType=1) emitter was approximated as a gravity emitter; radial motion is not simulated"
                .to_string(),
        );
    }
    if num(d, "radialAcceleration", 0.0) != 0.0 || num(d, "radialAccelVariance", 0.0) != 0.0 {
        warnings.push("radialAcceleration is not supported and was ignored".to_string());
    }
    if num(d, "tangentialAcceleration", 0.0) != 0.0 || num(d, "tangentialAccelVariance", 0.0) != 0.0
    {
        warnings.push("tangentialAcceleration is not supported and was ignored".to_string());
    }
    warnings
}

// ---------------------------------------------------------------------------
// Config → document → plist serialisation
// ---------------------------------------------------------------------------

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&ParticleDesignerDocument>,
    texture_size: f32,
) -> ParticleDesignerDocument {
    let angle_deg = (-config.direction_y).atan2(config.direction_x) * RAD2DEG;

    let start_size = (config.scale_min + config.scale_max) * 0.5 * texture_size;
    let start_var = (config.scale_max - config.scale_min) * 0.5 * texture_size;
    let finish_size = start_size * config.scale_end;

    let rot_speed_mid = (config.rotation_speed_min + config.rotation_speed_max) * 0.5;
    let rot_speed_var = (config.rotation_speed_max - config.rotation_speed_min) * 0.5;
    let lifetime_mid = (config.lifetime_min + config.lifetime_max) * 0.5;
    let rot_start = rot_speed_mid * lifetime_mid * RAD2DEG;
    let rot_var = rot_speed_var * lifetime_mid * RAD2DEG;

    let (mut vx, mut vy) = (0.0, 0.0);
    if config.emitter_shape == ParticleEmitterShape::Circle {
        vx = config.emitter_radius;
        vy = config.emitter_radius;
    } else if config.emitter_shape == ParticleEmitterShape::Rect {
        vx = config.emitter_width * 0.5;
        vy = config.emitter_height * 0.5;
    }

    // Prefer an existing source field over the config-derived value when the
    // config carries the zero default (mirrors the `!== 0 ? config : existing`
    // pattern in the TS serializer for color variances and reserved fields).
    let pick_var = |config_val: f32, existing_val: f32| -> f32 {
        if config_val != 0.0 {
            config_val
        } else {
            existing_val
        }
    };

    ParticleDesignerDocument {
        max_particles: config.max_particles,
        emitter_type: existing.map(|e| e.emitter_type).unwrap_or_default(),
        duration: if config.duration > 0.0 && !config.loop_ {
            config.duration
        } else {
            existing.map(|e| e.duration).unwrap_or(-1.0)
        },
        particle_lifespan: (config.lifetime_min + config.lifetime_max) * 0.5,
        particle_lifespan_variance: (config.lifetime_max - config.lifetime_min) * 0.5,
        speed: (config.speed_min + config.speed_max) * 0.5,
        speed_variance: (config.speed_max - config.speed_min) * 0.5,
        angle: angle_deg,
        angle_variance: config.spread * RAD2DEG,
        gravityx: config.gravity_x,
        gravityy: config.gravity_y,
        source_position_variance_x: vx,
        source_position_variance_y: vy,
        start_particle_size: start_size,
        start_particle_size_variance: start_var,
        finish_particle_size: finish_size,
        finish_particle_size_variance: existing
            .map(|e| e.finish_particle_size_variance)
            .unwrap_or(0.0),
        start_color_red: config.color_start_r,
        start_color_green: config.color_start_g,
        start_color_blue: config.color_start_b,
        start_color_alpha: config.alpha_start,
        start_color_variance_red: pick_var(
            config.color_start_variance_r,
            existing.map(|e| e.start_color_variance_red).unwrap_or(0.0),
        ),
        start_color_variance_green: pick_var(
            config.color_start_variance_g,
            existing
                .map(|e| e.start_color_variance_green)
                .unwrap_or(0.0),
        ),
        start_color_variance_blue: pick_var(
            config.color_start_variance_b,
            existing.map(|e| e.start_color_variance_blue).unwrap_or(0.0),
        ),
        start_color_variance_alpha: existing
            .map(|e| e.start_color_variance_alpha)
            .unwrap_or(0.0),
        finish_color_red: config.color_end_r,
        finish_color_green: config.color_end_g,
        finish_color_blue: config.color_end_b,
        finish_color_alpha: config.alpha_end,
        finish_color_variance_red: pick_var(
            config.color_end_variance_r,
            existing.map(|e| e.finish_color_variance_red).unwrap_or(0.0),
        ),
        finish_color_variance_green: pick_var(
            config.color_end_variance_g,
            existing
                .map(|e| e.finish_color_variance_green)
                .unwrap_or(0.0),
        ),
        finish_color_variance_blue: pick_var(
            config.color_end_variance_b,
            existing
                .map(|e| e.finish_color_variance_blue)
                .unwrap_or(0.0),
        ),
        finish_color_variance_alpha: existing
            .map(|e| e.finish_color_variance_alpha)
            .unwrap_or(0.0),
        rotation_start: rot_start,
        rotation_start_variance: rot_var,
        rotation_end: rot_start,
        rotation_end_variance: rot_var,
        max_radius: existing.map(|e| e.max_radius).unwrap_or(0.0),
        max_radius_variance: existing.map(|e| e.max_radius_variance).unwrap_or(0.0),
        min_radius: existing.map(|e| e.min_radius).unwrap_or(0.0),
        min_radius_variance: existing.map(|e| e.min_radius_variance).unwrap_or(0.0),
        rotate_per_second: existing.map(|e| e.rotate_per_second).unwrap_or(0.0),
        rotate_per_second_variance: existing
            .map(|e| e.rotate_per_second_variance)
            .unwrap_or(0.0),
        blend_func_source: blend_mode_to_src(
            config.blend_mode,
            existing.map(|e| e.blend_func_source).unwrap_or(770),
        ),
        blend_func_destination: blend_mode_to_dst(
            config.blend_mode,
            existing.map(|e| e.blend_func_destination).unwrap_or(771),
        ),
        texture_file_name: existing
            .map(|e| e.texture_file_name.clone())
            .unwrap_or_default(),
    }
}

fn blend_mode_to_src(mode: Option<ParticleBlendMode>, fallback: u32) -> u32 {
    match mode {
        Some(ParticleBlendMode::Add) => 770, // GL_SRC_ALPHA
        Some(ParticleBlendMode::Normal) => 770,
        _ => fallback,
    }
}

fn blend_mode_to_dst(mode: Option<ParticleBlendMode>, fallback: u32) -> u32 {
    match mode {
        Some(ParticleBlendMode::Add) => 1,      // GL_ONE
        Some(ParticleBlendMode::Normal) => 771, // GL_ONE_MINUS_SRC_ALPHA
        _ => fallback,
    }
}

fn document_to_plist(doc: &ParticleDesignerDocument) -> String {
    let mut lines: Vec<String> = vec![
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>".to_string(),
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">"
            .to_string(),
        "<plist version=\"1.0\">".to_string(),
        "<dict>".to_string(),
    ];

    fn push_num(lines: &mut Vec<String>, key: &str, value: f32) {
        lines.push(format!("\t<key>{key}</key>"));
        if value.fract() == 0.0 && value.is_finite() && value.abs() < 1e15 {
            lines.push(format!("\t<integer>{}</integer>", value as i64));
        } else {
            lines.push(format!("\t<real>{value}</real>"));
        }
    }
    fn push_int(lines: &mut Vec<String>, key: &str, value: u32) {
        lines.push(format!("\t<key>{key}</key>"));
        lines.push(format!("\t<integer>{value}</integer>"));
    }
    fn push_str(lines: &mut Vec<String>, key: &str, value: &str) {
        lines.push(format!("\t<key>{key}</key>"));
        lines.push(format!("\t<string>{}</string>", escape_xml(value)));
    }

    push_int(&mut lines, "maxParticles", doc.max_particles);
    push_int(&mut lines, "emitterType", doc.emitter_type as u32);
    push_num(&mut lines, "duration", doc.duration);
    push_num(&mut lines, "particleLifespan", doc.particle_lifespan);
    push_num(
        &mut lines,
        "particleLifespanVariance",
        doc.particle_lifespan_variance,
    );
    push_num(&mut lines, "speed", doc.speed);
    push_num(&mut lines, "speedVariance", doc.speed_variance);
    push_num(&mut lines, "angle", doc.angle);
    push_num(&mut lines, "angleVariance", doc.angle_variance);
    push_num(&mut lines, "gravityx", doc.gravityx);
    push_num(&mut lines, "gravityy", doc.gravityy);
    push_num(
        &mut lines,
        "sourcePositionVariancex",
        doc.source_position_variance_x,
    );
    push_num(
        &mut lines,
        "sourcePositionVariancey",
        doc.source_position_variance_y,
    );
    push_num(&mut lines, "startParticleSize", doc.start_particle_size);
    push_num(
        &mut lines,
        "startParticleSizeVariance",
        doc.start_particle_size_variance,
    );
    push_num(&mut lines, "finishParticleSize", doc.finish_particle_size);
    push_num(
        &mut lines,
        "finishParticleSizeVariance",
        doc.finish_particle_size_variance,
    );
    push_num(&mut lines, "startColorRed", doc.start_color_red);
    push_num(&mut lines, "startColorGreen", doc.start_color_green);
    push_num(&mut lines, "startColorBlue", doc.start_color_blue);
    push_num(&mut lines, "startColorAlpha", doc.start_color_alpha);
    push_num(
        &mut lines,
        "startColorVarianceRed",
        doc.start_color_variance_red,
    );
    push_num(
        &mut lines,
        "startColorVarianceGreen",
        doc.start_color_variance_green,
    );
    push_num(
        &mut lines,
        "startColorVarianceBlue",
        doc.start_color_variance_blue,
    );
    push_num(
        &mut lines,
        "startColorVarianceAlpha",
        doc.start_color_variance_alpha,
    );
    push_num(&mut lines, "finishColorRed", doc.finish_color_red);
    push_num(&mut lines, "finishColorGreen", doc.finish_color_green);
    push_num(&mut lines, "finishColorBlue", doc.finish_color_blue);
    push_num(&mut lines, "finishColorAlpha", doc.finish_color_alpha);
    push_num(
        &mut lines,
        "finishColorVarianceRed",
        doc.finish_color_variance_red,
    );
    push_num(
        &mut lines,
        "finishColorVarianceGreen",
        doc.finish_color_variance_green,
    );
    push_num(
        &mut lines,
        "finishColorVarianceBlue",
        doc.finish_color_variance_blue,
    );
    push_num(
        &mut lines,
        "finishColorVarianceAlpha",
        doc.finish_color_variance_alpha,
    );
    push_num(&mut lines, "rotationStart", doc.rotation_start);
    push_num(
        &mut lines,
        "rotationStartVariance",
        doc.rotation_start_variance,
    );
    push_num(&mut lines, "rotationEnd", doc.rotation_end);
    push_num(&mut lines, "rotationEndVariance", doc.rotation_end_variance);
    push_num(&mut lines, "maxRadius", doc.max_radius);
    push_num(&mut lines, "maxRadiusVariance", doc.max_radius_variance);
    push_num(&mut lines, "minRadius", doc.min_radius);
    push_num(&mut lines, "minRadiusVariance", doc.min_radius_variance);
    push_num(&mut lines, "rotatePerSecond", doc.rotate_per_second);
    push_num(
        &mut lines,
        "rotatePerSecondVariance",
        doc.rotate_per_second_variance,
    );
    push_int(&mut lines, "blendFuncSource", doc.blend_func_source);
    push_int(
        &mut lines,
        "blendFuncDestination",
        doc.blend_func_destination,
    );
    push_str(&mut lines, "textureFileName", &doc.texture_file_name);

    lines.push("</dict>".to_string());
    lines.push("</plist>".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIRE_PLIST: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>maxParticles</key><integer>200</integer>
  <key>emitterType</key><integer>0</integer>
  <key>duration</key><real>-1</real>
  <key>particleLifespan</key><real>1.5</real>
  <key>particleLifespanVariance</key><real>0.5</real>
  <key>speed</key><real>100</real>
  <key>speedVariance</key><real>20</real>
  <key>angle</key><real>90</real>
  <key>angleVariance</key><real>30</real>
  <key>gravityx</key><real>0</real>
  <key>gravityy</key><real>200</real>
  <key>sourcePositionVariancex</key><real>0</real>
  <key>sourcePositionVariancey</key><real>0</real>
  <key>startParticleSize</key><real>32</real>
  <key>startParticleSizeVariance</key><real>8</real>
  <key>finishParticleSize</key><real>8</real>
  <key>finishParticleSizeVariance</key><real>0</real>
  <key>startColorRed</key><real>1</real>
  <key>startColorGreen</key><real>0.5</real>
  <key>startColorBlue</key><real>0</real>
  <key>startColorAlpha</key><real>1</real>
  <key>startColorVarianceRed</key><real>0</real>
  <key>startColorVarianceGreen</key><real>0</real>
  <key>startColorVarianceBlue</key><real>0</real>
  <key>startColorVarianceAlpha</key><real>0</real>
  <key>finishColorRed</key><real>1</real>
  <key>finishColorGreen</key><real>0</real>
  <key>finishColorBlue</key><real>0</real>
  <key>finishColorAlpha</key><real>0</real>
  <key>finishColorVarianceRed</key><real>0</real>
  <key>finishColorVarianceGreen</key><real>0</real>
  <key>finishColorVarianceBlue</key><real>0</real>
  <key>finishColorVarianceAlpha</key><real>0</real>
  <key>rotationStart</key><real>0</real>
  <key>rotationStartVariance</key><real>0</real>
  <key>rotationEnd</key><real>0</real>
  <key>rotationEndVariance</key><real>0</real>
  <key>maxRadius</key><real>0</real>
  <key>maxRadiusVariance</key><real>0</real>
  <key>minRadius</key><real>0</real>
  <key>minRadiusVariance</key><real>0</real>
  <key>rotatePerSecond</key><real>0</real>
  <key>rotatePerSecondVariance</key><real>0</real>
  <key>blendFuncSource</key><integer>770</integer>
  <key>blendFuncDestination</key><integer>771</integer>
  <key>textureFileName</key><string>fire.png</string>
</dict>
</plist>"#;

    fn close(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() <= eps
    }

    // ── parse_particle_designer_plist: color variance and blend mode ──

    #[test]
    fn parse_particle_designer_plist_maps_start_color_variance() {
        let plist = FIRE_PLIST.replace(
            "<key>startColorVarianceRed</key><real>0</real>",
            "<key>startColorVarianceRed</key><real>0.3</real>",
        );
        let c = parse_particle_designer_plist(&plist, None);
        assert!(close(c.color_start_variance_r, 0.3, 1e-4));
    }

    #[test]
    fn parse_particle_designer_plist_maps_additive_blend() {
        let plist = FIRE_PLIST.replace(
            "<key>blendFuncDestination</key><integer>771</integer>",
            "<key>blendFuncDestination</key><integer>1</integer>",
        );
        let c = parse_particle_designer_plist(&plist, None);
        assert_eq!(c.blend_mode, Some(ParticleBlendMode::Add));
    }

    #[test]
    fn parse_particle_designer_plist_round_trips_color_variance() {
        let modified = FIRE_PLIST.replace(
            "<key>startColorVarianceGreen</key><real>0</real>",
            "<key>startColorVarianceGreen</key><real>0.2</real>",
        );
        let config = parse_particle_designer_plist(&modified, None);
        let document = parse_particle_designer_plist_document(&modified, None).document;
        let xml = serialize_particle_designer_plist(&config, Some(&document), None);
        let config2 = parse_particle_designer_plist(&xml, None);
        assert!(close(config2.color_start_variance_g, 0.2, 1e-3));
    }

    // ── parse_particle_designer_plist: lightweight ──

    #[test]
    fn parse_particle_designer_plist_minimal() {
        let c = parse_particle_designer_plist(FIRE_PLIST, None);
        assert_eq!(c.max_particles, 200);
        assert!(close(c.lifetime_min, 1.0, 1e-4));
        assert!(close(c.lifetime_max, 2.0, 1e-4));
        assert!(close(c.speed_min, 80.0, 1e-4));
        assert!(close(c.speed_max, 120.0, 1e-4));
        assert!(close(c.direction_x, 0.0, 1e-3));
        assert!(close(c.direction_y, -1.0, 1e-3));
        assert!(close(c.spread, 30.0 * DEG2RAD, 1e-4));
        assert!(close(c.gravity_x, 0.0, 1e-4));
        assert!(close(c.gravity_y, 200.0, 1e-4));
        assert!(close(c.color_start_r, 1.0, 1e-4));
        assert!(close(c.color_start_g, 0.5, 1e-4));
        assert!(close(c.color_start_b, 0.0, 1e-4));
        assert!(close(c.color_end_r, 1.0, 1e-4));
        assert!(close(c.color_end_g, 0.0, 1e-4));
        assert!(close(c.alpha_start, 1.0, 1e-4));
        assert!(close(c.alpha_end, 0.0, 1e-4));
        assert_eq!(c.emitter_shape, ParticleEmitterShape::Point);
    }

    #[test]
    fn parse_particle_designer_plist_normalises_scale_by_texture_size() {
        let opts = ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
        let c = parse_particle_designer_plist(FIRE_PLIST, Some(&opts));
        assert!(close(c.scale_min, 0.75, 1e-4));
        assert!(close(c.scale_max, 1.25, 1e-4));
        assert!(close(c.scale_end, 0.25, 1e-4));
    }

    #[test]
    fn parse_particle_designer_plist_duration_mapping() {
        let c = parse_particle_designer_plist(FIRE_PLIST, None);
        assert!(c.loop_);
        assert_eq!(c.duration, 0.0);

        let plist = FIRE_PLIST.replace(
            "<key>duration</key><real>-1</real>",
            "<key>duration</key><real>2.5</real>",
        );
        let c2 = parse_particle_designer_plist(&plist, None);
        assert!(!c2.loop_);
        assert!(close(c2.duration, 2.5, 1e-4));
    }

    // ── malformed input ──

    #[test]
    fn parse_particle_designer_plist_falls_back_on_empty_tags() {
        let xml = "<plist><dict>\
            <key>maxParticles</key><integer></integer>\
            <key>speed</key><real></real>\
            </dict></plist>";
        let c = parse_particle_designer_plist(xml, None);
        assert_eq!(c.max_particles, 200);
        assert!(c.speed_min.is_finite());
        assert!(c.speed_max.is_finite());
    }

    #[test]
    fn parse_particle_designer_plist_garbage_does_not_panic() {
        let _ = parse_particle_designer_plist("", None);
        let c = parse_particle_designer_plist("not xml at all", None);
        assert!(c.max_particles as f32 >= 0.0);
        assert!(c.gravity_y.is_finite());
    }

    // ── document ──

    #[test]
    fn parse_particle_designer_plist_document_round_trips() {
        let opts = ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
        let config = parse_particle_designer_plist(FIRE_PLIST, Some(&opts));
        let parsed = parse_particle_designer_plist_document(FIRE_PLIST, Some(&opts));
        assert_eq!(parsed.config.max_particles, config.max_particles);
        assert!(close(parsed.config.direction_y, config.direction_y, 1e-5));
        assert!(close(parsed.config.gravity_y, config.gravity_y, 1e-5));
        assert_eq!(parsed.document.texture_file_name, "fire.png");
        assert_eq!(parsed.document.blend_func_source, 770);
        assert_eq!(parsed.document.blend_func_destination, 771);
    }

    // ── warnings ──

    #[test]
    fn parse_particle_designer_plist_no_warnings_for_gravity() {
        assert!(
            parse_particle_designer_plist_document(FIRE_PLIST, None)
                .warnings
                .is_empty()
        );
    }

    #[test]
    fn parse_particle_designer_plist_radial_emits_warning() {
        let plist = FIRE_PLIST.replace(
            "<key>emitterType</key><integer>0</integer>",
            "<key>emitterType</key><integer>1</integer>",
        );
        let warnings = parse_particle_designer_plist_document(&plist, None).warnings;
        assert!(warnings.iter().any(|w| w.to_lowercase().contains("radial")));
    }

    #[test]
    fn parse_particle_designer_plist_warns_radial_acceleration() {
        let plist = FIRE_PLIST.replace(
            "<key>maxParticles</key><integer>200</integer>",
            "<key>maxParticles</key><integer>200</integer><key>radialAcceleration</key><real>50</real>",
        );
        let warnings = parse_particle_designer_plist_document(&plist, None).warnings;
        assert!(warnings.iter().any(|w| w.contains("radialAcceleration")));
    }

    // ── serialize ──

    #[test]
    fn serialize_particle_designer_plist_round_trips_fields() {
        let opts = ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
        let ser_opts = ParticleDesignerSerializeOptions {
            texture_size: Some(32.0),
        };
        let config = parse_particle_designer_plist(FIRE_PLIST, Some(&opts));
        let document = parse_particle_designer_plist_document(FIRE_PLIST, Some(&opts)).document;
        let xml = serialize_particle_designer_plist(&config, Some(&document), Some(&ser_opts));
        let config2 = parse_particle_designer_plist(&xml, Some(&opts));
        assert_eq!(config2.max_particles, config.max_particles);
        assert!(close(config2.direction_x, config.direction_x, 1e-3));
        assert!(close(config2.gravity_y, config.gravity_y, 0.1));
        assert!(close(config2.color_start_r, config.color_start_r, 1e-3));
        assert!(close(config2.alpha_end, config.alpha_end, 1e-3));
    }

    #[test]
    fn serialize_particle_designer_plist_preserves_texture_name() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let document = parse_particle_designer_plist_document(FIRE_PLIST, None).document;
        let xml = serialize_particle_designer_plist(&config, Some(&document), None);
        assert!(xml.contains("fire.png"));
    }

    #[test]
    fn serialize_particle_designer_plist_produces_valid_xml() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let xml = serialize_particle_designer_plist(&config, None, None);
        assert!(xml.contains("<?xml version=\"1.0\""));
        assert!(xml.contains("<plist version=\"1.0\">"));
    }

    #[test]
    fn serialize_particle_designer_plist_escapes_texture_name() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let document = ParticleDesignerDocument {
            texture_file_name: "a&b<c>.png".to_string(),
            ..parse_particle_designer_plist_document(FIRE_PLIST, None).document
        };
        let xml = serialize_particle_designer_plist(&config, Some(&document), None);
        assert!(!xml.contains("a&b<c>"));
        assert!(xml.contains("&amp;"));
        assert_eq!(
            parse_particle_designer_plist_document(&xml, None)
                .document
                .texture_file_name,
            "a&b<c>.png"
        );
    }
}
