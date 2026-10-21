//! Spine 4.x particle effect JSON parsing (TS `spineParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{
    ColorKeyframe, CurveKeyframe, EmitterShape, ParticleEmitterConfig,
    create_particle_emitter_config, particle_color_curve_from_keyframes,
    particle_curve_from_keyframes,
};
use serde_json::Value;

/// A low/high range (TS `SpineRangeValue`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpineRangeValue {
    pub high: f32,
    pub low: f32,
}

/// An alpha keyframe (TS `SpineAlphaKeyframe`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpineAlphaKeyframe {
    pub alpha: f32,
    pub time: f32,
}

/// A tint keyframe (TS `SpineTintKeyframe`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpineTintKeyframe {
    pub color: String,
    pub time: f32,
}

/// The Spine blend mode (TS `SpineBlendMode`, a closed string union).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SpineBlendMode {
    #[default]
    Normal,
    Additive,
    Multiply,
    Screen,
}

/// The Spine spawn shape (TS `spawnShape: 'point' | 'ellipse' | 'line'`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SpineSpawnShape {
    #[default]
    Point,
    Ellipse,
    Line,
}

/// Full Spine particle effect document (TS `SpineParticleDocument`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpineParticleDocument {
    pub alpha: Vec<SpineAlphaKeyframe>,
    pub angle: SpineRangeValue,
    pub blend_mode: SpineBlendMode,
    pub continuous: bool,
    pub duration: f32,
    pub emission: SpineRangeValue,
    pub gravity: SpineRangeValue,
    pub images: Vec<String>,
    pub life: SpineRangeValue,
    pub life_offset: SpineRangeValue,
    pub max_particles: f32,
    pub name: String,
    pub premultiplied: bool,
    pub rotation: SpineRangeValue,
    pub scale: SpineRangeValue,
    pub scale_end: SpineRangeValue,
    pub spawn_height: SpineRangeValue,
    pub spawn_shape: SpineSpawnShape,
    pub spawn_width: SpineRangeValue,
    pub tint: Vec<SpineTintKeyframe>,
    pub velocity: SpineRangeValue,
    pub wind: SpineRangeValue,
    pub x: SpineRangeValue,
    pub y: SpineRangeValue,
}

/// Parse result carrying the full document (TS `SpineParseResult`).
pub struct SpineParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub document: SpineParticleDocument,
}

fn alpha_keyframes_to_curve(array: Option<&Value>) -> Option<Vec<f32>> {
    let Some(Value::Array(values)) = array else {
        return None;
    };
    if values.len() <= 2 {
        return None;
    }
    let mut keys: Vec<CurveKeyframe> = Vec::new();
    for (index, value) in values.iter().enumerate() {
        require_spine_record(value, &format!("alpha[{}]", index));
        let default_time = index as f32 / (values.len() - 1) as f32;
        keys.push(CurveKeyframe {
            time: number_field(value, "time", default_time),
            value: number_field(value, "alpha", 1.0),
        });
    }
    return Some(particle_curve_from_keyframes(&keys, 33));
}

fn collect_spine_diagnostics(raw: &Value) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let mut report = |severity: ImportDiagnosticSeverity, kind: &str| {
        report_import_diagnostic(
            Some(&mut diagnostics),
            severity,
            kind,
            "collectSpineDiagnostics",
            None,
        );
    };
    let non_zero_range = |key: &str| -> bool {
        let Some(range) = raw.get(key).filter(|value| value.is_object()) else {
            return false;
        };
        return match (range.get("low"), range.get("high")) {
            (Some(Value::Number(low)), _) if low.as_f64().unwrap_or(0.0) as f32 != 0.0 => true,
            (_, Some(Value::Number(high))) if high.as_f64().unwrap_or(0.0) as f32 != 0.0 => true,
            _ => false,
        };
    };
    if non_zero_range("lifeOffset") {
        report(
            ImportDiagnosticSeverity::Skip,
            "spine.life-offset-unsupported",
        );
    }
    if non_zero_range("x") || non_zero_range("y") {
        report(
            ImportDiagnosticSeverity::Skip,
            "spine.position-range-unsupported",
        );
    }
    if raw.get("premultiplied") == Some(&Value::Bool(true)) {
        report(
            ImportDiagnosticSeverity::Skip,
            "spine.premultiplied-informational",
        );
    }
    return diagnostics;
}

fn first_alpha(array: Option<&Value>) -> f32 {
    let Some(Value::Array(values)) = array else {
        return 1.0;
    };
    let Some(first) = values.first() else {
        return 1.0;
    };
    require_spine_record(first, "alpha[0]");
    return number_field(first, "alpha", 1.0);
}

