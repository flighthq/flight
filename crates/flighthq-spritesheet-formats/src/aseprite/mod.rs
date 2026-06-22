//! Aseprite JSON export format parser and serializer.
//!
//! Aseprite can export its frames as a JSON file in two variants:
//! - **Hash** variant: `frames` is a `{ "name": {...} }` dict.
//! - **Array** variant: `frames` is an array where each entry carries a
//!   `filename` field.
//!
//! Both variants are detected automatically at parse time. `frameTags` in the
//! `meta` section are converted to [`SpritesheetAnimationData`] clips; per-
//! frame durations are preserved in [`SpritesheetAnimationData::frame_durations`]
//! when frames within a tag vary.
//!
//! Reference: <https://www.aseprite.org/docs/cli/#sheet-json>

pub mod schema;

use std::collections::HashMap;

use flighthq_spritesheet::{
    SpritesheetAnimationData, SpritesheetAnimationDirection, SpritesheetData, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_data, create_spritesheet_frame_data,
};

pub use schema::{
    AsepriteArrayDocument, AsepriteArrayFrame, AsepriteBaseFrame, AsepriteDocument,
    AsepriteFrameTag, AsepriteHashDocument, AsepriteHashFrame, AsepriteLayer, AsepriteMeta,
    AsepriteRect, AsepriteSize,
};

use crate::json::{JsonValue, format_json_number, parse_json};

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

/// Result of [`parse_aseprite_spritesheet_document`]: the parsed data plus the
/// original document for round-trip serialisation.
#[derive(Clone, Debug)]
pub struct AsepriteParsed {
    pub data: SpritesheetData,
    pub document: AsepriteDocument,
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`serialize_aseprite_spritesheet`].
#[derive(Clone, Debug, Default)]
pub struct AsepriteSerializeOptions {
    /// Override the output variant. Defaults to the variant of `existing`, or
    /// `Hash` when no existing document is supplied.
    pub variant: Option<AsepriteSerializeVariant>,
}

/// Aseprite output format variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AsepriteSerializeVariant {
    Array,
    Hash,
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Parses an Aseprite JSON string directly to a [`SpritesheetData`].
///
/// Single-pass: no intermediate document object is allocated. Use
/// [`parse_aseprite_spritesheet_document`] when you need round-trip
/// serialisation.
///
/// Per-frame durations are preserved in
/// [`SpritesheetAnimationData::frame_durations`] when frames within a tag have
/// varying durations.
pub fn parse_aseprite_spritesheet(json: &str) -> SpritesheetData {
    let value = parse_json(json).expect("invalid Aseprite JSON");
    document_to_data(&parse_document(&value))
}

/// Parses an Aseprite JSON string and preserves the full document for
/// round-trip serialisation via [`serialize_aseprite_spritesheet`].
pub fn parse_aseprite_spritesheet_document(json: &str) -> AsepriteParsed {
    let value = parse_json(json).expect("invalid Aseprite JSON");
    let document = parse_document(&value);
    AsepriteParsed { data: document_to_data(&document), document }
}

/// Serialises a [`SpritesheetData`] to an Aseprite JSON string.
///
/// Pass the `document` from [`parse_aseprite_spritesheet_document`] to
/// preserve fields that do not round-trip through the data (app name, layer
/// list, tag colours). Per-frame durations in
/// [`SpritesheetAnimationData::frame_durations`] are written back to each
/// frame's `duration` field so they survive a reload.
pub fn serialize_aseprite_spritesheet(
    data: &SpritesheetData,
    existing: Option<&AsepriteDocument>,
    options: Option<&AsepriteSerializeOptions>,
) -> String {
    let existing_is_array = matches!(existing, Some(AsepriteDocument::Array(_)));
    let variant = options.and_then(|o| o.variant).unwrap_or(if existing_is_array {
        AsepriteSerializeVariant::Array
    } else {
        AsepriteSerializeVariant::Hash
    });

    let existing_meta = existing.map(document_meta);

    match variant {
        AsepriteSerializeVariant::Array => data_to_array_value(data, existing_meta).to_json_string(),
        AsepriteSerializeVariant::Hash => data_to_hash_value(data, existing_meta).to_json_string(),
    }
}

