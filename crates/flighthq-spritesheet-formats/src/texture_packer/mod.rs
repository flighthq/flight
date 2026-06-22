//! Texture Packer JSON format parser and serializer.
//!
//! Texture Packer exports sprite atlases as a JSON file in two variants:
//! - **Hash** variant: `frames` is a `{ "name": {...} }` dict.
//! - **Array** variant: `frames` is an array where each entry carries a
//!   `filename` field.
//!
//! Both variants are detected automatically at parse time. `frameTags` in the
//! `meta` section (when present) are converted to
//! [`SpritesheetAnimationData`] clips.
//!
//! Reference: <https://www.codeandweb.com/texturepacker/documentation/texture-settings>

pub mod schema;

use flighthq_spritesheet::{
    SpritesheetAnimationData, SpritesheetAnimationDirection, SpritesheetData, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_data, create_spritesheet_frame_data,
};

pub use schema::{
    TexturePackerArrayDocument, TexturePackerArrayFrame, TexturePackerDocument,
    TexturePackerFrameTag, TexturePackerHashDocument, TexturePackerHashFrame, TexturePackerMeta,
    TexturePackerPivot, TexturePackerRect, TexturePackerSize,
};

use crate::json::{JsonValue, parse_json};

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

/// Result of [`parse_texture_packer_spritesheet_document`]: the parsed data
/// plus the original document for round-trip serialisation.
#[derive(Clone, Debug)]
pub struct TexturePackerParsed {
    pub data: SpritesheetData,
    pub document: TexturePackerDocument,
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`serialize_texture_packer_spritesheet`].
#[derive(Clone, Debug, Default)]
pub struct TexturePackerSerializeOptions {
    /// Override the output variant. Defaults to the variant of `existing`, or
    /// `Hash` when no existing document is supplied.
    pub variant: Option<TexturePackerSerializeVariant>,
}

/// Texture Packer output format variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TexturePackerSerializeVariant {
    Array,
    Hash,
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Parses a Texture Packer JSON string directly to a [`SpritesheetData`].
///
/// Single-pass: no intermediate document object is allocated. Use
/// [`parse_texture_packer_spritesheet_document`] when you need round-trip
/// serialisation.
pub fn parse_texture_packer_spritesheet(json: &str) -> SpritesheetData {
    let value = parse_json(json).expect("invalid Texture Packer JSON");
    document_to_data(&parse_document(&value))
}

/// Parses a Texture Packer JSON string and preserves the full document for
/// round-trip serialisation via [`serialize_texture_packer_spritesheet`].
pub fn parse_texture_packer_spritesheet_document(json: &str) -> TexturePackerParsed {
    let value = parse_json(json).expect("invalid Texture Packer JSON");
    let document = parse_document(&value);
    TexturePackerParsed { data: document_to_data(&document), document }
}

/// Serialises a [`SpritesheetData`] to a Texture Packer JSON string.
///
/// Pass the `document` from [`parse_texture_packer_spritesheet_document`] to
/// preserve any fields that do not round-trip through the data (app name,
/// format string, scale). The output variant (hash vs. array) is inferred
/// from the existing document or overridden via `options.variant`.
pub fn serialize_texture_packer_spritesheet(
    data: &SpritesheetData,
    existing: Option<&TexturePackerDocument>,
    options: Option<&TexturePackerSerializeOptions>,
) -> String {
    let existing_is_array = matches!(existing, Some(TexturePackerDocument::Array(_)));
    let variant = options.and_then(|o| o.variant).unwrap_or(if existing_is_array {
        TexturePackerSerializeVariant::Array
    } else {
        TexturePackerSerializeVariant::Hash
    });

    let existing_meta = existing.map(document_meta);

    match variant {
        TexturePackerSerializeVariant::Array => {
            data_to_array_value(data, existing_meta).to_json_string()
        }
        TexturePackerSerializeVariant::Hash => {
            data_to_hash_value(data, existing_meta).to_json_string()
        }
    }
}

// ---------------------------------------------------------------------------
// Document → SpritesheetData
// ---------------------------------------------------------------------------

