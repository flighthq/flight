//! Unity particle system JSON serialization (TS `unitySerialize.ts`).

use flight_math::RAD_TO_DEG;
use flight_particles::{
    EmitterShape, ParticleEmitterConfig, particle_color_curve_to_keyframes,
    particle_curve_to_keyframes,
};
use serde_json::{Map, Value, json};

use crate::types::ParticleSerializeResult;
use crate::unity_parse::{
    DEFAULT_PPU, UnityAnimationCurve, UnityColor, UnityColorOverLifetime, UnityCurveKey,
    UnityEmission, UnityGradient, UnityGradientAlphaKey, UnityGradientColorKey, UnityMinMaxMode,
    UnityMinMaxValue, UnityParticleDocument, UnityParticleShapeType, UnityRotationOverLifetime,
    UnityShape, UnitySizeOverLifetime, UnityVector3,
};

/// Serialize options (TS `UnitySerializeOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnitySerializeOptions {
    /// Pixels per unit reversing the parse conversion; defaults to 100.
    pub pixels_per_unit: Option<f32>,
}

fn build_gradient(config: &ParticleEmitterConfig) -> UnityGradient {
    let color_keys = match &config.color_curve {
        Some(curve) => {
            let mut color_kf = Vec::new();
            particle_color_curve_to_keyframes(&mut color_kf, curve);
            color_kf
                .into_iter()
                .map(|keyframe| UnityGradientColorKey {
                    b: keyframe.b,
                    g: keyframe.g,
                    r: keyframe.r,
                    time: keyframe.time,
                })
                .collect()
        }
        None => vec![
            UnityGradientColorKey {
                b: config.color_start_b,
                g: config.color_start_g,
                r: config.color_start_r,
                time: 0.0,
            },
            UnityGradientColorKey {
                b: config.color_end_b,
                g: config.color_end_g,
                r: config.color_end_r,
                time: 1.0,
            },
        ],
    };
    let alpha_keys = match &config.alpha_curve {
        Some(curve) => {
            let mut alpha_kf = Vec::new();
            particle_curve_to_keyframes(&mut alpha_kf, curve);
            alpha_kf
                .into_iter()
                .map(|keyframe| UnityGradientAlphaKey {
                    alpha: keyframe.value,
                    time: keyframe.time,
                })
                .collect()
        }
        None => vec![
            UnityGradientAlphaKey {
                alpha: config.alpha_start,
                time: 0.0,
            },
            UnityGradientAlphaKey {
                alpha: config.alpha_end,
                time: 1.0,
            },
        ],
    };
    return UnityGradient {
        alpha_keys,
        color_keys,
    };
}

fn build_size_curve(curve: &[f32]) -> UnityAnimationCurve {
    let mut curve_kf = Vec::new();
    particle_curve_to_keyframes(&mut curve_kf, curve);
    return UnityAnimationCurve {
        keys: curve_kf
            .into_iter()
            .map(|keyframe| UnityCurveKey {
                time: keyframe.time,
                value: keyframe.value,
            })
            .collect(),
    };
}

fn collect_unity_serialize_warnings(config: &ParticleEmitterConfig) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    if config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorEndVariance is not supported by the Unity format and was ignored",
        ));
    }
    if config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorStartVariance is not supported by the Unity format and was ignored",
        ));
    }
    if config.velocity_inheritance != 0.0 {
        warnings.push(String::from(
            "velocityInheritance is not supported by the Unity format and was ignored",
        ));
    }
    if config.gravity_x != 0.0 {
        warnings.push(String::from(
            "gravityX (horizontal gravity) is not supported by the Unity format and was ignored",
        ));
    }
    return warnings;
}

fn color_json(color: UnityColor) -> Value {
    return json!({"r": color.r, "g": color.g, "b": color.b, "a": color.a});
}

