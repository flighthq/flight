//! Unity Shuriken particle system JSON parsing (TS `unityParse.ts`).

use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{
    ColorKeyframe, CurveKeyframe, EmitterShape, ParticleEmitterConfig,
    create_particle_emitter_config, particle_color_curve_from_keyframes,
    particle_curve_from_keyframes,
};
use serde_json::Value;

pub(crate) const DEFAULT_PPU: f32 = 100.0;
pub(crate) const DEFAULT_GRAVITY: f32 = 9.81;

/// A Unity color (TS `UnityColor`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UnityColor {
    pub a: f32,
    pub b: f32,
    pub g: f32,
    pub r: f32,
}

/// A Unity min/max curve mode (TS `UnityMinMaxValue['mode']`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum UnityMinMaxMode {
    #[default]
    Constant,
    TwoConstants,
    Curve,
    TwoCurves,
}

/// A two-value min/max curve value (TS `UnityMinMaxValue`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnityMinMaxValue {
    pub constant: Option<f32>,
    pub constant_max: Option<f32>,
    pub constant_min: Option<f32>,
    pub mode: UnityMinMaxMode,
}

/// A Unity burst (TS `UnityBurst`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UnityBurst {
    pub count: f32,
    pub cycle_count: f32,
    pub repeat_interval: f32,
    pub time: f32,
}

/// A Unity emission module (TS `UnityEmission`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnityEmission {
    pub bursts: Vec<UnityBurst>,
    pub rate_over_time: UnityMinMaxValue,
}

/// The Unity shape type (TS `UnityParticleShapeType`, a closed string union).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum UnityParticleShapeType {
    Sphere,
    Hemisphere,
    #[default]
    Cone,
    Box,
    Circle,
    Edge,
    Rectangle,
    Donut,
}

/// A Unity vector (TS `scale: {x,y,z}`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UnityVector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// A Unity shape module (TS `UnityShape`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnityShape {
    pub angle: f32,
    pub enabled: bool,
    pub radius: f32,
    pub scale: UnityVector3,
    pub shape_type: UnityParticleShapeType,
}

/// A Unity gradient color stop (TS `UnityGradientColorKey`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UnityGradientColorKey {
    pub b: f32,
    pub g: f32,
    pub r: f32,
    pub time: f32,
}

/// A Unity gradient alpha stop (TS `UnityGradientAlphaKey`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UnityGradientAlphaKey {
    pub alpha: f32,
    pub time: f32,
}

/// A multi-stop Unity gradient (TS `UnityGradient`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnityGradient {
    pub alpha_keys: Vec<UnityGradientAlphaKey>,
    pub color_keys: Vec<UnityGradientColorKey>,
}

/// A Unity animation-curve key (TS `UnityCurveKey`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UnityCurveKey {
    pub time: f32,
    pub value: f32,
}

/// A multi-key Unity animation curve (TS `UnityAnimationCurve`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnityAnimationCurve {
    pub keys: Vec<UnityCurveKey>,
}

/// A Unity color-over-lifetime module (TS `UnityColorOverLifetime`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnityColorOverLifetime {
    pub color_end: UnityColor,
    pub color_start: UnityColor,
    pub enabled: bool,
    pub gradient: Option<UnityGradient>,
}

/// A Unity size-over-lifetime module (TS `UnitySizeOverLifetime`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnitySizeOverLifetime {
    pub curve: Option<UnityAnimationCurve>,
    pub enabled: bool,
    pub size_end: f32,
    pub size_start: f32,
}

/// A Unity rotation-over-lifetime module (TS `UnityRotationOverLifetime`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnityRotationOverLifetime {
    pub angular_velocity: UnityMinMaxValue,
    pub enabled: bool,
}

/// Full Unity particle system document (TS `UnityParticleDocument`).
#[derive(Clone, Debug, PartialEq)]
pub struct UnityParticleDocument {
    pub color_over_lifetime: UnityColorOverLifetime,
    pub duration: f32,
    pub emission: UnityEmission,
    pub gravity_modifier: f32,
    pub looping: bool,
    pub max_particles: f32,
    pub name: String,
    pub physics_gravity: f32,
    pub prewarm: bool,
    pub rotation_over_lifetime: UnityRotationOverLifetime,
    pub shape: UnityShape,
    pub size_over_lifetime: UnitySizeOverLifetime,
    pub start_color: UnityColor,
    pub start_lifetime: UnityMinMaxValue,
    pub start_rotation: UnityMinMaxValue,
    pub start_size: UnityMinMaxValue,
    pub start_speed: UnityMinMaxValue,
}