fn animations_from_frame_tags(
    tags: &[TexturePackerFrameTag],
    frame_names: &[String],
) -> Vec<SpritesheetAnimationData> {
    tags.iter()
        .map(|tag| {
            let from = tag.from as usize;
            let to = (tag.to as usize + 1).min(frame_names.len());
            let names = if from <= to { frame_names[from..to].to_vec() } else { Vec::new() };
            create_spritesheet_animation_data(SpritesheetAnimationData {
                direction: tag.direction,
                frame_duration: 100.0,
                frame_names: names,
                loop_: true,
                name: tag.name.clone(),
                ..Default::default()
            })
        })
        .collect()
}

fn document_meta(doc: &TexturePackerDocument) -> &TexturePackerMeta {
    match doc {
        TexturePackerDocument::Hash(h) => &h.meta,
        TexturePackerDocument::Array(a) => &a.meta,
    }
}

fn document_to_data(doc: &TexturePackerDocument) -> SpritesheetData {
    let mut frames: Vec<SpritesheetFrameData> = Vec::new();
    let mut frame_names: Vec<String> = Vec::new();

    match doc {
        TexturePackerDocument::Array(array) => {
            for entry in &array.frames {
                frames.push(frame_from_array_entry(entry));
                frame_names.push(entry.filename.clone());
            }
        }
        TexturePackerDocument::Hash(hash) => {
            for (name, entry) in &hash.frames {
                frames.push(frame_from_hash_entry(name, entry));
                frame_names.push(name.clone());
            }
        }
    }

    let meta = document_meta(doc);
    let animations = match &meta.frame_tags {
        Some(tags) => animations_from_frame_tags(tags, &frame_names),
        None => Vec::new(),
    };

    create_spritesheet_data(SpritesheetData {
        animations,
        frames,
        image_file: meta.image.clone(),
        image_height: meta.size.h as f32,
        image_width: meta.size.w as f32,
        scale: meta.scale,
    })
}

fn frame_data(
    name: &str,
    frame: &TexturePackerRect,
    sprite_source_size: &TexturePackerRect,
    source_size: &TexturePackerSize,
    pivot: Option<&TexturePackerPivot>,
    rotated: bool,
) -> SpritesheetFrameData {
    create_spritesheet_frame_data(SpritesheetFrameData {
        height: frame.h as f32,
        name: name.to_string(),
        offset_x: sprite_source_size.x as f32,
        offset_y: sprite_source_size.y as f32,
        pivot_x: pivot.map(|p| p.x),
        pivot_y: pivot.map(|p| p.y),
        rotated,
        source_height: source_size.h as f32,
        source_width: source_size.w as f32,
        width: frame.w as f32,
        x: frame.x as f32,
        y: frame.y as f32,
    })
}

fn frame_from_array_entry(entry: &TexturePackerArrayFrame) -> SpritesheetFrameData {
    frame_data(
        &entry.filename,
        &entry.frame,
        &entry.sprite_source_size,
        &entry.source_size,
        entry.pivot.as_ref(),
        entry.rotated,
    )
}

fn frame_from_hash_entry(name: &str, entry: &TexturePackerHashFrame) -> SpritesheetFrameData {
    frame_data(
        name,
        &entry.frame,
        &entry.sprite_source_size,
        &entry.source_size,
        entry.pivot.as_ref(),
        entry.rotated,
    )
}

// ---------------------------------------------------------------------------
// JSON → document
// ---------------------------------------------------------------------------

fn number_field(value: &JsonValue, key: &str) -> Option<f64> {
    value.get(key).and_then(JsonValue::as_number)
}

fn parse_direction(value: Option<&JsonValue>) -> SpritesheetAnimationDirection {
    match value.and_then(JsonValue::as_text) {
        Some("reverse") => SpritesheetAnimationDirection::Reverse,
        Some("pingpong") => SpritesheetAnimationDirection::Pingpong,
        Some("pingpong_reverse") => SpritesheetAnimationDirection::PingpongReverse,
        _ => SpritesheetAnimationDirection::Forward,
    }
}

