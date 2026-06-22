//! Unity Shuriken particle system JSON format support.
//!
//! Based on the Unity Particle System component's serialized field names as
//! exported by `JsonUtility` and common third-party particle-system exporters.
//! Targets Unity 2021 LTS and later.
//!
//! Curves (`MinMaxCurve`) are simplified to constant or two-keyframe linear
//! values during import.  Gradients (`MinMaxGradient`) are simplified to
//! start/end color stops unless a full gradient is present.

use std::f32::consts::PI;

use flighthq_particles::{
    create_particle_emitter_config, particle_color_curve_from_keyframes,
    particle_color_curve_to_keyframes, particle_curve_from_keyframes, particle_curve_to_keyframes,
};
use flighthq_types::{
    ColorKeyframe, CurveKeyframe, ParticleBlendMode, ParticleCurve, ParticleEmitterConfig,
    ParticleEmitterShape,
};

use crate::json::{JsonObjectWriter, JsonValue, format_json_number, parse_json};

const DEG2RAD: f32 = PI / 180.0;
const RAD2DEG: f32 = 180.0 / PI;
const DEFAULT_PPU: f32 = 100.0;
const DEFAULT_GRAVITY: f32 = 9.81;
const CURVE_SAMPLES: usize = 33;

// Unity modules with no equivalent in `ParticleEmitterConfig`. If present and
// enabled in the source, their effect is lost on import.
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

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/// Unity particle shape types.
#[repr(u8)]
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub enum UnityParticleShapeType {
    #[default]
    Sphere,
    Hemisphere,
    Cone,
    Box,
    Circle,
    Edge,
    Rectangle,
    Donut,
}

/// RGBA color (each channel `0.0–1.0`).
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityColor {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

/// A `MinMaxCurve` with constant or two-constant mode.
#[derive(Clone, Debug)]
pub struct UnityMinMaxValue {
    pub mode: UnityMinMaxMode,
    pub constant: Option<f32>,
    pub constant_min: Option<f32>,
    pub constant_max: Option<f32>,
}

/// Mode of a `UnityMinMaxValue`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum UnityMinMaxMode {
    #[default]
    Constant,
    TwoConstants,
    Curve,
    TwoCurves,
}

/// A Unity emission burst.
#[derive(Clone, Debug, Default)]
pub struct UnityBurst {
    /// Seconds into the particle system lifetime.
    pub time: f32,
    pub count: u32,
    /// `0` = infinite cycles.
    pub cycle_count: u32,
    pub repeat_interval: f32,
}

/// Unity emission module.
#[derive(Clone, Debug)]
pub struct UnityEmission {
    pub rate_over_time: UnityMinMaxValue,
    pub bursts: Vec<UnityBurst>,
}

/// Unity shape module.
#[derive(Clone, Debug)]
pub struct UnityShape {
    pub enabled: bool,
    pub shape_type: UnityParticleShapeType,
    /// Sphere / Hemisphere / Circle / Donut outer radius.
    pub radius: f32,
    /// Cone angle (degrees).
    pub angle: f32,
    /// Box / Rectangle dimensions.
    pub scale: UnityVec3,
}

/// Unity 3-component vector.
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityVec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// A Unity gradient color key (RGB stop at a normalised lifetime position).
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityGradientColorKey {
    pub time: f32,
    pub color: UnityColorRgb,
}

