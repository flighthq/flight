//! Pixi.js / pixi-particle-emitter JSON parsing (TS `pixiParse.ts`, parse-only).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{
    EmitterShape, ParticleBlendMode, ParticleEmitterConfig, ParticleEmitterConfigOptions,
    create_particle_emitter_config,
};
use serde_json::Value;

/// The parse result, config plus diagnostics (TS `PixiParseResult`).
pub struct PixiParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
}

fn collect_pixi_diagnostics(raw: &Value) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let mut report = |severity: ImportDiagnosticSeverity, kind: &str| {
        report_import_diagnostic(
            Some(&mut diagnostics),
            severity,
            kind,
            "collectPixiDiagnostics",
            None,
        );
    };
    if raw.get("spawnBurst").is_some() {
        report(
            ImportDiagnosticSeverity::Recover,
            "pixi.spawn-burst-mapped-to-point",
        );
    }
    if raw.get("spawnPolygon").is_some() {
        report(
            ImportDiagnosticSeverity::Recover,
            "pixi.spawn-polygon-mapped-to-point",
        );
    }
    if let Some(acceleration) = raw.get("acceleration")
        && (rn(acceleration.get("x"), 0.0) != 0.0 || rn(acceleration.get("y"), 0.0) != 0.0)
    {
        report(
            ImportDiagnosticSeverity::Skip,
            "pixi.acceleration-unsupported",
        );
    }
    if raw.get("behaviors").is_some() {
        report(ImportDiagnosticSeverity::Skip, "pixi.behaviors-partial");
    }
    return diagnostics;
}

fn field<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    return value.and_then(|value| value.get(key));
}

fn parse_pixi_json(json: &str) -> Value {
    let raw: Value = match serde_json::from_str(json) {
        Ok(raw) => raw,
        Err(error) => {
            panic!("Invalid Pixi particle JSON: {}", error);
        }
    };
    if !raw.is_object() {
        let description = match &raw {
            Value::Null => String::from("null"),
            Value::Array(_) => String::from("array"),
            Value::Number(_) => String::from("number"),
            Value::String(_) => String::from("string"),
            Value::Bool(_) => String::from("boolean"),
            Value::Object(_) => String::from("object"),
        };
        panic!(
            "Invalid Pixi particle document: expected a JSON object, got {}",
            description
        );
    }
    return raw;
}

/// Parses a Pixi config string directly to a config (TS `parsePixiParticle`).
pub fn parse_pixi_particle(json: &str) -> ParticleEmitterConfig {
    return raw_to_config(&parse_pixi_json(json));
}

/// Parses a Pixi config string and reports features that could not be represented (TS
/// `parsePixiParticleDocument`).
pub fn parse_pixi_particle_document(json: &str) -> PixiParseResult {
    let raw = parse_pixi_json(json);
    return PixiParseResult {
        config: raw_to_config(&raw),
        diagnostics: collect_pixi_diagnostics(&raw),
    };
}

