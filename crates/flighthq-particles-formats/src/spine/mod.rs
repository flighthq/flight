//! Spine 4.x particle effect JSON format support.
//!
//! Reference: <https://esotericsoftware.com/spine-particle-effects>
//! Field naming follows Spine editor export conventions.
//! Units: time in milliseconds, sizes in pixels, angles in degrees.

use std::f32::consts::PI;

use flighthq_particles::{
    create_particle_emitter_config, particle_color_curve_from_keyframes,
    particle_color_curve_to_keyframes, particle_curve_from_keyframes, particle_curve_to_keyframes,
};
use flighthq_types::{
    ColorKeyframe, CurveKeyframe, ParticleBlendMode, ParticleCurve, ParticleEmitterConfig,
    ParticleEmitterShape,
};

use crate::json::{
    JsonObjectWriter, JsonValue, escape_json_string, format_json_number, parse_json,
};

const DEG2RAD: f32 = PI / 180.0;
const RAD2DEG: f32 = 180.0 / PI;
const CURVE_SAMPLES: usize = 33;

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/// Spine particle blend mode.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SpineBlendMode {
    #[default]
    Normal,
    Additive,
    Multiply,
    Screen,
}

/// A `[low, high]` range value used throughout the Spine particle format.
#[derive(Copy, Clone, Debug, Default)]
pub struct SpineRangeValue {
    pub low: f32,
    pub high: f32,
}

/// An alpha keyframe on the particle alpha-over-lifetime timeline.
#[derive(Copy, Clone, Debug, Default)]
pub struct SpineAlphaKeyframe {
    /// Normalised lifetime fraction in `[0, 1]`.
    pub time: f32,
    /// Alpha value in `[0, 1]`.
    pub alpha: f32,
}

/// A tint keyframe on the particle color-over-lifetime timeline.
#[derive(Clone, Debug)]
pub struct SpineTintKeyframe {
    /// Normalised lifetime fraction in `[0, 1]`.
    pub time: f32,
    /// Hex-encoded RGB color, e.g. `"ff7700"`.
    pub color: String,
}

/// Full Spine particle effect document.
#[derive(Clone, Debug)]
pub struct SpineParticleDocument {
    pub name: String,

    // Capacity
    pub max_particles: u32,
    pub continuous: bool,
    /// Milliseconds; `-1` = infinite.
    pub duration: f32,

    // Emission (particles per second)
    pub emission: SpineRangeValue,

    // Lifetime (milliseconds)
    pub life: SpineRangeValue,
    pub life_offset: SpineRangeValue,

    // Spawn position
    pub x: SpineRangeValue,
    pub y: SpineRangeValue,
    pub spawn_shape: SpineSpawnShape,
    pub spawn_width: SpineRangeValue,
    pub spawn_height: SpineRangeValue,

    // Physics
    pub velocity: SpineRangeValue,
    pub angle: SpineRangeValue,
    pub rotation: SpineRangeValue,
    pub wind: SpineRangeValue,
    pub gravity: SpineRangeValue,

    // Appearance
    pub scale: SpineRangeValue,
    pub scale_end: SpineRangeValue,
    pub tint: Vec<SpineTintKeyframe>,
    pub alpha: Vec<SpineAlphaKeyframe>,
    pub blend_mode: SpineBlendMode,
    pub premultiplied: bool,

    // Images (first entry used for config mapping)
    pub images: Vec<String>,
}

/// Spawn shape in a Spine particle document.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SpineSpawnShape {
    #[default]
    Point,
    Ellipse,
    Line,
}

// ---------------------------------------------------------------------------
// Parse result
// ---------------------------------------------------------------------------