fn first_tint_color(array: Option<&Value>) -> (f32, f32, f32) {
    let Some(Value::Array(values)) = array else {
        return (1.0, 1.0, 1.0);
    };
    let Some(first) = values.first() else {
        return (1.0, 1.0, 1.0);
    };
    require_spine_record(first, "tint[0]");
    return hex_to_rgb(&string_field(first, "color", "ffffff"));
}

fn hex_to_rgb(hex: &str) -> (f32, f32, f32) {
    let trimmed = hex.replace('#', "");
    let mut padded = trimmed;
    while padded.len() < 6 {
        padded.push('f');
    }
    let channel = |index: usize| -> f32 {
        return match u8::from_str_radix(&padded[index..index + 2], 16) {
            Ok(value) => value as f32 / 255.0,
            Err(_) => 1.0,
        };
    };
    return (channel(0), channel(2), channel(4));
}

fn invalid_spine_entry(path: &str, expected: &str) -> ! {
    panic!(
        "Invalid Spine particle document: {} must be {}",
        path, expected
    );
}

fn is_unknown_record(value: &Value) -> bool {
    return value.is_object();
}

fn last_alpha(array: Option<&Value>) -> f32 {
    let Some(Value::Array(values)) = array else {
        return 0.0;
    };
    let Some(last) = values.last() else {
        return 0.0;
    };
    require_spine_record(last, &format!("alpha[{}]", values.len() - 1));
    return number_field(last, "alpha", 0.0);
}

fn last_tint_color(array: Option<&Value>) -> (f32, f32, f32) {
    let Some(Value::Array(values)) = array else {
        return (1.0, 1.0, 1.0);
    };
    let Some(last) = values.last() else {
        return (1.0, 1.0, 1.0);
    };
    require_spine_record(last, &format!("tint[{}]", values.len() - 1));
    return hex_to_rgb(&string_field(last, "color", "ffffff"));
}

fn number_field(value: &Value, key: &str, default: f32) -> f32 {
    return match value.get(key) {
        Some(Value::Number(number)) => number
            .as_f64()
            .filter(|parsed| parsed.is_finite())
            .map(|parsed| parsed as f32)
            .unwrap_or(default),
        _ => default,
    };
}

fn parse_spine_json(json: &str) -> Value {
    let raw: Value = match serde_json::from_str(json) {
        Ok(raw) => raw,
        Err(error) => panic!("Invalid Spine particle JSON: {}", error),
    };
    if !is_unknown_record(&raw) {
        let description = match &raw {
            Value::Null => String::from("null"),
            Value::Array(_) => String::from("array"),
            Value::Number(_) => String::from("number"),
            Value::String(_) => String::from("string"),
            Value::Bool(_) => String::from("boolean"),
            Value::Object(_) => String::from("object"),
        };
        panic!(
            "Invalid Spine particle document: expected a JSON object, got {}",
            description
        );
    }
    validate_spine_nested_entries(&raw);
    return raw;
}

/// Parses a Spine effect JSON string directly to a config (TS `parseSpineParticle`).
pub fn parse_spine_particle(json: &str) -> ParticleEmitterConfig {
    return raw_to_config(&parse_spine_json(json));
}

/// Parses a Spine effect JSON string and preserves the document (TS
/// `parseSpineParticleDocument`).
pub fn parse_spine_particle_document(json: &str) -> SpineParseResult {
    let raw = parse_spine_json(json);
    return SpineParseResult {
        config: raw_to_config(&raw),
        diagnostics: collect_spine_diagnostics(&raw),
        document: raw_to_document(&raw),
    };
}

fn range_high(value: Option<&Value>, default: f32) -> f32 {
    let Some(range) = value.filter(|value| value.is_object()) else {
        return default;
    };
    return number_field(range, "high", default);
}

fn range_low(value: Option<&Value>, default: f32) -> f32 {
    let Some(range) = value.filter(|value| value.is_object()) else {
        return default;
    };
    return number_field(range, "low", default);
}

// flight-lint: allow(f64) JSON numbers arrive as f64 from serde_json; the declared particle domain is f32
fn range_mid(value: Option<&Value>, default: f32) -> f32 {
    let Some(range) = value.filter(|value| value.is_object()) else {
        return default;
    };
    let low = match range.get("low") {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(default as f64) as f32,
        _ => default,
    };
    let high = match range.get("high") {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(default as f64) as f32,
        _ => default,
    };
    return (low + high) * 0.5;
}

