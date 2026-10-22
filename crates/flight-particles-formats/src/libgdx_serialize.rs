//! libGDX 2D Particle Editor `.p` serialization (TS `libgdxSerialize.ts`).

use flight_math::RAD_TO_DEG;
use flight_particles::{EmitterShape, ParticleBlendMode, ParticleEmitterConfig};

use crate::libgdx_parse::{
    LibgdxActiveRangeValue, LibgdxParticleDocument, LibgdxRangeValue, LibgdxSpawnShape,
    LibgdxSpawnShapeValue, LibgdxSpawnSide, LibgdxTint,
};
use crate::text::format_js_number;
use crate::types::ParticleSerializeResult;

/// Serialize options (TS `LibgdxSerializeOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxSerializeOptions {
    /// Texture side length reversing the parse normalization; defaults to 1.
    pub texture_size: Option<f32>,
}

fn active_from_range(range: &LibgdxRangeValue) -> LibgdxActiveRangeValue {
    return LibgdxActiveRangeValue {
        active: false,
        high_max: range.high_max,
        high_min: range.high_min,
        low_max: range.low_max,
        low_min: range.low_min,
        relative: range.relative,
        scaling: range.scaling.clone(),
        timeline: range.timeline.clone(),
    };
}

fn active_range(
    active: bool,
    low_min: f32,
    low_max: f32,
    high_min: f32,
    high_max: f32,
) -> LibgdxActiveRangeValue {
    return LibgdxActiveRangeValue {
        active,
        high_max,
        high_min,
        low_max,
        low_min,
        relative: false,
        scaling: vec![1.0],
        timeline: vec![0.0],
    };
}

fn collect_libgdx_serialize_warnings(config: &ParticleEmitterConfig) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    if let Some(blend_mode) = &config.blend_mode
        && *blend_mode != ParticleBlendMode::Add
        && *blend_mode != ParticleBlendMode::Normal
    {
        warnings.push(format!(
            "Blend mode '{}' has no libGDX equivalent and was approximated as 'normal'",
            blend_mode.as_str()
        ));
    }
    if config.color_curve.is_some() {
        warnings.push(String::from(
            "Color curve has more than two stops; libGDX stores only start and end color",
        ));
    }
    if config.alpha_curve.is_some() {
        warnings.push(String::from(
            "Alpha curve has more than two stops; libGDX stores only start and end alpha via transparency scaling",
        ));
    }
    if config.burst_count > 0.0 {
        warnings.push(String::from(
            "Emission bursts are not supported by the libGDX format and were ignored",
        ));
    }
    if config.color_start_variance_r != 0.0
        || config.color_start_variance_g != 0.0
        || config.color_start_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorStartVariance is not supported by the libGDX format and was ignored",
        ));
    }
    if config.color_end_variance_r != 0.0
        || config.color_end_variance_g != 0.0
        || config.color_end_variance_b != 0.0
    {
        warnings.push(String::from(
            "colorEndVariance is not supported by the libGDX format and was ignored",
        ));
    }
    if config.velocity_inheritance != 0.0 {
        warnings.push(String::from(
            "velocityInheritance is not supported by the libGDX format and was ignored",
        ));
    }
    return warnings;
}