/// Result of parsing a Spine particle JSON with the round-trip path.
#[derive(Debug)]
pub struct SpineParsed {
    pub config: ParticleEmitterConfig,
    pub document: SpineParticleDocument,
    /// Features present in the source that cannot be represented in the
    /// common-subset config and were silently dropped.
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse a Spine particle effect JSON string directly to a
/// `ParticleEmitterConfig`.
///
/// Single-pass: no intermediate document object is allocated.  Use
/// [`parse_spine_particle_document`] when you need round-trip serialisation.
///
/// Returns an `Err` if the JSON is syntactically invalid or not a JSON object.
pub fn parse_spine_particle(json: &str) -> Result<ParticleEmitterConfig, String> {
    Ok(raw_to_config(&parse_spine_json(json)?))
}

/// Parse a Spine particle effect JSON string and preserve the full document
/// for round-trip serialisation via [`serialize_spine_particle`].
///
/// Returns an `Err` if the JSON is syntactically invalid or not a JSON object.
pub fn parse_spine_particle_document(json: &str) -> Result<SpineParsed, String> {
    let raw = parse_spine_json(json)?;
    Ok(SpineParsed {
        config: raw_to_config(&raw),
        document: raw_to_document(&raw),
        warnings: collect_spine_warnings(&raw),
    })
}

/// Serialise a `ParticleEmitterConfig` to a Spine particle effect JSON string.
///
/// Pass the `document` returned by [`parse_spine_particle_document`] to
/// preserve fields that don't round-trip through the config (name, image list,
/// blend mode, etc.).
pub fn serialize_spine_particle(
    config: &ParticleEmitterConfig,
    existing: Option<&SpineParticleDocument>,
) -> String {
    document_to_json(&config_to_document(config, existing))
}

// ---------------------------------------------------------------------------
// JSON value helpers (operate on raw JSON, no document allocation)
// ---------------------------------------------------------------------------

/// Parse a JSON string and assert the root is a plain object, returning a
/// clear, format-tagged error otherwise. Mirrors the TS reference's throwing
/// behaviour by surfacing the issue as an `Err`.
fn parse_spine_json(json: &str) -> Result<JsonValue, String> {
    let raw = parse_json(json).map_err(|e| format!("Invalid Spine particle JSON: {e}"))?;
    if !raw.is_object() {
        let kind = match raw {
            JsonValue::Null => "null",
            JsonValue::Array(_) => "array",
            JsonValue::Bool(_) => "boolean",
            JsonValue::Number(_) => "number",
            JsonValue::Text(_) => "string",
            JsonValue::Object(_) => "object",
        };
        return Err(format!(
            "Invalid Spine particle document: expected a JSON object, got {kind}"
        ));
    }
    Ok(raw)
}

fn range_mid(obj: Option<&JsonValue>, def: f32) -> f32 {
    match obj {
        Some(o) if o.is_object() => {
            let lo = o
                .get("low")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(def);
            let hi = o
                .get("high")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(def);
            (lo + hi) * 0.5
        }
        _ => def,
    }
}

fn range_low(obj: Option<&JsonValue>, def: f32) -> f32 {
    match obj {
        Some(o) if o.is_object() => o
            .get("low")
            .and_then(JsonValue::as_number)
            .map(|n| n as f32)
            .unwrap_or(def),
        _ => def,
    }
}

fn range_high(obj: Option<&JsonValue>, def: f32) -> f32 {
    match obj {
        Some(o) if o.is_object() => o
            .get("high")
            .and_then(JsonValue::as_number)
            .map(|n| n as f32)
            .unwrap_or(def),
        _ => def,
    }
}

fn hex_to_rgb(hex: &str) -> (f32, f32, f32) {
    let trimmed = hex.trim_start_matches('#');
    let mut s: String = trimmed.to_string();
    while s.len() < 6 {
        s.push('f');
    }
    let chars: Vec<char> = s.chars().collect();
    // Fall back to a full channel (1) for any non-hex pair so a malformed color
    // string never injects NaN into the config.
    let channel = |i: usize| -> f32 {
        if i + 1 < chars.len() {
            let pair: String = chars[i..i + 2].iter().collect();
            match u8::from_str_radix(&pair, 16) {
                Ok(v) => v as f32 / 255.0,
                Err(_) => 1.0,
            }
        } else {
            1.0
        }
    };
    (channel(0), channel(2), channel(4))
}

fn first_tint_color(arr: Option<&JsonValue>) -> (f32, f32, f32) {
    let color = arr
        .and_then(JsonValue::as_array)
        .filter(|a| !a.is_empty())
        .and_then(|a| a[0].get("color"))
        .and_then(JsonValue::as_text)
        .unwrap_or("ffffff");
    hex_to_rgb(color)
}

fn last_tint_color(arr: Option<&JsonValue>) -> (f32, f32, f32) {
    match arr.and_then(JsonValue::as_array) {
        Some(a) if !a.is_empty() => hex_to_rgb(
            a[a.len() - 1]
                .get("color")
                .and_then(JsonValue::as_text)
                .unwrap_or("ffffff"),
        ),
        _ => (1.0, 1.0, 1.0),
    }
}

fn first_alpha(arr: Option<&JsonValue>) -> f32 {
    arr.and_then(JsonValue::as_array)
        .filter(|a| !a.is_empty())
        .and_then(|a| a[0].get("alpha"))
        .and_then(JsonValue::as_number)
        .map(|n| n as f32)
        .unwrap_or(1.0)
}

fn last_alpha(arr: Option<&JsonValue>) -> f32 {
    match arr.and_then(JsonValue::as_array) {
        Some(a) if !a.is_empty() => a[a.len() - 1]
            .get("alpha")
            .and_then(JsonValue::as_number)
            .map(|n| n as f32)
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

// ---------------------------------------------------------------------------
// Shared raw → config mapping
// ---------------------------------------------------------------------------

fn raw_to_config(raw: &JsonValue) -> ParticleEmitterConfig {
    let life_low = range_low(raw.get("life"), 500.0) / 1000.0;
    let life_high = range_high(raw.get("life"), 1500.0) / 1000.0;
    let angle_low = range_low(raw.get("angle"), 60.0);
    let angle_high = range_high(raw.get("angle"), 120.0);
    let angle_mid = (angle_low + angle_high) * 0.5 * DEG2RAD;
    let spread = (angle_high - angle_low) * 0.5 * DEG2RAD;
    let spawn_shape = raw
        .get("spawnShape")
        .and_then(JsonValue::as_text)
        .unwrap_or("point");
    let sx = range_mid(raw.get("spawnWidth"), 0.0);
    let sy = range_mid(raw.get("spawnHeight"), 0.0);
    let emitter_shape = if spawn_shape == "ellipse" {
        if sx == sy {
            ParticleEmitterShape::Circle
        } else {
            ParticleEmitterShape::Rect
        }
    } else {
        ParticleEmitterShape::Point
    };
    let spawn_scale_mid = range_mid(raw.get("scale"), 1.0);
    let end_scale_mid = range_mid(raw.get("scaleEnd"), 0.0);
    let (start_r, start_g, start_b) = first_tint_color(raw.get("tint"));
    let (end_r, end_g, end_b) = last_tint_color(raw.get("tint"));
    let color_curve = tint_keyframes_to_curve(raw.get("tint"));
    let alpha_curve = alpha_keyframes_to_curve(raw.get("alpha"));
    let continuous = raw
        .get("continuous")
        .and_then(JsonValue::as_bool)
        .unwrap_or(true);
    let duration_ms = raw
        .get("duration")
        .and_then(JsonValue::as_number)
        .map(|n| n as f32)
        .unwrap_or(-1.0);

    create_particle_emitter_config(Some(ParticleEmitterConfig {
        max_particles: raw
            .get("maxParticles")
            .and_then(JsonValue::as_number)
            .map(|n| n as i64 as u32)
            .unwrap_or(500),
        spawn_rate: range_mid(raw.get("emission"), 20.0),
        loop_: continuous,
        duration: if !continuous && duration_ms > 0.0 {
            duration_ms / 1000.0
        } else {
            0.0
        },
        color_curve,
        alpha_curve,
        lifetime_min: life_low,
        lifetime_max: life_high,
        speed_min: range_low(raw.get("velocity"), 50.0),
        speed_max: range_high(raw.get("velocity"), 150.0),
        direction_x: angle_mid.cos(),
        direction_y: -angle_mid.sin(),
        spread,
        gravity_x: range_mid(raw.get("wind"), 0.0),
        gravity_y: range_mid(raw.get("gravity"), 0.0),
        emitter_shape,
        emitter_radius: if emitter_shape == ParticleEmitterShape::Circle {
            sx * 0.5
        } else {
            0.0
        },
        emitter_width: if emitter_shape == ParticleEmitterShape::Rect {
            sx
        } else {
            0.0
        },
        emitter_height: if emitter_shape == ParticleEmitterShape::Rect {
            sy
        } else {
            0.0
        },
        scale_min: range_low(raw.get("scale"), 1.0),
        scale_max: range_high(raw.get("scale"), 1.0),
        scale_end: if spawn_scale_mid > 0.0 {
            end_scale_mid / spawn_scale_mid
        } else {
            0.0
        },
        color_start_r: start_r,
        color_start_g: start_g,
        color_start_b: start_b,
        color_end_r: end_r,
        color_end_g: end_g,
        color_end_b: end_b,
        alpha_start: first_alpha(raw.get("alpha")),
        alpha_end: last_alpha(raw.get("alpha")),
        rotation_speed_min: range_low(raw.get("rotation"), 0.0) * DEG2RAD,
        rotation_speed_max: range_high(raw.get("rotation"), 0.0) * DEG2RAD,
        blend_mode: spine_blend_mode(
            raw.get("blendMode")
                .and_then(JsonValue::as_text)
                .unwrap_or("normal"),
        ),
        ..ParticleEmitterConfig::default()
    }))
}

fn collect_spine_warnings(raw: &JsonValue) -> Vec<String> {
    let mut warnings = Vec::new();
    let non_zero_range = |key: &str| -> bool {
        match raw.get(key) {
            Some(o) if o.is_object() => {
                let lo = o.get("low").and_then(JsonValue::as_number).unwrap_or(0.0);
                let hi = o.get("high").and_then(JsonValue::as_number).unwrap_or(0.0);
                lo != 0.0 || hi != 0.0
            }
            _ => false,
        }
    };
    if non_zero_range("lifeOffset") {
        warnings.push("Spine lifeOffset is not supported and was ignored".to_string());
    }
    if non_zero_range("x") || non_zero_range("y") {
        warnings.push(
            "Spine emitter x/y position ranges are not supported and were ignored".to_string(),
        );
    }
    warnings
}

// Build a color curve from a tint timeline, but only when it has more than two
// stops (a 2-stop timeline is exactly the linear start→end path, so skip it).
fn tint_keyframes_to_curve(arr: Option<&JsonValue>) -> Option<ParticleCurve> {
    let a = arr.and_then(JsonValue::as_array)?;
    if a.len() <= 2 {
        return None;
    }
    let mut keys: Vec<ColorKeyframe> = Vec::with_capacity(a.len());
    for (i, k) in a.iter().enumerate() {
        let (r, g, b) = hex_to_rgb(
            k.get("color")
                .and_then(JsonValue::as_text)
                .unwrap_or("ffffff"),
        );
        keys.push(ColorKeyframe {
            time: k
                .get("time")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(i as f32 / (a.len() - 1) as f32),
            r,
            g,
            b,
        });
    }
    Some(particle_color_curve_from_keyframes(&keys, CURVE_SAMPLES))
}

fn alpha_keyframes_to_curve(arr: Option<&JsonValue>) -> Option<ParticleCurve> {
    let a = arr.and_then(JsonValue::as_array)?;
    if a.len() <= 2 {
        return None;
    }
    let mut keys: Vec<CurveKeyframe> = Vec::with_capacity(a.len());
    for (i, k) in a.iter().enumerate() {
        keys.push(CurveKeyframe {
            time: k
                .get("time")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(i as f32 / (a.len() - 1) as f32),
            value: k
                .get("alpha")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(1.0),
        });
    }
    Some(particle_curve_from_keyframes(&keys, CURVE_SAMPLES))
}

fn spine_blend_mode(mode: &str) -> Option<ParticleBlendMode> {
    match mode {
        "additive" => Some(ParticleBlendMode::Add),
        "multiply" => Some(ParticleBlendMode::Multiply),
        "screen" => Some(ParticleBlendMode::Screen),
        "normal" => Some(ParticleBlendMode::Normal),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Document construction (load path only)
// ---------------------------------------------------------------------------

fn read_range(obj: Option<&JsonValue>, lo: f32, hi: f32) -> SpineRangeValue {
    SpineRangeValue {
        low: match obj {
            Some(o) if o.is_object() => o
                .get("low")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(lo),
            _ => lo,
        },
        high: match obj {
            Some(o) if o.is_object() => o
                .get("high")
                .and_then(JsonValue::as_number)
                .map(|n| n as f32)
                .unwrap_or(hi),
            _ => hi,
        },
    }
}

fn spawn_shape_from_str(s: &str) -> SpineSpawnShape {
    match s {
        "ellipse" => SpineSpawnShape::Ellipse,
        "line" => SpineSpawnShape::Line,
        _ => SpineSpawnShape::Point,
    }
}

fn raw_to_document(raw: &JsonValue) -> SpineParticleDocument {
    let tint_kfs = match raw.get("tint").and_then(JsonValue::as_array) {
        Some(a) => a
            .iter()
            .map(|k| SpineTintKeyframe {
                time: k
                    .get("time")
                    .and_then(JsonValue::as_number)
                    .map(|n| n as f32)
                    .unwrap_or(0.0),
                color: k
                    .get("color")
                    .and_then(JsonValue::as_text)
                    .unwrap_or("ffffff")
                    .to_string(),
            })
            .collect(),
        None => vec![SpineTintKeyframe {
            time: 0.0,
            color: "ffffff".to_string(),
        }],
    };
    let alpha_kfs = match raw.get("alpha").and_then(JsonValue::as_array) {
        Some(a) => a
            .iter()
            .map(|k| SpineAlphaKeyframe {
                time: k
                    .get("time")
                    .and_then(JsonValue::as_number)
                    .map(|n| n as f32)
                    .unwrap_or(0.0),
                alpha: k
                    .get("alpha")
                    .and_then(JsonValue::as_number)
                    .map(|n| n as f32)
                    .unwrap_or(1.0),
            })
            .collect(),
        None => vec![
            SpineAlphaKeyframe {
                time: 0.0,
                alpha: 1.0,
            },
            SpineAlphaKeyframe {
                time: 1.0,
                alpha: 0.0,
            },
        ],
    };

    SpineParticleDocument {
        name: raw
            .get("name")
            .and_then(JsonValue::as_text)
            .unwrap_or("")
            .to_string(),
        max_particles: raw
            .get("maxParticles")
            .and_then(JsonValue::as_number)
            .map(|n| n as i64 as u32)
            .unwrap_or(500),
        continuous: raw
            .get("continuous")
            .and_then(JsonValue::as_bool)
            .unwrap_or(true),
        duration: raw
            .get("duration")
            .and_then(JsonValue::as_number)
            .map(|n| n as f32)
            .unwrap_or(-1.0),
        emission: read_range(raw.get("emission"), 10.0, 30.0),
        life: read_range(raw.get("life"), 500.0, 1500.0),
        life_offset: read_range(raw.get("lifeOffset"), 0.0, 0.0),
        x: read_range(raw.get("x"), 0.0, 0.0),
        y: read_range(raw.get("y"), 0.0, 0.0),
        spawn_shape: spawn_shape_from_str(
            raw.get("spawnShape")
                .and_then(JsonValue::as_text)
                .unwrap_or("point"),
        ),
        spawn_width: read_range(raw.get("spawnWidth"), 0.0, 0.0),
        spawn_height: read_range(raw.get("spawnHeight"), 0.0, 0.0),
        velocity: read_range(raw.get("velocity"), 50.0, 150.0),
        angle: read_range(raw.get("angle"), 60.0, 120.0),
        rotation: read_range(raw.get("rotation"), 0.0, 0.0),
        wind: read_range(raw.get("wind"), 0.0, 0.0),
        gravity: read_range(raw.get("gravity"), 0.0, 0.0),
        scale: read_range(raw.get("scale"), 1.0, 1.0),
        scale_end: read_range(raw.get("scaleEnd"), 0.0, 0.0),
        tint: tint_kfs,
        alpha: alpha_kfs,
        blend_mode: spine_blend_mode_enum(
            raw.get("blendMode")
                .and_then(JsonValue::as_text)
                .unwrap_or("normal"),
        ),
        premultiplied: raw
            .get("premultiplied")
            .and_then(JsonValue::as_bool)
            .unwrap_or(false),
        images: match raw.get("images").and_then(JsonValue::as_array) {
            Some(a) => a
                .iter()
                .filter_map(|v| v.as_text().map(str::to_string))
                .collect(),
            None => Vec::new(),
        },
    }
}

fn spine_blend_mode_enum(s: &str) -> SpineBlendMode {
    match s {
        "additive" => SpineBlendMode::Additive,
        "multiply" => SpineBlendMode::Multiply,
        "screen" => SpineBlendMode::Screen,
        _ => SpineBlendMode::Normal,
    }
}

fn spine_blend_mode_str(mode: SpineBlendMode) -> &'static str {
    match mode {
        SpineBlendMode::Normal => "normal",
        SpineBlendMode::Additive => "additive",
        SpineBlendMode::Multiply => "multiply",
        SpineBlendMode::Screen => "screen",
    }
}

fn spawn_shape_str(shape: SpineSpawnShape) -> &'static str {
    match shape {
        SpineSpawnShape::Point => "point",
        SpineSpawnShape::Ellipse => "ellipse",
        SpineSpawnShape::Line => "line",
    }
}

// ---------------------------------------------------------------------------
// Config → document → JSON serialisation
// ---------------------------------------------------------------------------

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let byte = |v: f32| -> String {
        let clamped = v.clamp(0.0, 1.0);
        format!("{:02x}", (clamped * 255.0).round() as u32)
    };
    format!("{}{}{}", byte(r), byte(g), byte(b))
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&SpineParticleDocument>,
) -> SpineParticleDocument {
    let angle_mid = (-config.direction_y).atan2(config.direction_x) * RAD2DEG;
    let spread_deg = config.spread * RAD2DEG;

    let spawn_shape = match config.emitter_shape {
        ParticleEmitterShape::Rect | ParticleEmitterShape::Circle => SpineSpawnShape::Ellipse,
        ParticleEmitterShape::Point => SpineSpawnShape::Point,
    };
    let spawn_dim = |dim: f32| -> SpineRangeValue {
        match config.emitter_shape {
            ParticleEmitterShape::Circle => SpineRangeValue {
                low: config.emitter_radius * 2.0,
                high: config.emitter_radius * 2.0,
            },
            ParticleEmitterShape::Rect => SpineRangeValue {
                low: dim,
                high: dim,
            },
            ParticleEmitterShape::Point => SpineRangeValue {
                low: 0.0,
                high: 0.0,
            },
        }
    };

    let tint = match &config.color_curve {
        Some(curve) => particle_color_curve_to_keyframes(curve)
            .into_iter()
            .map(|k| SpineTintKeyframe {
                time: k.time,
                color: rgb_to_hex(k.r, k.g, k.b),
            })
            .collect(),
        None => vec![
            SpineTintKeyframe {
                time: 0.0,
                color: rgb_to_hex(
                    config.color_start_r,
                    config.color_start_g,
                    config.color_start_b,
                ),
            },
            SpineTintKeyframe {
                time: 1.0,
                color: rgb_to_hex(config.color_end_r, config.color_end_g, config.color_end_b),
            },
        ],
    };
    let alpha = match &config.alpha_curve {
        Some(curve) => particle_curve_to_keyframes(curve)
            .into_iter()
            .map(|k| SpineAlphaKeyframe {
                time: k.time,
                alpha: k.value,
            })
            .collect(),
        None => vec![
            SpineAlphaKeyframe {
                time: 0.0,
                alpha: config.alpha_start,
            },
            SpineAlphaKeyframe {
                time: 1.0,
                alpha: config.alpha_end,
            },
        ],
    };

    let blend_mode = config_to_spine_blend_mode(config.blend_mode)
        .or_else(|| existing.map(|e| e.blend_mode))
        .unwrap_or(SpineBlendMode::Normal);

    SpineParticleDocument {
        name: existing.map(|e| e.name.clone()).unwrap_or_default(),
        max_particles: config.max_particles,
        continuous: config.loop_,
        duration: if config.duration > 0.0 && !config.loop_ {
            config.duration * 1000.0
        } else {
            existing.map(|e| e.duration).unwrap_or(-1.0)
        },
        emission: SpineRangeValue {
            low: config.spawn_rate * 0.8,
            high: config.spawn_rate * 1.2,
        },
        life: SpineRangeValue {
            low: config.lifetime_min * 1000.0,
            high: config.lifetime_max * 1000.0,
        },
        life_offset: existing.map(|e| e.life_offset).unwrap_or_default(),
        x: existing.map(|e| e.x).unwrap_or_default(),
        y: existing.map(|e| e.y).unwrap_or_default(),
        spawn_shape,
        spawn_width: spawn_dim(config.emitter_width),
        spawn_height: spawn_dim(config.emitter_height),
        velocity: SpineRangeValue {
            low: config.speed_min,
            high: config.speed_max,
        },
        angle: SpineRangeValue {
            low: angle_mid - spread_deg,
            high: angle_mid + spread_deg,
        },
        rotation: SpineRangeValue {
            low: config.rotation_speed_min * RAD2DEG,
            high: config.rotation_speed_max * RAD2DEG,
        },
        // gravityX is not representable as a Spine wind range.
        wind: SpineRangeValue {
            low: 0.0,
            high: 0.0,
        },
        gravity: SpineRangeValue {
            low: config.gravity_y,
            high: config.gravity_y,
        },
        scale: SpineRangeValue {
            low: config.scale_min,
            high: config.scale_max,
        },
        scale_end: SpineRangeValue {
            low: config.scale_min * config.scale_end,
            high: config.scale_max * config.scale_end,
        },
        tint,
        alpha,
        blend_mode,
        premultiplied: existing.map(|e| e.premultiplied).unwrap_or(false),
        images: existing.map(|e| e.images.clone()).unwrap_or_default(),
    }
}

fn config_to_spine_blend_mode(mode: Option<ParticleBlendMode>) -> Option<SpineBlendMode> {
    match mode {
        Some(ParticleBlendMode::Add) => Some(SpineBlendMode::Additive),
        Some(ParticleBlendMode::Multiply) => Some(SpineBlendMode::Multiply),
        Some(ParticleBlendMode::Screen) => Some(SpineBlendMode::Screen),
        Some(ParticleBlendMode::Normal) => Some(SpineBlendMode::Normal),
        None => None,
    }
}

fn range_json(r: SpineRangeValue) -> String {
    format!(
        "{{\n      \"low\": {},\n      \"high\": {}\n    }}",
        format_json_number(r.low),
        format_json_number(r.high)
    )
}

fn tint_array_json(tint: &[SpineTintKeyframe]) -> String {
    if tint.is_empty() {
        return "[]".to_string();
    }
    let items: Vec<String> = tint
        .iter()
        .map(|k| {
            format!(
                "{{\n        \"time\": {},\n        \"color\": \"{}\"\n      }}",
                format_json_number(k.time),
                escape_json_string(&k.color)
            )
        })
        .collect();
    format!("[\n      {}\n    ]", items.join(",\n      "))
}

fn alpha_array_json(alpha: &[SpineAlphaKeyframe]) -> String {
    if alpha.is_empty() {
        return "[]".to_string();
    }
    let items: Vec<String> = alpha
        .iter()
        .map(|k| {
            format!(
                "{{\n        \"time\": {},\n        \"alpha\": {}\n      }}",
                format_json_number(k.time),
                format_json_number(k.alpha)
            )
        })
        .collect();
    format!("[\n      {}\n    ]", items.join(",\n      "))
}

fn images_array_json(images: &[String]) -> String {
    if images.is_empty() {
        return "[]".to_string();
    }
    let items: Vec<String> = images
        .iter()
        .map(|s| format!("\"{}\"", escape_json_string(s)))
        .collect();
    format!("[\n      {}\n    ]", items.join(",\n      "))
}

fn document_to_json(doc: &SpineParticleDocument) -> String {
    let mut w = JsonObjectWriter::new();
    w.field_text("name", &doc.name);
    w.field_number("maxParticles", doc.max_particles as f32);
    w.field_bool("continuous", doc.continuous);
    w.field_number("duration", doc.duration);
    w.field_raw("emission", &range_json(doc.emission));
    w.field_raw("life", &range_json(doc.life));
    w.field_raw("lifeOffset", &range_json(doc.life_offset));
    w.field_raw("x", &range_json(doc.x));
    w.field_raw("y", &range_json(doc.y));
    w.field_text("spawnShape", spawn_shape_str(doc.spawn_shape));
    w.field_raw("spawnWidth", &range_json(doc.spawn_width));
    w.field_raw("spawnHeight", &range_json(doc.spawn_height));
    w.field_raw("velocity", &range_json(doc.velocity));
    w.field_raw("angle", &range_json(doc.angle));
    w.field_raw("rotation", &range_json(doc.rotation));
    w.field_raw("wind", &range_json(doc.wind));
    w.field_raw("gravity", &range_json(doc.gravity));
    w.field_raw("scale", &range_json(doc.scale));
    w.field_raw("scaleEnd", &range_json(doc.scale_end));
    w.field_raw("tint", &tint_array_json(&doc.tint));
    w.field_raw("alpha", &alpha_array_json(&doc.alpha));
    w.field_text("blendMode", spine_blend_mode_str(doc.blend_mode));
    w.field_bool("premultiplied", doc.premultiplied);
    w.field_raw("images", &images_array_json(&doc.images));
    w.finish()
}

#[cfg(test)]
mod tests {
    use flighthq_particles::{sample_particle_color_curve, sample_particle_curve};

    use super::*;

    const SPARK_JSON: &str = r#"{
  "name": "spark",
  "maxParticles": 300,
  "continuous": true,
  "duration": -1,
  "emission": { "low": 80, "high": 120 },
  "life": { "low": 400, "high": 800 },
  "lifeOffset": { "low": 0, "high": 0 },
  "x": { "low": 0, "high": 0 },
  "y": { "low": 0, "high": 0 },
  "spawnShape": "point",
  "spawnWidth": { "low": 0, "high": 0 },
  "spawnHeight": { "low": 0, "high": 0 },
  "velocity": { "low": 50, "high": 200 },
  "angle": { "low": 60, "high": 120 },
  "rotation": { "low": 0, "high": 360 },
  "wind": { "low": 0, "high": 0 },
  "gravity": { "low": 200, "high": 200 },
  "scale": { "low": 0.5, "high": 1.5 },
  "scaleEnd": { "low": 0, "high": 0 },
  "tint": [ { "time": 0, "color": "ffaa00" }, { "time": 1, "color": "ff0000" } ],
  "alpha": [ { "time": 0, "alpha": 1 }, { "time": 1, "alpha": 0 } ],
  "blendMode": "additive",
  "premultiplied": false,
  "images": ["spark.png"]
}"#;

    fn close(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() <= eps
    }

    // ── blend mode ──

    #[test]
    fn parse_spine_particle_blend_mode() {
        assert_eq!(
            parse_spine_particle(SPARK_JSON).unwrap().blend_mode,
            Some(ParticleBlendMode::Add)
        );
        let normal = SPARK_JSON.replace("\"additive\"", "\"normal\"");
        assert_eq!(
            parse_spine_particle(&normal).unwrap().blend_mode,
            Some(ParticleBlendMode::Normal)
        );
        // Round-trip.
        let config = parse_spine_particle(SPARK_JSON).unwrap();
        let document = parse_spine_particle_document(SPARK_JSON).unwrap().document;
        let config2 =
            parse_spine_particle(&serialize_spine_particle(&config, Some(&document))).unwrap();
        assert_eq!(config2.blend_mode, Some(ParticleBlendMode::Add));
    }

    // ── lightweight ──

    #[test]
    fn parse_spine_particle_minimal() {
        let c = parse_spine_particle(SPARK_JSON).unwrap();
        assert_eq!(c.max_particles, 300);
        assert!(close(c.lifetime_min, 0.4, 1e-4));
        assert!(close(c.lifetime_max, 0.8, 1e-4));
        assert!(close(c.spawn_rate, 100.0, 1e-3));
        assert!(close(c.speed_min, 50.0, 1e-4));
        assert!(close(c.speed_max, 200.0, 1e-4));
        assert!(close(c.direction_x, 0.0, 1e-2));
        assert!(close(c.direction_y, -1.0, 1e-2));
        assert!(close(c.spread, 30.0 * DEG2RAD, 1e-3));
        assert!(close(c.gravity_y, 200.0, 1e-4));
        assert!(close(c.color_start_r, 1.0, 1e-4));
        assert!(close(c.color_start_g, 0xaa as f32 / 255.0, 1e-2));
        assert!(close(c.color_end_r, 1.0, 1e-4));
        assert!(close(c.color_end_g, 0.0, 1e-4));
        assert!(close(c.alpha_start, 1.0, 1e-4));
        assert!(close(c.alpha_end, 0.0, 1e-4));
        assert!(close(c.rotation_speed_min, 0.0, 1e-4));
        assert!(close(c.rotation_speed_max, 360.0 * DEG2RAD, 1e-3));
        assert!(c.loop_);
        assert_eq!(c.duration, 0.0);
    }

    #[test]
    fn parse_spine_particle_finite_duration() {
        let json = SPARK_JSON
            .replace("\"continuous\": true", "\"continuous\": false")
            .replace("\"duration\": -1", "\"duration\": 2000");
        let c = parse_spine_particle(&json).unwrap();
        assert!(!c.loop_);
        assert!(close(c.duration, 2.0, 1e-4));
    }

    // ── malformed input ──

    #[test]
    fn parse_spine_particle_invalid_json_errors() {
        let e = parse_spine_particle("{not valid").unwrap_err();
        assert!(e.contains("Invalid Spine particle JSON"));
        assert!(
            parse_spine_particle("null")
                .unwrap_err()
                .contains("expected a JSON object")
        );
        assert!(
            parse_spine_particle("\"a string\"")
                .unwrap_err()
                .contains("expected a JSON object")
        );
        assert!(
            parse_spine_particle("[1,2,3]")
                .unwrap_err()
                .contains("expected a JSON object")
        );
    }

    #[test]
    fn parse_spine_particle_safe_for_bad_color() {
        let c =
            parse_spine_particle("{\"tint\": [{ \"time\": 0, \"color\": \"zzzzzz\" }]}").unwrap();
        assert!(c.color_start_r.is_finite());
        assert!(c.color_start_g.is_finite());
        assert!(c.color_start_b.is_finite());
    }

    #[test]
    fn parse_spine_particle_empty_object_defaults() {
        let c = parse_spine_particle("{}").unwrap();
        assert!(c.lifetime_min.is_finite());
        assert!(c.spawn_rate.is_finite());
        assert!(c.color_start_r.is_finite());
    }

    // ── multi-stop timelines ──

    #[test]
    fn parse_spine_particle_two_stop_leaves_curves_null() {
        let c = parse_spine_particle(SPARK_JSON).unwrap();
        assert!(c.color_curve.is_none());
        assert!(c.alpha_curve.is_none());
    }

    #[test]
    fn parse_spine_particle_multi_stop_tint_bakes_curve() {
        let json = SPARK_JSON.replace(
            "\"tint\": [ { \"time\": 0, \"color\": \"ffaa00\" }, { \"time\": 1, \"color\": \"ff0000\" } ]",
            "\"tint\": [ { \"time\": 0, \"color\": \"ff0000\" }, { \"time\": 0.5, \"color\": \"00ff00\" }, { \"time\": 1, \"color\": \"0000ff\" } ]",
        );
        let c = parse_spine_particle(&json).unwrap();
        let curve = c.color_curve.expect("color curve baked");
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&curve, 0.5, &mut out, 0);
        assert!(out[1] > 0.8);
        assert!(out[0] < 0.2);
    }

