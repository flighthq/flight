//! Spine particle effect JSON serialization (TS `spineSerialize.ts`).

use flight_math::RAD_TO_DEG;
use flight_particles::{
    EmitterShape, ParticleBlendMode, ParticleEmitterConfig, particle_color_curve_to_keyframes,
    particle_curve_to_keyframes,
};
use serde_json::{Map, Value, json};

use crate::spine_parse::{
    SpineAlphaKeyframe, SpineBlendMode, SpineParticleDocument, SpineRangeValue, SpineSpawnShape,
    SpineTintKeyframe,
};
use crate::types::ParticleSerializeResult;

fn blend_mode_string(mode: SpineBlendMode) -> &'static str {
    return match mode {
        SpineBlendMode::Additive => "additive",
        SpineBlendMode::Multiply => "multiply",
        SpineBlendMode::Screen => "screen",
        SpineBlendMode::Normal => "normal",
    };
}

fn collect_spine_serialize_warnings(config: &ParticleEmitterConfig) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    if config.burst_count > 0.0 {
        warnings.push(String::from(
            "Emission bursts are not supported by the Spine particle format and were ignored",
        ));
    }
    if config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorEndVariance is not supported by the Spine format and was ignored",
        ));
    }
    if config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorStartVariance is not supported by the Spine format and was ignored",
        ));
    }
    if config.velocity_inheritance != 0.0 {
        warnings.push(String::from(
            "velocityInheritance is not supported by the Spine format and was ignored",
        ));
    }
    return warnings;
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&SpineParticleDocument>,
) -> SpineParticleDocument {
    let angle_mid = (-config.direction_y).atan2(config.direction_x) * RAD_TO_DEG;
    let spread_deg = config.spread * RAD_TO_DEG;
    let spawn_shape = match config.emitter_shape {
        EmitterShape::Rect | EmitterShape::Circle => SpineSpawnShape::Ellipse,
        _ => SpineSpawnShape::Point,
    };
    let (spawn_width, spawn_height) = match config.emitter_shape {
        EmitterShape::Circle => {
            let diameter = config.emitter_radius * 2.0;
            (diameter, diameter)
        }
        EmitterShape::Rect => (config.emitter_width, config.emitter_height),
        _ => (0.0, 0.0),
    };
    let tint = match &config.color_curve {
        Some(curve) => {
            let mut color_kf = Vec::new();
            particle_color_curve_to_keyframes(&mut color_kf, curve);
            color_kf
                .into_iter()
                .map(|keyframe| SpineTintKeyframe {
                    color: rgb_to_hex(keyframe.r, keyframe.g, keyframe.b),
                    time: keyframe.time,
                })
                .collect()
        }
        None => vec![
            SpineTintKeyframe {
                color: rgb_to_hex(
                    config.color_start_r,
                    config.color_start_g,
                    config.color_start_b,
                ),
                time: 0.0,
            },
            SpineTintKeyframe {
                color: rgb_to_hex(config.color_end_r, config.color_end_g, config.color_end_b),
                time: 1.0,
            },
        ],
    };
    let alpha = match &config.alpha_curve {
        Some(curve) => {
            let mut alpha_kf = Vec::new();
            particle_curve_to_keyframes(&mut alpha_kf, curve);
            alpha_kf
                .into_iter()
                .map(|keyframe| SpineAlphaKeyframe {
                    alpha: keyframe.value,
                    time: keyframe.time,
                })
                .collect()
        }
        None => vec![
            SpineAlphaKeyframe {
                alpha: config.alpha_start,
                time: 0.0,
            },
            SpineAlphaKeyframe {
                alpha: config.alpha_end,
                time: 1.0,
            },
        ],
    };
    let blend_mode = match config.blend_mode.map(spine_blend_mode) {
        Some(mode) => mode,
        None => existing
            .map(|document| document.blend_mode)
            .unwrap_or(SpineBlendMode::Normal),
    };
    return SpineParticleDocument {
        alpha,
        angle: SpineRangeValue {
            high: angle_mid + spread_deg,
            low: angle_mid - spread_deg,
        },
        blend_mode,
        continuous: config.looping,
        duration: if config.duration > 0.0 && !config.looping {
            config.duration * 1000.0
        } else {
            existing.map(|document| document.duration).unwrap_or(-1.0)
        },
        emission: SpineRangeValue {
            high: config.spawn_rate * 1.2,
            low: config.spawn_rate * 0.8,
        },
        gravity: SpineRangeValue {
            high: config.gravity_y,
            low: config.gravity_y,
        },
        images: existing
            .map(|document| document.images.clone())
            .unwrap_or_default(),
        life: SpineRangeValue {
            high: config.lifetime_max * 1000.0,
            low: config.lifetime_min * 1000.0,
        },
        life_offset: existing
            .map(|document| document.life_offset)
            .unwrap_or_default(),
        max_particles: config.max_particles,
        name: existing
            .map(|document| document.name.clone())
            .unwrap_or_default(),
        premultiplied: existing
            .map(|document| document.premultiplied)
            .unwrap_or(false),
        rotation: SpineRangeValue {
            high: config.rotation_speed_max * RAD_TO_DEG,
            low: config.rotation_speed_min * RAD_TO_DEG,
        },
        scale: SpineRangeValue {
            high: config.scale_max,
            low: config.scale_min,
        },
        scale_end: SpineRangeValue {
            high: config.scale_max * config.scale_end,
            low: config.scale_min * config.scale_end,
        },
        spawn_height: SpineRangeValue {
            high: spawn_height,
            low: spawn_height,
        },
        spawn_shape,
        spawn_width: SpineRangeValue {
            high: spawn_width,
            low: spawn_width,
        },
        tint,
        velocity: SpineRangeValue {
            high: config.speed_max,
            low: config.speed_min,
        },
        wind: SpineRangeValue {
            high: 0.0,
            low: 0.0,
        },
        x: existing.map(|document| document.x).unwrap_or_default(),
        y: existing.map(|document| document.y).unwrap_or_default(),
    };
}