fn config_to_document(
    config: &ParticleEmitterConfig,
    existing: Option<&LibgdxParticleDocument>,
    texture_size: f32,
) -> LibgdxParticleDocument {
    let angle_mid = (-config.direction_y).atan2(config.direction_x) * RAD_TO_DEG;
    let spread_deg = config.spread * RAD_TO_DEG;
    let angle_min = angle_mid - spread_deg;
    let angle_max = angle_mid + spread_deg;
    let scale_min_px = config.scale_min * texture_size;
    let scale_max_px = config.scale_max * texture_size;
    let mut spawn_shape = LibgdxSpawnShapeValue::default();
    let mut spawn_width = make_const_range(0.0);
    let mut spawn_height = make_const_range(0.0);
    if config.emitter_shape == EmitterShape::Circle {
        spawn_shape = LibgdxSpawnShapeValue {
            edges: false,
            shape: LibgdxSpawnShape::Ellipse,
            side: LibgdxSpawnSide::Both,
        };
        let diameter = config.emitter_radius * 2.0;
        spawn_width = make_const_range(diameter);
        spawn_height = make_const_range(diameter);
    } else if config.emitter_shape == EmitterShape::Rect {
        spawn_shape = LibgdxSpawnShapeValue {
            edges: false,
            shape: LibgdxSpawnShape::Square,
            side: LibgdxSpawnSide::Both,
        };
        spawn_width = make_const_range(config.emitter_width);
        spawn_height = make_const_range(config.emitter_height);
    }
    let lifetime_sum = (config.lifetime_min + config.lifetime_max) * 0.5;
    let lifetime_mid = if lifetime_sum != 0.0 {
        lifetime_sum
    } else {
        1.0
    };
    let rotation_deg_min = config.rotation_speed_min * RAD_TO_DEG * lifetime_mid;
    let rotation_deg_max = config.rotation_speed_max * RAD_TO_DEG * lifetime_mid;
    let duration_ms = if config.looping {
        -1.0
    } else if config.duration > 0.0 {
        config.duration * 1000.0
    } else {
        3000.0
    };
    let duration_value = if duration_ms > 0.0 {
        duration_ms
    } else {
        3000.0
    };
    let default_range = || make_const_range(0.0);
    let existing_delay = existing.map(|document| &document.delay).cloned();
    let existing_life_offset = existing.map(|document| &document.life_offset).cloned();
    let existing_x_offset = existing.map(|document| &document.x_offset).cloned();
    let existing_y_offset = existing.map(|document| &document.y_offset).cloned();
    let inactive = default_range();
    return LibgdxParticleDocument {
        additive: config.blend_mode == Some(ParticleBlendMode::Add),
        angle: active_range(true, angle_min, angle_min, angle_max, angle_max),
        delay: existing_delay.unwrap_or_else(|| LibgdxActiveRangeValue {
            active: false,
            ..active_from_range(&inactive)
        }),
        duration: make_const_range(duration_value),
        emission: make_const_range(config.spawn_rate),
        gravity: active_range(
            config.gravity_y != 0.0,
            config.gravity_y,
            config.gravity_y,
            config.gravity_y,
            config.gravity_y,
        ),
        image_count: existing.map(|document| document.image_count).unwrap_or(1.0),
        image_path: existing
            .map(|document| document.image_path.clone())
            .unwrap_or_default(),
        life: LibgdxRangeValue {
            high_max: config.lifetime_max * 1000.0,
            high_min: config.lifetime_max * 1000.0,
            low_max: config.lifetime_min * 1000.0,
            low_min: config.lifetime_min * 1000.0,
            relative: false,
            scaling: vec![1.0],
            timeline: vec![0.0],
        },
        life_offset: existing_life_offset.unwrap_or_else(|| LibgdxActiveRangeValue {
            active: false,
            ..active_from_range(&inactive)
        }),
        max_particle_count: config.max_particles,
        min_particle_count: existing
            .map(|document| document.min_particle_count)
            .unwrap_or(0.0),
        name: existing
            .map(|document| document.name.clone())
            .unwrap_or_default(),
        premultiplied_alpha: existing
            .map(|document| document.premultiplied_alpha)
            .unwrap_or(false),
        rotation: active_range(
            rotation_deg_min != 0.0 || rotation_deg_max != 0.0,
            rotation_deg_min,
            rotation_deg_min,
            rotation_deg_max,
            rotation_deg_max,
        ),
        scale: LibgdxRangeValue {
            high_max: scale_max_px,
            high_min: scale_max_px,
            low_max: scale_min_px,
            low_min: scale_min_px,
            relative: false,
            scaling: vec![1.0, config.scale_end],
            timeline: vec![0.0, 1.0],
        },
        spawn_height,
        spawn_shape,
        spawn_width,
        tint: LibgdxTint {
            colors: vec![
                rgb_to_hex(
                    config.color_start_r,
                    config.color_start_g,
                    config.color_start_b,
                ),
                rgb_to_hex(config.color_end_r, config.color_end_g, config.color_end_b),
            ],
            timeline: vec![0.0, 1.0],
        },
        transparency: LibgdxRangeValue {
            high_max: 1.0,
            high_min: 1.0,
            low_max: 0.0,
            low_min: 0.0,
            relative: false,
            scaling: vec![config.alpha_start, config.alpha_end],
            timeline: vec![0.0, 1.0],
        },
        velocity: active_range(
            true,
            config.speed_min,
            config.speed_min,
            config.speed_max,
            config.speed_max,
        ),
        wind: active_range(
            config.gravity_x != 0.0,
            config.gravity_x,
            config.gravity_x,
            config.gravity_x,
            config.gravity_x,
        ),
        x_offset: existing_x_offset.unwrap_or_else(|| LibgdxActiveRangeValue {
            active: false,
            ..active_from_range(&inactive)
        }),
        y_offset: existing_y_offset.unwrap_or_else(|| LibgdxActiveRangeValue {
            active: false,
            ..active_from_range(&inactive)
        }),
    };
}

