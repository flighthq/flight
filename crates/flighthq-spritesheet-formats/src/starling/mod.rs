//! Starling / Sparrow XML atlas format parser and serializer.
//!
//! This is the same format used by OpenFL's `AssetType.IMAGE` texture atlas
//! support and is commonly exported by Texture Packer (Starling / Sparrow XML
//! preset). The XML has a single `<TextureAtlas imagePath="...">` root element
//! with `<SubTexture .../>` children.
//!
//! Animations are inferred from the standard `baseName_NNN` frame-naming
//! convention: runs of frames sharing a common base name and consecutive
//! numeric suffix are grouped into a single animation clip.
//!
//! Reference: <https://doc.starling-framework.org/current/starling/textures/TextureAtlas.html>

pub mod schema;

use flighthq_spritesheet::{
    SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_data, create_spritesheet_frame_data,
};

pub use schema::{StarlingDocument, StarlingSubTexture};

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

/// Result of [`parse_starling_spritesheet_document`]: the parsed data plus the
/// original document for round-trip serialisation.
#[derive(Clone, Debug)]
pub struct StarlingParsed {
    pub data: SpritesheetData,
    pub document: StarlingDocument,
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`parse_starling_spritesheet`] and
/// [`parse_starling_spritesheet_document`].
#[derive(Clone, Debug)]
pub struct StarlingParseOptions {
    /// Default duration (ms) per frame when building inferred animations.
    /// Defaults to `100`.
    pub frame_duration: f32,
}