fn raw_to_config(raw: &Value) -> ParticleEmitterConfig {
    let life_low = range_low(raw.get("life"), 500.0) / 1000.0;
    let life_high = range_high(raw.get("life"), 1500.0) / 1000.0;
    let angle_low = range_low(raw.get("angle"), 60.0);
    let angle_high = range_high(raw.get("angle"), 120.0);
    let angle_mid = (angle_low + angle_high) * 0.5 * DEG_TO_RAD;
    let spread = (angle_high - angle_low) * 0.5 * DEG_TO_RAD;
    let spawn_shape = string_field(raw, "spawnShape", "point");
    let spawn_width = range_mid(raw.get("spawnWidth"), 0.0);
    let spawn_height = range_mid(raw.get("spawnHeight"), 0.0);
    let emitter_shape = if spawn_shape == "ellipse" {
        if spawn_width == spawn_height {
            EmitterShape::Circle
        } else {
            EmitterShape::Rect
        }
    } else {
        EmitterShape::Point
    };
    let spawn_scale_mid = range_mid(raw.get("scale"), 1.0);
    let end_scale_mid = range_mid(raw.get("scaleEnd"), 0.0);
    let start_tint = first_tint_color(raw.get("tint"));
    let end_tint = last_tint_color(raw.get("tint"));
    let color_curve = tint_keyframes_to_curve(raw.get("tint"));
    let alpha_curve = alpha_keyframes_to_curve(raw.get("alpha"));
    let continuous = match raw.get("continuous") {
        Some(Value::Bool(value)) => *value,
        _ => true,
    };
    let duration_ms = number_field(raw, "duration", -1.0);
    let defaults = create_particle_emitter_config(None);
    return create_particle_emitter_config(Some(&ParticleEmitterConfig {
        alpha_curve,
        alpha_end: last_alpha(raw.get("alpha")),
        alpha_start: first_alpha(raw.get("alpha")),
        blend_mode: spine_blend_mode(&string_field(raw, "blendMode", "normal")),
        color_curve,
        color_end_b: end_tint.2,
        color_end_g: end_tint.1,
        color_end_r: end_tint.0,
        color_start_b: start_tint.2,
        color_start_g: start_tint.1,
        color_start_r: start_tint.0,
        direction_x: angle_mid.cos(),
        direction_y: -angle_mid.sin(),
        duration: if !continuous && duration_ms > 0.0 {
            duration_ms / 1000.0
        } else {
            0.0
        },
        emitter_height: if emitter_shape == EmitterShape::Rect {
            spawn_height
        } else {
            0.0
        },
        emitter_radius: if emitter_shape == EmitterShape::Circle {
            spawn_width * 0.5
        } else {
            0.0
        },
        emitter_shape,
        emitter_width: if emitter_shape == EmitterShape::Rect {
            spawn_width
        } else {
            0.0
        },
        gravity_x: range_mid(raw.get("wind"), 0.0),
        gravity_y: range_mid(raw.get("gravity"), 0.0),
        lifetime_max: life_high,
        lifetime_min: life_low,
        looping: continuous,
        max_particles: match raw.get("maxParticles") {
            Some(Value::Number(number)) => (number.as_f64().unwrap_or(500.0) as i32) as f32,
            _ => 500.0,
        },
        rotation_speed_max: range_high(raw.get("rotation"), 0.0) * DEG_TO_RAD,
        rotation_speed_min: range_low(raw.get("rotation"), 0.0) * DEG_TO_RAD,
        scale_end: if spawn_scale_mid > 0.0 {
            end_scale_mid / spawn_scale_mid
        } else {
            0.0
        },
        scale_max: range_high(raw.get("scale"), 1.0),
        scale_min: range_low(raw.get("scale"), 1.0),
        spawn_rate: range_mid(raw.get("emission"), 20.0),
        speed_max: range_high(raw.get("velocity"), 150.0),
        speed_min: range_low(raw.get("velocity"), 50.0),
        spread,
        ..defaults
    }));
}

