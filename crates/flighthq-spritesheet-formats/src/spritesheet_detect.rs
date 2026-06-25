//! Format-detection registry and the auto-detecting `parse_spritesheet` entry
//! point.
//!
//! Mirrors the TS `spritesheetDetect.ts` registry: built-in formats are
//! registered lazily and probed in insertion order. Registration is
//! last-write-wins, so a built-in entry can be replaced by registering the same
//! [`SpritesheetFormatKind`]; third-party formats should use a vendor-prefixed
//! kind (e.g. `"acme.MyAtlas"`).

use std::sync::{LazyLock, Mutex};

use flighthq_spritesheet::SpritesheetData;
use flighthq_types::{
    SPRITESHEET_FORMAT_KIND_ASEPRITE, SPRITESHEET_FORMAT_KIND_COCOS_PLIST,
    SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS, SPRITESHEET_FORMAT_KIND_STARLING,
    SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER, SpritesheetFormatKind,
};

use crate::aseprite::parse_aseprite_spritesheet;
use crate::cocos_plist::{CocosPlistParseOptions, parse_cocos_plist_spritesheet};
use crate::libgdx_atlas::{LibgdxAtlasParseOptions, parse_libgdx_atlas_spritesheet};
use crate::starling::{StarlingParseOptions, parse_starling_spritesheet};
use crate::texture_packer::parse_texture_packer_spritesheet;

/// Options threaded through [`parse_spritesheet`] to the per-format parsers.
#[derive(Clone, Debug, Default)]
pub struct SpritesheetParseOptions {
    /// Default frame duration in ms used by formats that do not embed per-frame
    /// timing. `None` falls back to each parser's default (100).
    pub frame_duration: Option<f32>,
    /// Atlas image height for formats that omit dimensions (e.g. Starling).
    pub image_height: Option<f32>,
    /// Atlas image width for formats that omit dimensions (e.g. Starling).
    pub image_width: Option<f32>,
}