fn parse_document(value: &JsonValue) -> TexturePackerDocument {
    let meta = parse_meta(value.get("meta"));
    match value.get("frames") {
        Some(JsonValue::Array(entries)) => {
            let frames = entries
                .iter()
                .map(|entry| TexturePackerArrayFrame {
                    filename: text_field(entry, "filename").unwrap_or_default(),
                    frame: parse_rect(entry.get("frame")),
                    pivot: parse_pivot(entry.get("pivot")),
                    rotated: entry.get("rotated").and_then(JsonValue::as_bool).unwrap_or(false),
                    source_size: parse_size(entry.get("sourceSize")),
                    sprite_source_size: parse_rect(entry.get("spriteSourceSize")),
                    trimmed: entry.get("trimmed").and_then(JsonValue::as_bool).unwrap_or(false),
                })
                .collect();
            TexturePackerDocument::Array(TexturePackerArrayDocument { frames, meta })
        }
        Some(JsonValue::Object(entries)) => {
            let frames = entries
                .iter()
                .map(|(name, entry)| (name.clone(), parse_hash_frame(entry)))
                .collect();
            TexturePackerDocument::Hash(TexturePackerHashDocument { frames, meta })
        }
        _ => TexturePackerDocument::Hash(TexturePackerHashDocument { frames: Vec::new(), meta }),
    }
}

fn parse_frame_tags(value: Option<&JsonValue>) -> Option<Vec<TexturePackerFrameTag>> {
    let JsonValue::Array(tags) = value? else { return None };
    Some(
        tags.iter()
            .map(|tag| TexturePackerFrameTag {
                direction: parse_direction(tag.get("direction")),
                from: number_field(tag, "from").unwrap_or(0.0) as u32,
                name: text_field(tag, "name").unwrap_or_default(),
                to: number_field(tag, "to").unwrap_or(0.0) as u32,
            })
            .collect(),
    )
}

fn parse_hash_frame(value: &JsonValue) -> TexturePackerHashFrame {
    TexturePackerHashFrame {
        frame: parse_rect(value.get("frame")),
        pivot: parse_pivot(value.get("pivot")),
        rotated: value.get("rotated").and_then(JsonValue::as_bool).unwrap_or(false),
        source_size: parse_size(value.get("sourceSize")),
        sprite_source_size: parse_rect(value.get("spriteSourceSize")),
        trimmed: value.get("trimmed").and_then(JsonValue::as_bool).unwrap_or(false),
    }
}

fn parse_meta(value: Option<&JsonValue>) -> TexturePackerMeta {
    let Some(value) = value else { return TexturePackerMeta::default() };
    let scale = match value.get("scale") {
        Some(JsonValue::Number(n)) => *n as f32,
        Some(JsonValue::Text(s)) => s.parse::<f32>().ok().filter(|v| *v != 0.0).unwrap_or(1.0),
        _ => 1.0,
    };
    TexturePackerMeta {
        app: text_field(value, "app")
            .unwrap_or_else(|| "https://www.codeandweb.com/texturepacker".to_string()),
        format: text_field(value, "format").unwrap_or_else(|| "RGBA8888".to_string()),
        frame_tags: parse_frame_tags(value.get("frameTags")),
        image: text_field(value, "image").unwrap_or_default(),
        scale,
        size: parse_size(value.get("size")),
        version: text_field(value, "version").unwrap_or_else(|| "1.0".to_string()),
    }
}

fn parse_pivot(value: Option<&JsonValue>) -> Option<TexturePackerPivot> {
    let value = value?;
    if !matches!(value, JsonValue::Object(_)) {
        return None;
    }
    Some(TexturePackerPivot {
        x: number_field(value, "x").unwrap_or(0.0) as f32,
        y: number_field(value, "y").unwrap_or(0.0) as f32,
    })
}

fn parse_rect(value: Option<&JsonValue>) -> TexturePackerRect {
    let Some(value) = value else { return TexturePackerRect::default() };
    TexturePackerRect {
        h: number_field(value, "h").unwrap_or(0.0) as u32,
        w: number_field(value, "w").unwrap_or(0.0) as u32,
        x: number_field(value, "x").unwrap_or(0.0) as u32,
        y: number_field(value, "y").unwrap_or(0.0) as u32,
    }
}