// ---------------------------------------------------------------------------
// Document → SpritesheetData
// ---------------------------------------------------------------------------

fn animation_from_tag(
    tag: &AsepriteFrameTag,
    frame_names: &[String],
    duration_map: &HashMap<String, u32>,
) -> SpritesheetAnimationData {
    let from = tag.from as usize;
    let to = (tag.to as usize + 1).min(frame_names.len());
    let tag_frame_names: Vec<String> =
        if from <= to { frame_names[from..to].to_vec() } else { Vec::new() };

    let durations: Vec<f32> = tag_frame_names
        .iter()
        .map(|n| *duration_map.get(n).unwrap_or(&100) as f32)
        .collect();
    let first_duration = durations.first().copied().unwrap_or(100.0);
    let uniform = durations.iter().all(|&d| d == first_duration);

    create_spritesheet_animation_data(SpritesheetAnimationData {
        direction: tag.direction,
        frame_duration: first_duration,
        frame_durations: if uniform { None } else { Some(durations) },
        frame_names: tag_frame_names,
        loop_: true,
        name: tag.name.clone(),
        ..Default::default()
    })
}

fn document_meta(doc: &AsepriteDocument) -> &AsepriteMeta {
    match doc {
        AsepriteDocument::Hash(h) => &h.meta,
        AsepriteDocument::Array(a) => &a.meta,
    }
}

fn document_to_data(doc: &AsepriteDocument) -> SpritesheetData {
    let mut frames: Vec<SpritesheetFrameData> = Vec::new();
    let mut frame_names: Vec<String> = Vec::new();
    let mut duration_map: HashMap<String, u32> = HashMap::new();

    match doc {
        AsepriteDocument::Array(array) => {
            for entry in &array.frames {
                frames.push(frame_from_entry(&entry.filename, &entry.base));
                frame_names.push(entry.filename.clone());
                duration_map.insert(entry.filename.clone(), entry.base.duration);
            }
        }
        AsepriteDocument::Hash(hash) => {
            for (name, entry) in &hash.frames {
                frames.push(frame_from_entry(name, entry));
                frame_names.push(name.clone());
                duration_map.insert(name.clone(), entry.duration);
            }
        }
    }

    let meta = document_meta(doc);
    let animations: Vec<SpritesheetAnimationData> = if meta.frame_tags.is_empty() {
        Vec::new()
    } else {
        meta.frame_tags
            .iter()
            .map(|tag| animation_from_tag(tag, &frame_names, &duration_map))
            .collect()
    };

    create_spritesheet_data(SpritesheetData {
        animations,
        frames,
        image_file: meta.image.clone(),
        image_height: meta.size.h as f32,
        image_width: meta.size.w as f32,
        scale: meta_scale(meta),
    })
}

fn frame_from_entry(name: &str, entry: &AsepriteBaseFrame) -> SpritesheetFrameData {
    create_spritesheet_frame_data(SpritesheetFrameData {
        height: entry.frame.h as f32,
        name: name.to_string(),
        offset_x: entry.sprite_source_size.x as f32,
        offset_y: entry.sprite_source_size.y as f32,
        pivot_x: None,
        pivot_y: None,
        rotated: entry.rotated,
        source_height: entry.source_size.h as f32,
        source_width: entry.source_size.w as f32,
        width: entry.frame.w as f32,
        x: entry.frame.x as f32,
        y: entry.frame.y as f32,
    })
}

fn meta_scale(meta: &AsepriteMeta) -> f32 {
    meta.scale.parse::<f32>().ok().filter(|v| *v != 0.0).unwrap_or(1.0)
}

// ---------------------------------------------------------------------------
// JSON → document
// ---------------------------------------------------------------------------

fn number_field(value: &JsonValue, key: &str) -> Option<f64> {
    value.get(key).and_then(JsonValue::as_number)
}