/// Parse options (TS `UnityParseOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct UnityParseOptions {
    /// Pixels per unit; defaults to 100.
    pub pixels_per_unit: Option<f32>,
}

/// Parse result carrying the full document (TS `UnityParseResult`).
pub struct UnityParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub document: UnityParticleDocument,
}

const UNSUPPORTED_UNITY_MODULES: &[(&str, &str)] = &[
    ("velocityOverLifetime", "velocity-over-lifetime"),
    ("forceOverLifetime", "force-over-lifetime"),
    ("limitVelocityOverLifetime", "limit-velocity-over-lifetime"),
    ("inheritVelocity", "inherit-velocity"),
    ("noise", "noise"),
    ("collision", "collision"),
    ("subEmitters", "sub-emitters"),
    ("trails", "trails"),
    ("textureSheetAnimation", "texture-sheet-animation"),
    ("externalForces", "external-forces"),
    ("lights", "lights"),
];

fn alpha_keys_to_curve(array: Option<&Value>) -> Option<Vec<f32>> {
    let Some(Value::Array(values)) = array else {
        return None;
    };
    if values.len() <= 2 {
        return None;
    }
    let mut keys: Vec<CurveKeyframe> = Vec::new();
    for (index, key) in values.iter().enumerate() {
        let default_time = index as f32 / (values.len() - 1) as f32;
        keys.push(CurveKeyframe {
            time: rn(key.get("time"), default_time),
            value: rn(key.get("alpha"), 1.0),
        });
    }
    return Some(particle_curve_from_keyframes(&keys, 33));
}

fn collect_unity_diagnostics(raw: &Value) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    for (key, label) in UNSUPPORTED_UNITY_MODULES {
        let Some(module) = raw.get(*key).filter(|value| value.is_object()) else {
            continue;
        };
        if !rb(module.get("enabled"), false) {
            continue;
        }
        let mut detail = HashMap::new();
        detail.insert(
            String::from("module"),
            ImportDiagnosticDetailValue::String(String::from(*label)),
        );
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Skip,
            "unity.module-unsupported",
            "collectUnityDiagnostics",
            Some(detail),
        );
    }
    let burst_count = raw
        .get("emission")
        .and_then(|emission| emission.get("bursts"))
        .and_then(|bursts| bursts.as_array())
        .map(|bursts| bursts.len())
        .unwrap_or(0);
    if burst_count > 1 {
        let mut detail = HashMap::new();
        detail.insert(
            String::from("burstCount"),
            ImportDiagnosticDetailValue::Number(burst_count as f32),
        );
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Skip,
            "unity.extra-bursts-unsupported",
            "collectUnityDiagnostics",
            Some(detail),
        );
    }
    if let Some(shape) = raw.get("shape").filter(|shape| shape.is_object())
        && rb(shape.get("enabled"), false)
    {
        let shape_type = rs(shape.get("shapeType"), "Cone");
        if !["Sphere", "Hemisphere", "Circle", "Box", "Rectangle", "Cone"]
            .contains(&shape_type.as_str())
        {
            let mut detail = HashMap::new();
            detail.insert(
                String::from("shapeType"),
                ImportDiagnosticDetailValue::String(shape_type),
            );
            report_import_diagnostic(
                Some(&mut diagnostics),
                ImportDiagnosticSeverity::Recover,
                "unity.shape-unsupported",
                "collectUnityDiagnostics",
                Some(detail),
            );
        }
    }
    if rb(raw.get("prewarm"), false) {
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Skip,
            "unity.prewarm-unsupported",
            "collectUnityDiagnostics",
            None,
        );
    }
    let start_rotation = read_min_max(raw.get("startRotation"), 0.0);
    let mode = start_rotation.mode;
    let dropped = mode == UnityMinMaxMode::Curve
        || mode == UnityMinMaxMode::TwoCurves
        || start_rotation.constant.unwrap_or(0.0) != 0.0
        || start_rotation.constant_min.unwrap_or(0.0) != 0.0
        || start_rotation.constant_max.unwrap_or(0.0) != 0.0;
    if dropped {
        report_import_diagnostic(
            Some(&mut diagnostics),
            ImportDiagnosticSeverity::Skip,
            "unity.start-rotation-unsupported",
            "collectUnityDiagnostics",
            None,
        );
    }
    return diagnostics;
}