fn color_over_lifetime_json(value: &UnityColorOverLifetime) -> Value {
    let mut object = Map::new();
    object.insert(String::from("enabled"), Value::Bool(value.enabled));
    object.insert(String::from("colorStart"), color_json(value.color_start));
    object.insert(String::from("colorEnd"), color_json(value.color_end));
    if let Some(gradient) = &value.gradient {
        object.insert(String::from("gradient"), gradient_json(gradient));
    }
    return Value::Object(object);
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&UnityParticleDocument>,
    ppu: f32,
) -> UnityParticleDocument {
    let rotation_low = config.rotation_speed_min * RAD_TO_DEG;
    let rotation_high = config.rotation_speed_max * RAD_TO_DEG;
    let has_rotation = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;
    let has_burst = config.burst_count > 0.0;
    let gravity_world = config.gravity_y / ppu;
    let physics_gravity = existing
        .map(|document| document.physics_gravity)
        .unwrap_or(crate::unity_parse::DEFAULT_GRAVITY);
    let gravity_modifier = if physics_gravity != 0.0 {
        gravity_world / physics_gravity
    } else {
        0.0
    };
    let mut shape_type = UnityParticleShapeType::Cone;
    let mut radius = 0.0;
    let mut angle = config.spread * RAD_TO_DEG;
    match config.emitter_shape {
        EmitterShape::Circle => {
            shape_type = UnityParticleShapeType::Circle;
            radius = config.emitter_radius / ppu;
            angle = 0.0;
        }
        EmitterShape::Rect => {
            shape_type = UnityParticleShapeType::Box;
        }
        _ => {}
    }
    let start_color = UnityColor {
        a: config.alpha_start,
        b: config.color_start_b,
        g: config.color_start_g,
        r: config.color_start_r,
    };
    let end_color = UnityColor {
        a: config.alpha_end,
        b: config.color_end_b,
        g: config.color_end_g,
        r: config.color_end_r,
    };
    return UnityParticleDocument {
        color_over_lifetime: UnityColorOverLifetime {
            color_end: end_color,
            color_start: start_color,
            enabled: true,
            gradient: if config.color_curve.is_some() || config.alpha_curve.is_some() {
                Some(build_gradient(config))
            } else {
                None
            },
        },
        duration: if config.duration > 0.0 {
            config.duration
        } else {
            existing.map(|document| document.duration).unwrap_or(5.0)
        },
        emission: UnityEmission {
            bursts: if has_burst {
                vec![crate::unity_parse::UnityBurst {
                    count: config.burst_count,
                    cycle_count: if config.burst_interval > 0.0 {
                        0.0
                    } else {
                        1.0
                    },
                    repeat_interval: config.burst_interval,
                    time: 0.0,
                }]
            } else {
                Vec::new()
            },
            rate_over_time: UnityMinMaxValue {
                constant: Some(config.spawn_rate),
                ..UnityMinMaxValue::default()
            },
        },
        gravity_modifier,
        looping: config.looping,
        max_particles: config.max_particles,
        name: existing
            .map(|document| document.name.clone())
            .unwrap_or_default(),
        physics_gravity,
        prewarm: existing.map(|document| document.prewarm).unwrap_or(false),
        rotation_over_lifetime: UnityRotationOverLifetime {
            angular_velocity: if has_rotation {
                two_constants(rotation_low, rotation_high)
            } else {
                constant(0.0)
            },
            enabled: has_rotation,
        },
        shape: UnityShape {
            angle,
            enabled: config.emitter_shape != EmitterShape::Point,
            radius,
            scale: UnityVector3 {
                x: if config.emitter_shape == EmitterShape::Rect {
                    config.emitter_width / ppu
                } else {
                    1.0
                },
                y: if config.emitter_shape == EmitterShape::Rect {
                    config.emitter_height / ppu
                } else {
                    1.0
                },
                z: 1.0,
            },
            shape_type,
        },
        size_over_lifetime: UnitySizeOverLifetime {
            curve: config
                .scale_curve
                .as_ref()
                .map(|curve| build_size_curve(curve)),
            enabled: config.scale_end != 1.0 || config.scale_curve.is_some(),
            size_end: config.scale_end,
            size_start: 1.0,
        },
        start_color,
        start_lifetime: two_constants(config.lifetime_min, config.lifetime_max),
        start_rotation: constant(0.0),
        start_size: two_constants(config.scale_min, config.scale_max),
        start_speed: two_constants(config.speed_min / ppu, config.speed_max / ppu),
    };
}

fn constant(value: f32) -> UnityMinMaxValue {
    return UnityMinMaxValue {
        constant: Some(value),
        ..UnityMinMaxValue::default()
    };
}

fn document_to_json(document: &UnityParticleDocument) -> String {
    let mut object = Map::new();
    object.insert(String::from("name"), Value::String(document.name.clone()));
    object.insert(String::from("duration"), json!(document.duration));
    object.insert(String::from("looping"), Value::Bool(document.looping));
    object.insert(String::from("prewarm"), Value::Bool(document.prewarm));
    object.insert(String::from("maxParticles"), json!(document.max_particles));
    object.insert(
        String::from("startLifetime"),
        min_max_json(&document.start_lifetime),
    );
    object.insert(
        String::from("startSpeed"),
        min_max_json(&document.start_speed),
    );
    object.insert(
        String::from("startSize"),
        min_max_json(&document.start_size),
    );
    object.insert(
        String::from("startRotation"),
        min_max_json(&document.start_rotation),
    );
    object.insert(String::from("startColor"), color_json(document.start_color));
    object.insert(
        String::from("gravityModifier"),
        json!(document.gravity_modifier),
    );
    object.insert(
        String::from("physicsGravity"),
        json!(document.physics_gravity),
    );
    object.insert(String::from("emission"), emission_json(&document.emission));
    object.insert(String::from("shape"), shape_json(&document.shape));
    object.insert(
        String::from("colorOverLifetime"),
        color_over_lifetime_json(&document.color_over_lifetime),
    );
    object.insert(
        String::from("sizeOverLifetime"),
        size_over_lifetime_json(&document.size_over_lifetime),
    );
    object.insert(
        String::from("rotationOverLifetime"),
        rotation_over_lifetime_json(&document.rotation_over_lifetime),
    );
    return serde_json::to_string_pretty(&Value::Object(object))
        .expect("unity document serializes to JSON");
}

