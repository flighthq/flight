//! Starling / Sparrow PEX XML serialization (TS `starlingPexSerialize.ts`).

use flight_math::RAD_TO_DEG;
use flight_particles::{EmitterShape, ParticleBlendMode, ParticleEmitterConfig};

use crate::starling_pex_parse::{StarlingPexColor, StarlingPexDocument, StarlingPexEmitterType};
use crate::text::format_js_number;
use crate::types::ParticleSerializeResult;

/// Serialize options (TS `StarlingPexSerializeOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StarlingPexSerializeOptions {
    /// Texture side length reversing the parse normalization; defaults to 1.
    pub texture_size: Option<f32>,
}

fn collect_starling_pex_serialize_warnings(config: &ParticleEmitterConfig) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    if let Some(blend_mode) = &config.blend_mode
        && *blend_mode != ParticleBlendMode::Add
        && *blend_mode != ParticleBlendMode::Normal
    {
        warnings.push(format!(
            "Blend mode '{}' has no Starling PEX equivalent and was approximated as 'normal'",
            blend_mode.as_str()
        ));
    }
    if config.color_curve.is_some() {
        warnings.push(String::from(
            "Color curve has more than two stops; Starling PEX stores only start and end colors",
        ));
    }
    if config.alpha_curve.is_some() {
        warnings.push(String::from(
            "Alpha curve has more than two stops; Starling PEX stores only start and end alpha",
        ));
    }
    if config.scale_curve.is_some() {
        warnings.push(String::from(
            "Scale curve has more than two stops; Starling PEX stores only start and end size",
        ));
    }
    if config.burst_count > 0.0 {
        warnings.push(String::from(
            "Emission bursts are not supported by the Starling PEX format and were ignored",
        ));
    }
    if config.velocity_inheritance != 0.0 {
        warnings.push(String::from(
            "velocityInheritance is not supported by the Starling PEX format and was ignored",
        ));
    }
    return warnings;
}