fn raw_to_config(raw: &Value) -> ParticleEmitterConfig {
    let max_particles = (rn(raw.get("maxParticles"), 1000.0) as i32) as f32;
    let frequency = rn(raw.get("frequency"), 0.1);
    let spawn_rate = if frequency > 0.0 {
        1.0 / frequency
    } else {
        10.0
    };
    let lifetime = raw.get("lifetime");
    let lifetime_min = rn(field(lifetime, "min"), 0.5);
    let lifetime_max = rn(field(lifetime, "max"), 1.0);
    let (speed_start, speed_end) = read_start_end(raw.get("speed"), 100.0, 50.0);
    let speed_min = speed_start.min(speed_end);
    let speed_max = speed_start.max(speed_end);
    let (scale_start, scale_end) = read_start_end(raw.get("scale"), 1.0, 0.5);
    let scale_min = scale_start.min(scale_end);
    let scale_max = scale_start.max(scale_end);
    let scale_end_ratio = if scale_max > 0.0 {
        scale_start.min(scale_end) / scale_max
    } else {
        1.0
    };
    let (alpha_start, alpha_end) = read_start_end(raw.get("alpha"), 1.0, 0.0);
    let color = raw.get("color");
    let (start_r, start_g, start_b) = read_color(field(color, "start"), "ffffff");
    let (end_r, end_g, end_b) = read_color(field(color, "end"), "ffffff");
    let angle = raw.get("angle");
    let angle_min = rn(field(angle, "min"), 0.0);
    let angle_max = rn(field(angle, "max"), 360.0);
    let angle_mid = (angle_min + angle_max) * 0.5 * DEG_TO_RAD;
    let spread = (angle_max - angle_min) * 0.5 * DEG_TO_RAD;
    let mut emitter_shape = EmitterShape::Point;
    let mut emitter_radius = 0.0;
    let mut emitter_width = 0.0;
    let mut emitter_height = 0.0;
    if let Some(spawn_circle) = raw.get("spawnCircle") {
        emitter_shape = EmitterShape::Circle;
        emitter_radius = rn(spawn_circle.get("r"), 0.0);
    } else if let Some(spawn_rect) = raw.get("spawnRect") {
        emitter_shape = EmitterShape::Rect;
        emitter_width = rn(spawn_rect.get("w"), 0.0);
        emitter_height = rn(spawn_rect.get("h"), 0.0);
    }
    let blend_mode_string = rs(raw.get("blendMode"), "normal").to_lowercase();
    let blend_mode = match blend_mode_string.as_str() {
        "add" | "additive" => Some(ParticleBlendMode::Add),
        "multiply" => Some(ParticleBlendMode::Multiply),
        "screen" => Some(ParticleBlendMode::Screen),
        "normal" | "src_alpha" => Some(ParticleBlendMode::Normal),
        _ => None,
    };
    let rotation_speed = rn(raw.get("rotationSpeed"), 0.0) * DEG_TO_RAD;
    return create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
        alpha_end: Some(alpha_end),
        alpha_start: Some(alpha_start),
        blend_mode: Some(blend_mode),
        color_end_b: Some(end_b),
        color_end_g: Some(end_g),
        color_end_r: Some(end_r),
        color_start_b: Some(start_b),
        color_start_g: Some(start_g),
        color_start_r: Some(start_r),
        direction_x: Some(angle_mid.cos()),
        direction_y: Some(angle_mid.sin()),
        emitter_height: Some(emitter_height),
        emitter_radius: Some(emitter_radius),
        emitter_shape: Some(emitter_shape),
        emitter_width: Some(emitter_width),
        lifetime_max: Some(lifetime_max),
        lifetime_min: Some(lifetime_min),
        max_particles: Some(max_particles),
        rotation_speed_max: Some(rotation_speed),
        rotation_speed_min: Some(rotation_speed),
        scale_end: Some(scale_end_ratio),
        scale_max: Some(scale_max),
        scale_min: Some(scale_min),
        spawn_rate: Some(spawn_rate),
        speed_max: Some(speed_max),
        speed_min: Some(speed_min),
        spread: Some(spread),
        ..Default::default()
    }));
}

fn read_color(value: Option<&Value>, default: &str) -> (f32, f32, f32) {
    let hex = match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Object(object)) => match object.get("value") {
            Some(Value::String(text)) => text.clone(),
            _ => String::from(default),
        },
        _ => String::from(default),
    };
    let trimmed = hex.strip_prefix('#').unwrap_or(&hex);
    let mut padded = String::from(trimmed);
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

fn read_start_end(value: Option<&Value>, default_start: f32, default_end: f32) -> (f32, f32) {
    let Some(Value::Object(object)) = value else {
        return (default_start, default_end);
    };
    let start = match object.get("start") {
        Some(Value::Number(number)) => number.as_f64().map(|value| value as f32),
        Some(Value::Object(inner)) => match inner.get("value") {
            Some(Value::Number(number)) => number.as_f64().map(|value| value as f32),
            _ => None,
        },
        _ => None,
    }
    .unwrap_or(default_start);
    let end = match object.get("end") {
        Some(Value::Number(number)) => number.as_f64().map(|value| value as f32),
        Some(Value::Object(inner)) => match inner.get("value") {
            Some(Value::Number(number)) => number.as_f64().map(|value| value as f32),
            _ => None,
        },
        _ => None,
    }
    .unwrap_or(default_end);
    return (start, end);
}

fn rn(value: Option<&Value>, default: f32) -> f32 {
    return match value {
        Some(Value::Number(number)) => match number.as_f64() {
            Some(parsed) if parsed.is_finite() => parsed as f32,
            _ => default,
        },
        _ => default,
    };
}

fn rs(value: Option<&Value>, default: &str) -> String {
    return match value {
        Some(Value::String(text)) => text.clone(),
        _ => String::from(default),
    };
}