fn color_at(value: Option<&Value>, default: UnityColor) -> UnityColor {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return default;
    };
    return UnityColor {
        a: rn(value.get("a"), default.a),
        b: rn(value.get("b"), default.b),
        g: rn(value.get("g"), default.g),
        r: rn(value.get("r"), default.r),
    };
}

fn color_keys_to_curve(array: Option<&Value>) -> Option<Vec<f32>> {
    let Some(Value::Array(values)) = array else {
        return None;
    };
    if values.len() <= 2 {
        return None;
    }
    let mut keys: Vec<ColorKeyframe> = Vec::new();
    for (index, key) in values.iter().enumerate() {
        let default_time = index as f32 / (values.len() - 1) as f32;
        let color = key.get("color").unwrap_or(key);
        keys.push(ColorKeyframe {
            b: rn(color.get("b"), 1.0),
            g: rn(color.get("g"), 1.0),
            r: rn(color.get("r"), 1.0),
            time: rn(key.get("time"), default_time),
        });
    }
    return Some(particle_color_curve_from_keyframes(&keys, 33));
}

fn mm_high(value: Option<&Value>, default: f32) -> f32 {
    let Some(value) = value else {
        return default;
    };
    if let Some(number) = value.as_f64() {
        return number as f32;
    }
    let Some(object) = value.as_object() else {
        return default;
    };
    let mode = rs(value.get("mode"), "constant");
    if mode == "twoConstants" || mode == "twoCurves" {
        return match object.get("constantMax") {
            Some(number) => rn(Some(number), rn(object.get("constant"), default)),
            None => rn(object.get("constant"), default),
        };
    }
    return rn(object.get("constant"), default);
}

fn mm_low(value: Option<&Value>, default: f32) -> f32 {
    let Some(value) = value else {
        return default;
    };
    if let Some(number) = value.as_f64() {
        return number as f32;
    }
    let Some(object) = value.as_object() else {
        return default;
    };
    let mode = rs(value.get("mode"), "constant");
    if mode == "twoConstants" || mode == "twoCurves" {
        return match object.get("constantMin") {
            Some(number) => rn(Some(number), rn(object.get("constant"), default)),
            None => rn(object.get("constant"), default),
        };
    }
    return rn(object.get("constant"), default);
}

fn parse_unity_json(json: &str) -> Value {
    let raw: Value = match serde_json::from_str(json) {
        Ok(raw) => raw,
        Err(error) => panic!("Invalid Unity particle JSON: {}", error),
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
            "Invalid Unity particle document: expected a JSON object, got {}",
            description
        );
    }
    return raw;
}