    #[test]
    fn parse_spine_particle_multi_stop_alpha_bakes_curve() {
        let json = SPARK_JSON.replace(
            "\"alpha\": [ { \"time\": 0, \"alpha\": 1 }, { \"time\": 1, \"alpha\": 0 } ]",
            "\"alpha\": [ { \"time\": 0, \"alpha\": 0 }, { \"time\": 0.5, \"alpha\": 1 }, { \"time\": 1, \"alpha\": 0 } ]",
        );
        let c = parse_spine_particle(&json).unwrap();
        let curve = c.alpha_curve.expect("alpha curve baked");
        assert!(sample_particle_curve(&curve, 0.5) > 0.9);
        assert!(sample_particle_curve(&curve, 0.0) < 0.1);
    }

    // ── document ──

    #[test]
    fn parse_spine_particle_document_round_trips() {
        let config = parse_spine_particle(SPARK_JSON).unwrap();
        let parsed = parse_spine_particle_document(SPARK_JSON).unwrap();
        assert_eq!(parsed.config.max_particles, config.max_particles);
        assert!(close(parsed.config.gravity_y, config.gravity_y, 1e-5));
        assert_eq!(parsed.document.name, "spark");
        assert_eq!(parsed.document.blend_mode, SpineBlendMode::Additive);
        assert_eq!(parsed.document.images[0], "spark.png");
    }