impl Default for StarlingParseOptions {
    fn default() -> Self {
        Self {
            frame_duration: 100.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Parses a Starling / Sparrow XML atlas string directly to a
/// [`SpritesheetData`].
///
/// Single-pass: no intermediate document object is allocated. Animations are
/// inferred from the `baseName_NNN` frame-naming convention. Use
/// [`parse_starling_spritesheet_document`] when you need round-trip
/// serialisation.
pub fn parse_starling_spritesheet(
    xml: &str,
    options: Option<&StarlingParseOptions>,
) -> SpritesheetData {
    let frame_duration = options.map(|o| o.frame_duration).unwrap_or(100.0);
    document_to_data(&parse_starling_xml(xml), frame_duration)
}

/// Parses a Starling / Sparrow XML atlas string and preserves the full
/// document for round-trip serialisation via [`serialize_starling_spritesheet`].
pub fn parse_starling_spritesheet_document(
    xml: &str,
    options: Option<&StarlingParseOptions>,
) -> StarlingParsed {
    let frame_duration = options.map(|o| o.frame_duration).unwrap_or(100.0);
    let document = parse_starling_xml(xml);
    StarlingParsed {
        data: document_to_data(&document, frame_duration),
        document,
    }
}

/// Serialises a [`SpritesheetData`] to a Starling / Sparrow XML atlas string.
///
/// Pass the `document` from [`parse_starling_spritesheet_document`] to
/// preserve any fields that do not round-trip through the data (pivot values
/// stored in the document).
pub fn serialize_starling_spritesheet(
    data: &SpritesheetData,
    existing: Option<&StarlingDocument>,
) -> String {
    let image_path = if !data.image_file.is_empty() {
        data.image_file.clone()
    } else {
        existing.map(|d| d.image_path.clone()).unwrap_or_default()
    };
    let doc = StarlingDocument {
        image_path,
        sub_textures: data.frames.iter().map(frame_to_sub_texture).collect(),
    };
    document_to_xml(&doc)
}

// ---------------------------------------------------------------------------
// Document → SpritesheetData
// ---------------------------------------------------------------------------

fn document_to_data(doc: &StarlingDocument, frame_duration: f32) -> SpritesheetData {
    let frames: Vec<SpritesheetFrameData> =
        doc.sub_textures.iter().map(sub_texture_to_frame).collect();
    let frame_names: Vec<String> = frames.iter().map(|f| f.name.clone()).collect();
    let animations = infer_animations(&frame_names, frame_duration);

    create_spritesheet_data(SpritesheetData {
        animations,
        frames,
        image_file: doc.image_path.clone(),
        image_height: 0.0,
        image_width: 0.0,
        scale: 1.0,
    })
}

/// Infer animations from frame names using the `baseName_NNN` convention.
/// Frames whose names do not end in a numeric suffix are left standalone.
fn infer_animations(frame_names: &[String], frame_duration: f32) -> Vec<SpritesheetAnimationData> {
    // Insertion-ordered grouping by base name, mirroring the JS `Map` order.
    let mut order: Vec<String> = Vec::new();
    let mut groups: Vec<(String, Vec<(i64, String)>)> = Vec::new();

    for name in frame_names {
        let Some((base, index)) = split_base_and_index(name) else {
            continue;
        };
        if let Some(pos) = order.iter().position(|b| *b == base) {
            groups[pos].1.push((index, name.clone()));
        } else {
            order.push(base.clone());
            groups.push((base, vec![(index, name.clone())]));
        }
    }

    let mut animations = Vec::new();
    for (base, mut entries) in groups {
        if entries.len() < 2 {
            continue;
        }
        entries.sort_by_key(|(index, _)| *index);
        animations.push(create_spritesheet_animation_data(
            SpritesheetAnimationData {
                frame_duration,
                frame_names: entries.into_iter().map(|(_, name)| name).collect(),
                loop_: true,
                name: base,
                ..Default::default()
            },
        ));
    }
    animations
}

/// Strip a trailing `.ext` then split a trailing numeric suffix, mirroring the
/// TS regexes `\.\w+$` and `^(.*?)_?(\d+)$`. Returns `(base, index)` or `None`.
fn split_base_and_index(name: &str) -> Option<(String, i64)> {
    let no_ext = strip_extension(name);
    let chars: Vec<char> = no_ext.chars().collect();
    let mut digit_start = chars.len();
    while digit_start > 0 && chars[digit_start - 1].is_ascii_digit() {
        digit_start -= 1;
    }
    if digit_start == chars.len() {
        return None; // no trailing digits
    }
    let num_str: String = chars[digit_start..].iter().collect();
    let index = num_str.parse::<i64>().ok()?;
    // `(.*?)_?` — drop a single underscore separator if present.
    let mut base_end = digit_start;
    if base_end > 0 && chars[base_end - 1] == '_' {
        base_end -= 1;
    }
    let base: String = chars[..base_end].iter().collect();
    Some((base, index))
}

/// Remove a trailing `.word` extension (`\.\w+$`), where `\w` is
/// alphanumeric or underscore.
fn strip_extension(name: &str) -> &str {
    if let Some(dot) = name.rfind('.') {
        let ext = &name[dot + 1..];
        if !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return &name[..dot];
        }
    }
    name
}

fn sub_texture_to_frame(st: &StarlingSubTexture) -> SpritesheetFrameData {
    let offset_x = st.frame_x.map(|v| -v).unwrap_or(0.0);
    let offset_y = st.frame_y.map(|v| -v).unwrap_or(0.0);
    let source_width = st.frame_width.unwrap_or(st.width);
    let source_height = st.frame_height.unwrap_or(st.height);

    let pivot_x = match st.pivot_x {
        Some(px) if source_width > 0.0 => Some(px / source_width),
        _ => None,
    };
    let pivot_y = match st.pivot_y {
        Some(py) if source_height > 0.0 => Some(py / source_height),
        _ => None,
    };

    create_spritesheet_frame_data(SpritesheetFrameData {
        height: st.height,
        name: st.name.clone(),
        offset_x,
        offset_y,
        pivot_x,
        pivot_y,
        rotated: st.rotated.unwrap_or(false),
        source_height,
        source_width,
        width: st.width,
        x: st.x,
        y: st.y,
    })
}

// ---------------------------------------------------------------------------
// XML → document
// ---------------------------------------------------------------------------

/// Parse the attributes inside an XML element's open tag, mirroring the TS
/// `(\w+)\s*=\s*"([^"]*)"` scanner.
fn parse_attrs(attrs: &str) -> Vec<(String, String)> {
    let chars: Vec<char> = attrs.chars().collect();
    let mut result = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        // Read a `\w+` name.
        if !(chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
            i += 1;
            continue;
        }
        let name_start = i;
        while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
            i += 1;
        }
        let name: String = chars[name_start..i].iter().collect();

        // Skip whitespace then require '='.
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() || chars[i] != '=' {
            continue;
        }
        i += 1;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() || chars[i] != '"' {
            continue;
        }
        i += 1;
        let value_start = i;
        while i < chars.len() && chars[i] != '"' {
            i += 1;
        }
        let value: String = chars[value_start..i].iter().collect();
        if i < chars.len() {
            i += 1; // consume closing quote
        }
        result.push((name, value));
    }
    result
}

fn attr_float(attrs: &[(String, String)], key: &str) -> Option<f32> {
    attrs
        .iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| v.parse::<f32>().ok())
}