fn color_attribute(name: &str, color: &StarlingPexColor) -> String {
    return format!(
        "  <attribute name=\"{}\" red=\"{}\" green=\"{}\" blue=\"{}\" alpha=\"{}\"/>",
        name,
        format_js_number(color.red),
        format_js_number(color.green),
        format_js_number(color.blue),
        format_js_number(color.alpha)
    );
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&StarlingPexDocument>,
    texture_size: f32,
) -> StarlingPexDocument {
    let angle_degrees = (-config.direction_y).atan2(config.direction_x) * RAD_TO_DEG;
    let start_size = (config.scale_min + config.scale_max) * 0.5 * texture_size;
    let start_variance = (config.scale_max - config.scale_min) * 0.5 * texture_size;
    let finish_size = start_size * config.scale_end;
    let rotation_speed_mid = (config.rotation_speed_min + config.rotation_speed_max) * 0.5;
    let rotation_speed_variance = (config.rotation_speed_max - config.rotation_speed_min) * 0.5;
    let lifetime_mid = (config.lifetime_min + config.lifetime_max) * 0.5;
    let rotation_start = rotation_speed_mid * lifetime_mid * RAD_TO_DEG;
    let rotation_variance = rotation_speed_variance * lifetime_mid * RAD_TO_DEG;
    let (variance_x, variance_y) = match config.emitter_shape {
        EmitterShape::Circle => (config.emitter_radius, config.emitter_radius),
        EmitterShape::Rect => (config.emitter_width * 0.5, config.emitter_height * 0.5),
        _ => (0.0, 0.0),
    };
    let existing_source = existing
        .map(|document| document.blend_func_source)
        .unwrap_or(770.0);
    let existing_destination = existing
        .map(|document| document.blend_func_destination)
        .unwrap_or(771.0);
    let source = if config.blend_mode == Some(ParticleBlendMode::Add) {
        770.0
    } else {
        existing_source
    };
    let destination = match config.blend_mode {
        Some(ParticleBlendMode::Add) => 1.0,
        Some(ParticleBlendMode::Normal) => 771.0,
        _ => existing_destination,
    };
    let zero_color = StarlingPexColor::default();
    let existing_start_variance = existing
        .map(|document| document.start_color_variance)
        .unwrap_or(zero_color);
    let existing_finish_variance = existing
        .map(|document| document.finish_color_variance)
        .unwrap_or(zero_color);
    return StarlingPexDocument {
        angle: angle_degrees,
        angle_variance: config.spread * RAD_TO_DEG,
        blend_func_destination: destination,
        blend_func_source: source,
        duration: if config.duration > 0.0 && !config.looping {
            config.duration
        } else {
            existing.map(|document| document.duration).unwrap_or(-1.0)
        },
        emitter_type: existing
            .map(|document| document.emitter_type)
            .unwrap_or(StarlingPexEmitterType::Gravity),
        finish_color: StarlingPexColor {
            alpha: config.alpha_end,
            blue: config.color_end_b,
            green: config.color_end_g,
            red: config.color_end_r,
        },
        finish_color_variance: StarlingPexColor {
            alpha: existing_finish_variance.alpha,
            blue: if config.color_end_variance_b != 0.0 {
                config.color_end_variance_b
            } else {
                existing_finish_variance.blue
            },
            green: if config.color_end_variance_g != 0.0 {
                config.color_end_variance_g
            } else {
                existing_finish_variance.green
            },
            red: if config.color_end_variance_r != 0.0 {
                config.color_end_variance_r
            } else {
                existing_finish_variance.red
            },
        },
        finish_particle_size: finish_size,
        finish_particle_size_variance: existing
            .map(|document| document.finish_particle_size_variance)
            .unwrap_or(0.0),
        gravityx: config.gravity_x,
        gravityy: config.gravity_y,
        max_particles: config.max_particles,
        max_radius: existing.map(|document| document.max_radius).unwrap_or(0.0),
        max_radius_variance: existing
            .map(|document| document.max_radius_variance)
            .unwrap_or(0.0),
        min_radius: existing.map(|document| document.min_radius).unwrap_or(0.0),
        min_radius_variance: existing
            .map(|document| document.min_radius_variance)
            .unwrap_or(0.0),
        particle_lifespan: (config.lifetime_min + config.lifetime_max) * 0.5,
        particle_lifespan_variance: (config.lifetime_max - config.lifetime_min) * 0.5,
        radial_accel_variance: existing
            .map(|document| document.radial_accel_variance)
            .unwrap_or(0.0),
        radial_acceleration: existing
            .map(|document| document.radial_acceleration)
            .unwrap_or(0.0),
        rotate_per_second: existing
            .map(|document| document.rotate_per_second)
            .unwrap_or(0.0),
        rotate_per_second_variance: existing
            .map(|document| document.rotate_per_second_variance)
            .unwrap_or(0.0),
        rotation_end: rotation_start,
        rotation_end_variance: rotation_variance,
        rotation_start,
        rotation_start_variance: rotation_variance,
        source_position_variancex: variance_x,
        source_position_variancey: variance_y,
        speed: (config.speed_min + config.speed_max) * 0.5,
        speed_variance: (config.speed_max - config.speed_min) * 0.5,
        start_color: StarlingPexColor {
            alpha: config.alpha_start,
            blue: config.color_start_b,
            green: config.color_start_g,
            red: config.color_start_r,
        },
        start_color_variance: StarlingPexColor {
            alpha: existing_start_variance.alpha,
            blue: if config.color_start_variance_b != 0.0 {
                config.color_start_variance_b
            } else {
                existing_start_variance.blue
            },
            green: if config.color_start_variance_g != 0.0 {
                config.color_start_variance_g
            } else {
                existing_start_variance.green
            },
            red: if config.color_start_variance_r != 0.0 {
                config.color_start_variance_r
            } else {
                existing_start_variance.red
            },
        },
        start_particle_size: start_size,
        start_particle_size_variance: start_variance,
        tangential_accel_variance: existing
            .map(|document| document.tangential_accel_variance)
            .unwrap_or(0.0),
        tangential_acceleration: existing
            .map(|document| document.tangential_acceleration)
            .unwrap_or(0.0),
        texture_file_name: existing
            .map(|document| document.texture_file_name.clone())
            .unwrap_or_default(),
    };
}