    // ── warnings ──

    #[test]
    fn parse_spine_particle_no_warnings_two_keyframe() {
        assert!(
            parse_spine_particle_document(SPARK_JSON)
                .unwrap()
                .warnings
                .is_empty()
        );
    }

    #[test]
    fn parse_spine_particle_multi_stop_no_tint_warning() {
        let json = SPARK_JSON.replace(
            "\"tint\": [ { \"time\": 0, \"color\": \"ffaa00\" }, { \"time\": 1, \"color\": \"ff0000\" } ]",
            "\"tint\": [ { \"time\": 0, \"color\": \"ff0000\" }, { \"time\": 0.5, \"color\": \"00ff00\" }, { \"time\": 1, \"color\": \"0000ff\" } ]",
        );
        let warnings = parse_spine_particle_document(&json).unwrap().warnings;
        assert!(!warnings.iter().any(|w| w.contains("Tint")));
    }

    #[test]
    fn parse_spine_particle_life_offset_warns() {
        let json = SPARK_JSON.replace(
            "\"lifeOffset\": { \"low\": 0, \"high\": 0 }",
            "\"lifeOffset\": { \"low\": 100, \"high\": 200 }",
        );
        let warnings = parse_spine_particle_document(&json).unwrap().warnings;
        assert!(warnings.iter().any(|w| w.contains("lifeOffset")));
    }