fn attr_text<'a>(attrs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

fn parse_starling_xml(xml: &str) -> StarlingDocument {
    let image_path = parse_texture_atlas_attrs(xml)
        .and_then(|attrs| attr_text(&attrs, "imagePath").map(str::to_string))
        .unwrap_or_default();

    let mut sub_textures = Vec::new();
    for raw in iter_sub_texture_attrs(xml) {
        let attrs = parse_attrs(&raw);
        let Some(name) = attr_text(&attrs, "name").filter(|s| !s.is_empty()) else {
            continue;
        };
        let st = StarlingSubTexture {
            frame_height: attr_float(&attrs, "frameHeight"),
            frame_width: attr_float(&attrs, "frameWidth"),
            frame_x: attr_float(&attrs, "frameX"),
            frame_y: attr_float(&attrs, "frameY"),
            height: attr_float(&attrs, "height").unwrap_or(0.0),
            name: name.to_string(),
            pivot_x: attr_float(&attrs, "pivotX"),
            pivot_y: attr_float(&attrs, "pivotY"),
            rotated: attr_text(&attrs, "rotated").map(|v| v == "true"),
            width: attr_float(&attrs, "width").unwrap_or(0.0),
            x: attr_float(&attrs, "x").unwrap_or(0.0),
            y: attr_float(&attrs, "y").unwrap_or(0.0),
        };
        sub_textures.push(st);
    }

    StarlingDocument {
        image_path,
        sub_textures,
    }
}

/// Returns the attribute text inside the first `<TextureAtlas ...>` open tag,
/// mirroring the TS `<TextureAtlas([^>]*)>` capture.
fn parse_texture_atlas_attrs(xml: &str) -> Option<Vec<(String, String)>> {
    let start = xml.find("<TextureAtlas")?;
    let after = &xml[start + "<TextureAtlas".len()..];
    let end = after.find('>')?;
    Some(parse_attrs(&after[..end]))
}

/// Yield the attribute text of each `<SubTexture ... />` element, mirroring the
/// TS `<SubTexture([^/]*)\/?>` scanner (attributes stop at the first `/`).
fn iter_sub_texture_attrs(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(idx) = rest.find("<SubTexture") {
        let after = &rest[idx + "<SubTexture".len()..];
        // `[^/]*` — attribute run ends at the first '/' (or '>').
        let attr_end = after.find(['/', '>']).unwrap_or(after.len());
        out.push(after[..attr_end].to_string());
        rest = &after[attr_end..];
    }
    out
}

// ---------------------------------------------------------------------------
// SpritesheetData → XML (serialize)
// ---------------------------------------------------------------------------

fn document_to_xml(doc: &StarlingDocument) -> String {
    let mut lines = vec![
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string(),
        format!("<TextureAtlas imagePath=\"{}\">", doc.image_path),
    ];
    for st in &doc.sub_textures {
        lines.push(format!("\t<SubTexture {}/>", sub_texture_to_attr(st)));
    }
    lines.push("</TextureAtlas>".to_string());
    lines.join("\n")
}

fn frame_to_sub_texture(frame: &SpritesheetFrameData) -> StarlingSubTexture {
    let mut st = StarlingSubTexture {
        height: frame.height,
        name: frame.name.clone(),
        width: frame.width,
        x: frame.x,
        y: frame.y,
        ..Default::default()
    };

    if frame.offset_x != 0.0 {
        st.frame_x = Some(-frame.offset_x);
    }
    if frame.offset_y != 0.0 {
        st.frame_y = Some(-frame.offset_y);
    }
    if frame.source_width != frame.width {
        st.frame_width = Some(frame.source_width);
    }
    if frame.source_height != frame.height {
        st.frame_height = Some(frame.source_height);
    }
    if let Some(px) = frame.pivot_x
        && frame.source_width > 0.0
    {
        st.pivot_x = Some(px * frame.source_width);
    }
    if let Some(py) = frame.pivot_y
        && frame.source_height > 0.0
    {
        st.pivot_y = Some(py * frame.source_height);
    }
    if frame.rotated {
        st.rotated = Some(true);
    }

    st
}

