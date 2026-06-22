//! Texture Packer JSON schema — field names match the exported file.
//!
//! Reference: <https://www.codeandweb.com/texturepacker/documentation/texture-settings>
//!
//! Supports both the Hash (dict-keyed frames) and Array (array of frames with
//! `filename`) variants.

use flighthq_spritesheet::SpritesheetAnimationDirection;

// ---------------------------------------------------------------------------
// Primitive shapes
// ---------------------------------------------------------------------------

/// An axis-aligned rectangle as exported by Texture Packer.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerRect {
    pub h: u32,
    pub w: u32,
    pub x: u32,
    pub y: u32,
}

/// A 2-D size as exported by Texture Packer.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerSize {
    pub h: u32,
    pub w: u32,
}

/// A normalized pivot point.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerPivot {
    pub x: f32,
    pub y: f32,
}

// ---------------------------------------------------------------------------
// Frame tags
// ---------------------------------------------------------------------------

/// A named frame-range tag from a Texture Packer export.
#[derive(Clone, Debug)]
pub struct TexturePackerFrameTag {
    pub direction: SpritesheetAnimationDirection,
    /// Index of the first frame in this tag (inclusive).
    pub from: u32,
    pub name: String,
    /// Index of the last frame in this tag (inclusive).
    pub to: u32,
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/// Hash variant frame: a single entry in the `frames` dict.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerHashFrame {
    pub frame: TexturePackerRect,
    /// Optional normalized pivot point.
    pub pivot: Option<TexturePackerPivot>,
    pub rotated: bool,
    pub source_size: TexturePackerSize,
    pub sprite_source_size: TexturePackerRect,
    pub trimmed: bool,
}

/// Array variant frame: extends the hash frame with a `filename` field.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerArrayFrame {
    pub filename: String,
    pub frame: TexturePackerRect,
    pub pivot: Option<TexturePackerPivot>,
    pub rotated: bool,
    pub source_size: TexturePackerSize,
    pub sprite_source_size: TexturePackerRect,
    pub trimmed: bool,
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

/// The `meta` block at the top level of a Texture Packer JSON export.
#[derive(Clone, Debug)]
pub struct TexturePackerMeta {
    pub app: String,
    pub format: String,
    /// Optional frame tags; absent when no animations were defined.
    pub frame_tags: Option<Vec<TexturePackerFrameTag>>,
    pub image: String,
    /// Scale as a float or string in the file (e.g. `1` or `"1"`).
    pub scale: f32,
    pub size: TexturePackerSize,
    pub version: String,
}

impl Default for TexturePackerMeta {
    fn default() -> Self {
        Self {
            app: "https://www.codeandweb.com/texturepacker".into(),
            format: "RGBA8888".into(),
            frame_tags: None,
            image: String::new(),
            scale: 1.0,
            size: TexturePackerSize::default(),
            version: "1.0".into(),
        }
    }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/// Hash-keyed variant: `frames` is an object keyed by frame name. Stored as an
/// insertion-ordered `Vec` of pairs so frame order survives a round trip,
/// matching JavaScript object-iteration order.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerHashDocument {
    pub frames: Vec<(String, TexturePackerHashFrame)>,
    pub meta: TexturePackerMeta,
}

impl TexturePackerHashDocument {
    /// Returns the frame entry for `name`, or `None` when absent.
    pub fn get(&self, name: &str) -> Option<&TexturePackerHashFrame> {
        self.frames.iter().find(|(k, _)| k == name).map(|(_, v)| v)
    }
}

/// Array variant: `frames` is a `Vec` and each entry carries a `filename`.
#[derive(Clone, Debug, Default)]
pub struct TexturePackerArrayDocument {
    pub frames: Vec<TexturePackerArrayFrame>,
    pub meta: TexturePackerMeta,
}

/// Either a hash-keyed or array-form Texture Packer export document.
#[derive(Clone, Debug)]
pub enum TexturePackerDocument {
    Hash(TexturePackerHashDocument),
    Array(TexturePackerArrayDocument),
}