    // ── serialize ──

    #[test]
    fn serialize_spine_particle_round_trips_fields() {
        let config = parse_spine_particle(SPARK_JSON).unwrap();
        let document = parse_spine_particle_document(SPARK_JSON).unwrap().document;
        let config2 =
            parse_spine_particle(&serialize_spine_particle(&config, Some(&document))).unwrap();
        assert_eq!(config2.max_particles, config.max_particles);
        assert!(close(config2.lifetime_min, config.lifetime_min, 1e-3));
        assert!(close(config2.speed_max, config.speed_max, 1e-2));
        assert!(close(config2.gravity_y, config.gravity_y, 1e-2));
    }

    #[test]
    fn serialize_spine_particle_preserves_blend_mode() {
        let config = parse_spine_particle(SPARK_JSON).unwrap();
        let document = parse_spine_particle_document(SPARK_JSON).unwrap().document;
        let xml = serialize_spine_particle(&config, Some(&document));
        assert_eq!(
            parse_spine_particle_document(&xml)
                .unwrap()
                .document
                .blend_mode,
            SpineBlendMode::Additive
        );
    }

    #[test]
    fn serialize_spine_particle_produces_valid_json() {
        let config = parse_spine_particle(SPARK_JSON).unwrap();
        let json = serialize_spine_particle(&config, None);
        assert!(parse_json(&json).is_ok());
    }