fn document_to_json(document: &SpineParticleDocument) -> String {
    let mut object = Map::new();
    object.insert(String::from("name"), Value::String(document.name.clone()));
    object.insert(String::from("maxParticles"), json!(document.max_particles));
    object.insert(String::from("continuous"), Value::Bool(document.continuous));
    object.insert(String::from("duration"), json!(document.duration));
    object.insert(String::from("emission"), range_json(&document.emission));
    object.insert(String::from("life"), range_json(&document.life));
    object.insert(
        String::from("lifeOffset"),
        range_json(&document.life_offset),
    );
    object.insert(String::from("x"), range_json(&document.x));
    object.insert(String::from("y"), range_json(&document.y));
    object.insert(
        String::from("spawnShape"),
        Value::String(String::from(spawn_shape_string(document.spawn_shape))),
    );
    object.insert(
        String::from("spawnWidth"),
        range_json(&document.spawn_width),
    );
    object.insert(
        String::from("spawnHeight"),
        range_json(&document.spawn_height),
    );
    object.insert(String::from("velocity"), range_json(&document.velocity));
    object.insert(String::from("angle"), range_json(&document.angle));
    object.insert(String::from("rotation"), range_json(&document.rotation));
    object.insert(String::from("wind"), range_json(&document.wind));
    object.insert(String::from("gravity"), range_json(&document.gravity));
    object.insert(String::from("scale"), range_json(&document.scale));
    object.insert(String::from("scaleEnd"), range_json(&document.scale_end));
    object.insert(
        String::from("tint"),
        Value::Array(
            document
                .tint
                .iter()
                .map(|keyframe| json!({"time": keyframe.time, "color": keyframe.color}))
                .collect(),
        ),
    );
    object.insert(
        String::from("alpha"),
        Value::Array(
            document
                .alpha
                .iter()
                .map(|keyframe| json!({"time": keyframe.time, "alpha": keyframe.alpha}))
                .collect(),
        ),
    );
    object.insert(
        String::from("blendMode"),
        Value::String(String::from(blend_mode_string(document.blend_mode))),
    );
    object.insert(
        String::from("premultiplied"),
        Value::Bool(document.premultiplied),
    );
    object.insert(
        String::from("images"),
        Value::Array(
            document
                .images
                .iter()
                .map(|image| Value::String(image.clone()))
                .collect(),
        ),
    );
    return serde_json::to_string_pretty(&Value::Object(object))
        .expect("spine document serializes to JSON");
}

fn range_json(range: &SpineRangeValue) -> Value {
    return json!({"low": range.low, "high": range.high});
}

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let channel = |value: f32| {
        let clamped = value.clamp(0.0, 1.0);
        return format!("{:02x}", (clamped * 255.0).round() as u32);
    };
    return format!("{}{}{}", channel(r), channel(g), channel(b));
}

/// Serializes a config to a Spine effect JSON string (TS `serializeSpineParticle`).
pub fn serialize_spine_particle(
    config: &ParticleEmitterConfig,
    existing: Option<&SpineParticleDocument>,
) -> String {
    return document_to_json(&config_to_document(config, existing));
}

/// Serializes a config to a Spine effect JSON string with warnings (TS
/// `serializeSpineParticleDocument`).
pub fn serialize_spine_particle_document(
    config: &ParticleEmitterConfig,
    existing: Option<&SpineParticleDocument>,
) -> ParticleSerializeResult {
    return ParticleSerializeResult {
        text: serialize_spine_particle(config, existing),
        warnings: collect_spine_serialize_warnings(config),
    };
}

fn spawn_shape_string(shape: SpineSpawnShape) -> &'static str {
    return match shape {
        SpineSpawnShape::Point => "point",
        SpineSpawnShape::Ellipse => "ellipse",
        SpineSpawnShape::Line => "line",
    };
}

fn spine_blend_mode(mode: ParticleBlendMode) -> SpineBlendMode {
    return match mode {
        ParticleBlendMode::Add => SpineBlendMode::Additive,
        ParticleBlendMode::Multiply => SpineBlendMode::Multiply,
        ParticleBlendMode::Screen => SpineBlendMode::Screen,
        ParticleBlendMode::Normal => SpineBlendMode::Normal,
    };
}