/// RGB color without alpha.
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityColorRgb {
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

/// A Unity gradient alpha key.
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityGradientAlphaKey {
    pub time: f32,
    pub alpha: f32,
}

/// Multi-stop gradient (full `MinMaxGradient` fidelity).
#[derive(Clone, Debug, Default)]
pub struct UnityGradient {
    pub color_keys: Vec<UnityGradientColorKey>,
    pub alpha_keys: Vec<UnityGradientAlphaKey>,
}

/// A Unity `AnimationCurve` key.
#[derive(Copy, Clone, Debug, Default)]
pub struct UnityCurveKey {
    /// `[0, 1]`.
    pub time: f32,
    pub value: f32,
}

/// Multi-key `AnimationCurve`.
#[derive(Clone, Debug, Default)]
pub struct UnityAnimationCurve {
    pub keys: Vec<UnityCurveKey>,
}

/// Unity color-over-lifetime module.
#[derive(Clone, Debug)]
pub struct UnityColorOverLifetime {
    pub enabled: bool,
    pub color_start: UnityColor,
    pub color_end: UnityColor,
    /// Full multi-stop gradient; when present it carries the complete
    /// color/alpha timeline that `color_start`/`color_end` only approximate.
    pub gradient: Option<UnityGradient>,
}

/// Unity size-over-lifetime module.
#[derive(Clone, Debug, Default)]
pub struct UnitySizeOverLifetime {
    pub enabled: bool,
    pub size_start: f32,
    pub size_end: f32,
    /// Full `AnimationCurve`; when present it carries the complete
    /// size-over-lifetime shape.
    pub curve: Option<UnityAnimationCurve>,
}

/// Unity rotation-over-lifetime module.
#[derive(Clone, Debug)]
pub struct UnityRotationOverLifetime {
    pub enabled: bool,
    /// Angular velocity in degrees/sec.
    pub angular_velocity: UnityMinMaxValue,
}

/// Full Unity Shuriken particle system JSON document.
#[derive(Clone, Debug)]
pub struct UnityParticleDocument {
    pub name: String,
    pub duration: f32,
    pub looping: bool,
    pub prewarm: bool,
    pub max_particles: u32,
    pub start_lifetime: UnityMinMaxValue,
    pub start_speed: UnityMinMaxValue,
    pub start_size: UnityMinMaxValue,
    /// Degrees.
    pub start_rotation: UnityMinMaxValue,
    pub start_color: UnityColor,
    /// Multiplier on `Physics.gravity` (default 9.81 m/s² downward).
    pub gravity_modifier: f32,
    /// World gravity magnitude (m/s²); default 9.81.
    pub physics_gravity: f32,
    pub emission: UnityEmission,
    pub shape: UnityShape,
    pub color_over_lifetime: UnityColorOverLifetime,
    pub size_over_lifetime: UnitySizeOverLifetime,
    pub rotation_over_lifetime: UnityRotationOverLifetime,
}

// ---------------------------------------------------------------------------
// Parse options / result types
// ---------------------------------------------------------------------------

/// Options for parsing a Unity particle JSON.
#[derive(Clone, Debug)]
pub struct UnityParseOptions {
    /// Pixels-per-unit for the target canvas.  Unity uses world-space units
    /// (metres); multiply by this factor to convert to pixel coordinates.
    /// Defaults to `100`.
    pub pixels_per_unit: Option<f32>,
}

/// Result of parsing a Unity particle JSON with the round-trip path.
#[derive(Debug)]
pub struct UnityParsed {
    pub config: ParticleEmitterConfig,
    pub document: UnityParticleDocument,
    /// Features present in the source that cannot be represented in the
    /// common-subset config and were silently dropped.
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Serialize options
// ---------------------------------------------------------------------------

/// Options for serialising a config to Unity particle JSON.
#[derive(Clone, Debug, Default)]
pub struct UnitySerializeOptions {
    /// Pixels-per-unit — reverses the conversion applied during parsing.
    /// Defaults to `100`.
    pub pixels_per_unit: Option<f32>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse a Unity Shuriken particle system JSON string directly to a
/// `ParticleEmitterConfig`.
///
/// Single-pass: no intermediate document object is allocated.  Use
/// [`parse_unity_particle_document`] when you need round-trip serialisation.
///
/// Returns an `Err` if the JSON is syntactically invalid or not a JSON object.
pub fn parse_unity_particle(
    json: &str,
    options: Option<&UnityParseOptions>,
) -> Result<ParticleEmitterConfig, String> {
    let ppu = options
        .and_then(|o| o.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    Ok(raw_to_config(&parse_unity_json(json)?, ppu))
}

/// Parse a Unity Shuriken particle system JSON string and preserve the full
/// document for round-trip serialisation via [`serialize_unity_particle`].
///
/// Returns an `Err` if the JSON is syntactically invalid or not a JSON object.
pub fn parse_unity_particle_document(
    json: &str,
    options: Option<&UnityParseOptions>,
) -> Result<UnityParsed, String> {
    let ppu = options
        .and_then(|o| o.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    let raw = parse_unity_json(json)?;
    Ok(UnityParsed {
        config: raw_to_config(&raw, ppu),
        document: raw_to_document(&raw),
        warnings: collect_unity_warnings(&raw),
    })
}

/// Serialise a `ParticleEmitterConfig` to a Unity Shuriken particle system
/// JSON string.
///
/// Pass the `document` returned by [`parse_unity_particle_document`] to
/// preserve fields that don't round-trip through the config (name, duration,
/// looping, prewarm, etc.).
pub fn serialize_unity_particle(
    config: &ParticleEmitterConfig,
    existing: Option<&UnityParticleDocument>,
    options: Option<&UnitySerializeOptions>,
) -> String {
    let ppu = options
        .and_then(|o| o.pixels_per_unit)
        .unwrap_or(DEFAULT_PPU);
    document_to_json(&config_to_document(config, existing, ppu))
}

// ---------------------------------------------------------------------------
// JSON value helpers (shared by both paths)
// ---------------------------------------------------------------------------

/// Parse a JSON string and assert the root is a plain object, returning a
/// clear, format-tagged error otherwise.
fn parse_unity_json(json: &str) -> Result<JsonValue, String> {
    let raw = parse_json(json).map_err(|e| format!("Invalid Unity particle JSON: {e}"))?;
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
            "Invalid Unity particle document: expected a JSON object, got {kind}"
        ));
    }
    Ok(raw)
}

fn rn(obj: Option<&JsonValue>, def: f32) -> f32 {
    obj.and_then(JsonValue::as_number)
        .map(|n| n as f32)
        .unwrap_or(def)
}

fn rb(obj: Option<&JsonValue>, def: bool) -> bool {
    obj.and_then(JsonValue::as_bool).unwrap_or(def)
}

fn rs<'a>(obj: Option<&'a JsonValue>, def: &'a str) -> &'a str {
    obj.and_then(JsonValue::as_text).unwrap_or(def)
}

fn mm_low(obj: Option<&JsonValue>, def: f32) -> f32 {
    match obj {
        None | Some(JsonValue::Null) => def,
        Some(JsonValue::Number(n)) => *n as f32,
        Some(o) => {
            let mode = rs(o.get("mode"), "constant");
            if mode == "twoConstants" || mode == "twoCurves" {
                rn(o.get("constantMin"), rn(o.get("constant"), def))
            } else {
                rn(o.get("constant"), def)
            }
        }
    }
}

fn mm_high(obj: Option<&JsonValue>, def: f32) -> f32 {
    match obj {
        None | Some(JsonValue::Null) => def,
        Some(JsonValue::Number(n)) => *n as f32,
        Some(o) => {
            let mode = rs(o.get("mode"), "constant");
            if mode == "twoConstants" || mode == "twoCurves" {
                rn(o.get("constantMax"), rn(o.get("constant"), def))
            } else {
                rn(o.get("constant"), def)
            }
        }
    }
}

fn color_at(obj: Option<&JsonValue>, def: UnityColor) -> UnityColor {
    match obj {
        Some(o) if o.is_object() => UnityColor {
            r: rn(o.get("r"), def.r),
            g: rn(o.get("g"), def.g),
            b: rn(o.get("b"), def.b),
            a: rn(o.get("a"), def.a),
        },
        _ => def,
    }
}

// ---------------------------------------------------------------------------
// Shared raw → config mapping
// ---------------------------------------------------------------------------

fn raw_to_config(raw: &JsonValue, ppu: f32) -> ParticleEmitterConfig {
    let physics_gravity = rn(raw.get("physicsGravity"), DEFAULT_GRAVITY);
    let grav_pixels = rn(raw.get("gravityModifier"), 0.0) * physics_gravity * ppu;

    let em_raw = raw.get("emission");
    let spawn_rate = (mm_low(em_raw.and_then(|e| e.get("rateOverTime")), 10.0)
        + mm_high(em_raw.and_then(|e| e.get("rateOverTime")), 10.0))
        * 0.5;
    let bursts = em_raw
        .and_then(|e| e.get("bursts"))
        .and_then(JsonValue::as_array);
    let burst0 = bursts.and_then(|b| b.first());
    let burst_count = burst0
        .map(|b| rn(b.get("count"), 0.0) as i64 as u32)
        .unwrap_or(0);
    let burst_interval = match burst0 {
        Some(b) if rn(b.get("cycleCount"), 1.0) != 1.0 => rn(b.get("repeatInterval"), 0.0),
        _ => 0.0,
    };

    let shape_raw = raw.get("shape");
    let shape_enabled = rb(shape_raw.and_then(|s| s.get("enabled")), false);
    let shape_type = rs(shape_raw.and_then(|s| s.get("shapeType")), "Cone").to_string();
    let mut emitter_shape = ParticleEmitterShape::Point;
    let mut emitter_radius = 0.0;
    let mut emitter_width = 0.0;
    let mut emitter_height = 0.0;
    let direction_x = 0.0;
    let direction_y = -1.0;
    let mut spread = PI;

    if shape_enabled {
        let shape_radius = rn(shape_raw.and_then(|s| s.get("radius")), 0.0) * ppu;
        let scale_raw = shape_raw.and_then(|s| s.get("scale"));
        if shape_type == "Sphere" || shape_type == "Hemisphere" || shape_type == "Circle" {
            emitter_shape = ParticleEmitterShape::Circle;
            emitter_radius = shape_radius;
            spread = PI * 2.0;
        } else if shape_type == "Box" || shape_type == "Rectangle" {
            emitter_shape = ParticleEmitterShape::Rect;
            emitter_width = rn(scale_raw.and_then(|s| s.get("x")), 1.0) * ppu;
            emitter_height = rn(scale_raw.and_then(|s| s.get("y")), 1.0) * ppu;
            spread = PI * 2.0;
        } else if shape_type == "Cone" {
            spread = rn(shape_raw.and_then(|s| s.get("angle")), 25.0) * DEG2RAD;
            emitter_shape = if shape_radius > 0.0 {
                ParticleEmitterShape::Circle
            } else {
                ParticleEmitterShape::Point
            };
            emitter_radius = shape_radius;
        }
    }

    let scale_low = mm_low(raw.get("startSize"), 1.0);
    let scale_high = mm_high(raw.get("startSize"), 1.0);
    let sol_raw = raw.get("sizeOverLifetime");
    let sol_enabled = rb(sol_raw.and_then(|s| s.get("enabled")), false);
    let scale_end = if sol_enabled {
        rn(sol_raw.and_then(|s| s.get("sizeEnd")), 1.0)
            / (0.001f32).max((scale_low + scale_high) * 0.5)
    } else {
        1.0
    };

    let col_raw = raw.get("colorOverLifetime");
    let col_enabled = rb(col_raw.and_then(|c| c.get("enabled")), false);
    let white = UnityColor {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 1.0,
    };
    let fade = UnityColor {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 0.0,
    };
    let start_color = if col_enabled {
        color_at(col_raw.and_then(|c| c.get("colorStart")), white)
    } else {
        color_at(raw.get("startColor"), white)
    };
    let end_color = if col_enabled {
        color_at(col_raw.and_then(|c| c.get("colorEnd")), fade)
    } else {
        color_at(raw.get("startColor"), white)
    };
    let gradient = if col_enabled {
        col_raw.and_then(|c| c.get("gradient"))
    } else {
        None
    };
    let color_curve = color_keys_to_curve(gradient.and_then(|g| g.get("colorKeys")));
    let alpha_curve = alpha_keys_to_curve(gradient.and_then(|g| g.get("alphaKeys")));
    let scale_curve = if sol_enabled {
        size_keys_to_curve(sol_raw.and_then(|s| s.get("curve")))
    } else {
        None
    };

    let rol_raw = raw.get("rotationOverLifetime");
    let rol_enabled = rb(rol_raw.and_then(|r| r.get("enabled")), false);
    let rot_low = if rol_enabled {
        mm_low(rol_raw.and_then(|r| r.get("angularVelocity")), 0.0) * DEG2RAD
    } else {
        0.0
    };
    let rot_high = if rol_enabled {
        mm_high(rol_raw.and_then(|r| r.get("angularVelocity")), 0.0) * DEG2RAD
    } else {
        0.0
    };

    let looping = rb(raw.get("looping"), true);

    create_particle_emitter_config(Some(ParticleEmitterConfig {
        max_particles: rn(raw.get("maxParticles"), 1000.0) as i64 as u32,
        spawn_rate,
        loop_: looping,
        duration: if looping {
            0.0
        } else {
            rn(raw.get("duration"), 5.0).max(0.0)
        },
        lifetime_min: mm_low(raw.get("startLifetime"), 1.0),
        lifetime_max: mm_high(raw.get("startLifetime"), 1.0),
        speed_min: mm_low(raw.get("startSpeed"), 5.0) * ppu,
        speed_max: mm_high(raw.get("startSpeed"), 5.0) * ppu,
        direction_x,
        direction_y,
        spread,
        gravity_x: 0.0,
        gravity_y: grav_pixels,
        emitter_shape,
        emitter_radius,
        emitter_width,
        emitter_height,
        scale_min: scale_low,
        scale_max: scale_high,
        scale_end,
        color_start_r: start_color.r,
        color_start_g: start_color.g,
        color_start_b: start_color.b,
        color_end_r: end_color.r,
        color_end_g: end_color.g,
        color_end_b: end_color.b,
        alpha_start: start_color.a,
        alpha_end: end_color.a,
        color_curve,
        alpha_curve,
        scale_curve,
        rotation_speed_min: rot_low,
        rotation_speed_max: rot_high,
        burst_count,
        burst_interval,
        blend_mode: unity_blend_mode(raw),
        ..ParticleEmitterConfig::default()
    }))
}

fn collect_unity_warnings(raw: &JsonValue) -> Vec<String> {
    let mut warnings = Vec::new();
    for (key, label) in UNSUPPORTED_UNITY_MODULES {
        if let Some(module) = raw.get(key) {
            if module.is_object() && rb(module.get("enabled"), false) {
                warnings.push(format!(
                    "Unity {label} module is not supported and was ignored"
                ));
            }
        }
    }
    let bursts = raw
        .get("emission")
        .and_then(|e| e.get("bursts"))
        .and_then(JsonValue::as_array)
        .map(<[JsonValue]>::len)
        .unwrap_or(0);
    if bursts > 1 {
        warnings.push(format!(
            "Only the first of {bursts} emission bursts was imported"
        ));
    }
    warnings
}

// Unity gradient colorKeys → baked color curve, but only for genuine multi-stop
// gradients (≤2 stops are exactly the linear start→end path).
fn color_keys_to_curve(arr: Option<&JsonValue>) -> Option<ParticleCurve> {
    let a = arr.and_then(JsonValue::as_array)?;
    if a.len() <= 2 {
        return None;
    }
    let mut keys: Vec<ColorKeyframe> = Vec::with_capacity(a.len());
    for (i, k) in a.iter().enumerate() {
        // The color may be nested under "color" or inline on the key itself.
        let c = k.get("color").unwrap_or(k);
        keys.push(ColorKeyframe {
            time: rn(k.get("time"), i as f32 / (a.len() - 1) as f32),
            r: rn(c.get("r"), 1.0),
            g: rn(c.get("g"), 1.0),
            b: rn(c.get("b"), 1.0),
        });
    }
    Some(particle_color_curve_from_keyframes(&keys, CURVE_SAMPLES))
}

fn alpha_keys_to_curve(arr: Option<&JsonValue>) -> Option<ParticleCurve> {
    let a = arr.and_then(JsonValue::as_array)?;
    if a.len() <= 2 {
        return None;
    }
    let mut keys: Vec<CurveKeyframe> = Vec::with_capacity(a.len());
    for (i, k) in a.iter().enumerate() {
        keys.push(CurveKeyframe {
            time: rn(k.get("time"), i as f32 / (a.len() - 1) as f32),
            value: rn(k.get("alpha"), 1.0),
        });
    }
    Some(particle_curve_from_keyframes(&keys, CURVE_SAMPLES))
}

// Unity size-over-lifetime AnimationCurve { keys: [{ time, value }] } → scale curve.
fn size_keys_to_curve(curve: Option<&JsonValue>) -> Option<ParticleCurve> {
    let c = curve?;
    if !c.is_object() {
        return None;
    }
    let a = c.get("keys").and_then(JsonValue::as_array)?;
    if a.len() <= 2 {
        return None;
    }
    let mut keys: Vec<CurveKeyframe> = Vec::with_capacity(a.len());
    for (i, k) in a.iter().enumerate() {
        keys.push(CurveKeyframe {
            time: rn(k.get("time"), i as f32 / (a.len() - 1) as f32),
            value: rn(k.get("value"), 1.0),
        });
    }
    Some(particle_curve_from_keyframes(&keys, CURVE_SAMPLES))
}

fn unity_blend_mode(raw: &JsonValue) -> Option<ParticleBlendMode> {
    let mode = raw
        .get("blendMode")
        .and_then(JsonValue::as_text)
        .map(str::to_lowercase);
    match mode.as_deref() {
        Some("additive") | Some("add") => Some(ParticleBlendMode::Add),
        Some("multiply") => Some(ParticleBlendMode::Multiply),
        Some("screen") => Some(ParticleBlendMode::Screen),
        Some("normal") | Some("alpha") => Some(ParticleBlendMode::Normal),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Document construction (load path only)
// ---------------------------------------------------------------------------

fn min_max_mode_from_str(s: &str) -> UnityMinMaxMode {
    match s {
        "twoConstants" => UnityMinMaxMode::TwoConstants,
        "curve" => UnityMinMaxMode::Curve,
        "twoCurves" => UnityMinMaxMode::TwoCurves,
        _ => UnityMinMaxMode::Constant,
    }
}

fn read_min_max(obj: Option<&JsonValue>, def_const: f32) -> UnityMinMaxValue {
    match obj {
        None | Some(JsonValue::Null) => UnityMinMaxValue {
            mode: UnityMinMaxMode::Constant,
            constant: Some(def_const),
            constant_min: None,
            constant_max: None,
        },
        Some(JsonValue::Number(n)) => UnityMinMaxValue {
            mode: UnityMinMaxMode::Constant,
            constant: Some(*n as f32),
            constant_min: None,
            constant_max: None,
        },
        Some(o) => UnityMinMaxValue {
            mode: min_max_mode_from_str(rs(o.get("mode"), "constant")),
            constant: Some(rn(o.get("constant"), def_const)),
            constant_min: Some(rn(o.get("constantMin"), def_const)),
            constant_max: Some(rn(o.get("constantMax"), def_const)),
        },
    }
}

fn read_emission(obj: Option<&JsonValue>) -> UnityEmission {
    match obj {
        Some(o) if o.is_object() => {
            let bursts = match o.get("bursts").and_then(JsonValue::as_array) {
                Some(a) => a
                    .iter()
                    .map(|b| UnityBurst {
                        time: rn(b.get("time"), 0.0),
                        count: rn(b.get("count"), 0.0) as i64 as u32,
                        cycle_count: rn(b.get("cycleCount"), 1.0) as i64 as u32,
                        repeat_interval: rn(b.get("repeatInterval"), 0.0),
                    })
                    .collect(),
                None => Vec::new(),
            };
            UnityEmission {
                rate_over_time: read_min_max(o.get("rateOverTime"), 10.0),
                bursts,
            }
        }
        _ => UnityEmission {
            rate_over_time: UnityMinMaxValue {
                mode: UnityMinMaxMode::Constant,
                constant: Some(10.0),
                constant_min: None,
                constant_max: None,
            },
            bursts: Vec::new(),
        },
    }
}

fn shape_type_from_str(s: &str) -> UnityParticleShapeType {
    match s {
        "Sphere" => UnityParticleShapeType::Sphere,
        "Hemisphere" => UnityParticleShapeType::Hemisphere,
        "Cone" => UnityParticleShapeType::Cone,
        "Box" => UnityParticleShapeType::Box,
        "Circle" => UnityParticleShapeType::Circle,
        "Edge" => UnityParticleShapeType::Edge,
        "Rectangle" => UnityParticleShapeType::Rectangle,
        "Donut" => UnityParticleShapeType::Donut,
        _ => UnityParticleShapeType::Cone,
    }
}

fn read_shape(obj: Option<&JsonValue>) -> UnityShape {
    let def = UnityShape {
        enabled: true,
        shape_type: UnityParticleShapeType::Cone,
        radius: 1.0,
        angle: 25.0,
        scale: UnityVec3 {
            x: 1.0,
            y: 1.0,
            z: 1.0,
        },
    };
    match obj {
        Some(o) if o.is_object() => {
            let sc = o.get("scale");
            UnityShape {
                enabled: rb(o.get("enabled"), true),
                shape_type: shape_type_from_str(rs(o.get("shapeType"), "Cone")),
                radius: rn(o.get("radius"), 1.0),
                angle: rn(o.get("angle"), 25.0),
                scale: UnityVec3 {
                    x: rn(sc.and_then(|s| s.get("x")), 1.0),
                    y: rn(sc.and_then(|s| s.get("y")), 1.0),
                    z: rn(sc.and_then(|s| s.get("z")), 1.0),
                },
            }
        }
        _ => def,
    }
}

fn read_color_lifetime(obj: Option<&JsonValue>) -> UnityColorOverLifetime {
    let def_start = UnityColor {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 1.0,
    };
    let def_end = UnityColor {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 0.0,
    };
    match obj {
        Some(o) if o.is_object() => UnityColorOverLifetime {
            enabled: rb(o.get("enabled"), false),
            color_start: color_at(o.get("colorStart"), def_start),
            color_end: color_at(o.get("colorEnd"), def_end),
            gradient: None,
        },
        _ => UnityColorOverLifetime {
            enabled: false,
            color_start: def_start,
            color_end: def_end,
            gradient: None,
        },
    }
}

fn read_size_lifetime(obj: Option<&JsonValue>) -> UnitySizeOverLifetime {
    match obj {
        Some(o) if o.is_object() => UnitySizeOverLifetime {
            enabled: rb(o.get("enabled"), false),
            size_start: rn(o.get("sizeStart"), 1.0),
            size_end: rn(o.get("sizeEnd"), 1.0),
            curve: None,
        },
        _ => UnitySizeOverLifetime {
            enabled: false,
            size_start: 1.0,
            size_end: 1.0,
            curve: None,
        },
    }
}

fn read_rotation_lifetime(obj: Option<&JsonValue>) -> UnityRotationOverLifetime {
    match obj {
        Some(o) if o.is_object() => UnityRotationOverLifetime {
            enabled: rb(o.get("enabled"), false),
            angular_velocity: read_min_max(o.get("angularVelocity"), 0.0),
        },
        _ => UnityRotationOverLifetime {
            enabled: false,
            angular_velocity: UnityMinMaxValue {
                mode: UnityMinMaxMode::Constant,
                constant: Some(0.0),
                constant_min: None,
                constant_max: None,
            },
        },
    }
}

fn raw_to_document(raw: &JsonValue) -> UnityParticleDocument {
    UnityParticleDocument {
        name: rs(raw.get("name"), "").to_string(),
        duration: rn(raw.get("duration"), 5.0),
        looping: rb(raw.get("looping"), true),
        prewarm: rb(raw.get("prewarm"), false),
        max_particles: rn(raw.get("maxParticles"), 1000.0) as i64 as u32,
        start_lifetime: read_min_max(raw.get("startLifetime"), 1.0),
        start_speed: read_min_max(raw.get("startSpeed"), 5.0),
        start_size: read_min_max(raw.get("startSize"), 1.0),
        start_rotation: read_min_max(raw.get("startRotation"), 0.0),
        start_color: color_at(
            raw.get("startColor"),
            UnityColor {
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 1.0,
            },
        ),
        gravity_modifier: rn(raw.get("gravityModifier"), 0.0),
        physics_gravity: rn(raw.get("physicsGravity"), DEFAULT_GRAVITY),
        emission: read_emission(raw.get("emission")),
        shape: read_shape(raw.get("shape")),
        color_over_lifetime: read_color_lifetime(raw.get("colorOverLifetime")),
        size_over_lifetime: read_size_lifetime(raw.get("sizeOverLifetime")),
        rotation_over_lifetime: read_rotation_lifetime(raw.get("rotationOverLifetime")),
    }
}

// ---------------------------------------------------------------------------
// Config → document → JSON serialisation
// ---------------------------------------------------------------------------

fn make_color(r: f32, g: f32, b: f32, a: f32) -> UnityColor {
    UnityColor { r, g, b, a }
}

fn constant(v: f32) -> UnityMinMaxValue {
    UnityMinMaxValue {
        mode: UnityMinMaxMode::Constant,
        constant: Some(v),
        constant_min: None,
        constant_max: None,
    }
}

fn two_const(low: f32, high: f32) -> UnityMinMaxValue {
    if low == high {
        constant(low)
    } else {
        UnityMinMaxValue {
            mode: UnityMinMaxMode::TwoConstants,
            constant: None,
            constant_min: Some(low),
            constant_max: Some(high),
        }
    }
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&UnityParticleDocument>,
    ppu: f32,
) -> UnityParticleDocument {
    let rot_low = config.rotation_speed_min * RAD2DEG;
    let rot_high = config.rotation_speed_max * RAD2DEG;
    let has_rotation = config.rotation_speed_min != 0.0 || config.rotation_speed_max != 0.0;
    let has_burst = config.burst_count > 0;

    let grav_world = config.gravity_y / ppu;
    let physics_gravity = existing.map(|e| e.physics_gravity).unwrap_or(9.81);
    let grav_modifier = if physics_gravity != 0.0 {
        grav_world / physics_gravity
    } else {
        0.0
    };

    let mut shape_type = UnityParticleShapeType::Cone;
    let mut radius = 0.0;
    let mut angle = config.spread * RAD2DEG;
    if config.emitter_shape == ParticleEmitterShape::Circle {
        shape_type = UnityParticleShapeType::Circle;
        radius = config.emitter_radius / ppu;
        angle = 0.0;
    } else if config.emitter_shape == ParticleEmitterShape::Rect {
        shape_type = UnityParticleShapeType::Box;
    }

    let gradient = if config.color_curve.is_some() || config.alpha_curve.is_some() {
        Some(build_gradient(config))
    } else {
        None
    };
    let size_curve = config.scale_curve.as_ref().map(|c| build_size_curve(c));

    UnityParticleDocument {
        name: existing.map(|e| e.name.clone()).unwrap_or_default(),
        duration: if config.duration > 0.0 {
            config.duration
        } else {
            existing.map(|e| e.duration).unwrap_or(5.0)
        },
        looping: config.loop_,
        prewarm: existing.map(|e| e.prewarm).unwrap_or(false),
        max_particles: config.max_particles,
        start_lifetime: two_const(config.lifetime_min, config.lifetime_max),
        start_speed: two_const(config.speed_min / ppu, config.speed_max / ppu),
        start_size: two_const(config.scale_min, config.scale_max),
        start_rotation: constant(0.0),
        start_color: make_color(
            config.color_start_r,
            config.color_start_g,
            config.color_start_b,
            config.alpha_start,
        ),
        gravity_modifier: grav_modifier,
        physics_gravity,
        emission: UnityEmission {
            rate_over_time: constant(config.spawn_rate),
            bursts: if has_burst {
                vec![UnityBurst {
                    time: 0.0,
                    count: config.burst_count,
                    cycle_count: if config.burst_interval > 0.0 { 0 } else { 1 },
                    repeat_interval: config.burst_interval,
                }]
            } else {
                Vec::new()
            },
        },
        shape: UnityShape {
            enabled: config.emitter_shape != ParticleEmitterShape::Point,
            shape_type,
            radius,
            angle,
            scale: UnityVec3 {
                x: if config.emitter_shape == ParticleEmitterShape::Rect {
                    config.emitter_width / ppu
                } else {
                    1.0
                },
                y: if config.emitter_shape == ParticleEmitterShape::Rect {
                    config.emitter_height / ppu
                } else {
                    1.0
                },
                z: 1.0,
            },
        },
        color_over_lifetime: UnityColorOverLifetime {
            enabled: true,
            color_start: make_color(
                config.color_start_r,
                config.color_start_g,
                config.color_start_b,
                config.alpha_start,
            ),
            color_end: make_color(
                config.color_end_r,
                config.color_end_g,
                config.color_end_b,
                config.alpha_end,
            ),
            gradient,
        },
        size_over_lifetime: UnitySizeOverLifetime {
            enabled: config.scale_end != 1.0 || config.scale_curve.is_some(),
            size_start: 1.0,
            size_end: config.scale_end,
            curve: size_curve,
        },
        rotation_over_lifetime: UnityRotationOverLifetime {
            enabled: has_rotation,
            angular_velocity: if has_rotation {
                two_const(rot_low, rot_high)
            } else {
                constant(0.0)
            },
        },
    }
}

fn build_gradient(config: &ParticleEmitterConfig) -> UnityGradient {
    let color_keys = match &config.color_curve {
        Some(curve) => particle_color_curve_to_keyframes(curve)
            .into_iter()
            .map(|k| UnityGradientColorKey {
                time: k.time,
                color: UnityColorRgb {
                    r: k.r,
                    g: k.g,
                    b: k.b,
                },
            })
            .collect(),
        None => vec![
            UnityGradientColorKey {
                time: 0.0,
                color: UnityColorRgb {
                    r: config.color_start_r,
                    g: config.color_start_g,
                    b: config.color_start_b,
                },
            },
            UnityGradientColorKey {
                time: 1.0,
                color: UnityColorRgb {
                    r: config.color_end_r,
                    g: config.color_end_g,
                    b: config.color_end_b,
                },
            },
        ],
    };
    let alpha_keys = match &config.alpha_curve {
        Some(curve) => particle_curve_to_keyframes(curve)
            .into_iter()
            .map(|k| UnityGradientAlphaKey {
                time: k.time,
                alpha: k.value,
            })
            .collect(),
        None => vec![
            UnityGradientAlphaKey {
                time: 0.0,
                alpha: config.alpha_start,
            },
            UnityGradientAlphaKey {
                time: 1.0,
                alpha: config.alpha_end,
            },
        ],
    };
    UnityGradient {
        color_keys,
        alpha_keys,
    }
}

fn build_size_curve(scale_curve: &[f32]) -> UnityAnimationCurve {
    UnityAnimationCurve {
        keys: particle_curve_to_keyframes(scale_curve)
            .into_iter()
            .map(|k| UnityCurveKey {
                time: k.time,
                value: k.value,
            })
            .collect(),
    }
}

fn shape_type_str(t: &UnityParticleShapeType) -> &'static str {
    match t {
        UnityParticleShapeType::Sphere => "Sphere",
        UnityParticleShapeType::Hemisphere => "Hemisphere",
        UnityParticleShapeType::Cone => "Cone",
        UnityParticleShapeType::Box => "Box",
        UnityParticleShapeType::Circle => "Circle",
        UnityParticleShapeType::Edge => "Edge",
        UnityParticleShapeType::Rectangle => "Rectangle",
        UnityParticleShapeType::Donut => "Donut",
    }
}

fn min_max_mode_str(m: UnityMinMaxMode) -> &'static str {
    match m {
        UnityMinMaxMode::Constant => "constant",
        UnityMinMaxMode::TwoConstants => "twoConstants",
        UnityMinMaxMode::Curve => "curve",
        UnityMinMaxMode::TwoCurves => "twoCurves",
    }
}

fn min_max_json(v: &UnityMinMaxValue, indent: &str) -> String {
    let inner = format!("{indent}  ");
    let mut parts = vec![format!("\"mode\": \"{}\"", min_max_mode_str(v.mode))];
    if let Some(c) = v.constant {
        parts.push(format!("\"constant\": {}", format_json_number(c)));
    }
    if let Some(c) = v.constant_min {
        parts.push(format!("\"constantMin\": {}", format_json_number(c)));
    }
    if let Some(c) = v.constant_max {
        parts.push(format!("\"constantMax\": {}", format_json_number(c)));
    }
    let body = parts
        .iter()
        .map(|p| format!("{inner}{p}"))
        .collect::<Vec<_>>()
        .join(",\n");
    format!("{{\n{body}\n{indent}}}")
}

fn color_json(c: UnityColor, indent: &str) -> String {
    let inner = format!("{indent}  ");
    format!(
        "{{\n{inner}\"r\": {},\n{inner}\"g\": {},\n{inner}\"b\": {},\n{inner}\"a\": {}\n{indent}}}",
        format_json_number(c.r),
        format_json_number(c.g),
        format_json_number(c.b),
        format_json_number(c.a)
    )
}

fn vec3_json(v: UnityVec3, indent: &str) -> String {
    let inner = format!("{indent}  ");
    format!(
        "{{\n{inner}\"x\": {},\n{inner}\"y\": {},\n{inner}\"z\": {}\n{indent}}}",
        format_json_number(v.x),
        format_json_number(v.y),
        format_json_number(v.z)
    )
}

fn emission_json(e: &UnityEmission) -> String {
    let bursts = if e.bursts.is_empty() {
        "[]".to_string()
    } else {
        let items: Vec<String> = e
            .bursts
            .iter()
            .map(|b| {
                format!(
                    "{{\n        \"time\": {},\n        \"count\": {},\n        \"cycleCount\": {},\n        \"repeatInterval\": {}\n      }}",
                    format_json_number(b.time),
                    b.count,
                    b.cycle_count,
                    format_json_number(b.repeat_interval)
                )
            })
            .collect();
        format!("[\n      {}\n    ]", items.join(",\n      "))
    };
    format!(
        "{{\n    \"rateOverTime\": {},\n    \"bursts\": {}\n  }}",
        min_max_json(&e.rate_over_time, "    "),
        bursts
    )
}

fn shape_json(s: &UnityShape) -> String {
    format!(
        "{{\n    \"enabled\": {},\n    \"shapeType\": \"{}\",\n    \"radius\": {},\n    \"angle\": {},\n    \"scale\": {}\n  }}",
        s.enabled,
        shape_type_str(&s.shape_type),
        format_json_number(s.radius),
        format_json_number(s.angle),
        vec3_json(s.scale, "    ")
    )
}

fn gradient_json(g: &UnityGradient) -> String {
    let color_items: Vec<String> = g
        .color_keys
        .iter()
        .map(|k| {
            format!(
                "{{\n          \"time\": {},\n          \"color\": {}\n        }}",
                format_json_number(k.time),
                format!(
                    "{{\n            \"r\": {},\n            \"g\": {},\n            \"b\": {}\n          }}",
                    format_json_number(k.color.r),
                    format_json_number(k.color.g),
                    format_json_number(k.color.b)
                )
            )
        })
        .collect();
    let alpha_items: Vec<String> = g
        .alpha_keys
        .iter()
        .map(|k| {
            format!(
                "{{\n          \"time\": {},\n          \"alpha\": {}\n        }}",
                format_json_number(k.time),
                format_json_number(k.alpha)
            )
        })
        .collect();
    let color_arr = if color_items.is_empty() {
        "[]".to_string()
    } else {
        format!("[\n        {}\n      ]", color_items.join(",\n        "))
    };
    let alpha_arr = if alpha_items.is_empty() {
        "[]".to_string()
    } else {
        format!("[\n        {}\n      ]", alpha_items.join(",\n        "))
    };
    format!(
        "{{\n      \"colorKeys\": {},\n      \"alphaKeys\": {}\n    }}",
        color_arr, alpha_arr
    )
}

fn color_lifetime_json(c: &UnityColorOverLifetime) -> String {
    let mut body = format!(
        "\n    \"enabled\": {},\n    \"colorStart\": {},\n    \"colorEnd\": {}",
        c.enabled,
        color_json(c.color_start, "    "),
        color_json(c.color_end, "    ")
    );
    if let Some(g) = &c.gradient {
        body.push_str(&format!(",\n    \"gradient\": {}", gradient_json(g)));
    }
    format!("{{{body}\n  }}")
}

fn animation_curve_json(curve: &UnityAnimationCurve) -> String {
    let items: Vec<String> = curve
        .keys
        .iter()
        .map(|k| {
            format!(
                "{{\n          \"time\": {},\n          \"value\": {}\n        }}",
                format_json_number(k.time),
                format_json_number(k.value)
            )
        })
        .collect();
    let arr = if items.is_empty() {
        "[]".to_string()
    } else {
        format!("[\n        {}\n      ]", items.join(",\n        "))
    };
    format!("{{\n      \"keys\": {}\n    }}", arr)
}

fn size_lifetime_json(s: &UnitySizeOverLifetime) -> String {
    let mut body = format!(
        "\n    \"enabled\": {},\n    \"sizeStart\": {},\n    \"sizeEnd\": {}",
        s.enabled,
        format_json_number(s.size_start),
        format_json_number(s.size_end)
    );
    if let Some(c) = &s.curve {
        body.push_str(&format!(",\n    \"curve\": {}", animation_curve_json(c)));
    }
    format!("{{{body}\n  }}")
}

fn rotation_lifetime_json(r: &UnityRotationOverLifetime) -> String {
    format!(
        "{{\n    \"enabled\": {},\n    \"angularVelocity\": {}\n  }}",
        r.enabled,
        min_max_json(&r.angular_velocity, "    ")
    )
}

fn document_to_json(doc: &UnityParticleDocument) -> String {
    let mut w = JsonObjectWriter::new();
    w.field_text("name", &doc.name);
    w.field_number("duration", doc.duration);
    w.field_bool("looping", doc.looping);
    w.field_bool("prewarm", doc.prewarm);
    w.field_number("maxParticles", doc.max_particles as f32);
    w.field_raw("startLifetime", &min_max_json(&doc.start_lifetime, "  "));
    w.field_raw("startSpeed", &min_max_json(&doc.start_speed, "  "));
    w.field_raw("startSize", &min_max_json(&doc.start_size, "  "));
    w.field_raw("startRotation", &min_max_json(&doc.start_rotation, "  "));
    w.field_raw("startColor", &color_json(doc.start_color, "  "));
    w.field_number("gravityModifier", doc.gravity_modifier);
    w.field_number("physicsGravity", doc.physics_gravity);
    w.field_raw("emission", &emission_json(&doc.emission));
    w.field_raw("shape", &shape_json(&doc.shape));
    w.field_raw(
        "colorOverLifetime",
        &color_lifetime_json(&doc.color_over_lifetime),
    );
    w.field_raw(
        "sizeOverLifetime",
        &size_lifetime_json(&doc.size_over_lifetime),
    );
    w.field_raw(
        "rotationOverLifetime",
        &rotation_lifetime_json(&doc.rotation_over_lifetime),
    );
    w.finish()
}

#[cfg(test)]
mod tests {
    use flighthq_particles::{sample_particle_color_curve, sample_particle_curve};

    use super::*;

    const SMOKE_JSON: &str = r#"{
  "name": "smoke",
  "duration": 5.0,
  "looping": true,
  "prewarm": false,
  "maxParticles": 500,
  "startLifetime": { "mode": "twoConstants", "constantMin": 1.0, "constantMax": 2.5 },
  "startSpeed": { "mode": "twoConstants", "constantMin": 0.5, "constantMax": 1.5 },
  "startSize": { "mode": "twoConstants", "constantMin": 0.8, "constantMax": 1.2 },
  "startRotation": { "mode": "constant", "constant": 0 },
  "startColor": { "r": 0.8, "g": 0.8, "b": 0.8, "a": 1.0 },
  "gravityModifier": 0.1,
  "physicsGravity": 9.81,
  "emission": { "rateOverTime": { "mode": "constant", "constant": 20 }, "bursts": [] },
  "shape": { "enabled": true, "shapeType": "Cone", "radius": 0.5, "angle": 15, "scale": { "x": 1, "y": 1, "z": 1 } },
  "colorOverLifetime": { "enabled": true, "colorStart": { "r": 0.8, "g": 0.8, "b": 0.8, "a": 1.0 }, "colorEnd": { "r": 0.3, "g": 0.3, "b": 0.3, "a": 0.0 } },
  "sizeOverLifetime": { "enabled": true, "sizeStart": 1.0, "sizeEnd": 2.0 },
  "rotationOverLifetime": { "enabled": true, "angularVelocity": { "mode": "twoConstants", "constantMin": -45, "constantMax": 45 } }
}"#;

    const PPU: f32 = 100.0;

    fn opts() -> UnityParseOptions {
        UnityParseOptions {
            pixels_per_unit: Some(PPU),
        }
    }

    fn close(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() <= eps
    }

    // ── gradient / size curves ──

    #[test]
    fn parse_unity_particle_two_stop_leaves_curves_null() {
        let c = parse_unity_particle(SMOKE_JSON, Some(&opts())).unwrap();
        assert!(c.color_curve.is_none());
        assert!(c.alpha_curve.is_none());
        assert!(c.scale_curve.is_none());
    }

    #[test]
    fn parse_unity_particle_multi_stop_gradient_bakes_curve() {
        let json = SMOKE_JSON.replace(
            "\"colorOverLifetime\": { \"enabled\": true, \"colorStart\": { \"r\": 0.8, \"g\": 0.8, \"b\": 0.8, \"a\": 1.0 }, \"colorEnd\": { \"r\": 0.3, \"g\": 0.3, \"b\": 0.3, \"a\": 0.0 } }",
            "\"colorOverLifetime\": { \"enabled\": true, \"gradient\": { \"colorKeys\": [ { \"time\": 0, \"color\": { \"r\": 1, \"g\": 0, \"b\": 0 } }, { \"time\": 0.5, \"color\": { \"r\": 0, \"g\": 1, \"b\": 0 } }, { \"time\": 1, \"color\": { \"r\": 0, \"g\": 0, \"b\": 1 } } ], \"alphaKeys\": [ { \"time\": 0, \"alpha\": 0 }, { \"time\": 0.5, \"alpha\": 1 }, { \"time\": 1, \"alpha\": 0 } ] } }",
        );
        let c = parse_unity_particle(&json, Some(&opts())).unwrap();
        let cc = c.color_curve.expect("color curve");
        let ac = c.alpha_curve.expect("alpha curve");
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&cc, 0.5, &mut out, 0);
        assert!(out[1] > 0.8);
        assert!(sample_particle_curve(&ac, 0.5) > 0.9);
    }

    #[test]
    fn parse_unity_particle_size_curve_bakes() {
        let json = SMOKE_JSON.replace(
            "\"sizeOverLifetime\": { \"enabled\": true, \"sizeStart\": 1.0, \"sizeEnd\": 2.0 }",
            "\"sizeOverLifetime\": { \"enabled\": true, \"curve\": { \"keys\": [ { \"time\": 0, \"value\": 0 }, { \"time\": 0.5, \"value\": 1 }, { \"time\": 1, \"value\": 0 } ] } }",
        );
        let c = parse_unity_particle(&json, Some(&opts())).unwrap();
        let sc = c.scale_curve.expect("scale curve");
        assert!(sample_particle_curve(&sc, 0.5) > sample_particle_curve(&sc, 0.0));
    }

    #[test]
    fn parse_unity_particle_gradient_no_warning() {
        let json = SMOKE_JSON.replace(
            "\"colorOverLifetime\": { \"enabled\": true, \"colorStart\": { \"r\": 0.8, \"g\": 0.8, \"b\": 0.8, \"a\": 1.0 }, \"colorEnd\": { \"r\": 0.3, \"g\": 0.3, \"b\": 0.3, \"a\": 0.0 } }",
            "\"colorOverLifetime\": { \"enabled\": true, \"gradient\": { \"colorKeys\": [ { \"time\": 0, \"color\": { \"r\": 1, \"g\": 1, \"b\": 1 } }, { \"time\": 0.5, \"color\": { \"r\": 0.5, \"g\": 0.5, \"b\": 0.5 } }, { \"time\": 1, \"color\": { \"r\": 0, \"g\": 0, \"b\": 0 } } ] } }",
        );
        let warnings = parse_unity_particle_document(&json, None).unwrap().warnings;
        assert!(
            !warnings
                .iter()
                .any(|w| w.to_lowercase().contains("gradient"))
        );
    }

    // ── lightweight ──

    #[test]
    fn parse_unity_particle_minimal() {
        let c = parse_unity_particle(SMOKE_JSON, Some(&opts())).unwrap();
        assert_eq!(c.max_particles, 500);
        assert!(close(c.lifetime_min, 1.0, 1e-4));
        assert!(close(c.lifetime_max, 2.5, 1e-4));
        assert!(close(c.speed_min, 50.0, 1e-3));
        assert!(close(c.speed_max, 150.0, 1e-3));
        assert!(close(c.gravity_y, 0.1 * 9.81 * PPU, 0.1));
        assert!(close(c.spread, 15.0 * DEG2RAD, 1e-3));
        assert!(close(c.color_start_r, 0.8, 1e-4));
        assert!(close(c.color_end_r, 0.3, 1e-4));
        assert!(close(c.alpha_start, 1.0, 1e-4));
        assert!(close(c.alpha_end, 0.0, 1e-4));
        assert!(close(c.scale_end, 2.0, 1e-3));
        assert!(close(c.rotation_speed_min, -45.0 * DEG2RAD, 1e-3));
        assert!(close(c.rotation_speed_max, 45.0 * DEG2RAD, 1e-3));
        assert!(c.loop_);
        assert_eq!(c.duration, 0.0);
    }

    #[test]
    fn parse_unity_particle_non_looping_duration() {
        let json = SMOKE_JSON
            .replace("\"looping\": true", "\"looping\": false")
            .replace("\"duration\": 5.0", "\"duration\": 3");
        let c = parse_unity_particle(&json, Some(&opts())).unwrap();
        assert!(!c.loop_);
        assert!(close(c.duration, 3.0, 1e-4));
    }

    #[test]
    fn parse_unity_particle_bursts() {
        let json = SMOKE_JSON.replace(
            "\"emission\": { \"rateOverTime\": { \"mode\": \"constant\", \"constant\": 20 }, \"bursts\": [] }",
            "\"emission\": { \"rateOverTime\": { \"mode\": \"constant\", \"constant\": 0 }, \"bursts\": [{ \"time\": 0, \"count\": 25, \"cycleCount\": 0, \"repeatInterval\": 2 }] }",
        );
        let c = parse_unity_particle(&json, Some(&opts())).unwrap();
        assert_eq!(c.burst_count, 25);
        assert!(close(c.burst_interval, 2.0, 1e-4));
    }

    // ── malformed input ──

    #[test]
    fn parse_unity_particle_invalid_json_errors() {
        assert!(
            parse_unity_particle("{not valid", None)
                .unwrap_err()
                .contains("Invalid Unity particle JSON")
        );
        assert!(
            parse_unity_particle("null", None)
                .unwrap_err()
                .contains("expected a JSON object")
        );
        assert!(
            parse_unity_particle("42", None)
                .unwrap_err()
                .contains("expected a JSON object")
        );
        assert!(
            parse_unity_particle("[]", None)
                .unwrap_err()
                .contains("expected a JSON object")
        );
    }

    #[test]
    fn parse_unity_particle_empty_object_defaults() {
        let c = parse_unity_particle("{}", None).unwrap();
        assert!(c.lifetime_min.is_finite());
        assert!(c.gravity_y.is_finite());
        assert!(c.spawn_rate.is_finite());
    }

    // ── document ──

    #[test]
    fn parse_unity_particle_document_round_trips() {
        let config = parse_unity_particle(SMOKE_JSON, Some(&opts())).unwrap();
        let parsed = parse_unity_particle_document(SMOKE_JSON, Some(&opts())).unwrap();
        assert_eq!(parsed.config.max_particles, config.max_particles);
        assert!(close(parsed.config.gravity_y, config.gravity_y, 1e-5));
        assert_eq!(parsed.document.name, "smoke");
        assert!(parsed.document.looping);
        assert!(!parsed.document.prewarm);
    }

    // ── warnings ──

    #[test]
    fn parse_unity_particle_no_warnings_representable() {
        assert!(
            parse_unity_particle_document(SMOKE_JSON, Some(&opts()))
                .unwrap()
                .warnings
                .is_empty()
        );
    }

    #[test]
    fn parse_unity_particle_unsupported_modules_warn() {
        let json = SMOKE_JSON.replace(
            "\"name\": \"smoke\",",
            "\"name\": \"smoke\", \"noise\": { \"enabled\": true }, \"collision\": { \"enabled\": true }, \"trails\": { \"enabled\": false },",
        );
        let warnings = parse_unity_particle_document(&json, Some(&opts()))
            .unwrap()
            .warnings;
        assert!(warnings.iter().any(|w| w.contains("noise")));
        assert!(warnings.iter().any(|w| w.contains("collision")));
        assert!(!warnings.iter().any(|w| w.contains("trails")));
    }

    #[test]
    fn parse_unity_particle_multi_burst_warns() {
        let json = SMOKE_JSON.replace(
            "\"emission\": { \"rateOverTime\": { \"mode\": \"constant\", \"constant\": 20 }, \"bursts\": [] }",
            "\"emission\": { \"rateOverTime\": { \"mode\": \"constant\", \"constant\": 0 }, \"bursts\": [ { \"time\": 0, \"count\": 5 }, { \"time\": 1, \"count\": 5 } ] }",
        );
        let warnings = parse_unity_particle_document(&json, None).unwrap().warnings;
        assert!(warnings.iter().any(|w| w.contains("burst")));
    }

    // ── serialize ──

    #[test]
    fn serialize_unity_particle_round_trips_fields() {
        let ser_opts = UnitySerializeOptions {
            pixels_per_unit: Some(PPU),
        };
        let config = parse_unity_particle(SMOKE_JSON, Some(&opts())).unwrap();
        let document = parse_unity_particle_document(SMOKE_JSON, Some(&opts()))
            .unwrap()
            .document;
        let json = serialize_unity_particle(&config, Some(&document), Some(&ser_opts));
        let config2 = parse_unity_particle(&json, Some(&opts())).unwrap();
        assert_eq!(config2.max_particles, config.max_particles);
        assert!(close(config2.lifetime_min, config.lifetime_min, 1e-3));
        assert!(close(config2.gravity_y, config.gravity_y, 1e-2));
        assert!(close(config2.alpha_end, config.alpha_end, 1e-3));
        assert!(close(config2.scale_end, config.scale_end, 1e-2));
    }

    #[test]
    fn serialize_unity_particle_produces_valid_json() {
        let config = parse_unity_particle(SMOKE_JSON, None).unwrap();
        let json = serialize_unity_particle(&config, None, None);
        assert!(parse_json(&json).is_ok());
    }

    #[test]
    fn serialize_unity_particle_bakes_curves() {
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
        let scale_curve = particle_curve_from_keyframes(
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
            scale_curve: Some(scale_curve),
            ..ParticleEmitterConfig::default()
        }));
        let json = serialize_unity_particle(
            &config,
            None,
            Some(&UnitySerializeOptions {
                pixels_per_unit: Some(PPU),
            }),
        );
        let doc = parse_json(&json).unwrap();
        assert!(
            doc.get("colorOverLifetime")
                .and_then(|c| c.get("gradient"))
                .is_some()
        );
        assert!(
            doc.get("sizeOverLifetime")
                .and_then(|s| s.get("curve"))
                .is_some()
        );

        let c2 = parse_unity_particle(&json, Some(&opts())).unwrap();
        let cc = c2.color_curve.expect("color curve");
        let ac = c2.alpha_curve.expect("alpha curve");
        let sc = c2.scale_curve.expect("scale curve");
        let mut out = [0.0f32; 3];
        sample_particle_color_curve(&cc, 0.5, &mut out, 0);
        assert!(out[1] > 0.8);
        assert!(sample_particle_curve(&ac, 0.5) > 0.9);
        assert!(sample_particle_curve(&sc, 0.5) > sample_particle_curve(&sc, 0.0));
    }
}