    #[test]
    fn serialize_spine_particle_bakes_curves() {
        let color_curve = particle_color_curve_from_keyframes(
            &[
                ColorKeyframe {
                    time: 0.0,
                    r: 1.0,
                    g: 0.0,
                    b: 0.0,
                },
                ColorKeyframe {
                    time: 0.5,
                    r: 0.0,
                    g: 1.0,
                    b: 0.0,
                },
                ColorKeyframe {
                    time: 1.0,
                    r: 0.0,
                    g: 0.0,
                    b: 1.0,
                },
            ],
            CURVE_SAMPLES,
        );
        let alpha_curve = particle_curve_from_keyframes(
            &[
                CurveKeyframe {
                    time: 0.0,
                    value: 0.0,
                },
                CurveKeyframe {
                    time: 0.5,
                    value: 1.0,
                },
                CurveKeyframe {
                    time: 1.0,
                    value: 0.0,
                },
            ],
            CURVE_SAMPLES,
        );
        let config = create_particle_emitter_config(Some(ParticleEmitterConfig {
            color_curve: Some(color_curve),
            alpha_curve: Some(alpha_curve),
            ..ParticleEmitterConfig::default()
        }));
        let c2 = parse_spine_particle(&serialize_spine_particle(&config, None)).unwrap();
        let cc = c2.color_curve.expect("color curve");
        let ac = c2.alpha_curve.expect("alpha curve");
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&cc, 0.5, &mut out, 0);
        assert!(out[1] > 0.8);
        assert!(sample_particle_curve(&ac, 0.5) > 0.9);
        assert!(sample_particle_curve(&ac, 0.0) < 0.1);
    }
}