fn parse_base_frame(value: &JsonValue) -> AsepriteBaseFrame {
    AsepriteBaseFrame {
        duration: number_field(value, "duration").unwrap_or(0.0) as u32,
        frame: parse_rect(value.get("frame")),
        rotated: value.get("rotated").and_then(JsonValue::as_bool).unwrap_or(false),
        source_size: parse_size(value.get("sourceSize")),
        sprite_source_size: parse_rect(value.get("spriteSourceSize")),
        trimmed: value.get("trimmed").and_then(JsonValue::as_bool).unwrap_or(false),
    }
}

fn parse_direction(value: Option<&JsonValue>) -> SpritesheetAnimationDirection {
    match value.and_then(JsonValue::as_text) {
        Some("reverse") => SpritesheetAnimationDirection::Reverse,
        Some("pingpong") => SpritesheetAnimationDirection::Pingpong,
        Some("pingpong_reverse") => SpritesheetAnimationDirection::PingpongReverse,
        _ => SpritesheetAnimationDirection::Forward,
    }
}

fn parse_document(value: &JsonValue) -> AsepriteDocument {
    let meta = parse_meta(value.get("meta"));
    match value.get("frames") {
        Some(JsonValue::Array(entries)) => {
            let frames = entries
                .iter()
                .map(|entry| AsepriteArrayFrame {
                    filename: text_field(entry, "filename").unwrap_or_default(),
                    base: parse_base_frame(entry),
                })
                .collect();
            AsepriteDocument::Array(AsepriteArrayDocument { frames, meta })
        }
        Some(JsonValue::Object(entries)) => {
            let frames =
                entries.iter().map(|(name, entry)| (name.clone(), parse_base_frame(entry))).collect();
            AsepriteDocument::Hash(AsepriteHashDocument { frames, meta })
        }
        _ => AsepriteDocument::Hash(AsepriteHashDocument { frames: Vec::new(), meta }),
    }
}

fn parse_frame_tags(value: Option<&JsonValue>) -> Vec<AsepriteFrameTag> {
    let Some(JsonValue::Array(tags)) = value else { return Vec::new() };
    tags.iter()
        .map(|tag| AsepriteFrameTag {
            direction: parse_direction(tag.get("direction")),
            from: number_field(tag, "from").unwrap_or(0.0) as u32,
            name: text_field(tag, "name").unwrap_or_default(),
            to: number_field(tag, "to").unwrap_or(0.0) as u32,
            color: text_field(tag, "color"),
        })
        .collect()
}

fn parse_layers(value: Option<&JsonValue>) -> Option<Vec<AsepriteLayer>> {
    let JsonValue::Array(layers) = value? else { return None };
    Some(
        layers
            .iter()
            .map(|layer| AsepriteLayer {
                blend_mode: text_field(layer, "blendMode").unwrap_or_default(),
                name: text_field(layer, "name").unwrap_or_default(),
                opacity: number_field(layer, "opacity").unwrap_or(0.0) as u8,
            })
            .collect(),
    )
}

fn parse_meta(value: Option<&JsonValue>) -> AsepriteMeta {
    let Some(value) = value else { return AsepriteMeta::default() };
    let scale = match value.get("scale") {
        Some(JsonValue::Text(s)) => s.clone(),
        Some(JsonValue::Number(n)) => format_json_number(*n),
        _ => "1".to_string(),
    };
    AsepriteMeta {
        app: text_field(value, "app").unwrap_or_else(|| "https://www.aseprite.org/".to_string()),
        format: text_field(value, "format").unwrap_or_else(|| "RGBA8888".to_string()),
        frame_tags: parse_frame_tags(value.get("frameTags")),
        image: text_field(value, "image").unwrap_or_default(),
        layers: parse_layers(value.get("layers")),
        scale,
        size: parse_size(value.get("size")),
        version: text_field(value, "version").unwrap_or_else(|| "1.3".to_string()),
    }
}

fn parse_rect(value: Option<&JsonValue>) -> AsepriteRect {
    let Some(value) = value else { return AsepriteRect::default() };
    AsepriteRect {
        h: number_field(value, "h").unwrap_or(0.0) as u32,
        w: number_field(value, "w").unwrap_or(0.0) as u32,
        x: number_field(value, "x").unwrap_or(0.0) as u32,
        y: number_field(value, "y").unwrap_or(0.0) as u32,
    }
}