fn document_to_text(document: &LibgdxParticleDocument) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push(String::from("Particle Effect"));
    if !document.name.is_empty() {
        lines.push(format!("- {} -", document.name));
    }
    lines.push(format!(
        "minParticleCount: {}",
        format_js_number(document.min_particle_count)
    ));
    lines.push(format!(
        "maxParticleCount: {}",
        format_js_number(document.max_particle_count)
    ));
    lines.push(format!("additive: {}", document.additive));
    if document.premultiplied_alpha {
        lines.push(format!(
            "premultipliedAlpha: {}",
            document.premultiplied_alpha
        ));
    }
    if !document.image_path.is_empty() {
        lines.push(format!("imagePath: {}", document.image_path));
    }
    if document.image_count != 1.0 {
        lines.push(format!(
            "imageCount: {}",
            format_js_number(document.image_count)
        ));
    }
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Delay",
        &range_of_active(&document.delay),
        Some(document.delay.active),
    );
    lines.push(String::new());
    push_range_lines(&mut lines, "Duration", &document.duration, None);
    lines.push(String::new());
    push_range_lines(&mut lines, "Emission", &document.emission, None);
    lines.push(String::new());
    push_range_lines(&mut lines, "Life", &document.life, None);
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Life Offset",
        &range_of_active(&document.life_offset),
        Some(document.life_offset.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "X Offset",
        &range_of_active(&document.x_offset),
        Some(document.x_offset.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Y Offset",
        &range_of_active(&document.y_offset),
        Some(document.y_offset.active),
    );
    lines.push(String::new());
    lines.push(String::from("Spawn Shape"));
    lines.push(format!(
        "shape: {}",
        spawn_shape_string(document.spawn_shape.shape)
    ));
    if document.spawn_shape.shape == LibgdxSpawnShape::Ellipse {
        lines.push(format!("edges: {}", document.spawn_shape.edges));
        lines.push(format!(
            "side: {}",
            spawn_side_string(document.spawn_shape.side)
        ));
    }
    lines.push(String::new());
    push_range_lines(&mut lines, "Spawn Width", &document.spawn_width, None);
    lines.push(String::new());
    push_range_lines(&mut lines, "Spawn Height", &document.spawn_height, None);
    lines.push(String::new());
    push_range_lines(&mut lines, "Scale", &document.scale, None);
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Velocity",
        &range_of_active(&document.velocity),
        Some(document.velocity.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Angle",
        &range_of_active(&document.angle),
        Some(document.angle.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Rotation",
        &range_of_active(&document.rotation),
        Some(document.rotation.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Wind",
        &range_of_active(&document.wind),
        Some(document.wind.active),
    );
    lines.push(String::new());
    push_range_lines(
        &mut lines,
        "Gravity",
        &range_of_active(&document.gravity),
        Some(document.gravity.active),
    );
    lines.push(String::new());
    lines.push(String::from("Tint"));
    lines.push(format!("colors: {}", document.tint.colors.join(",")));
    lines.push(format!("timelineCount: {}", document.tint.timeline.len()));
    for (index, value) in document.tint.timeline.iter().enumerate() {
        lines.push(format!("timeline{}: {}", index, format_js_number(*value)));
    }
    lines.push(String::new());
    push_range_lines(&mut lines, "Transparency", &document.transparency, None);
    lines.push(String::new());
    return lines.join("\n");
}

fn make_const_range(value: f32) -> LibgdxRangeValue {
    return LibgdxRangeValue {
        high_max: value,
        high_min: value,
        low_max: value,
        low_min: value,
        relative: false,
        scaling: vec![1.0],
        timeline: vec![0.0],
    };
}

fn push_range_lines(
    lines: &mut Vec<String>,
    section: &str,
    range: &LibgdxRangeValue,
    active: Option<bool>,
) {
    lines.push(String::from(section));
    if let Some(active) = active {
        lines.push(format!("active: {}", active));
    }
    lines.push(format!("lowMin: {}", format_js_number(range.low_min)));
    lines.push(format!("lowMax: {}", format_js_number(range.low_max)));
    lines.push(format!("highMin: {}", format_js_number(range.high_min)));
    lines.push(format!("highMax: {}", format_js_number(range.high_max)));
    lines.push(format!("relative: {}", range.relative));
    lines.push(format!("scalingCount: {}", range.scaling.len()));
    for (index, value) in range.scaling.iter().enumerate() {
        lines.push(format!("scaling{}: {}", index, format_js_number(*value)));
    }
    lines.push(format!("timelineCount: {}", range.timeline.len()));
    for (index, value) in range.timeline.iter().enumerate() {
        lines.push(format!("timeline{}: {}", index, format_js_number(*value)));
    }
}

fn range_of_active(range: &LibgdxActiveRangeValue) -> LibgdxRangeValue {
    return LibgdxRangeValue {
        high_max: range.high_max,
        high_min: range.high_min,
        low_max: range.low_max,
        low_min: range.low_min,
        relative: range.relative,
        scaling: range.scaling.clone(),
        timeline: range.timeline.clone(),
    };
}

fn rgb_to_hex(r: f32, g: f32, b: f32) -> String {
    let channel = |value: f32| {
        let clamped = value.clamp(0.0, 1.0);
        return format!("{:02x}", (clamped * 255.0).round() as u32);
    };
    return format!("{}{}{}", channel(r), channel(g), channel(b));
}

/// Serializes a config to a libGDX `.p` string, preserving fields from `existing` that the config
/// does not carry (TS `serializeLibgdxParticle`).
pub fn serialize_libgdx_particle(
    config: &ParticleEmitterConfig,
    existing: Option<&LibgdxParticleDocument>,
    options: Option<&LibgdxSerializeOptions>,
) -> String {
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    let document = config_to_document(config, existing, texture_size);
    return document_to_text(&document);
}

/// Serializes a config and reports features the target format cannot represent (TS
/// `serializeLibgdxParticleDocument`).
pub fn serialize_libgdx_particle_document(
    config: &ParticleEmitterConfig,
    existing: Option<&LibgdxParticleDocument>,
    options: Option<&LibgdxSerializeOptions>,
) -> ParticleSerializeResult {
    return ParticleSerializeResult {
        text: serialize_libgdx_particle(config, existing, options),
        warnings: collect_libgdx_serialize_warnings(config),
    };
}

fn spawn_shape_string(shape: LibgdxSpawnShape) -> &'static str {
    return match shape {
        LibgdxSpawnShape::Point => "point",
        LibgdxSpawnShape::Line => "line",
        LibgdxSpawnShape::Square => "square",
        LibgdxSpawnShape::Ellipse => "ellipse",
    };
}

fn spawn_side_string(side: LibgdxSpawnSide) -> &'static str {
    return match side {
        LibgdxSpawnSide::Both => "both",
        LibgdxSpawnSide::Top => "top",
        LibgdxSpawnSide::Bottom => "bottom",
    };
}