fn emission_json(emission: &UnityEmission) -> Value {
    return json!({
        "rateOverTime": min_max_json(&emission.rate_over_time),
        "bursts": emission
            .bursts
            .iter()
            .map(|burst| json!({
                "time": burst.time,
                "count": burst.count,
                "cycleCount": burst.cycle_count,
                "repeatInterval": burst.repeat_interval,
            }))
            .collect::<Vec<Value>>(),
    });
}

fn gradient_json(gradient: &UnityGradient) -> Value {
    return json!({
        "colorKeys": gradient
            .color_keys
            .iter()
            .map(|key| json!({
                "time": key.time,
                "color": {"r": key.r, "g": key.g, "b": key.b},
            }))
            .collect::<Vec<Value>>(),
        "alphaKeys": gradient
            .alpha_keys
            .iter()
            .map(|key| json!({"time": key.time, "alpha": key.alpha}))
            .collect::<Vec<Value>>(),
    });
}

fn min_max_json(value: &UnityMinMaxValue) -> Value {
    let mut object = Map::new();
    object.insert(
        String::from("mode"),
        Value::String(String::from(match value.mode {
            UnityMinMaxMode::Constant => "constant",
            UnityMinMaxMode::TwoConstants => "twoConstants",
            UnityMinMaxMode::Curve => "curve",
            UnityMinMaxMode::TwoCurves => "twoCurves",
        })),
    );
    if let Some(constant) = value.constant {
        object.insert(String::from("constant"), json!(constant));
    }
    if let Some(constant_min) = value.constant_min {
        object.insert(String::from("constantMin"), json!(constant_min));
    }
    if let Some(constant_max) = value.constant_max {
        object.insert(String::from("constantMax"), json!(constant_max));
    }
    return Value::Object(object);
}

fn rotation_over_lifetime_json(value: &UnityRotationOverLifetime) -> Value {
    return json!({
        "enabled": value.enabled,
        "angularVelocity": min_max_json(&value.angular_velocity),
    });
}

/// Serializes a config to a Unity particle JSON string (TS `serializeUnityParticle`).
pub fn serialize_unity_particle(
    config: &ParticleEmitterConfig,
    existing: Option<&UnityParticleDocument>,
    options: Option<&UnitySerializeOptions>,
) -> String {
    let ppu = options
        .and_then(|options| options.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    return document_to_json(&config_to_document(config, existing, ppu));
}

/// Serializes a config to a Unity particle JSON string with warnings (TS
/// `serializeUnityParticleDocument`).
pub fn serialize_unity_particle_document(
    config: &ParticleEmitterConfig,
    existing: Option<&UnityParticleDocument>,
    options: Option<&UnitySerializeOptions>,
) -> ParticleSerializeResult {
    return ParticleSerializeResult {
        text: serialize_unity_particle(config, existing, options),
        warnings: collect_unity_serialize_warnings(config),
    };
}

fn shape_json(shape: &UnityShape) -> Value {
    return json!({
        "enabled": shape.enabled,
        "shapeType": shape_type_string(shape.shape_type),
        "radius": shape.radius,
        "angle": shape.angle,
        "scale": {"x": shape.scale.x, "y": shape.scale.y, "z": shape.scale.z},
    });
}

fn shape_type_string(shape_type: UnityParticleShapeType) -> &'static str {
    return match shape_type {
        UnityParticleShapeType::Sphere => "Sphere",
        UnityParticleShapeType::Hemisphere => "Hemisphere",
        UnityParticleShapeType::Cone => "Cone",
        UnityParticleShapeType::Box => "Box",
        UnityParticleShapeType::Circle => "Circle",
        UnityParticleShapeType::Edge => "Edge",
        UnityParticleShapeType::Rectangle => "Rectangle",
        UnityParticleShapeType::Donut => "Donut",
    };
}

fn size_over_lifetime_json(value: &UnitySizeOverLifetime) -> Value {
    let mut object = Map::new();
    object.insert(String::from("enabled"), Value::Bool(value.enabled));
    object.insert(String::from("sizeStart"), json!(value.size_start));
    object.insert(String::from("sizeEnd"), json!(value.size_end));
    if let Some(curve) = &value.curve {
        object.insert(
            String::from("curve"),
            json!({
                "keys": curve
                    .keys
                    .iter()
                    .map(|key| json!({"time": key.time, "value": key.value}))
                    .collect::<Vec<Value>>(),
            }),
        );
    }
    return Value::Object(object);
}

fn two_constants(low: f32, high: f32) -> UnityMinMaxValue {
    if low == high {
        return constant(low);
    }
    return UnityMinMaxValue {
        constant_max: Some(high),
        constant_min: Some(low),
        mode: UnityMinMaxMode::TwoConstants,
        ..UnityMinMaxValue::default()
    };
}
