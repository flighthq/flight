//! libGDX 2D Particle Editor `.p` parsing (TS `libgdxParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_math::DEG_TO_RAD;
use flight_particles::{EmitterShape, ParticleEmitterConfig, create_particle_emitter_config};

use crate::text::parse_js_float;

/// A scalar range value (TS `LibgdxRangeValue`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxRangeValue {
    pub low_min: f32,
    pub low_max: f32,
    pub high_min: f32,
    pub high_max: f32,
    pub relative: bool,
    /// Scaling curve values (parallel to timeline).
    pub scaling: Vec<f32>,
    /// Timeline positions (0-1 normalized).
    pub timeline: Vec<f32>,
}

/// A range value carrying an `active` gate (TS `LibgdxActiveRangeValue`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxActiveRangeValue {
    pub active: bool,
    pub low_min: f32,
    pub low_max: f32,
    pub high_min: f32,
    pub high_max: f32,
    pub relative: bool,
    pub scaling: Vec<f32>,
    pub timeline: Vec<f32>,
}

/// The spawn shape (TS `shape: 'point' | 'line' | 'square' | 'ellipse'`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LibgdxSpawnShape {
    #[default]
    Point,
    Line,
    Square,
    Ellipse,
}

/// Which edge of the spawn shape emits (TS `side: 'both' | 'top' | 'bottom'`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LibgdxSpawnSide {
    #[default]
    Both,
    Top,
    Bottom,
}

/// The spawn shape block (TS `spawnShape`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxSpawnShapeValue {
    pub edges: bool,
    pub shape: LibgdxSpawnShape,
    pub side: LibgdxSpawnSide,
}

/// The tint block (TS `tint`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxTint {
    pub colors: Vec<String>,
    pub timeline: Vec<f32>,
}

/// Full libGDX particle emitter document (TS `LibgdxParticleDocument`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxParticleDocument {
    pub additive: bool,
    pub angle: LibgdxActiveRangeValue,
    pub delay: LibgdxActiveRangeValue,
    pub duration: LibgdxRangeValue,
    pub emission: LibgdxRangeValue,
    pub gravity: LibgdxActiveRangeValue,
    pub image_count: f32,
    pub image_path: String,
    pub life: LibgdxRangeValue,
    pub life_offset: LibgdxActiveRangeValue,
    pub max_particle_count: f32,
    pub min_particle_count: f32,
    pub name: String,
    pub premultiplied_alpha: bool,
    pub rotation: LibgdxActiveRangeValue,
    pub scale: LibgdxRangeValue,
    pub spawn_height: LibgdxRangeValue,
    pub spawn_shape: LibgdxSpawnShapeValue,
    pub spawn_width: LibgdxRangeValue,
    pub tint: LibgdxTint,
    pub transparency: LibgdxRangeValue,
    pub velocity: LibgdxActiveRangeValue,
    pub wind: LibgdxActiveRangeValue,
    pub x_offset: LibgdxActiveRangeValue,
    pub y_offset: LibgdxActiveRangeValue,
}

/// Parse options (TS `LibgdxParseOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LibgdxParseOptions {
    /// Texture side length used to normalize pixel sizes; defaults to 1.
    pub texture_size: Option<f32>,
}

/// Parse result carrying the full document (TS `LibgdxParseResult`).
pub struct LibgdxParseResult {
    pub config: ParticleEmitterConfig,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub document: LibgdxParticleDocument,
}

/// Parses a libGDX `.p` string directly to a config (TS `parseLibgdxParticle`).
#[derive(Default)]
struct LibgdxSection {
    entries: Vec<(String, String)>,
}

struct LibgdxSections {
    header: String,
    sections: Vec<(String, LibgdxSection)>,
}