fn parse_size(value: Option<&JsonValue>) -> AsepriteSize {
    let Some(value) = value else { return AsepriteSize::default() };
    AsepriteSize {
        h: number_field(value, "h").unwrap_or(0.0) as u32,
        w: number_field(value, "w").unwrap_or(0.0) as u32,
    }
}

fn text_field(value: &JsonValue, key: &str) -> Option<String> {
    value.get(key).and_then(JsonValue::as_text).map(str::to_string)
}

// ---------------------------------------------------------------------------
// SpritesheetData → JSON (serialize)
// ---------------------------------------------------------------------------

fn data_to_array_value(data: &SpritesheetData, existing: Option<&AsepriteMeta>) -> JsonValue {
    let frames: Vec<JsonValue> = data
        .frames
        .iter()
        .map(|frame| {
            let mut obj = vec![("filename".to_string(), JsonValue::Text(frame.name.clone()))];
            if let JsonValue::Object(entry) =
                frame_to_value(frame, resolve_frame_duration(data, &frame.name))
            {
                obj.extend(entry);
            }
            JsonValue::Object(obj)
        })
        .collect();
    JsonValue::Object(vec![
        ("frames".to_string(), JsonValue::Array(frames)),
        ("meta".to_string(), meta_to_value(data, existing)),
    ])
}

fn data_to_hash_value(data: &SpritesheetData, existing: Option<&AsepriteMeta>) -> JsonValue {
    let frames: Vec<(String, JsonValue)> = data
        .frames
        .iter()
        .map(|frame| {
            (frame.name.clone(), frame_to_value(frame, resolve_frame_duration(data, &frame.name)))
        })
        .collect();
    JsonValue::Object(vec![
        ("frames".to_string(), JsonValue::Object(frames)),
        ("meta".to_string(), meta_to_value(data, existing)),
    ])
}

fn direction_text(direction: SpritesheetAnimationDirection) -> &'static str {
    match direction {
        SpritesheetAnimationDirection::Forward => "forward",
        SpritesheetAnimationDirection::Pingpong => "pingpong",
        SpritesheetAnimationDirection::PingpongReverse => "pingpong_reverse",
        SpritesheetAnimationDirection::Reverse => "reverse",
    }
}

fn frame_to_value(frame: &SpritesheetFrameData, duration_ms: f32) -> JsonValue {
    let trimmed = frame.offset_x != 0.0
        || frame.offset_y != 0.0
        || frame.source_width != frame.width
        || frame.source_height != frame.height;
    JsonValue::Object(vec![
        ("duration".to_string(), JsonValue::Number(duration_ms as f64)),
        ("frame".to_string(), rect_value(frame.x, frame.y, frame.width, frame.height)),
        ("rotated".to_string(), JsonValue::Bool(frame.rotated)),
        ("sourceSize".to_string(), size_value(frame.source_width, frame.source_height)),
        (
            "spriteSourceSize".to_string(),
            rect_value(frame.offset_x, frame.offset_y, frame.width, frame.height),
        ),
        ("trimmed".to_string(), JsonValue::Bool(trimmed)),
    ])
}