/// Parses a Unity particle JSON string directly to a config (TS `parseUnityParticle`).
pub fn parse_unity_particle(
    json: &str,
    options: Option<&UnityParseOptions>,
) -> ParticleEmitterConfig {
    let ppu = options
        .and_then(|options| options.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    return raw_to_config(&parse_unity_json(json), ppu);
}

/// Parses a Unity particle JSON string and preserves the document (TS
/// `parseUnityParticleDocument`).
pub fn parse_unity_particle_document(
    json: &str,
    options: Option<&UnityParseOptions>,
) -> UnityParseResult {
    let ppu = options
        .and_then(|options| options.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    let raw = parse_unity_json(json);
    return UnityParseResult {
        config: raw_to_config(&raw, ppu),
        diagnostics: collect_unity_diagnostics(&raw),
        document: raw_to_document(&raw),
    };
}

fn raw_to_config(raw: &Value, ppu: f32) -> ParticleEmitterConfig {
    let physics_gravity = rn(raw.get("physicsGravity"), DEFAULT_GRAVITY);
    let gravity_pixels = rn(raw.get("gravityModifier"), 0.0) * physics_gravity * ppu;
    let emission = raw.get("emission");
    let rate_over_time = emission.and_then(|emission| emission.get("rateOverTime"));
    let spawn_rate = (mm_low(rate_over_time, 10.0) + mm_high(rate_over_time, 10.0)) * 0.5;
    let bursts = emission
        .and_then(|emission| emission.get("bursts"))
        .and_then(|bursts| bursts.as_array())
        .cloned()
        .unwrap_or_default();
    let burst0 = bursts.first();
    let burst_count = burst0
        .map(|burst| rn(burst.get("count"), 0.0))
        .unwrap_or(0.0);
    let burst_interval = match burst0 {
        Some(burst) if rn(burst.get("cycleCount"), 1.0) != 1.0 => {
            rn(burst.get("repeatInterval"), 0.0)
        }
        _ => 0.0,
    };
    let shape = raw.get("shape");
    let shape_enabled = rb(shape.and_then(|shape| shape.get("enabled")), false);
    let shape_type = rs(shape.and_then(|shape| shape.get("shapeType")), "Cone");
    let mut emitter_shape = EmitterShape::Point;
    let mut emitter_radius = 0.0;
    let mut emitter_width = 0.0;
    let mut emitter_height = 0.0;
    let mut direction_x = 0.0;
    let mut direction_y = -1.0;
    let mut spread = std::f32::consts::PI;
    if shape_enabled {
        let shape_radius = rn(shape.and_then(|shape| shape.get("radius")), 0.0) * ppu;
        let scale = shape.and_then(|shape| shape.get("scale"));
        match shape_type.as_str() {
            "Sphere" | "Hemisphere" | "Circle" => {
                emitter_shape = EmitterShape::Circle;
                emitter_radius = shape_radius;
                spread = std::f32::consts::PI * 2.0;
            }
            "Box" | "Rectangle" => {
                emitter_shape = EmitterShape::Rect;
                emitter_width = rn(scale.and_then(|scale| scale.get("x")), 1.0) * ppu;
                emitter_height = rn(scale.and_then(|scale| scale.get("y")), 1.0) * ppu;
                spread = std::f32::consts::PI * 2.0;
            }
            "Cone" => {
                spread = rn(shape.and_then(|shape| shape.get("angle")), 25.0) * DEG_TO_RAD;
                emitter_shape = if shape_radius > 0.0 {
                    EmitterShape::Circle
                } else {
                    EmitterShape::Point
                };
                emitter_radius = shape_radius;
            }
            _ => {
                direction_x = 0.0;
                direction_y = -1.0;
            }
        }
    }
    let scale_low = mm_low(raw.get("startSize"), 1.0);
    let scale_high = mm_high(raw.get("startSize"), 1.0);
    let size_over_lifetime = raw.get("sizeOverLifetime");
    let size_enabled = rb(
        size_over_lifetime.and_then(|size| size.get("enabled")),
        false,
    );
    let scale_end = if size_enabled {
        rn(size_over_lifetime.and_then(|size| size.get("sizeEnd")), 1.0)
            / (0.001f32).max((scale_low + scale_high) * 0.5)
    } else {
        1.0
    };
    let color_over_lifetime = raw.get("colorOverLifetime");
    let color_enabled = rb(
        color_over_lifetime.and_then(|color| color.get("enabled")),
        false,
    );
    let white = UnityColor::default();
    let fade = UnityColor { a: 0.0, ..white };
    let start_color = if color_enabled {
        color_at(
            color_over_lifetime.and_then(|color| color.get("colorStart")),
            white,
        )
    } else {
        color_at(raw.get("startColor"), white)
    };
    let end_color = if color_enabled {
        color_at(
            color_over_lifetime.and_then(|color| color.get("colorEnd")),
            fade,
        )
    } else {
        color_at(raw.get("startColor"), white)
    };
    let gradient = color_over_lifetime
        .and_then(|color| color.get("gradient"))
        .filter(|gradient| color_enabled);
    let color_curve = color_keys_to_curve(gradient.and_then(|gradient| gradient.get("colorKeys")));
    let alpha_curve = alpha_keys_to_curve(gradient.and_then(|gradient| gradient.get("alphaKeys")));
    let scale_curve = if size_enabled {
        size_keys_to_curve(size_over_lifetime.and_then(|size| size.get("curve")))
    } else {
        None
    };
    let rotation_over_lifetime = raw.get("rotationOverLifetime");
    let rotation_enabled = rb(
        rotation_over_lifetime.and_then(|rotation| rotation.get("enabled")),
        false,
    );
    let rotation_low = if rotation_enabled {
        mm_low(
            rotation_over_lifetime.and_then(|rotation| rotation.get("angularVelocity")),
            0.0,
        ) * DEG_TO_RAD
    } else {
        0.0
    };
    let rotation_high = if rotation_enabled {
        mm_high(
            rotation_over_lifetime.and_then(|rotation| rotation.get("angularVelocity")),
            0.0,
        ) * DEG_TO_RAD
    } else {
        0.0
    };
    let looping = rb(raw.get("looping"), true);
    let defaults = create_particle_emitter_config(None);
    return create_particle_emitter_config(Some(&ParticleEmitterConfig {
        alpha_curve,
        alpha_end: end_color.a,
        alpha_start: start_color.a,
        blend_mode: unity_blend_mode(raw),
        burst_count,
        burst_interval,
        color_curve,
        color_end_b: end_color.b,
        color_end_g: end_color.g,
        color_end_r: end_color.r,
        color_start_b: start_color.b,
        color_start_g: start_color.g,
        color_start_r: start_color.r,
        direction_x,
        direction_y,
        duration: if looping {
            0.0
        } else {
            (0.0f32).max(rn(raw.get("duration"), 5.0))
        },
        emitter_height,
        emitter_radius,
        emitter_shape,
        emitter_width,
        gravity_x: 0.0,
        gravity_y: gravity_pixels,
        lifetime_max: mm_high(raw.get("startLifetime"), 1.0),
        lifetime_min: mm_low(raw.get("startLifetime"), 1.0),
        looping,
        max_particles: (rn(raw.get("maxParticles"), 1000.0) as i32) as f32,
        rotation_speed_max: rotation_high,
        rotation_speed_min: rotation_low,
        scale_curve,
        scale_end,
        scale_max: scale_high,
        scale_min: scale_low,
        spawn_rate,
        speed_max: mm_high(raw.get("startSpeed"), 5.0) * ppu,
        speed_min: mm_low(raw.get("startSpeed"), 5.0) * ppu,
        spread,
        ..defaults
    }));
}

fn raw_to_document(raw: &Value) -> UnityParticleDocument {
    return UnityParticleDocument {
        color_over_lifetime: read_color_lifetime(raw.get("colorOverLifetime")),
        duration: rn(raw.get("duration"), 5.0),
        emission: read_emission(raw.get("emission")),
        gravity_modifier: rn(raw.get("gravityModifier"), 0.0),
        looping: rb(raw.get("looping"), true),
        max_particles: (rn(raw.get("maxParticles"), 1000.0) as i32) as f32,
        name: rs(raw.get("name"), ""),
        physics_gravity: rn(raw.get("physicsGravity"), DEFAULT_GRAVITY),
        prewarm: rb(raw.get("prewarm"), false),
        rotation_over_lifetime: read_rotation_lifetime(raw.get("rotationOverLifetime")),
        shape: read_shape(raw.get("shape")),
        size_over_lifetime: read_size_lifetime(raw.get("sizeOverLifetime")),
        start_color: color_at(raw.get("startColor"), UnityColor::default()),
        start_lifetime: read_min_max(raw.get("startLifetime"), 1.0),
        start_rotation: read_min_max(raw.get("startRotation"), 0.0),
        start_size: read_min_max(raw.get("startSize"), 1.0),
        start_speed: read_min_max(raw.get("startSpeed"), 5.0),
    };
}

fn rb(value: Option<&Value>, default: bool) -> bool {
    return match value {
        Some(Value::Bool(value)) => *value,
        _ => default,
    };
}

fn read_color_lifetime(value: Option<&Value>) -> UnityColorOverLifetime {
    let default = UnityColorOverLifetime {
        color_end: UnityColor {
            a: 0.0,
            ..UnityColor::default()
        },
        color_start: UnityColor::default(),
        enabled: false,
        gradient: None,
    };
    let Some(value) = value.filter(|value| value.is_object()) else {
        return default;
    };
    return UnityColorOverLifetime {
        color_end: color_at(value.get("colorEnd"), default.color_end),
        color_start: color_at(value.get("colorStart"), default.color_start),
        enabled: rb(value.get("enabled"), false),
        gradient: read_gradient(value.get("gradient")),
    };
}

fn read_emission(value: Option<&Value>) -> UnityEmission {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return UnityEmission {
            bursts: Vec::new(),
            rate_over_time: UnityMinMaxValue {
                constant: Some(10.0),
                ..UnityMinMaxValue::default()
            },
        };
    };
    let bursts = match value.get("bursts") {
        Some(Value::Array(values)) => values
            .iter()
            .map(|burst| UnityBurst {
                count: rn(burst.get("count"), 0.0),
                cycle_count: rn(burst.get("cycleCount"), 1.0),
                repeat_interval: rn(burst.get("repeatInterval"), 0.0),
                time: rn(burst.get("time"), 0.0),
            })
            .collect(),
        _ => Vec::new(),
    };
    return UnityEmission {
        bursts,
        rate_over_time: read_min_max(value.get("rateOverTime"), 10.0),
    };
}

fn read_gradient(value: Option<&Value>) -> Option<UnityGradient> {
    let value = value.filter(|value| value.is_object())?;
    let color_keys = match value.get("colorKeys") {
        Some(Value::Array(values)) => values
            .iter()
            .map(|key| {
                let color = key.get("color").unwrap_or(key);
                return UnityGradientColorKey {
                    b: rn(color.get("b"), 0.0),
                    g: rn(color.get("g"), 0.0),
                    r: rn(color.get("r"), 0.0),
                    time: rn(key.get("time"), 0.0),
                };
            })
            .collect(),
        _ => Vec::new(),
    };
    let alpha_keys = match value.get("alphaKeys") {
        Some(Value::Array(values)) => values
            .iter()
            .map(|key| UnityGradientAlphaKey {
                alpha: rn(key.get("alpha"), 0.0),
                time: rn(key.get("time"), 0.0),
            })
            .collect(),
        _ => Vec::new(),
    };
    return Some(UnityGradient {
        alpha_keys,
        color_keys,
    });
}

fn read_min_max(value: Option<&Value>, default_constant: f32) -> UnityMinMaxValue {
    let Some(value) = value else {
        return UnityMinMaxValue {
            constant: Some(default_constant),
            ..UnityMinMaxValue::default()
        };
    };
    if value.is_number() {
        return UnityMinMaxValue {
            constant: Some(rn(Some(value), default_constant)),
            ..UnityMinMaxValue::default()
        };
    }
    let mode = match rs(value.get("mode"), "constant").as_str() {
        "twoConstants" => UnityMinMaxMode::TwoConstants,
        "curve" => UnityMinMaxMode::Curve,
        "twoCurves" => UnityMinMaxMode::TwoCurves,
        _ => UnityMinMaxMode::Constant,
    };
    return UnityMinMaxValue {
        constant: Some(rn(value.get("constant"), default_constant)),
        constant_max: Some(rn(value.get("constantMax"), default_constant)),
        constant_min: Some(rn(value.get("constantMin"), default_constant)),
        mode,
    };
}

fn read_rotation_lifetime(value: Option<&Value>) -> UnityRotationOverLifetime {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return UnityRotationOverLifetime {
            angular_velocity: read_min_max(None, 0.0),
            enabled: false,
        };
    };
    return UnityRotationOverLifetime {
        angular_velocity: read_min_max(value.get("angularVelocity"), 0.0),
        enabled: rb(value.get("enabled"), false),
    };
}

