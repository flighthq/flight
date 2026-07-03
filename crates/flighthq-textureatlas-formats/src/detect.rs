use crate::json::{JsonValue, parse_json};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextureAtlasFormatKind {
    Aseprite,
    LibgdxAtlas,
    Starling,
    TexturePacker,
}

pub fn detect_texture_atlas_format(content: &str) -> Option<TextureAtlasFormatKind> {
    let trimmed = content.trim_start();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with('<') {
        return if trimmed.contains("<TextureAtlas") {
            Some(TextureAtlasFormatKind::Starling)
        } else {
            None
        };
    }

    if trimmed.starts_with('{') {
        let doc = parse_json(content).ok()?;
        doc.get("frames")?;
        let app = read_meta_app(&doc).to_lowercase();
        if app.contains("aseprite") {
            return Some(TextureAtlasFormatKind::Aseprite);
        }
        if app.contains("texturepacker") || app.contains("codeandweb") {
            return Some(TextureAtlasFormatKind::TexturePacker);
        }
        return if has_frame_duration(&doc) {
            Some(TextureAtlasFormatKind::Aseprite)
        } else {
            Some(TextureAtlasFormatKind::TexturePacker)
        };
    }

    let has_header = trimmed.lines().any(|l| {
        let t = l.trim();
        t.starts_with("size:")
            || t.starts_with("format:")
            || t.starts_with("filter:")
            || t.starts_with("repeat:")
    });
    let has_region = trimmed.lines().any(|l| {
        let t = l.trim();
        t.starts_with("xy:") || t.starts_with("orig:")
    });
    if has_header && has_region {
        return Some(TextureAtlasFormatKind::LibgdxAtlas);
    }

    None
}

fn read_meta_app(doc: &JsonValue) -> String {
    doc.get("meta")
        .and_then(|m| m.get("app"))
        .and_then(|a| a.as_text())
        .unwrap_or("")
        .to_string()
}

fn has_frame_duration(doc: &JsonValue) -> bool {
    let frames = match doc.get("frames") {
        Some(f) => f,
        None => return false,
    };
    let first = if let Some(arr) = frames.as_array() {
        arr.first()
    } else if let Some(obj) = frames.as_object() {
        obj.first().map(|(_, v)| v)
    } else {
        None
    };
    match first {
        Some(frame) => frame.get("duration").and_then(|d| d.as_number()).is_some(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_starling() {
        let xml = r#"<?xml version="1.0"?><TextureAtlas imagePath="sheet.png"></TextureAtlas>"#;
        assert_eq!(
            detect_texture_atlas_format(xml),
            Some(TextureAtlasFormatKind::Starling)
        );
    }

    #[test]
    fn test_detect_aseprite() {
        let json = r#"{"frames":[{"filename":"a","frame":{"x":0,"y":0,"w":32,"h":32},"duration":100}],"meta":{"app":"aseprite"}}"#;
        assert_eq!(
            detect_texture_atlas_format(json),
            Some(TextureAtlasFormatKind::Aseprite)
        );
    }

    #[test]
    fn test_detect_texturepacker() {
        let json = r#"{"frames":{"a":{"frame":{"x":0,"y":0,"w":32,"h":32}}},"meta":{"app":"texturepacker"}}"#;
        assert_eq!(
            detect_texture_atlas_format(json),
            Some(TextureAtlasFormatKind::TexturePacker)
        );
    }

    #[test]
    fn test_detect_libgdx() {
        let text = "sheet.png\nsize: 1024,1024\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nsprite\n  xy: 0, 0\n  size: 32, 32\n  orig: 32, 32\n";
        assert_eq!(
            detect_texture_atlas_format(text),
            Some(TextureAtlasFormatKind::LibgdxAtlas)
        );
    }

    #[test]
    fn test_detect_empty() {
        assert_eq!(detect_texture_atlas_format(""), None);
        assert_eq!(detect_texture_atlas_format("   "), None);
    }

    #[test]
    fn test_detect_unknown() {
        assert_eq!(detect_texture_atlas_format("hello world"), None);
    }
}