/// A registered spritesheet format: a `detect` sniffer and a `parse` builder.
///
/// The closures are stored as `Send + Sync` boxes so the registry can live in a
/// shared `static`. This is the Rust expression of the TS `FormatEntry` object
/// (`{ detect, parse }`).
pub struct SpritesheetFormatEntry {
    pub detect: Box<dyn Fn(&str) -> bool + Send + Sync>,
    // The boxed parse closure is the registry seam (the Rust form of the TS
    // `FormatEntry.parse`); the full signature is the intended public type.
    #[allow(clippy::type_complexity)]
    pub parse: Box<dyn Fn(&str, &SpritesheetParseOptions) -> SpritesheetData + Send + Sync>,
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Detects the format kind of a spritesheet text document.
///
/// Returns the [`SpritesheetFormatKind`] of the first registered format whose
/// `detect` returns `true`, or `None` when no format is recognized.
pub fn detect_spritesheet_format(text: &str) -> Option<SpritesheetFormatKind> {
    let registry = registry().lock().unwrap();
    for (kind, entry) in registry.iter() {
        if (entry.detect)(text) {
            return Some(kind.clone());
        }
    }
    None
}

/// Invokes the registered entry for `kind` to detect the given text, returning
/// `None` when no format with that kind is registered.
///
/// The TS `getSpritesheetFormat` returns the `{ detect, parse }` entry object so
/// callers can invoke either function. The Rust registry stores non-`Clone`
/// boxed closures behind a `Mutex`, so the entry cannot be handed out directly;
/// [`run_spritesheet_format_detect`] and [`run_spritesheet_format_parse`] expose
/// the two callable halves instead.
pub fn run_spritesheet_format_detect(kind: &str, text: &str) -> Option<bool> {
    let registry = registry().lock().unwrap();
    registry
        .iter()
        .find(|(k, _)| k == kind)
        .map(|(_, entry)| (entry.detect)(text))
}

/// Invokes the registered parser for `kind`, returning `None` when no format
/// with that kind is registered.
pub fn run_spritesheet_format_parse(
    kind: &str,
    text: &str,
    options: &SpritesheetParseOptions,
) -> Option<SpritesheetData> {
    let registry = registry().lock().unwrap();
    registry
        .iter()
        .find(|(k, _)| k == kind)
        .map(|(_, entry)| (entry.parse)(text, options))
}

/// Reports whether a format with the given kind is registered.
pub fn has_spritesheet_format(kind: &str) -> bool {
    let registry = registry().lock().unwrap();
    registry.iter().any(|(k, _)| k == kind)
}

/// Parses a spritesheet text document to a [`SpritesheetData`], auto-detecting
/// the format.
///
/// Accepts an optional `format_kind` override — useful when the format is known
/// in advance, or when the input is ambiguous. Returns `None` when the format
/// cannot be recognized (expected failure — not a panic).
pub fn parse_spritesheet(
    text: &str,
    format_kind: Option<&str>,
    options: Option<&SpritesheetParseOptions>,
) -> Option<SpritesheetData> {
    let default_opts = SpritesheetParseOptions::default();
    let opts = options.unwrap_or(&default_opts);
    let kind = match format_kind {
        Some(k) => k.to_string(),
        None => detect_spritesheet_format(text)?,
    };
    run_spritesheet_format_parse(&kind, text, opts)
}

/// Registers a custom spritesheet format for use with
/// [`detect_spritesheet_format`] and [`parse_spritesheet`].
///
/// Registration is last-write-wins; a built-in entry can be replaced by
/// registering the same [`SpritesheetFormatKind`]. Third-party formats should
/// use a vendor-prefixed kind (e.g. `"acme.MyAtlas"`) to avoid colliding with
/// built-ins.
pub fn register_spritesheet_format(kind: SpritesheetFormatKind, entry: SpritesheetFormatEntry) {
    let mut registry = registry().lock().unwrap();
    if let Some(slot) = registry.iter_mut().find(|(k, _)| *k == kind) {
        slot.1 = entry;
    } else {
        registry.push((kind, entry));
    }
}

// ---------------------------------------------------------------------------
// Built-in detectors
// ---------------------------------------------------------------------------

fn detect_texture_packer(text: &str) -> bool {
    if !text.trim_start().starts_with('{') {
        return false;
    }
    contains_key(text, "meta") && contains_key(text, "app")
}

fn detect_aseprite(text: &str) -> bool {
    if !text.trim_start().starts_with('{') {
        return false;
    }
    contains_key(text, "meta") && text.to_ascii_lowercase().contains("aseprite.org")
}

fn detect_cocos_plist(text: &str) -> bool {
    let trimmed = text.trim_start();
    let starts = trimmed.starts_with('<') || trimmed.starts_with("<?xml");
    starts && text.to_ascii_lowercase().contains("<plist")
}

fn detect_starling(text: &str) -> bool {
    text.to_ascii_lowercase().contains("<textureatlas")
}

fn detect_libgdx_atlas(text: &str) -> bool {
    let ch = text.trim_start().chars().next();
    if ch == Some('<') || ch == Some('{') {
        return false;
    }
    has_line_key(text, "rotate") || has_line_key(text, "xy")
}

/// Mirror the TS `/"key"\s*:/` probe.
fn contains_key(text: &str, key: &str) -> bool {
    let needle = format!("\"{key}\"");
    let bytes = text.as_bytes();
    let mut search = 0;
    while let Some(rel) = text[search..].find(&needle) {
        let after = search + rel + needle.len();
        let mut i = after;
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < bytes.len() && bytes[i] == b':' {
            return true;
        }
        search = search + rel + needle.len();
    }
    false
}

/// Mirror the TS `^\s*key\s*:` multiline probe: some line, after leading
/// whitespace, starts with `key` then optional whitespace then `:`.
fn has_line_key(text: &str, key: &str) -> bool {
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix(key) {
            let rest = rest.trim_start();
            if rest.starts_with(':') {
                return true;
            }
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type FormatRegistry = Vec<(SpritesheetFormatKind, SpritesheetFormatEntry)>;

fn registry() -> &'static Mutex<FormatRegistry> {
    static REGISTRY: LazyLock<Mutex<FormatRegistry>> =
        LazyLock::new(|| Mutex::new(default_registry()));
    &REGISTRY
}

fn default_registry() -> FormatRegistry {
    vec![
        (
            SPRITESHEET_FORMAT_KIND_ASEPRITE.to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(detect_aseprite),
                parse: Box::new(|text, _opts| parse_aseprite_spritesheet(text)),
            },
        ),
        (
            SPRITESHEET_FORMAT_KIND_COCOS_PLIST.to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(detect_cocos_plist),
                parse: Box::new(|text, opts| {
                    parse_cocos_plist_spritesheet(text, cocos_options(opts).as_ref())
                }),
            },
        ),
        (
            SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER.to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(detect_texture_packer),
                parse: Box::new(|text, _opts| parse_texture_packer_spritesheet(text)),
            },
        ),
        (
            SPRITESHEET_FORMAT_KIND_STARLING.to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(detect_starling),
                parse: Box::new(|text, opts| {
                    parse_starling_spritesheet(text, starling_options(opts).as_ref())
                }),
            },
        ),
        (
            SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS.to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(detect_libgdx_atlas),
                parse: Box::new(|text, opts| {
                    parse_libgdx_atlas_spritesheet(text, libgdx_options(opts).as_ref())
                }),
            },
        ),
    ]
}

fn cocos_options(opts: &SpritesheetParseOptions) -> Option<CocosPlistParseOptions> {
    opts.frame_duration
        .map(|frame_duration| CocosPlistParseOptions { frame_duration })
}

fn libgdx_options(opts: &SpritesheetParseOptions) -> Option<LibgdxAtlasParseOptions> {
    opts.frame_duration
        .map(|frame_duration| LibgdxAtlasParseOptions { frame_duration })
}