fn read_shape(value: Option<&Value>) -> UnityShape {
    let default = UnityShape {
        angle: 25.0,
        enabled: true,
        radius: 1.0,
        scale: UnityVector3::default(),
        shape_type: UnityParticleShapeType::Cone,
    };
    let Some(value) = value.filter(|value| value.is_object()) else {
        return default;
    };
    let scale = value.get("scale").filter(|scale| scale.is_object());
    return UnityShape {
        angle: rn(value.get("angle"), 25.0),
        enabled: rb(value.get("enabled"), true),
        radius: rn(value.get("radius"), 1.0),
        scale: UnityVector3 {
            x: rn(scale.and_then(|scale| scale.get("x")), 1.0),
            y: rn(scale.and_then(|scale| scale.get("y")), 1.0),
            z: rn(scale.and_then(|scale| scale.get("z")), 1.0),
        },
        shape_type: unity_shape_type(&rs(value.get("shapeType"), "Cone")),
    };
}

fn read_size_lifetime(value: Option<&Value>) -> UnitySizeOverLifetime {
    let Some(value) = value.filter(|value| value.is_object()) else {
        return UnitySizeOverLifetime {
            curve: None,
            enabled: false,
            size_end: 1.0,
            size_start: 1.0,
        };
    };
    let curve = match value.get("curve").filter(|curve| curve.is_object()) {
        Some(curve) => match curve.get("keys") {
            Some(Value::Array(values)) => Some(UnityAnimationCurve {
                keys: values
                    .iter()
                    .map(|key| UnityCurveKey {
                        time: rn(key.get("time"), 0.0),
                        value: rn(key.get("value"), 1.0),
                    })
                    .collect(),
            }),
            _ => None,
        },
        None => None,
    };
    return UnitySizeOverLifetime {
        curve,
        enabled: rb(value.get("enabled"), false),
        size_end: rn(value.get("sizeEnd"), 1.0),
        size_start: rn(value.get("sizeStart"), 1.0),
    };
}