fn sub_texture_to_attr(st: &StarlingSubTexture) -> String {
    let mut parts = vec![
        format!("name=\"{}\"", st.name),
        format!("x=\"{}\"", number(st.x)),
        format!("y=\"{}\"", number(st.y)),
        format!("width=\"{}\"", number(st.width)),
        format!("height=\"{}\"", number(st.height)),
    ];
    if let Some(v) = st.frame_x {
        parts.push(format!("frameX=\"{}\"", number(v)));
    }
    if let Some(v) = st.frame_y {
        parts.push(format!("frameY=\"{}\"", number(v)));
    }
    if let Some(v) = st.frame_width {
        parts.push(format!("frameWidth=\"{}\"", number(v)));
    }
    if let Some(v) = st.frame_height {
        parts.push(format!("frameHeight=\"{}\"", number(v)));
    }
    if let Some(v) = st.pivot_x {
        parts.push(format!("pivotX=\"{}\"", number(v)));
    }
    if let Some(v) = st.pivot_y {
        parts.push(format!("pivotY=\"{}\"", number(v)));
    }
    if st.rotated == Some(true) {
        parts.push("rotated=\"true\"".to_string());
    }
    parts.join(" ")
}

/// Format an `f32` like JavaScript's number-to-string: integers print without a
/// trailing `.0` so XML attributes match the original document.
fn number(value: f32) -> String {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let s = format!("{value}");
        if s == "-0" { "0".to_string() } else { s }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const ATLAS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero_idle_0001" x="0" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="hero_idle_0002" x="60" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="hero_idle_0003" x="120" y="0" width="60" height="56"
              frameX="-2" frameY="-4" frameWidth="64" frameHeight="64"
              pivotX="32" pivotY="64"/>
  <SubTexture name="fx_spark" x="0" y="56" width="16" height="16"/>
</TextureAtlas>"#;

    const ROTATED_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="sprites.png">
  <SubTexture name="run_001" x="0" y="0" width="32" height="32" rotated="true"/>
  <SubTexture name="run_002" x="32" y="0" width="32" height="32" rotated="true"/>
</TextureAtlas>"#;

    const MINIMAL_XML: &str = r#"<TextureAtlas imagePath="mini.png">
  <SubTexture name="tile" x="0" y="0" width="8" height="8"/>
</TextureAtlas>"#;

    fn frame_named<'a>(data: &'a SpritesheetData, name: &str) -> &'a SpritesheetFrameData {
        data.frames.iter().find(|f| f.name == name).unwrap()
    }

    // parse_starling_spritesheet

    #[test]
    fn parse_starling_spritesheet_basic() {
        let data = parse_starling_spritesheet(ATLAS_XML, None);
        assert_eq!(data.frames.len(), 4);

        let frame = &data.frames[0];
        assert_eq!(frame.name, "hero_idle_0001");
        assert_eq!(frame.x, 0.0);
        assert_eq!(frame.y, 0.0);
        assert_eq!(frame.width, 60.0);
        assert_eq!(frame.height, 56.0);
        assert_eq!(frame.offset_x, 2.0);
        assert_eq!(frame.offset_y, 4.0);
        assert_eq!(frame.source_width, 64.0);
        assert_eq!(frame.source_height, 64.0);
        assert!((frame.pivot_x.unwrap() - 0.5).abs() < 1e-6);
        assert!((frame.pivot_y.unwrap() - 1.0).abs() < 1e-6);

        let spark = frame_named(&data, "fx_spark");
        assert_eq!(spark.source_width, 16.0);
        assert_eq!(spark.source_height, 16.0);
        assert_eq!(spark.pivot_x, None);
        assert_eq!(spark.pivot_y, None);
        assert!(!spark.rotated);

        assert_eq!(data.image_file, "atlas.png");
        assert_eq!(
            parse_starling_spritesheet(MINIMAL_XML, None).image_file,
            "mini.png"
        );
    }

    #[test]
    fn parse_starling_spritesheet_rotated_flag() {
        let data = parse_starling_spritesheet(ROTATED_XML, None);
        assert!(data.frames[0].rotated);
        assert!(data.frames[1].rotated);
    }

    #[test]
    fn parse_starling_spritesheet_infers_animations() {
        let data = parse_starling_spritesheet(ATLAS_XML, None);
        let hero = data
            .animations
            .iter()
            .find(|a| a.name == "hero_idle")
            .unwrap();
        assert_eq!(hero.frame_names.len(), 3);
        assert_eq!(hero.frame_names[0], "hero_idle_0001");
        assert_eq!(hero.frame_names[1], "hero_idle_0002");
        assert_eq!(hero.frame_names[2], "hero_idle_0003");
        assert!(data.animations.iter().all(|a| a.name != "fx"));
        assert!(data.animations.iter().all(|a| a.name != "fx_spark"));
        assert_eq!(hero.frame_duration, 100.0);

        let custom = parse_starling_spritesheet(
            ATLAS_XML,
            Some(&StarlingParseOptions {
                frame_duration: 200.0,
            }),
        );
        assert_eq!(custom.animations[0].frame_duration, 200.0);

        let run = parse_starling_spritesheet(ROTATED_XML, None);
        assert_eq!(run.animations.len(), 1);
        assert_eq!(run.animations[0].name, "run");
        assert_eq!(run.animations[0].frame_names.len(), 2);

        let minimal = parse_starling_spritesheet(MINIMAL_XML, None);
        assert_eq!(minimal.frames.len(), 1);
        assert_eq!(minimal.animations.len(), 0);
    }

    // parse_starling_spritesheet_document

    #[test]
    fn parse_starling_spritesheet_document_preserves_document() {
        let parsed = parse_starling_spritesheet_document(ATLAS_XML, None);
        assert_eq!(parsed.data.frames.len(), 4);
        assert_eq!(parsed.document.sub_textures.len(), 4);
        assert_eq!(parsed.document.image_path, "atlas.png");

        let st = &parsed.document.sub_textures[0];
        assert_eq!(st.name, "hero_idle_0001");
        assert_eq!(st.x, 0.0);
        assert_eq!(st.width, 60.0);
        assert_eq!(st.frame_x, Some(-2.0));
        assert_eq!(st.frame_y, Some(-4.0));
        assert_eq!(st.frame_width, Some(64.0));
        assert_eq!(st.frame_height, Some(64.0));
    }

    // serialize_starling_spritesheet

    #[test]
    fn serialize_starling_spritesheet_round_trips() {
        let parsed = parse_starling_spritesheet_document(ATLAS_XML, None);
        let xml = serialize_starling_spritesheet(&parsed.data, Some(&parsed.document));
        let data2 = parse_starling_spritesheet(&xml, None);

        let names: Vec<&str> = data2.frames.iter().map(|f| f.name.as_str()).collect();
        let orig: Vec<&str> = parsed.data.frames.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, orig);
        assert_eq!(data2.frames[0].x, parsed.data.frames[0].x);
        assert_eq!(data2.frames[0].width, parsed.data.frames[0].width);
        assert_eq!(data2.frames[0].offset_x, parsed.data.frames[0].offset_x);
        assert_eq!(data2.frames[0].offset_y, parsed.data.frames[0].offset_y);
        assert_eq!(
            data2.frames[0].source_width,
            parsed.data.frames[0].source_width
        );
        assert_eq!(
            data2.frames[0].source_height,
            parsed.data.frames[0].source_height
        );
        assert!(
            (data2.frames[0].pivot_x.unwrap() - parsed.data.frames[0].pivot_x.unwrap()).abs()
                < 1e-6
        );
        assert!(
            (data2.frames[0].pivot_y.unwrap() - parsed.data.frames[0].pivot_y.unwrap()).abs()
                < 1e-6
        );
        assert_eq!(data2.image_file, "atlas.png");

        let rotated = parse_starling_spritesheet_document(ROTATED_XML, None);
        let rxml = serialize_starling_spritesheet(&rotated.data, Some(&rotated.document));
        assert!(parse_starling_spritesheet(&rxml, None).frames[0].rotated);

        // well-formed output
        let minimal = parse_starling_spritesheet(MINIMAL_XML, None);
        let mxml = serialize_starling_spritesheet(&minimal, None);
        assert!(mxml.contains("<TextureAtlas"));
        assert!(mxml.contains("<SubTexture"));
        assert!(mxml.contains("</TextureAtlas>"));
        assert!(!mxml.contains("frameX"));
        assert!(!mxml.contains("pivotX"));
        assert!(!mxml.contains("rotated"));
    }

    #[test]
    fn serialize_starling_spritesheet_with_existing_preserves_pivot() {
        let parsed = parse_starling_spritesheet_document(ATLAS_XML, None);
        let xml = serialize_starling_spritesheet(&parsed.data, Some(&parsed.document));
        assert!(xml.contains("frameX=\"-2\""));
        assert!(xml.contains("frameY=\"-4\""));
        // pivot survives the round trip: 0.5 * 64 = 32, 1.0 * 64 = 64
        assert!(xml.contains("pivotX=\"32\""));
        assert!(xml.contains("pivotY=\"64\""));
    }
}