fn meta_to_value(data: &SpritesheetData, existing: Option<&AsepriteMeta>) -> JsonValue {
    let tags: Vec<JsonValue> = data
        .animations
        .iter()
        .enumerate()
        .map(|(i, anim)| {
            let first = anim.frame_names.first().map(String::as_str).unwrap_or("");
            let last = anim.frame_names.last().map(String::as_str).unwrap_or("");
            let from = data.frames.iter().position(|f| f.name == first).unwrap_or(0);
            let to = data.frames.iter().position(|f| f.name == last).unwrap_or(0);
            let mut entry = vec![
                (
                    "direction".to_string(),
                    JsonValue::Text(direction_text(anim.direction).to_string()),
                ),
                ("from".to_string(), JsonValue::Number(from as f64)),
                ("name".to_string(), JsonValue::Text(anim.name.clone())),
                ("to".to_string(), JsonValue::Number(to as f64)),
            ];
            if let Some(color) =
                existing.and_then(|m| m.frame_tags.get(i)).and_then(|t| t.color.clone())
            {
                entry.push(("color".to_string(), JsonValue::Text(color)));
            }
            JsonValue::Object(entry)
        })
        .collect();

    let image = if !data.image_file.is_empty() {
        data.image_file.clone()
    } else {
        existing.map(|m| m.image.clone()).unwrap_or_default()
    };
    let scale = if data.scale != 1.0 {
        format_json_number(data.scale as f64)
    } else {
        existing.map(|m| m.scale.clone()).unwrap_or_else(|| "1".to_string())
    };

    let mut entries = vec![
        (
            "app".to_string(),
            JsonValue::Text(
                existing
                    .map(|m| m.app.clone())
                    .unwrap_or_else(|| "https://www.aseprite.org/".to_string()),
            ),
        ),
        (
            "format".to_string(),
            JsonValue::Text(
                existing.map(|m| m.format.clone()).unwrap_or_else(|| "RGBA8888".to_string()),
            ),
        ),
        ("frameTags".to_string(), JsonValue::Array(tags)),
        ("image".to_string(), JsonValue::Text(image)),
    ];

    if let Some(layers) = existing.and_then(|m| m.layers.as_ref()) {
        let values: Vec<JsonValue> = layers
            .iter()
            .map(|layer| {
                JsonValue::Object(vec![
                    ("blendMode".to_string(), JsonValue::Text(layer.blend_mode.clone())),
                    ("name".to_string(), JsonValue::Text(layer.name.clone())),
                    ("opacity".to_string(), JsonValue::Number(layer.opacity as f64)),
                ])
            })
            .collect();
        entries.push(("layers".to_string(), JsonValue::Array(values)));
    }

    entries.push(("scale".to_string(), JsonValue::Text(scale)));
    entries.push(("size".to_string(), size_value(data.image_width, data.image_height)));
    entries.push((
        "version".to_string(),
        JsonValue::Text(existing.map(|m| m.version.clone()).unwrap_or_else(|| "1.3".to_string())),
    ));

    JsonValue::Object(entries)
}

fn rect_value(x: f32, y: f32, w: f32, h: f32) -> JsonValue {
    JsonValue::Object(vec![
        ("h".to_string(), JsonValue::Number(h as f64)),
        ("w".to_string(), JsonValue::Number(w as f64)),
        ("x".to_string(), JsonValue::Number(x as f64)),
        ("y".to_string(), JsonValue::Number(y as f64)),
    ])
}

fn resolve_frame_duration(data: &SpritesheetData, frame_name: &str) -> f32 {
    for anim in &data.animations {
        let Some(idx) = anim.frame_names.iter().position(|n| n == frame_name) else { continue };
        return match &anim.frame_durations {
            Some(durations) => durations.get(idx).copied().unwrap_or(anim.frame_duration),
            None => anim.frame_duration,
        };
    }
    100.0
}

