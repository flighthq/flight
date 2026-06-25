//! Cocos Creator / Cocos2d-x plist atlas format parser.
//!
//! The plist XML has a root `<dict>` (optionally wrapped in `<plist>`) with a
//! `frames` `<dict>` and a `metadata` `<dict>`. Both old-style keys (`frame`,
//! `offset`, `sourceSize`, `size`, `rotated`, `trimmed`) and new-style
//! sprite-prefixed keys (`textureRect`, `spriteOffset`, `spriteSourceSize`,
//! `spriteSize`, `textureRotated`, `spriteTrimmed`) are normalised into the
//! [`CocosPlistFrame`] shape.

pub mod schema;

use flighthq_spritesheet::{
    SpritesheetData, SpritesheetFrameData, create_spritesheet_data, create_spritesheet_frame_data,
};

use flighthq_resource_formats::{XmlElement, parse_xml_document};

pub use schema::{CocosPlistDocument, CocosPlistFrame, CocosPlistMetadata};

// ---------------------------------------------------------------------------
// Return types and options
// ---------------------------------------------------------------------------

/// Result of [`parse_cocos_plist_spritesheet_document`]: the parsed data plus the
/// original document for round-trip serialisation.
#[derive(Clone, Debug)]
pub struct CocosPlistParsed {
    pub data: SpritesheetData,
    pub document: CocosPlistDocument,
}

/// Options for [`parse_cocos_plist_spritesheet`] and
/// [`parse_cocos_plist_spritesheet_document`].
#[derive(Clone, Debug)]
pub struct CocosPlistParseOptions {
    /// Default duration (ms) per frame when building inferred animations.
    /// Defaults to `100`.
    pub frame_duration: f32,
}