fn document_to_xml(document: &StarlingPexDocument) -> String {
    let mut lines: Vec<String> = vec![
        String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>"),
        String::from("<particleEmitterConfig>"),
        format!(
            "  <attribute name=\"maxParticles\" value=\"{}\"/>",
            format_js_number(document.max_particles)
        ),
        format!(
            "  <attribute name=\"emitterType\" value=\"{}\"/>",
            if document.emitter_type == StarlingPexEmitterType::Radial {
                "1"
            } else {
                "0"
            }
        ),
    ];
    for (name, value) in [
        ("duration", document.duration),
        ("particleLifespan", document.particle_lifespan),
        (
            "particleLifespanVariance",
            document.particle_lifespan_variance,
        ),
        ("speed", document.speed),
        ("speedVariance", document.speed_variance),
        ("angle", document.angle),
        ("angleVariance", document.angle_variance),
        ("gravityx", document.gravityx),
        ("gravityy", document.gravityy),
        (
            "sourcePositionVariancex",
            document.source_position_variancex,
        ),
        (
            "sourcePositionVariancey",
            document.source_position_variancey,
        ),
        ("startParticleSize", document.start_particle_size),
        (
            "startParticleSizeVariance",
            document.start_particle_size_variance,
        ),
        ("finishParticleSize", document.finish_particle_size),
        (
            "finishParticleSizeVariance",
            document.finish_particle_size_variance,
        ),
    ] {
        lines.push(format!(
            "  <attribute name=\"{}\" value=\"{}\"/>",
            name,
            format_js_number(value)
        ));
    }
    lines.push(color_attribute("startColor", &document.start_color));
    lines.push(color_attribute(
        "startColorVariance",
        &document.start_color_variance,
    ));
    lines.push(color_attribute("finishColor", &document.finish_color));
    lines.push(color_attribute(
        "finishColorVariance",
        &document.finish_color_variance,
    ));
    for (name, value) in [
        ("rotationStart", document.rotation_start),
        ("rotationStartVariance", document.rotation_start_variance),
        ("rotationEnd", document.rotation_end),
        ("rotationEndVariance", document.rotation_end_variance),
        ("maxRadius", document.max_radius),
        ("maxRadiusVariance", document.max_radius_variance),
        ("minRadius", document.min_radius),
        ("minRadiusVariance", document.min_radius_variance),
        ("rotatePerSecond", document.rotate_per_second),
        (
            "rotatePerSecondVariance",
            document.rotate_per_second_variance,
        ),
        ("radialAcceleration", document.radial_acceleration),
        ("radialAccelVariance", document.radial_accel_variance),
        ("tangentialAcceleration", document.tangential_acceleration),
        (
            "tangentialAccelVariance",
            document.tangential_accel_variance,
        ),
        ("blendFuncSource", document.blend_func_source),
        ("blendFuncDestination", document.blend_func_destination),
    ] {
        lines.push(format!(
            "  <attribute name=\"{}\" value=\"{}\"/>",
            name,
            format_js_number(value)
        ));
    }
    if !document.texture_file_name.is_empty() {
        lines.push(format!(
            "  <attribute name=\"textureFileName\" value=\"{}\"/>",
            escape_xml(&document.texture_file_name)
        ));
    }
    lines.push(String::from("</particleEmitterConfig>"));
    return lines.join("\n");
}

fn escape_xml(text: &str) -> String {
    return text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
}

/// Serializes a config to a Starling PEX XML string (TS `serializeStarlingPex`).
pub fn serialize_starling_pex(
    config: &ParticleEmitterConfig,
    existing: Option<&StarlingPexDocument>,
    options: Option<&StarlingPexSerializeOptions>,
) -> String {
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return document_to_xml(&config_to_document(config, existing, texture_size));
}

/// Serializes a config to a Starling PEX XML string with warnings (TS
/// `serializeStarlingPexDocument`).
pub fn serialize_starling_pex_document(
    config: &ParticleEmitterConfig,
    existing: Option<&StarlingPexDocument>,
    options: Option<&StarlingPexSerializeOptions>,
) -> ParticleSerializeResult {
    return ParticleSerializeResult {
        text: serialize_starling_pex(config, existing, options),
        warnings: collect_starling_pex_serialize_warnings(config),
    };
}
