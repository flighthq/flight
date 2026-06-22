//! Aseprite JSON export schema — field names match the exported file.
//!
//! Reference: <https://www.aseprite.org/docs/cli/#sheet-json>
//!
//! Aseprite exports either a Hash variant (`frames` is a dict keyed by name)
//! or an Array variant (`frames` is an array with a `filename` field per
//! entry). Both are represented here; use the `AsepriteDocument` enum to
//! accept either at runtime.

use flighthq_spritesheet::SpritesheetAnimationDirection;

// ---------------------------------------------------------------------------
// Primitive shapes
// ---------------------------------------------------------------------------

/// An axis-aligned rectangle as exported by Aseprite.
#[derive(Clone, Debug, Default)]
pub struct AsepriteRect {
    pub h: u32,
    pub w: u32,
    pub x: u32,
    pub y: u32,
}

/// A 2-D size as exported by Aseprite.
#[derive(Clone, Debug, Default)]
pub struct AsepriteSize {
    pub h: u32,
    pub w: u32,
}

// ---------------------------------------------------------------------------
// Frame tags
// ---------------------------------------------------------------------------

/// A named frame-range tag from Aseprite's tag editor.
#[derive(Clone, Debug)]
pub struct AsepriteFrameTag {
    /// Playback direction for this tag range.
    pub direction: SpritesheetAnimationDirection,
    /// Index of the first frame in this tag (inclusive).
    pub from: u32,
    pub name: String,
    /// Index of the last frame in this tag (inclusive).
    pub to: u32,
    /// Optional hex colour label assigned in Aseprite (e.g. `"#ff0000ff"`).
    pub color: Option<String>,
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/// A single layer entry in the Aseprite meta section.
#[derive(Clone, Debug)]
pub struct AsepriteLayer {
    pub blend_mode: String,
    pub name: String,
    pub opacity: u8,
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/// Fields common to both the hash and array frame variants.
#[derive(Clone, Debug, Default)]
pub struct AsepriteBaseFrame {
    /// Per-frame display duration in milliseconds.
    pub duration: u32,
    pub frame: AsepriteRect,
    pub rotated: bool,
    pub source_size: AsepriteSize,
    pub sprite_source_size: AsepriteRect,
    pub trimmed: bool,
}

/// Hash variant: each value in the `frames` dict.
pub type AsepriteHashFrame = AsepriteBaseFrame;

/// Array variant: each element of the `frames` array.
#[derive(Clone, Debug, Default)]
pub struct AsepriteArrayFrame {
    pub filename: String,
    pub base: AsepriteBaseFrame,
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

/// The `meta` block at the top level of an Aseprite export.
#[derive(Clone, Debug)]
pub struct AsepriteMeta {
    pub app: String,
    pub format: String,
    pub frame_tags: Vec<AsepriteFrameTag>,
    pub image: String,
    pub layers: Option<Vec<AsepriteLayer>>,
    /// Scale as a string or float in the file (e.g. `"1"` or `1`).
    pub scale: String,
    pub size: AsepriteSize,
    pub version: String,
}

impl Default for AsepriteMeta {
    fn default() -> Self {
        Self {
            app: "https://www.aseprite.org/".into(),
            format: "RGBA8888".into(),
            frame_tags: Vec::new(),
            image: String::new(),
            layers: None,
            scale: "1".into(),
            size: AsepriteSize::default(),
            version: "1.3".into(),
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
pub struct AsepriteHashDocument {
    pub frames: Vec<(String, AsepriteHashFrame)>,
    pub meta: AsepriteMeta,
}

impl AsepriteHashDocument {
    /// Returns the frame entry for `name`, or `None` when absent.
    pub fn get(&self, name: &str) -> Option<&AsepriteHashFrame> {
        self.frames.iter().find(|(k, _)| k == name).map(|(_, v)| v)
    }
}

/// Array variant: `frames` is a `Vec` and each entry carries a `filename`.
#[derive(Clone, Debug, Default)]
pub struct AsepriteArrayDocument {
    pub frames: Vec<AsepriteArrayFrame>,
    pub meta: AsepriteMeta,
}

/// Either a hash-keyed or array-form Aseprite export document.
#[derive(Clone, Debug)]
pub enum AsepriteDocument {
    Hash(AsepriteHashDocument),
    Array(AsepriteArrayDocument),
}