fn parse_size(value: Option<&JsonValue>) -> TexturePackerSize {
    let Some(value) = value else { return TexturePackerSize::default() };
    TexturePackerSize {
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

fn data_to_array_value(data: &SpritesheetData, existing: Option<&TexturePackerMeta>) -> JsonValue {
    let frames: Vec<JsonValue> = data
        .frames
        .iter()
        .map(|frame| {
            let mut obj = vec![("filename".to_string(), JsonValue::Text(frame.name.clone()))];
            if let JsonValue::Object(entry) = frame_to_value(frame) {
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

fn data_to_hash_value(data: &SpritesheetData, existing: Option<&TexturePackerMeta>) -> JsonValue {
    let frames: Vec<(String, JsonValue)> =
        data.frames.iter().map(|frame| (frame.name.clone(), frame_to_value(frame))).collect();
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

fn frame_to_value(frame: &SpritesheetFrameData) -> JsonValue {
    let trimmed = frame.offset_x != 0.0
        || frame.offset_y != 0.0
        || frame.source_width != frame.width
        || frame.source_height != frame.height;
    let mut entries =
        vec![("frame".to_string(), rect_value(frame.x, frame.y, frame.width, frame.height))];
    if let (Some(px), Some(py)) = (frame.pivot_x, frame.pivot_y) {
        entries.push((
            "pivot".to_string(),
            JsonValue::Object(vec![
                ("x".to_string(), JsonValue::Number(px as f64)),
                ("y".to_string(), JsonValue::Number(py as f64)),
            ]),
        ));
    }
    entries.push(("rotated".to_string(), JsonValue::Bool(frame.rotated)));
    entries.push(("sourceSize".to_string(), size_value(frame.source_width, frame.source_height)));
    entries.push((
        "spriteSourceSize".to_string(),
        rect_value(frame.offset_x, frame.offset_y, frame.width, frame.height),
    ));
    entries.push(("trimmed".to_string(), JsonValue::Bool(trimmed)));
    JsonValue::Object(entries)
}

fn meta_to_value(data: &SpritesheetData, existing: Option<&TexturePackerMeta>) -> JsonValue {
    let image = if !data.image_file.is_empty() {
        data.image_file.clone()
    } else {
        existing.map(|m| m.image.clone()).unwrap_or_default()
    };
    let scale =
        if data.scale != 1.0 { data.scale } else { existing.map(|m| m.scale).unwrap_or(1.0) };

    let mut entries = vec![
        (
            "app".to_string(),
            JsonValue::Text(
                existing
                    .map(|m| m.app.clone())
                    .unwrap_or_else(|| "https://www.codeandweb.com/texturepacker".to_string()),
            ),
        ),
        (
            "format".to_string(),
            JsonValue::Text(
                existing.map(|m| m.format.clone()).unwrap_or_else(|| "RGBA8888".to_string()),
            ),
        ),
    ];

    if !data.animations.is_empty() {
        let tags: Vec<JsonValue> = data
            .animations
            .iter()
            .map(|anim| {
                let first = anim.frame_names.first().map(String::as_str).unwrap_or("");
                let last = anim.frame_names.last().map(String::as_str).unwrap_or("");
                let from = data.frames.iter().position(|f| f.name == first).unwrap_or(0);
                let to = data.frames.iter().position(|f| f.name == last).unwrap_or(0);
                JsonValue::Object(vec![
                    (
                        "direction".to_string(),
                        JsonValue::Text(direction_text(anim.direction).to_string()),
                    ),
                    ("from".to_string(), JsonValue::Number(from as f64)),
                    ("name".to_string(), JsonValue::Text(anim.name.clone())),
                    ("to".to_string(), JsonValue::Number(to as f64)),
                ])
            })
            .collect();
        entries.push(("frameTags".to_string(), JsonValue::Array(tags)));
    }

    entries.push(("image".to_string(), JsonValue::Text(image)));
    entries.push(("scale".to_string(), JsonValue::Number(scale as f64)));
    entries.push(("size".to_string(), size_value(data.image_width, data.image_height)));
    entries.push((
        "version".to_string(),
        JsonValue::Text(existing.map(|m| m.version.clone()).unwrap_or_else(|| "1.0".to_string())),
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
        "hero/idle_0.png": { "frame": {"x":0,"y":0,"w":60,"h":56}, "rotated": false, "trimmed": true, "spriteSourceSize": {"x":2,"y":4,"w":60,"h":56}, "sourceSize": {"w":64,"h":64}, "pivot": {"x":0.5,"y":1.0} },
        "hero/idle_1.png": { "frame": {"x":60,"y":0,"w":60,"h":56}, "rotated": false, "trimmed": true, "spriteSourceSize": {"x":2,"y":4,"w":60,"h":56}, "sourceSize": {"w":64,"h":64}, "pivot": {"x":0.5,"y":1.0} },
        "fx/spark.png": { "frame": {"x":0,"y":56,"w":16,"h":16}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":16,"h":16}, "sourceSize": {"w":16,"h":16} }
      },
      "meta": {
        "app": "https://www.codeandweb.com/texturepacker", "version": "1.0", "image": "atlas.png", "format": "RGBA8888",
        "size": {"w":256,"h":128}, "scale": "2",
        "frameTags": [{ "name": "idle", "from": 0, "to": 1, "direction": "forward" }]
      }
    }"#;

    const ARRAY_JSON: &str = r#"{
      "frames": [
        { "filename": "hero/idle_0.png", "frame": {"x":0,"y":0,"w":60,"h":56}, "rotated": false, "trimmed": true, "spriteSourceSize": {"x":2,"y":4,"w":60,"h":56}, "sourceSize": {"w":64,"h":64}, "pivot": {"x":0.5,"y":1.0} },
        { "filename": "hero/run_0.png", "frame": {"x":60,"y":0,"w":32,"h":32}, "rotated": true, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":32,"h":32}, "sourceSize": {"w":32,"h":32} }
      ],
      "meta": {
        "app": "https://www.codeandweb.com/texturepacker", "version": "1.0", "image": "sprites.png", "format": "RGBA8888",
        "size": {"w":128,"h":64}, "scale": 1
      }
    }"#;

    const MINIMAL_HASH_JSON: &str = r#"{
      "frames": {
        "a.png": { "frame": {"x":0,"y":0,"w":10,"h":10}, "rotated": false, "trimmed": false, "spriteSourceSize": {"x":0,"y":0,"w":10,"h":10}, "sourceSize": {"w":10,"h":10} }
      },
      "meta": { "app": "tp", "version": "1.0", "image": "a.png", "format": "RGBA8888", "size": {"w":64,"h":64}, "scale": "1" }
    }"#;

    fn frame_named<'a>(data: &'a SpritesheetData, name: &str) -> &'a SpritesheetFrameData {
        data.frames.iter().find(|f| f.name == name).unwrap()
    }

    // parse_texture_packer_spritesheet

    #[test]
    fn parse_texture_packer_spritesheet_hash_variant() {
        let data = parse_texture_packer_spritesheet(HASH_JSON);
        assert_eq!(data.frames.len(), 3);
        let idle = frame_named(&data, "hero/idle_0.png");
        assert_eq!(idle.x, 0.0);
        assert_eq!(idle.y, 0.0);
        assert_eq!(idle.width, 60.0);
        assert_eq!(idle.height, 56.0);
        assert_eq!(idle.offset_x, 2.0);
        assert_eq!(idle.offset_y, 4.0);
        assert_eq!(idle.source_width, 64.0);
        assert_eq!(idle.source_height, 64.0);
        assert_eq!(idle.pivot_x, Some(0.5));
        assert_eq!(idle.pivot_y, Some(1.0));

        let spark = frame_named(&data, "fx/spark.png");
        assert_eq!(spark.pivot_x, None);
        assert_eq!(spark.pivot_y, None);
        assert_eq!(spark.offset_x, 0.0);
        assert_eq!(spark.offset_y, 0.0);

        assert_eq!(data.image_file, "atlas.png");
        assert_eq!(data.image_width, 256.0);
        assert_eq!(data.image_height, 128.0);
        assert_eq!(data.scale, 2.0);

        assert_eq!(data.animations.len(), 1);
        assert_eq!(data.animations[0].name, "idle");
        assert_eq!(data.animations[0].direction, SpritesheetAnimationDirection::Forward);
        assert_eq!(data.animations[0].frame_names, vec!["hero/idle_0.png", "hero/idle_1.png"]);
    }

    #[test]
    fn parse_texture_packer_spritesheet_array_variant() {
        let data = parse_texture_packer_spritesheet(ARRAY_JSON);
        assert_eq!(data.frames.len(), 2);
        assert_eq!(data.frames[0].name, "hero/idle_0.png");
        assert_eq!(data.frames[1].name, "hero/run_0.png");
        assert!(!data.frames[0].rotated);
        assert!(data.frames[1].rotated);
        assert_eq!(data.image_file, "sprites.png");
        assert_eq!(data.scale, 1.0);
        assert_eq!(data.animations.len(), 0);
    }

    #[test]
    fn parse_texture_packer_spritesheet_no_frame_tags_has_no_animations() {
        assert_eq!(parse_texture_packer_spritesheet(MINIMAL_HASH_JSON).animations.len(), 0);
    }

    // parse_texture_packer_spritesheet_document

    #[test]
    fn parse_texture_packer_spritesheet_document_preserves_document() {
        let parsed = parse_texture_packer_spritesheet_document(HASH_JSON);
        assert_eq!(parsed.data.frames.len(), 3);
        match &parsed.document {
            TexturePackerDocument::Hash(doc) => {
                assert!(doc.get("hero/idle_0.png").is_some());
                assert_eq!(doc.meta.app, "https://www.codeandweb.com/texturepacker");
                assert_eq!(doc.meta.version, "1.0");
                assert_eq!(doc.meta.format, "RGBA8888");
            }
            _ => panic!("expected hash document"),
        }

        let array_parsed = parse_texture_packer_spritesheet_document(ARRAY_JSON);
        assert!(matches!(array_parsed.document, TexturePackerDocument::Array(_)));
    }

    // serialize_texture_packer_spritesheet

    #[test]
    fn serialize_texture_packer_spritesheet_round_trips_hash() {
        let parsed = parse_texture_packer_spritesheet_document(HASH_JSON);
        let json = serialize_texture_packer_spritesheet(&parsed.data, Some(&parsed.document), None);
        let data2 = parse_texture_packer_spritesheet(&json);

        let mut names: Vec<&str> = data2.frames.iter().map(|f| f.name.as_str()).collect();
        let mut orig: Vec<&str> = parsed.data.frames.iter().map(|f| f.name.as_str()).collect();
        names.sort();
        orig.sort();
        assert_eq!(names, orig);

        assert_eq!(data2.image_file, parsed.data.image_file);
        assert_eq!(data2.image_width, parsed.data.image_width);
        assert_eq!(data2.image_height, parsed.data.image_height);

        let rt = frame_named(&data2, "hero/idle_0.png");
        let orig_frame = frame_named(&parsed.data, "hero/idle_0.png");
        assert_eq!(rt.x, orig_frame.x);
        assert_eq!(rt.y, orig_frame.y);
        assert_eq!(rt.width, orig_frame.width);
        assert_eq!(rt.height, orig_frame.height);
        assert_eq!(rt.pivot_x, Some(0.5));
        assert_eq!(rt.pivot_y, Some(1.0));

        assert_eq!(data2.animations.len(), parsed.data.animations.len());
        assert_eq!(data2.animations[0].name, parsed.data.animations[0].name);

        assert!(!parse_json(&json).unwrap().get("frames").unwrap().is_array());
    }

    #[test]
    fn serialize_texture_packer_spritesheet_round_trips_array() {
        let parsed = parse_texture_packer_spritesheet_document(ARRAY_JSON);
        let json = serialize_texture_packer_spritesheet(&parsed.data, Some(&parsed.document), None);
        assert!(parse_json(&json).unwrap().get("frames").unwrap().is_array());
    }

    #[test]
    fn serialize_texture_packer_spritesheet_variant_override() {
        let parsed = parse_texture_packer_spritesheet_document(HASH_JSON);
        let options =
            TexturePackerSerializeOptions { variant: Some(TexturePackerSerializeVariant::Array) };
        let json = serialize_texture_packer_spritesheet(
            &parsed.data,
            Some(&parsed.document),
            Some(&options),
        );
        assert!(parse_json(&json).unwrap().get("frames").unwrap().is_array());

        let minimal = parse_texture_packer_spritesheet(MINIMAL_HASH_JSON);
        assert!(parse_json(&serialize_texture_packer_spritesheet(&minimal, None, None)).is_ok());
    }
}