fn active_range(range: &LibgdxActiveRangeValue) -> LibgdxRangeValue {
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

fn bool_key(section: &LibgdxSection, key: &str, default: bool) -> bool {
    return match section.get(key) {
        Some(value) => value == "true",
        None => default,
    };
}

fn clone_section(section: &LibgdxSection) -> LibgdxSection {
    return LibgdxSection {
        entries: section.entries.clone(),
    };
}

fn collect_libgdx_diagnostics(document: &LibgdxParticleDocument) -> Vec<ImportDiagnostic> {
    let mut diagnostics: Vec<ImportDiagnostic> = Vec::new();
    let mut report = |severity: ImportDiagnosticSeverity, kind: &str| {
        report_import_diagnostic(
            Some(&mut diagnostics),
            severity,
            kind,
            "collectLibgdxDiagnostics",
            None,
        );
    };
    if document.delay.active {
        report(ImportDiagnosticSeverity::Skip, "libgdx.delay-unsupported");
    }
    if document.life_offset.active {
        report(
            ImportDiagnosticSeverity::Skip,
            "libgdx.life-offset-unsupported",
        );
    }
    if document.x_offset.active || document.y_offset.active {
        report(
            ImportDiagnosticSeverity::Skip,
            "libgdx.position-offset-unsupported",
        );
    }
    if document.premultiplied_alpha {
        report(
            ImportDiagnosticSeverity::Skip,
            "libgdx.premultiplied-alpha-informational",
        );
    }
    if document.spawn_shape.shape == LibgdxSpawnShape::Line {
        report(
            ImportDiagnosticSeverity::Recover,
            "libgdx.line-shape-mapped-to-point",
        );
    }
    report(
        ImportDiagnosticSeverity::Recover,
        "libgdx.emission-unsupported",
    );
    if document.tint.colors.len() > 2 {
        report(ImportDiagnosticSeverity::Recover, "libgdx.tint-reduced");
    }
    if document.transparency.scaling.len() > 2 {
        report(
            ImportDiagnosticSeverity::Recover,
            "libgdx.transparency-reduced",
        );
    }
    if document.spawn_shape.edges || document.spawn_shape.side != LibgdxSpawnSide::Both {
        report(
            ImportDiagnosticSeverity::Skip,
            "libgdx.spawn-edges-unsupported",
        );
    }
    return diagnostics;
}

fn document_to_config(
    document: &LibgdxParticleDocument,
    texture_size: f32,
) -> ParticleEmitterConfig {
    let (life_min, life_max) = range_to_min_max(&document.life);
    let (velocity_min, velocity_max) = if document.velocity.active {
        range_to_min_max(&active_range(&document.velocity))
    } else {
        (0.0, 0.0)
    };
    let (angle_min, angle_max) = if document.angle.active {
        range_to_min_max(&active_range(&document.angle))
    } else {
        (0.0, 360.0)
    };
    let angle_mid = (angle_min + angle_max) * 0.5 * DEG_TO_RAD;
    let spread = (angle_max - angle_min) * 0.5 * DEG_TO_RAD;
    let (scale_min_px, scale_max_px) = range_to_min_max(&document.scale);
    let scale_min = scale_min_px / texture_size;
    let scale_max = scale_max_px / texture_size;
    let last_scaling = document.scale.scaling.last().copied().unwrap_or(1.0);
    let (wind_min, _) = if document.wind.active {
        range_to_min_max(&active_range(&document.wind))
    } else {
        (0.0, 0.0)
    };
    let (gravity_min, _) = if document.gravity.active {
        range_to_min_max(&active_range(&document.gravity))
    } else {
        (0.0, 0.0)
    };
    let (spawn_width_min, spawn_width_max) = range_to_min_max(&document.spawn_width);
    let (spawn_height_min, spawn_height_max) = range_to_min_max(&document.spawn_height);
    let spawn_width_mid = (spawn_width_min + spawn_width_max) * 0.5;
    let spawn_height_mid = (spawn_height_min + spawn_height_max) * 0.5;
    let mut emitter_shape = EmitterShape::Point;
    let mut emitter_radius = 0.0;
    let mut emitter_width = 0.0;
    let mut emitter_height = 0.0;
    match document.spawn_shape.shape {
        LibgdxSpawnShape::Ellipse => {
            if spawn_width_mid > 0.0 && spawn_width_mid == spawn_height_mid {
                emitter_shape = EmitterShape::Circle;
                emitter_radius = spawn_width_mid * 0.5;
            } else if spawn_width_mid > 0.0 || spawn_height_mid > 0.0 {
                emitter_shape = EmitterShape::Rect;
                emitter_width = spawn_width_mid;
                emitter_height = spawn_height_mid;
            }
        }
        LibgdxSpawnShape::Square => {
            emitter_shape = EmitterShape::Rect;
            emitter_width = spawn_width_mid;
            emitter_height = spawn_height_mid;
        }
        LibgdxSpawnShape::Point | LibgdxSpawnShape::Line => {}
    }
    let first_color = document
        .tint
        .colors
        .first()
        .cloned()
        .unwrap_or_else(|| String::from("ffffff"));
    let last_color = document
        .tint
        .colors
        .last()
        .cloned()
        .unwrap_or_else(|| String::from("ffffff"));
    let (start_r, start_g, start_b) = hex_to_rgb(&first_color);
    let (end_r, end_g, end_b) = hex_to_rgb(&last_color);
    let alpha_start = document
        .transparency
        .scaling
        .first()
        .copied()
        .unwrap_or(1.0);
    let alpha_end = document.transparency.scaling.last().copied().unwrap_or(0.0);
    let (duration_min, duration_max) = range_to_min_max(&document.duration);
    let duration_mid = (duration_min + duration_max) * 0.5;
    let (rotation_min, rotation_max) = if document.rotation.active {
        range_to_min_max(&active_range(&document.rotation))
    } else {
        (0.0, 0.0)
    };
    let lifetime_sum = life_min / 1000.0 + life_max / 1000.0;
    let lifetime_mid = if lifetime_sum * 0.5 != 0.0 {
        lifetime_sum * 0.5
    } else {
        1.0
    };
    let rotation_speed_min = (rotation_min * DEG_TO_RAD) / lifetime_mid;
    let rotation_speed_max = (rotation_max * DEG_TO_RAD) / lifetime_mid;
    let blend_mode = if document.additive { "add" } else { "normal" };
    let defaults = create_particle_emitter_config(None);
    return create_particle_emitter_config(Some(&ParticleEmitterConfig {
        alpha_end,
        alpha_start,
        blend_mode: Some(String::from(blend_mode)),
        color_end_b: end_b,
        color_end_g: end_g,
        color_end_r: end_r,
        color_start_b: start_b,
        color_start_g: start_g,
        color_start_r: start_r,
        direction_x: angle_mid.cos(),
        direction_y: -angle_mid.sin(),
        duration: if duration_mid > 0.0 {
            duration_mid / 1000.0
        } else {
            0.0
        },
        emitter_height,
        emitter_radius,
        emitter_shape,
        emitter_width,
        gravity_x: wind_min,
        gravity_y: gravity_min,
        lifetime_max: life_max / 1000.0,
        lifetime_min: (life_min / 1000.0).max(0.0),
        looping: duration_mid <= 0.0,
        max_particles: document.max_particle_count,
        rotation_speed_max,
        rotation_speed_min,
        scale_end: last_scaling,
        scale_max,
        scale_min,
        speed_max: velocity_max,
        speed_min: velocity_min,
        spread,
        ..defaults
    }));
}

fn hex_to_rgb(hex: &str) -> (f32, f32, f32) {
    let trimmed = hex.strip_prefix('#').unwrap_or(hex);
    let mut padded = String::from(trimmed);
    while padded.len() < 6 {
        padded.push('f');
    }
    let channel = |index: usize| -> f32 {
        let slice = &padded[index..index + 2];
        return match u8::from_str_radix(slice, 16) {
            Ok(value) => value as f32 / 255.0,
            Err(_) => 1.0,
        };
    };
    return (channel(0), channel(2), channel(4));
}

fn num_key(section: &LibgdxSection, key: &str, default: f32) -> f32 {
    return match section.get(key) {
        Some(value) => parse_js_float(value)
            .filter(|parsed| parsed.is_finite())
            .unwrap_or(default),
        None => default,
    };
}

pub fn parse_libgdx_particle(
    text: &str,
    options: Option<&LibgdxParseOptions>,
) -> ParticleEmitterConfig {
    if text.trim().is_empty() {
        panic!("Invalid libGDX particle: input is empty or not a string");
    }
    let sections = parse_libgdx_text(text);
    let document = sections_to_document(&sections);
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return document_to_config(&document, texture_size);
}

/// Parses a libGDX `.p` string and preserves the full document (TS
/// `parseLibgdxParticleDocument`).
pub fn parse_libgdx_particle_document(
    text: &str,
    options: Option<&LibgdxParseOptions>,
) -> LibgdxParseResult {
    if text.trim().is_empty() {
        panic!("Invalid libGDX particle: input is empty or not a string");
    }
    let sections = parse_libgdx_text(text);
    let document = sections_to_document(&sections);
    let texture_size = options
        .and_then(|options| options.texture_size)
        .unwrap_or(1.0);
    return LibgdxParseResult {
        config: document_to_config(&document, texture_size),
        diagnostics: collect_libgdx_diagnostics(&document),
        document,
    };
}

fn parse_libgdx_text(text: &str) -> LibgdxSections {
    let mut sections: Vec<(String, LibgdxSection)> = Vec::new();
    let mut current_section = String::new();
    let mut current = LibgdxSection::default();
    let mut header = String::new();
    for raw in text.split('\n') {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        match line.find(':') {
            None => {
                if !current_section.is_empty() || !current.entries.is_empty() {
                    set_section(&mut sections, current_section.clone(), current);
                }
                current_section = String::from(line);
                current = LibgdxSection::default();
                if header.is_empty() {
                    header = String::from(line);
                }
            }
            Some(colon) => {
                let key = line[..colon].trim();
                let value = line[colon + 1..].trim();
                current.set(String::from(key), String::from(value));
            }
        }
    }
    if !current_section.is_empty() || !current.entries.is_empty() {
        set_section(&mut sections, current_section, current);
    }
    return LibgdxSections { header, sections };
}

fn range_to_min_max(range: &LibgdxRangeValue) -> (f32, f32) {
    let low = (range.low_min + range.low_max) * 0.5;
    let high = (range.high_min + range.high_max) * 0.5;
    return (low.min(high), low.max(high));
}

fn read_active_range(section: &LibgdxSection, default_active: bool) -> LibgdxActiveRangeValue {
    let range = read_range(section, None);
    return LibgdxActiveRangeValue {
        active: bool_key(section, "active", default_active),
        high_max: range.high_max,
        high_min: range.high_min,
        low_max: range.low_max,
        low_min: range.low_min,
        relative: range.relative,
        scaling: range.scaling,
        timeline: range.timeline,
    };
}

fn read_range(section: &LibgdxSection, defaults: Option<&LibgdxRangeValue>) -> LibgdxRangeValue {
    let count = num_key(section, "scalingCount", 1.0) as i64;
    let mut scaling: Vec<f32> = Vec::new();
    let timeline_count = num_key(section, "timelineCount", 1.0) as i64;
    let mut timeline: Vec<f32> = Vec::new();
    for index in 0..count {
        scaling.push(num_key(section, &format!("scaling{}", index), 1.0));
    }
    for index in 0..timeline_count {
        let default = if index == 0 { 0.0 } else { 1.0 };
        timeline.push(num_key(section, &format!("timeline{}", index), default));
    }
    let default = defaults.cloned().unwrap_or_default();
    return LibgdxRangeValue {
        high_max: num_key(section, "highMax", default.high_max),
        high_min: num_key(section, "highMin", default.high_min),
        low_max: num_key(section, "lowMax", default.low_max),
        low_min: num_key(section, "lowMin", default.low_min),
        relative: bool_key(section, "relative", default.relative),
        scaling,
        timeline,
    };
}

fn sections_to_document(sections: &LibgdxSections) -> LibgdxParticleDocument {
    let emitter_key = sections
        .sections
        .iter()
        .map(|(key, _)| key)
        .find(|key| key.starts_with("- ") && key.ends_with(" -"))
        .cloned();
    let emitter_name = match &emitter_key {
        Some(key) => String::from(key[2..key.len() - 2].trim()),
        None => String::new(),
    };
    let empty = LibgdxSection::default();
    let root = emitter_key
        .as_ref()
        .and_then(|key| sections.get(key))
        .or_else(|| sections.get("Particle Effect"))
        .or_else(|| sections.get(""))
        .unwrap_or(&empty);
    let tint_section = sections.section("Tint");
    let mut tint_colors: Vec<String> = Vec::new();
    let raw_colors = tint_section
        .get("colors")
        .cloned()
        .unwrap_or_else(String::new);
    for color in raw_colors.split(',') {
        let trimmed = color.trim();
        if !trimmed.is_empty() {
            tint_colors.push(String::from(trimmed));
        }
    }
    if tint_colors.is_empty() {
        tint_colors.push(String::from("ffffff"));
    }
    let tint_timeline_count = {
        let count = num_key(&tint_section, "timelineCount", 1.0) as i64;
        if count == 0 { 1 } else { count }
    };
    let mut tint_timeline: Vec<f32> = Vec::new();
    for index in 0..tint_timeline_count {
        let default = if index == 0 { 0.0 } else { 1.0 };
        tint_timeline.push(num_key(
            &tint_section,
            &format!("timeline{}", index),
            default,
        ));
    }
    let spawn_shape_section = sections.section("Spawn Shape");
    let shape_value = spawn_shape_section
        .get("shape")
        .cloned()
        .unwrap_or_else(|| String::from("point"));
    let shape = match shape_value.as_str() {
        "line" => LibgdxSpawnShape::Line,
        "square" => LibgdxSpawnShape::Square,
        "ellipse" => LibgdxSpawnShape::Ellipse,
        _ => LibgdxSpawnShape::Point,
    };
    let side_value = spawn_shape_section
        .get("side")
        .cloned()
        .unwrap_or_else(|| String::from("both"));
    let side = match side_value.as_str() {
        "top" => LibgdxSpawnSide::Top,
        "bottom" => LibgdxSpawnSide::Bottom,
        _ => LibgdxSpawnSide::Both,
    };
    let duration_default = LibgdxRangeValue {
        high_max: 3000.0,
        high_min: 3000.0,
        low_max: 3000.0,
        low_min: 3000.0,
        relative: false,
        scaling: Vec::new(),
        timeline: Vec::new(),
    };
    let emission_default = LibgdxRangeValue {
        high_max: 64.0,
        high_min: 32.0,
        ..LibgdxRangeValue::default()
    };
    let life_default = LibgdxRangeValue {
        high_max: 1000.0,
        high_min: 1000.0,
        low_max: 1000.0,
        low_min: 1000.0,
        ..LibgdxRangeValue::default()
    };
    let scale_default = LibgdxRangeValue {
        high_max: 32.0,
        high_min: 32.0,
        ..LibgdxRangeValue::default()
    };
    let velocity_default = LibgdxRangeValue {
        high_max: 100.0,
        high_min: 100.0,
        ..LibgdxRangeValue::default()
    };
    let angle_default = LibgdxRangeValue {
        high_max: 360.0,
        high_min: 360.0,
        ..LibgdxRangeValue::default()
    };
    let transparency_default = LibgdxRangeValue {
        high_max: 1.0,
        high_min: 1.0,
        ..LibgdxRangeValue::default()
    };
    let duration_section = sections.section("Duration");
    let return_document = LibgdxParticleDocument {
        additive: bool_key(root, "additive", false),
        angle: {
            let section = sections.section("Angle");
            let range = read_range(&section, Some(&angle_default));
            LibgdxActiveRangeValue {
                active: bool_key(&section, "active", true),
                high_max: range.high_max,
                high_min: range.high_min,
                low_max: range.low_max,
                low_min: range.low_min,
                relative: range.relative,
                scaling: range.scaling,
                timeline: range.timeline,
            }
        },
        delay: read_active_range(&sections.section("Delay"), false),
        duration: read_range(&duration_section, Some(&duration_default)),
        emission: read_range(&sections.section("Emission"), Some(&emission_default)),
        gravity: read_active_range(&sections.section("Gravity"), false),
        image_count: num_key(root, "imageCount", 1.0),
        image_path: root.get("imagePath").cloned().unwrap_or_else(String::new),
        life: read_range(&sections.section("Life"), Some(&life_default)),
        life_offset: read_active_range(&sections.section("Life Offset"), false),
        max_particle_count: num_key(root, "maxParticleCount", 100.0),
        min_particle_count: num_key(root, "minParticleCount", 4.0),
        name: emitter_name,
        premultiplied_alpha: bool_key(root, "premultipliedAlpha", false),
        rotation: read_active_range(&sections.section("Rotation"), false),
        scale: read_range(&sections.section("Scale"), Some(&scale_default)),
        spawn_height: read_range(&sections.section("Spawn Height"), None),
        spawn_shape: LibgdxSpawnShapeValue {
            edges: bool_key(&spawn_shape_section, "edges", false),
            shape,
            side,
        },
        spawn_width: read_range(&sections.section("Spawn Width"), None),
        tint: LibgdxTint {
            colors: tint_colors,
            timeline: tint_timeline,
        },
        transparency: read_range(
            &sections.section("Transparency"),
            Some(&transparency_default),
        ),
        velocity: {
            let section = sections.section("Velocity");
            let range = read_range(&section, Some(&velocity_default));
            LibgdxActiveRangeValue {
                active: bool_key(&section, "active", true),
                high_max: range.high_max,
                high_min: range.high_min,
                low_max: range.low_max,
                low_min: range.low_min,
                relative: range.relative,
                scaling: range.scaling,
                timeline: range.timeline,
            }
        },
        wind: read_active_range(&sections.section("Wind"), false),
        x_offset: read_active_range(&sections.section("X Offset"), false),
        y_offset: read_active_range(&sections.section("Y Offset"), false),
    };
    return return_document;
}

fn set_section(sections: &mut Vec<(String, LibgdxSection)>, key: String, section: LibgdxSection) {
    if let Some((_, existing)) = sections.iter_mut().find(|(entry, _)| *entry == key) {
        *existing = section;
        return;
    }
    sections.push((key, section));
}

// flight-lint: allow(sugar-delegates) private ordered-section map helper; its accessors are internal plumbing, not contract sugar
impl LibgdxSections {
    fn get(&self, key: &str) -> Option<&LibgdxSection> {
        return self
            .sections
            .iter()
            .find(|(entry, _)| entry == key)
            .map(|(_, section)| section);
    }

    fn section(&self, key: &str) -> LibgdxSection {
        return match self.get(key) {
            Some(section) => clone_section(section),
            None => LibgdxSection::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) private ordered-section map helper; its accessors are internal plumbing, not contract sugar
impl LibgdxSection {
    fn get(&self, key: &str) -> Option<&String> {
        return self
            .entries
            .iter()
            .find(|(entry, _)| entry == key)
            .map(|(_, value)| value);
    }

    fn set(&mut self, key: String, value: String) {
        if let Some((_, existing)) = self.entries.iter_mut().find(|(entry, _)| *entry == key) {
            *existing = value;
            return;
        }
        self.entries.push((key, value));
    }
}