impl Default for CocosPlistParseOptions {
    fn default() -> Self {
        Self {
            frame_duration: 100.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Parses a Cocos Creator / Cocos2d-x plist XML atlas string directly to a
/// [`SpritesheetData`].
///
/// Single-pass: no intermediate document object is allocated. Use
/// [`parse_cocos_plist_spritesheet_document`] when you need round-trip
/// serialisation.
pub fn parse_cocos_plist_spritesheet(
    xml: &str,
    _options: Option<&CocosPlistParseOptions>,
) -> SpritesheetData {
    document_to_data(&parse_cocos_plist_xml(xml))
}

/// Parses a Cocos Creator / Cocos2d-x plist XML atlas string and preserves the
/// full document for round-trip serialisation.
pub fn parse_cocos_plist_spritesheet_document(
    xml: &str,
    _options: Option<&CocosPlistParseOptions>,
) -> CocosPlistParsed {
    let document = parse_cocos_plist_xml(xml);
    CocosPlistParsed {
        data: document_to_data(&document),
        document,
    }
}

// ---------------------------------------------------------------------------
// plist structural helpers
// ---------------------------------------------------------------------------

/// Parse a Cocos plist size/offset string of the form `"{w,h}"` or `"{x,y}"`,
/// mirroring the TS `/{?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*}?/` scan.
fn parse_plist_pair(s: &str) -> (f32, f32) {
    let nums = scan_numbers(s, 2);
    (nums[0], nums[1])
}

/// Parse a Cocos plist rect string of the form `"{{x,y},{w,h}}"`, mirroring the
/// TS rect regex (four numbers, in `x, y, w, h` order).
fn parse_plist_rect(s: &str) -> (f32, f32, f32, f32) {
    let nums = scan_numbers(s, 4);
    (nums[0], nums[1], nums[2], nums[3])
}

/// Scan up to `count` leading numbers (`[-\d.]+`) from a plist brace string,
/// padding with `0.0` when fewer are present.
fn scan_numbers(s: &str, count: usize) -> Vec<f32> {
    let mut out: Vec<f32> = Vec::with_capacity(count);
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() && out.len() < count {
        if chars[i] == '-' || chars[i] == '.' || chars[i].is_ascii_digit() {
            let start = i;
            while i < chars.len()
                && (chars[i] == '-' || chars[i] == '.' || chars[i].is_ascii_digit())
            {
                i += 1;
            }
            let token: String = chars[start..i].iter().collect();
            out.push(token.parse::<f32>().unwrap_or(0.0));
        } else {
            i += 1;
        }
    }
    while out.len() < count {
        out.push(0.0);
    }
    out
}

/// Walk a plist `<dict>` element and return its key→value pairs in order, with
/// values still as [`XmlElement`]. Mirrors the TS `dictToMap` even-odd walk.
fn dict_to_pairs(el: &XmlElement) -> Vec<(String, &XmlElement)> {
    let mut pairs = Vec::new();
    let children = &el.children;
    let mut i = 0;
    while i < children.len() {
        let key_el = &children[i];
        if key_el.name == "key"
            && let Some(val_el) = children.get(i + 1)
        {
            pairs.push((key_el.text.clone(), val_el));
        }
        i += 2;
    }
    pairs
}

fn find_value<'a>(pairs: &'a [(String, &'a XmlElement)], key: &str) -> Option<&'a XmlElement> {
    pairs.iter().find(|(k, _)| k == key).map(|(_, v)| *v)
}

fn get_text_value(el: Option<&XmlElement>) -> String {
    el.map(|e| e.text.clone()).unwrap_or_default()
}

fn get_bool_value(el: Option<&XmlElement>) -> bool {
    el.map(|e| e.name == "true").unwrap_or(false)
}

fn get_int_value(el: Option<&XmlElement>) -> i64 {
    // `parseInt(text ?? '0', 10)` — leading integer prefix, defaulting to 0.
    let text = el.map(|e| e.text.as_str()).unwrap_or("0");
    parse_int_prefix(text)
}

/// Mirror JS `parseInt(s, 10)`: parse the leading integer (optionally signed),
/// returning `0` when no digits are present.
fn parse_int_prefix(s: &str) -> i64 {
    let trimmed = s.trim_start();
    let bytes = trimmed.as_bytes();
    let mut i = 0;
    let mut sign = 1i64;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        if bytes[i] == b'-' {
            sign = -1;
        }
        i += 1;
    }
    let start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if start == i {
        return 0;
    }
    let digits = &trimmed[start..i];
    digits.parse::<i64>().map(|v| sign * v).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// XML → document
// ---------------------------------------------------------------------------

fn parse_cocos_plist_xml(xml: &str) -> CocosPlistDocument {
    let root = parse_xml_document(xml);

    // Locate the root <dict> (may be under <plist>).
    let root_dict: Option<&XmlElement> = match root.as_ref() {
        Some(r) if r.name == "plist" => r.children.iter().find(|c| c.name == "dict"),
        Some(r) if r.name == "dict" => Some(r),
        _ => None,
    };

    let Some(root_dict) = root_dict else {
        return CocosPlistDocument {
            frames: Vec::new(),
            metadata: CocosPlistMetadata::default(),
        };
    };

    let root_pairs = dict_to_pairs(root_dict);

    // Parse metadata.
    let mut metadata = CocosPlistMetadata::default();
    if let Some(meta_el) = find_value(&root_pairs, "metadata")
        && meta_el.name == "dict"
    {
        let meta_pairs = dict_to_pairs(meta_el);
        let texture = get_text_value(find_value(&meta_pairs, "textureFileName"));
        let texture = if texture.is_empty() {
            get_text_value(find_value(&meta_pairs, "realTextureFileName"))
        } else {
            texture
        };
        metadata = CocosPlistMetadata {
            format: get_int_value(find_value(&meta_pairs, "format")),
            size: get_text_value(find_value(&meta_pairs, "size")),
            texture_file_name: texture,
        };
    }

    // Parse frames.
    let mut frames: Vec<(String, CocosPlistFrame)> = Vec::new();
    if let Some(frames_el) = find_value(&root_pairs, "frames")
        && frames_el.name == "dict"
    {
        for (frame_name, frame_el) in dict_to_pairs(frames_el) {
            if frame_el.name != "dict" {
                continue;
            }
            let fm = dict_to_pairs(frame_el);

            let has_sprite_fields = find_value(&fm, "spriteOffset").is_some();
            let has_frame =
                find_value(&fm, "frame").is_some() || find_value(&fm, "textureRect").is_some();
            if !has_frame && !has_sprite_fields {
                continue;
            }

            let rect_str =
                get_text_value(find_value(&fm, "frame").or_else(|| find_value(&fm, "textureRect")));
            let rotated = get_bool_value(
                find_value(&fm, "textureRotated").or_else(|| find_value(&fm, "rotated")),
            );
            let offset_str = get_text_value(
                find_value(&fm, "spriteOffset").or_else(|| find_value(&fm, "offset")),
            );
            let source_size_str = get_text_value(
                find_value(&fm, "spriteSourceSize").or_else(|| find_value(&fm, "sourceSize")),
            );
            let size_str =
                get_text_value(find_value(&fm, "spriteSize").or_else(|| find_value(&fm, "size")));
            let trimmed = get_bool_value(
                find_value(&fm, "spriteTrimmed").or_else(|| find_value(&fm, "trimmed")),
            );

            let mut aliases: Vec<String> = Vec::new();
            if let Some(alias_el) = find_value(&fm, "aliases")
                && alias_el.name == "array"
            {
                for child in &alias_el.children {
                    if child.name == "string" {
                        aliases.push(child.text.clone());
                    }
                }
            }

            frames.push((
                frame_name,
                CocosPlistFrame {
                    aliases: if aliases.is_empty() {
                        None
                    } else {
                        Some(aliases)
                    },
                    frame: rect_str,
                    sprite_offset: offset_str,
                    sprite_size: size_str,
                    sprite_source_size: source_size_str,
                    sprite_trimmed: trimmed,
                    texture_rotated: rotated,
                },
            ));
        }
    }

    CocosPlistDocument { frames, metadata }
}

// ---------------------------------------------------------------------------
// document → SpritesheetData
// ---------------------------------------------------------------------------

fn plist_frame_to_data(name: &str, pf: &CocosPlistFrame) -> SpritesheetFrameData {
    let (rect_x, rect_y, rect_w, rect_h) = parse_plist_rect(&pf.frame);
    let (offset_x, offset_y) = parse_plist_pair(&pf.sprite_offset);
    let (source_width, source_height) = parse_plist_pair(&pf.sprite_source_size);

    // Rotated frames in plist have swapped w/h in the atlas rect.
    let atlas_width = if pf.texture_rotated { rect_h } else { rect_w };
    let atlas_height = if pf.texture_rotated { rect_w } else { rect_h };

    create_spritesheet_frame_data(SpritesheetFrameData {
        height: atlas_height,
        name: name.to_string(),
        offset_x,
        offset_y,
        pivot_x: None,
        pivot_y: None,
        rotated: pf.texture_rotated,
        source_height: if source_height > 0.0 {
            source_height
        } else {
            atlas_height
        },
        source_width: if source_width > 0.0 {
            source_width
        } else {
            atlas_width
        },
        width: atlas_width,
        x: rect_x,
        y: rect_y,
    })
}

fn document_to_data(doc: &CocosPlistDocument) -> SpritesheetData {
    let frames: Vec<SpritesheetFrameData> = doc
        .frames
        .iter()
        .map(|(name, pf)| plist_frame_to_data(name, pf))
        .collect();
    let (image_width, image_height) = parse_plist_pair(&doc.metadata.size);

    create_spritesheet_data(SpritesheetData {
        animations: Vec::new(),
        frames,
        image_file: doc.metadata.texture_file_name.clone(),
        image_height,
        image_width,
        scale: 1.0,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const NEW_STYLE_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>frames</key>
    <dict>
        <key>hero.png</key>
        <dict>
            <key>spriteOffset</key>
            <string>{0,0}</string>
            <key>spriteSize</key>
            <string>{60,56}</string>
            <key>spriteSourceSize</key>
            <string>{64,64}</string>
            <key>textureRect</key>
            <string>{{0,0},{60,56}}</string>
            <key>textureRotated</key>
            <false/>
            <key>spriteTrimmed</key>
            <true/>
        </dict>
        <key>spark.png</key>
        <dict>
            <key>spriteOffset</key>
            <string>{1,2}</string>
            <key>spriteSize</key>
            <string>{16,32}</string>
            <key>spriteSourceSize</key>
            <string>{16,16}</string>
            <key>textureRect</key>
            <string>{{60,0},{16,32}}</string>
            <key>textureRotated</key>
            <true/>
        </dict>
    </dict>
    <key>metadata</key>
    <dict>
        <key>format</key>
        <integer>3</integer>
        <key>size</key>
        <string>{256,128}</string>
        <key>textureFileName</key>
        <string>atlas.png</string>
    </dict>
</dict>
</plist>"#;

    const OLD_STYLE_PLIST: &str = r#"<plist version="1.0">
<dict>
    <key>frames</key>
    <dict>
        <key>tile.png</key>
        <dict>
            <key>frame</key>
            <string>{{0,0},{8,8}}</string>
            <key>offset</key>
            <string>{0,0}</string>
            <key>sourceSize</key>
            <string>{8,8}</string>
            <key>size</key>
            <string>{8,8}</string>
            <key>rotated</key>
            <false/>
        </dict>
    </dict>
    <key>metadata</key>
    <dict>
        <key>format</key>
        <integer>2</integer>
        <key>size</key>
        <string>{8,8}</string>
        <key>realTextureFileName</key>
        <string>old.png</string>
    </dict>
</dict>
</plist>"#;

    // parse_cocos_plist_spritesheet

    #[test]
    fn parse_cocos_plist_spritesheet_new_style() {
        let data = parse_cocos_plist_spritesheet(NEW_STYLE_PLIST, None);
        assert_eq!(data.frames.len(), 2);
        assert_eq!(data.image_file, "atlas.png");
        assert_eq!(data.image_width, 256.0);
        assert_eq!(data.image_height, 128.0);

        let hero = &data.frames[0];
        assert_eq!(hero.name, "hero.png");
        assert_eq!(hero.x, 0.0);
        assert_eq!(hero.y, 0.0);
        assert_eq!(hero.width, 60.0);
        assert_eq!(hero.height, 56.0);
        assert_eq!(hero.source_width, 64.0);
        assert_eq!(hero.source_height, 64.0);
        assert!(!hero.rotated);

        // Rotated frame swaps atlas w/h.
        let spark = &data.frames[1];
        assert_eq!(spark.name, "spark.png");
        assert!(spark.rotated);
        assert_eq!(spark.width, 32.0); // rect.h becomes width when rotated
        assert_eq!(spark.height, 16.0); // rect.w becomes height when rotated
        assert_eq!(spark.offset_x, 1.0);
        assert_eq!(spark.offset_y, 2.0);
    }

    #[test]
    fn parse_cocos_plist_spritesheet_old_style() {
        let data = parse_cocos_plist_spritesheet(OLD_STYLE_PLIST, None);
        assert_eq!(data.frames.len(), 1);
        assert_eq!(data.image_file, "old.png");
        let tile = &data.frames[0];
        assert_eq!(tile.name, "tile.png");
        assert_eq!(tile.width, 8.0);
        assert_eq!(tile.height, 8.0);
        assert_eq!(tile.source_width, 8.0);
        assert_eq!(tile.source_height, 8.0);
    }

    #[test]
    fn parse_cocos_plist_spritesheet_empty_for_unrecognized() {
        let data = parse_cocos_plist_spritesheet("not a plist", None);
        assert_eq!(data.frames.len(), 0);
        assert_eq!(data.image_file, "");
    }

    // parse_cocos_plist_spritesheet_document

    #[test]
    fn parse_cocos_plist_spritesheet_document_preserves_document() {
        let parsed = parse_cocos_plist_spritesheet_document(NEW_STYLE_PLIST, None);
        assert_eq!(parsed.data.frames.len(), 2);
        assert_eq!(parsed.document.frames.len(), 2);
        assert_eq!(parsed.document.metadata.format, 3);
        assert_eq!(parsed.document.metadata.texture_file_name, "atlas.png");

        let (name, hero) = &parsed.document.frames[0];
        assert_eq!(name, "hero.png");
        assert_eq!(hero.frame, "{{0,0},{60,56}}");
        assert_eq!(hero.sprite_source_size, "{64,64}");
        assert!(hero.sprite_trimmed);
        assert!(!hero.texture_rotated);

        let (_, spark) = &parsed.document.frames[1];
        assert!(spark.texture_rotated);
    }
}