fn starling_options(opts: &SpritesheetParseOptions) -> Option<StarlingParseOptions> {
    opts.frame_duration
        .map(|frame_duration| StarlingParseOptions { frame_duration })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const ASEPRITE_JSON: &str = r#"{"frames":{"a 0.png":{"frame":{"x":0,"y":0,"w":8,"h":8},"spriteSourceSize":{"x":0,"y":0,"w":8,"h":8},"sourceSize":{"w":8,"h":8},"duration":100}},"meta":{"app":"http://www.aseprite.org/","image":"a.png","size":{"w":8,"h":8},"scale":"1","frameTags":[]}}"#;

    const TEXTURE_PACKER_JSON: &str = r#"{"frames":{"a.png":{"frame":{"x":0,"y":0,"w":8,"h":8},"rotated":false,"trimmed":false,"spriteSourceSize":{"x":0,"y":0,"w":8,"h":8},"sourceSize":{"w":8,"h":8}}},"meta":{"app":"https://www.codeandweb.com/texturepacker","image":"a.png","size":{"w":8,"h":8},"scale":"1"}}"#;

    const STARLING_XML: &str = r#"<TextureAtlas imagePath="a.png"><SubTexture name="tile" x="0" y="0" width="8" height="8"/></TextureAtlas>"#;

    const COCOS_PLIST: &str = r#"<plist version="1.0"><dict><key>frames</key><dict><key>t.png</key><dict><key>frame</key><string>{{0,0},{8,8}}</string><key>offset</key><string>{0,0}</string><key>sourceSize</key><string>{8,8}</string><key>size</key><string>{8,8}</string><key>rotated</key><false/></dict></dict><key>metadata</key><dict><key>format</key><integer>2</integer><key>size</key><string>{8,8}</string><key>textureFileName</key><string>t.png</string></dict></dict></plist>"#;

    const LIBGDX_ATLAS: &str = "a.png\n  size: 8,8\ntile\n  rotate: false\n  xy: 0, 0\n  size: 8, 8\n  orig: 8, 8\n  offset: 0, 0\n  index: -1\n";

    // detect_spritesheet_format

    #[test]
    fn detect_spritesheet_format_recognizes_each_builtin() {
        assert_eq!(
            detect_spritesheet_format(ASEPRITE_JSON).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_ASEPRITE)
        );
        assert_eq!(
            detect_spritesheet_format(TEXTURE_PACKER_JSON).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER)
        );
        assert_eq!(
            detect_spritesheet_format(STARLING_XML).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_STARLING)
        );
        assert_eq!(
            detect_spritesheet_format(COCOS_PLIST).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_COCOS_PLIST)
        );
        assert_eq!(
            detect_spritesheet_format(LIBGDX_ATLAS).as_deref(),
            Some(SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS)
        );
        assert_eq!(detect_spritesheet_format("plain text"), None);
    }

    // has_spritesheet_format / run_spritesheet_format_*

    #[test]
    fn has_spritesheet_format_reports_builtins() {
        assert!(has_spritesheet_format(SPRITESHEET_FORMAT_KIND_STARLING));
        assert!(!has_spritesheet_format("acme.Unregistered"));
        assert_eq!(
            run_spritesheet_format_detect(SPRITESHEET_FORMAT_KIND_STARLING, STARLING_XML),
            Some(true)
        );
        assert_eq!(
            run_spritesheet_format_detect("acme.Unregistered", STARLING_XML),
            None
        );
    }

    // parse_spritesheet

    #[test]
    fn parse_spritesheet_auto_detects() {
        let data = parse_spritesheet(STARLING_XML, None, None).unwrap();
        assert_eq!(data.frames.len(), 1);
        assert_eq!(data.frames[0].name, "tile");

        let cocos = parse_spritesheet(COCOS_PLIST, None, None).unwrap();
        assert_eq!(cocos.frames.len(), 1);
        assert_eq!(cocos.image_file, "t.png");

        let libgdx = parse_spritesheet(LIBGDX_ATLAS, None, None).unwrap();
        assert_eq!(libgdx.frames.len(), 1);
        assert_eq!(libgdx.image_file, "a.png");

        assert!(parse_spritesheet("not a known format", None, None).is_none());
    }

    #[test]
    fn parse_spritesheet_honors_format_kind_override() {
        let data =
            parse_spritesheet(STARLING_XML, Some(SPRITESHEET_FORMAT_KIND_STARLING), None).unwrap();
        assert_eq!(data.frames.len(), 1);
        // Unknown override kind → None.
        assert!(parse_spritesheet(STARLING_XML, Some("acme.Unregistered"), None).is_none());
    }

    // register_spritesheet_format

    #[test]
    fn register_spritesheet_format_last_write_wins() {
        register_spritesheet_format(
            "acme.MyAtlas".to_string(),
            SpritesheetFormatEntry {
                detect: Box::new(|t| t.starts_with("MYATLAS")),
                parse: Box::new(|_t, _o| SpritesheetData::default()),
            },
        );
        assert!(has_spritesheet_format("acme.MyAtlas"));
        assert_eq!(
            detect_spritesheet_format("MYATLAS v1").as_deref(),
            Some("acme.MyAtlas")
        );
        let parsed = parse_spritesheet("MYATLAS v1", None, None).unwrap();
        assert_eq!(parsed.frames.len(), 0);
    }
}
