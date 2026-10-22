//! Particle Designer plist serialization (TS `particleDesignerSerialize.ts`).

use flight_math::RAD_TO_DEG;
use flight_particles::{EmitterShape, ParticleBlendMode, ParticleEmitterConfig};

use crate::particle_designer_parse::{ParticleDesignerDocument, ParticleDesignerEmitterType};
use crate::text::format_js_number;
use crate::types::ParticleSerializeResult;

/// Serialize options (TS `ParticleDesignerSerializeOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ParticleDesignerSerializeOptions {
    /// Texture side length reversing the parse normalization; defaults to 1.
    pub texture_size: Option<f32>,
}

fn blend_mode_to_destination(mode: Option<ParticleBlendMode>, fallback: f32) -> f32 {
    return match mode {
        Some(ParticleBlendMode::Add) => 1.0,
        Some(ParticleBlendMode::Normal) => 771.0,
        _ => fallback,
    };
}

fn blend_mode_to_source(mode: Option<ParticleBlendMode>, fallback: f32) -> f32 {
    return match mode {
        Some(ParticleBlendMode::Add) | Some(ParticleBlendMode::Normal) => 770.0,
        _ => fallback,
    };
}

fn collect_particle_designer_serialize_warnings(config: &ParticleEmitterConfig) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    if let Some(blend_mode) = &config.blend_mode
        && *blend_mode != ParticleBlendMode::Add
        && *blend_mode != ParticleBlendMode::Normal
    {
        warnings.push(format!(
            "Blend mode '{}' has no Particle Designer equivalent and was approximated as 'normal'",
            blend_mode.as_str()
        ));
    }
    if config.color_curve.is_some() {
        warnings.push(String::from(
            "Color curve has more than two stops; Particle Designer stores only start and end colors",
        ));
    }
    if config.alpha_curve.is_some() {
        warnings.push(String::from(
            "Alpha curve has more than two stops; Particle Designer stores only start and end alpha",
        ));
    }
    if config.scale_curve.is_some() {
        warnings.push(String::from(
            "Scale curve has more than two stops; Particle Designer stores only start and end size",
        ));
    }
    if config.burst_count > 0.0 {
        warnings.push(String::from(
            "Emission bursts are not supported by the Particle Designer format and were ignored",
        ));
    }
    if config.velocity_inheritance != 0.0 {
        warnings.push(String::from(
            "velocityInheritance is not supported by the Particle Designer format and was ignored",
        ));
    }
    return warnings;
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&ParticleDesignerDocument>,
    texture_size: f32,
) -> ParticleDesignerDocument {
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
    let existing_variance_red = existing.map(|document| document.start_color_variance_red);
    let existing_variance_green = existing.map(|document| document.start_color_variance_green);
    let existing_variance_blue = existing.map(|document| document.start_color_variance_blue);
    let existing_end_variance_red = existing.map(|document| document.finish_color_variance_red);
    let existing_end_variance_green = existing.map(|document| document.finish_color_variance_green);
    let existing_end_variance_blue = existing.map(|document| document.finish_color_variance_blue);
    return ParticleDesignerDocument {
        angle: angle_degrees,
        angle_variance: config.spread * RAD_TO_DEG,
        blend_func_destination: blend_mode_to_destination(
            config.blend_mode,
            existing
                .map(|document| document.blend_func_destination)
                .unwrap_or(771.0),
        ),
        blend_func_source: blend_mode_to_source(
            config.blend_mode,
            existing
                .map(|document| document.blend_func_source)
                .unwrap_or(770.0),
        ),
        duration: if config.duration > 0.0 && !config.looping {
            config.duration
        } else {
            existing.map(|document| document.duration).unwrap_or(-1.0)
        },
        emitter_type: existing
            .map(|document| document.emitter_type)
            .unwrap_or(ParticleDesignerEmitterType::Gravity),
        finish_color_alpha: config.alpha_end,
        finish_color_blue: config.color_end_b,
        finish_color_green: config.color_end_g,
        finish_color_red: config.color_end_r,
        finish_color_variance_alpha: existing
            .map(|document| document.finish_color_variance_alpha)
            .unwrap_or(0.0),
        finish_color_variance_blue: if config.color_end_variance_b != 0.0 {
            config.color_end_variance_b
        } else {
            existing_end_variance_blue.unwrap_or(0.0)
        },
        finish_color_variance_green: if config.color_end_variance_g != 0.0 {
            config.color_end_variance_g
        } else {
            existing_end_variance_green.unwrap_or(0.0)
        },
        finish_color_variance_red: if config.color_end_variance_r != 0.0 {
            config.color_end_variance_r
        } else {
            existing_end_variance_red.unwrap_or(0.0)
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
        start_color_alpha: config.alpha_start,
        start_color_blue: config.color_start_b,
        start_color_green: config.color_start_g,
        start_color_red: config.color_start_r,
        start_color_variance_alpha: existing
            .map(|document| document.start_color_variance_alpha)
            .unwrap_or(0.0),
        start_color_variance_blue: if config.color_start_variance_b != 0.0 {
            config.color_start_variance_b
        } else {
            existing_variance_blue.unwrap_or(0.0)
        },
        start_color_variance_green: if config.color_start_variance_g != 0.0 {
            config.color_start_variance_g
        } else {
            existing_variance_green.unwrap_or(0.0)
        },
        start_color_variance_red: if config.color_start_variance_r != 0.0 {
            config.color_start_variance_r
        } else {
            existing_variance_red.unwrap_or(0.0)
        },
        start_particle_size: start_size,
        start_particle_size_variance: start_variance,
        texture_file_name: existing
            .map(|document| document.texture_file_name.clone())
            .unwrap_or_default(),
    };
}

fn document_to_plist(document: &ParticleDesignerDocument) -> String {
    let mut lines: Vec<String> = vec![
        String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>"),
        String::from(
            "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
        ),
        String::from("<plist version=\"1.0\">"),
        String::from("<dict>"),
    ];
    let push_integer = |lines: &mut Vec<String>, key: &str, value: f32| {
        lines.push(format!("\t<key>{}</key>", key));
        lines.push(format!("\t<integer>{}</integer>", format_js_number(value)));
    };
    let push_real = |lines: &mut Vec<String>, key: &str, value: f32| {
        lines.push(format!("\t<key>{}</key>", key));
        lines.push(format!("\t<real>{}</real>", format_js_number(value)));
    };
    push_integer(&mut lines, "maxParticles", document.max_particles);
    push_integer(
        &mut lines,
        "emitterType",
        if document.emitter_type == ParticleDesignerEmitterType::Radial {
            1.0
        } else {
            0.0
        },
    );
    push_real(&mut lines, "duration", document.duration);
    push_real(&mut lines, "particleLifespan", document.particle_lifespan);
    push_real(
        &mut lines,
        "particleLifespanVariance",
        document.particle_lifespan_variance,
    );
    push_real(&mut lines, "speed", document.speed);
    push_real(&mut lines, "speedVariance", document.speed_variance);
    push_real(&mut lines, "angle", document.angle);
    push_real(&mut lines, "angleVariance", document.angle_variance);
    push_real(&mut lines, "gravityx", document.gravityx);
    push_real(&mut lines, "gravityy", document.gravityy);
    push_real(
        &mut lines,
        "sourcePositionVariancex",
        document.source_position_variancex,
    );
    push_real(
        &mut lines,
        "sourcePositionVariancey",
        document.source_position_variancey,
    );
    push_real(
        &mut lines,
        "startParticleSize",
        document.start_particle_size,
    );
    push_real(
        &mut lines,
        "startParticleSizeVariance",
        document.start_particle_size_variance,
    );
    push_real(
        &mut lines,
        "finishParticleSize",
        document.finish_particle_size,
    );
    push_real(
        &mut lines,
        "finishParticleSizeVariance",
        document.finish_particle_size_variance,
    );
    push_real(&mut lines, "startColorRed", document.start_color_red);
    push_real(&mut lines, "startColorGreen", document.start_color_green);
    push_real(&mut lines, "startColorBlue", document.start_color_blue);
    push_real(&mut lines, "startColorAlpha", document.start_color_alpha);
    push_real(
        &mut lines,
        "startColorVarianceRed",
        document.start_color_variance_red,
    );
    push_real(
        &mut lines,
        "startColorVarianceGreen",
        document.start_color_variance_green,
    );
    push_real(
        &mut lines,
        "startColorVarianceBlue",
        document.start_color_variance_blue,
    );
    push_real(
        &mut lines,
        "startColorVarianceAlpha",
        document.start_color_variance_alpha,
    );
    push_real(&mut lines, "finishColorRed", document.finish_color_red);
    push_real(&mut lines, "finishColorGreen", document.finish_color_green);
    push_real(&mut lines, "finishColorBlue", document.finish_color_blue);
    push_real(&mut lines, "finishColorAlpha", document.finish_color_alpha);
    push_real(
        &mut lines,
        "finishColorVarianceRed",
        document.finish_color_variance_red,
    );
    push_real(
        &mut lines,
        "finishColorVarianceGreen",
        document.finish_color_variance_green,
    );
    push_real(
        &mut lines,
        "finishColorVarianceBlue",
        document.finish_color_variance_blue,
    );
    push_real(
        &mut lines,
        "finishColorVarianceAlpha",
        document.finish_color_variance_alpha,
    );
    push_real(&mut lines, "rotationStart", document.rotation_start);
    push_real(
        &mut lines,
        "rotationStartVariance",
        document.rotation_start_variance,
    );
    push_real(&mut lines, "rotationEnd", document.rotation_end);
    push_real(
        &mut lines,
        "rotationEndVariance",
        document.rotation_end_variance,
    );
    push_real(&mut lines, "maxRadius", document.max_radius);
    push_real(
        &mut lines,
        "maxRadiusVariance",
        document.max_radius_variance,
    );
    push_real(&mut lines, "minRadius", document.min_radius);
    push_real(
        &mut lines,
        "minRadiusVariance",
        document.min_radius_variance,
    );
    push_real(&mut lines, "rotatePerSecond", document.rotate_per_second);
    push_real(
        &mut lines,
        "rotatePerSecondVariance",
        document.rotate_per_second_variance,
    );
    push_integer(&mut lines, "blendFuncSource", document.blend_func_source);
    push_integer(
        &mut lines,
        "blendFuncDestination",
        document.blend_func_destination,
    );
    lines.push(String::from("\t<key>textureFileName</key>"));
    lines.push(format!(
        "\t<string>{}</string>",
        escape_xml(&document.texture_file_name)
    ));
    lines.push(String::from("</dict>"));
    lines.push(String::from("</plist>"));
    return lines.join("\n");
}

fn escape_xml(text: &str) -> String {
    return text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
}

/// Serializes a config to a Particle Designer plist (TS `serializeParticleDesignerPlist`).
pub fn serialize_particle_designer_plist(
    config: &ParticleEmitterConfig,
    existing: Option<&ParticleDesignerDocument>,
    options: Option<&ParticleDesignerSerializeOptions>,
) -> String {
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return document_to_plist(&config_to_document(config, existing, texture_size));
}

/// Serializes a config to a Particle Designer plist with warnings (TS
/// `serializeParticleDesignerPlistDocument`).
pub fn serialize_particle_designer_plist_document(
    config: &ParticleEmitterConfig,
    existing: Option<&ParticleDesignerDocument>,
    options: Option<&ParticleDesignerSerializeOptions>,
) -> ParticleSerializeResult {
    return ParticleSerializeResult {
        text: serialize_particle_designer_plist(config, existing, options),
        warnings: collect_particle_designer_serialize_warnings(config),
    };
}