fn size_value(w: f32, h: f32) -> JsonValue {
    JsonValue::Object(vec![
        ("h".to_string(), JsonValue::Number(h as f64)),
        ("w".to_string(), JsonValue::Number(w as f64)),
    ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const HASH_JSON: &str = r#"{
      "frames": {
        "sprite 0.aseprite": { "frame": {"x":0,"y":0,"w":32,"h":32}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":32,"h":32}, "sourceSize": {"w":32,"h":32}, "duration": 100 },
        "sprite 1.aseprite": { "frame": {"x":32,"y":0,"w":32,"h":32}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":32,"h":32}, "sourceSize": {"w":32,"h":32}, "duration": 150 },
        "sprite 2.aseprite": { "frame": {"x":64,"y":0,"w":30,"h":28}, "rotated": false, "trimmed": true, "spriteSourceSize": {"x":1,"y":2,"w":30,"h":28}, "sourceSize": {"w":32,"h":32}, "duration": 200 },
        "sprite 3.aseprite": { "frame": {"x":96,"y":0,"w":32,"h":32}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":32,"h":32}, "sourceSize": {"w":32,"h":32}, "duration": 100 }
      },
      "meta": {
        "app": "https://www.aseprite.org/", "version": "1.3", "image": "sprite.png", "format": "RGBA8888",
        "size": {"w":128,"h":32}, "scale": "1",
        "frameTags": [
          { "name": "run", "from": 0, "to": 1, "direction": "forward" },
          { "name": "jump", "from": 2, "to": 3, "direction": "reverse" }
        ],
        "layers": [{ "name": "Layer 1", "opacity": 255, "blendMode": "normal" }]
      }
    }"#;

    const ARRAY_JSON: &str = r#"{
      "frames": [
        { "filename": "anim 0.aseprite", "frame": {"x":0,"y":0,"w":16,"h":16}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":16,"h":16}, "sourceSize": {"w":16,"h":16}, "duration": 80 },
        { "filename": "anim 1.aseprite", "frame": {"x":16,"y":0,"w":16,"h":16}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":16,"h":16}, "sourceSize": {"w":16,"h":16}, "duration": 80 }
      ],
      "meta": {
        "app": "https://www.aseprite.org/", "version": "1.3", "image": "anim.png", "format": "RGBA8888",
        "size": {"w":32,"h":16}, "scale": "1",
        "frameTags": [{ "name": "idle", "from": 0, "to": 1, "direction": "pingpong" }]
      }
    }"#;

    const NO_TAGS_JSON: &str = r#"{
      "frames": {
        "solo 0.aseprite": { "frame": {"x":0,"y":0,"w":8,"h":8}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":8,"h":8}, "sourceSize": {"w":8,"h":8}, "duration": 100 }
      },
      "meta": {
        "app": "https://www.aseprite.org/", "version": "1.3", "image": "solo.png", "format": "RGBA8888",
        "size": {"w":8,"h":8}, "scale": "1", "frameTags": []
      }
    }"#;

    fn frame_named<'a>(data: &'a SpritesheetData, name: &str) -> &'a SpritesheetFrameData {
        data.frames.iter().find(|f| f.name == name).unwrap()
    }

    // parse_aseprite_spritesheet

    #[test]
    fn parse_aseprite_spritesheet_hash_variant() {
        let data = parse_aseprite_spritesheet(HASH_JSON);
        assert_eq!(data.frames.len(), 4);
        assert_eq!(data.frames[0].name, "sprite 0.aseprite");
        assert_eq!(data.frames[2].name, "sprite 2.aseprite");
        assert_eq!(data.frames[0].x, 0.0);
        assert_eq!(data.frames[0].width, 32.0);
        let trimmed = frame_named(&data, "sprite 2.aseprite");
        assert_eq!(trimmed.offset_x, 1.0);
        assert_eq!(trimmed.offset_y, 2.0);
        assert_eq!(trimmed.source_width, 32.0);
        assert_eq!(trimmed.source_height, 32.0);
        assert_eq!(data.frames[0].pivot_x, None);
        assert_eq!(data.frames[0].pivot_y, None);
        assert_eq!(data.image_file, "sprite.png");
        assert_eq!(data.image_width, 128.0);
        assert_eq!(data.image_height, 32.0);

        assert_eq!(data.animations.len(), 2);
        assert_eq!(data.animations[0].name, "run");
        assert_eq!(data.animations[1].name, "jump");
        assert_eq!(data.animations[0].direction, SpritesheetAnimationDirection::Forward);
        assert_eq!(data.animations[1].direction, SpritesheetAnimationDirection::Reverse);
        assert_eq!(data.animations[0].frame_names, vec!["sprite 0.aseprite", "sprite 1.aseprite"]);
        assert_eq!(data.animations[1].frame_names, vec!["sprite 2.aseprite", "sprite 3.aseprite"]);
        assert_eq!(data.animations[0].frame_durations, Some(vec![100.0, 150.0]));
        assert_eq!(data.animations[0].frame_duration, 100.0);
    }

    #[test]
    fn parse_aseprite_spritesheet_array_variant() {
        let data = parse_aseprite_spritesheet(ARRAY_JSON);
        assert_eq!(data.frames.len(), 2);
        assert_eq!(data.frames[0].name, "anim 0.aseprite");
        assert_eq!(data.frames[1].name, "anim 1.aseprite");
        let idle = &data.animations[0];
        assert_eq!(idle.frame_durations, None);
        assert_eq!(idle.frame_duration, 80.0);
        assert_eq!(idle.direction, SpritesheetAnimationDirection::Pingpong);
    }

    #[test]
    fn parse_aseprite_spritesheet_no_tags_has_no_animations() {
        assert_eq!(parse_aseprite_spritesheet(NO_TAGS_JSON).animations.len(), 0);
    }

    // parse_aseprite_spritesheet_document

    #[test]
    fn parse_aseprite_spritesheet_document_preserves_document() {
        let parsed = parse_aseprite_spritesheet_document(HASH_JSON);
        assert_eq!(parsed.data.frames.len(), 4);
        match &parsed.document {
            AsepriteDocument::Hash(doc) => {
                assert!(doc.get("sprite 0.aseprite").is_some());
                assert_eq!(doc.meta.layers.as_ref().unwrap().len(), 1);
                assert_eq!(doc.meta.layers.as_ref().unwrap()[0].name, "Layer 1");
            }
            _ => panic!("expected hash document"),
        }

        let array_parsed = parse_aseprite_spritesheet_document(ARRAY_JSON);
        assert!(matches!(array_parsed.document, AsepriteDocument::Array(_)));
    }

    // serialize_aseprite_spritesheet

    #[test]
    fn serialize_aseprite_spritesheet_round_trips_hash() {
        let parsed = parse_aseprite_spritesheet_document(HASH_JSON);
        let json = serialize_aseprite_spritesheet(&parsed.data, Some(&parsed.document), None);
        let data2 = parse_aseprite_spritesheet(&json);

        let names: Vec<&str> = data2.frames.iter().map(|f| f.name.as_str()).collect();
        let orig_names: Vec<&str> = parsed.data.frames.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, orig_names);
        assert_eq!(data2.frames[0].x, parsed.data.frames[0].x);
        assert_eq!(frame_named(&data2, "sprite 2.aseprite").offset_x, 1.0);
        assert_eq!(data2.animations[0].frame_durations, Some(vec![100.0, 150.0]));
        assert_eq!(data2.animations[1].name, "jump");
        assert_eq!(data2.animations[1].direction, SpritesheetAnimationDirection::Reverse);

        let doc2 = parse_aseprite_spritesheet_document(&json);
        match &doc2.document {
            AsepriteDocument::Hash(d) => assert_eq!(d.meta.layers.as_ref().unwrap().len(), 1),
            _ => panic!("expected hash"),
        }
    }

    #[test]
    fn serialize_aseprite_spritesheet_round_trips_array() {
        let parsed = parse_aseprite_spritesheet_document(ARRAY_JSON);
        let json = serialize_aseprite_spritesheet(&parsed.data, Some(&parsed.document), None);
        let value = parse_json(&json).unwrap();
        assert!(value.get("frames").unwrap().is_array());

        let data2 = parse_aseprite_spritesheet(&json);
        assert_eq!(data2.animations[0].frame_durations, None);
        assert_eq!(data2.animations[0].frame_duration, 80.0);
    }

    #[test]
    fn serialize_aseprite_spritesheet_variant_override() {
        let parsed = parse_aseprite_spritesheet_document(HASH_JSON);
        let options = AsepriteSerializeOptions { variant: Some(AsepriteSerializeVariant::Array) };
        let json =
            serialize_aseprite_spritesheet(&parsed.data, Some(&parsed.document), Some(&options));
        assert!(parse_json(&json).unwrap().get("frames").unwrap().is_array());

        let no_existing = serialize_aseprite_spritesheet(&parsed.data, None, None);
        assert!(!parse_json(&no_existing).unwrap().get("frames").unwrap().is_array());

        let solo = parse_aseprite_spritesheet(NO_TAGS_JSON);
        assert!(parse_json(&serialize_aseprite_spritesheet(&solo, None, None)).is_ok());
    }
}