fn rn(value: Option<&Value>, default: f32) -> f32 {
    return match value {
        Some(Value::Number(number)) => number
            .as_f64()
            .filter(|parsed| parsed.is_finite())
            .map(|parsed| parsed as f32)
            .unwrap_or(default),
        _ => default,
    };
}

fn rs(value: Option<&Value>, default: &str) -> String {
    return match value {
        Some(Value::String(text)) => text.clone(),
        _ => String::from(default),
    };
}

fn size_keys_to_curve(curve: Option<&Value>) -> Option<Vec<f32>> {
    let curve = curve.filter(|curve| curve.is_object())?;
    let keys = curve.get("keys")?.as_array()?;
    if keys.len() <= 2 {
        return None;
    }
    let mut result: Vec<CurveKeyframe> = Vec::new();
    for (index, key) in keys.iter().enumerate() {
        let default_time = index as f32 / (keys.len() - 1) as f32;
        result.push(CurveKeyframe {
            time: rn(key.get("time"), default_time),
            value: rn(key.get("value"), 1.0),
        });
    }
    return Some(particle_curve_from_keyframes(&result, 33));
}

fn unity_blend_mode(raw: &Value) -> Option<String> {
    let mode = rs(raw.get("blendMode"), "").to_lowercase();
    return match mode.as_str() {
        "additive" | "add" => Some(String::from("add")),
        "multiply" => Some(String::from("multiply")),
        "screen" => Some(String::from("screen")),
        "normal" | "alpha" => Some(String::from("normal")),
        _ => None,
    };
}

fn unity_shape_type(value: &str) -> UnityParticleShapeType {
    return match value {
        "Sphere" => UnityParticleShapeType::Sphere,
        "Hemisphere" => UnityParticleShapeType::Hemisphere,
        "Box" => UnityParticleShapeType::Box,
        "Circle" => UnityParticleShapeType::Circle,
        "Edge" => UnityParticleShapeType::Edge,
        "Rectangle" => UnityParticleShapeType::Rectangle,
        "Donut" => UnityParticleShapeType::Donut,
        _ => UnityParticleShapeType::Cone,
    };
}

impl Default for UnityColor {
    fn default() -> Self {
        return UnityColor {
            a: 1.0,
            b: 1.0,
            g: 1.0,
            r: 1.0,
        };
    }
}

impl Default for UnityVector3 {
    fn default() -> Self {
        return UnityVector3 {
            x: 1.0,
            y: 1.0,
            z: 1.0,
        };
    }
}