fn raw_to_document(raw: &Value) -> SpineParticleDocument {
    let range_value = |key: &str, low: f32, high: f32| -> SpineRangeValue {
        return SpineRangeValue {
            high: range_high(raw.get(key), high),
            low: range_low(raw.get(key), low),
        };
    };
    let tint_keyframes = match raw.get("tint") {
        Some(Value::Array(values)) => values
            .iter()
            .enumerate()
            .map(|(index, value)| {
                require_spine_record(value, &format!("tint[{}]", index));
                return SpineTintKeyframe {
                    color: string_field(value, "color", "ffffff"),
                    time: number_field(value, "time", 0.0),
                };
            })
            .collect(),
        _ => vec![SpineTintKeyframe {
            color: String::from("ffffff"),
            time: 0.0,
        }],
    };
    let alpha_keyframes = match raw.get("alpha") {
        Some(Value::Array(values)) => values
            .iter()
            .enumerate()
            .map(|(index, value)| {
                require_spine_record(value, &format!("alpha[{}]", index));
                return SpineAlphaKeyframe {
                    alpha: number_field(value, "alpha", 1.0),
                    time: number_field(value, "time", 0.0),
                };
            })
            .collect(),
        _ => vec![
            SpineAlphaKeyframe {
                alpha: 1.0,
                time: 0.0,
            },
            SpineAlphaKeyframe {
                alpha: 0.0,
                time: 1.0,
            },
        ],
    };
    return SpineParticleDocument {
        alpha: alpha_keyframes,
        angle: range_value("angle", 60.0, 120.0),
        blend_mode: spine_document_blend_mode(&string_field(raw, "blendMode", "normal")),
        continuous: match raw.get("continuous") {
            Some(Value::Bool(value)) => *value,
            _ => true,
        },
        duration: number_field(raw, "duration", -1.0),
        emission: range_value("emission", 10.0, 30.0),
        gravity: range_value("gravity", 0.0, 0.0),
        images: read_spine_images(raw.get("images")),
        life: range_value("life", 500.0, 1500.0),
        life_offset: range_value("lifeOffset", 0.0, 0.0),
        max_particles: match raw.get("maxParticles") {
            Some(Value::Number(number)) => (number.as_f64().unwrap_or(500.0) as i32) as f32,
            _ => 500.0,
        },
        name: string_field(raw, "name", ""),
        premultiplied: match raw.get("premultiplied") {
            Some(Value::Bool(value)) => *value,
            _ => false,
        },
        rotation: range_value("rotation", 0.0, 0.0),
        scale: range_value("scale", 1.0, 1.0),
        scale_end: range_value("scaleEnd", 0.0, 0.0),
        spawn_height: range_value("spawnHeight", 0.0, 0.0),
        spawn_shape: spine_spawn_shape(&string_field(raw, "spawnShape", "point")),
        spawn_width: range_value("spawnWidth", 0.0, 0.0),
        tint: tint_keyframes,
        velocity: range_value("velocity", 50.0, 150.0),
        wind: range_value("wind", 0.0, 0.0),
        x: range_value("x", 0.0, 0.0),
        y: range_value("y", 0.0, 0.0),
    };
}

fn read_spine_images(value: Option<&Value>) -> Vec<String> {
    let Some(Value::Array(values)) = value else {
        return Vec::new();
    };
    let mut images: Vec<String> = Vec::new();
    for (index, image) in values.iter().enumerate() {
        let Value::String(text) = image else {
            invalid_spine_entry(&format!("images[{}]", index), "a string");
        };
        images.push(text.clone());
    }
    return images;
}

fn require_spine_record(value: &Value, path: &str) {
    if !is_unknown_record(value) {
        invalid_spine_entry(path, "a JSON object");
    }
}

fn spine_blend_mode(mode: &str) -> Option<String> {
    return match mode {
        "additive" => Some(String::from("add")),
        "multiply" => Some(String::from("multiply")),
        "screen" => Some(String::from("screen")),
        "normal" => Some(String::from("normal")),
        _ => None,
    };
}

fn spine_document_blend_mode(mode: &str) -> SpineBlendMode {
    return match mode {
        "additive" => SpineBlendMode::Additive,
        "multiply" => SpineBlendMode::Multiply,
        "screen" => SpineBlendMode::Screen,
        _ => SpineBlendMode::Normal,
    };
}

fn spine_spawn_shape(value: &str) -> SpineSpawnShape {
    return match value {
        "ellipse" => SpineSpawnShape::Ellipse,
        "line" => SpineSpawnShape::Line,
        _ => SpineSpawnShape::Point,
    };
}

fn string_field(value: &Value, key: &str, default: &str) -> String {
    return match value.get(key) {
        Some(Value::String(text)) => text.clone(),
        _ => String::from(default),
    };
}

fn tint_keyframes_to_curve(array: Option<&Value>) -> Option<Vec<f32>> {
    let Some(Value::Array(values)) = array else {
        return None;
    };
    if values.len() <= 2 {
        return None;
    }
    let mut keys: Vec<ColorKeyframe> = Vec::new();
    for (index, value) in values.iter().enumerate() {
        require_spine_record(value, &format!("tint[{}]", index));
        let default_time = index as f32 / (values.len() - 1) as f32;
        let (r, g, b) = hex_to_rgb(&string_field(value, "color", "ffffff"));
        keys.push(ColorKeyframe {
            b,
            g,
            r,
            time: number_field(value, "time", default_time),
        });
    }
    return Some(particle_color_curve_from_keyframes(&keys, 33));
}

fn validate_spine_nested_entries(raw: &Value) {
    validate_spine_record_entries(raw.get("tint"), "tint");
    validate_spine_record_entries(raw.get("alpha"), "alpha");
    let _images = read_spine_images(raw.get("images"));
}

fn validate_spine_record_entries(value: Option<&Value>, path: &str) {
    let Some(Value::Array(values)) = value else {
        return;
    };
    for (index, value) in values.iter().enumerate() {
        require_spine_record(value, &format!("{}[{}]", path, index));
    }
}
