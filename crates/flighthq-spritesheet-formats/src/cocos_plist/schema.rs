//! Cocos Creator / Cocos2d-x plist atlas schema — field names as they appear in
//! the plist file.
//!
//! Supports both old-style keys (frame, offset, sourceSize, size, rotated,
//! trimmed) and new-style sprite-prefixed keys (textureRect, spriteOffset,
//! spriteSourceSize, spriteSize, textureRotated, spriteTrimmed). The parser
//! normalises both variants into this shape.

/// A single frame descriptor within a Cocos plist atlas.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CocosPlistFrame {
    /// Rect of this frame in the atlas, as a plist string `"{{x,y},{w,h}}"`.
    pub frame: String,
    /// Pixel offset of the trimmed sprite within its original bounds, as a plist
    /// string `"{x,y}"`.
    pub sprite_offset: String,
    /// Trimmed size of this frame in the atlas, as a plist string `"{w,h}"`.
    pub sprite_size: String,
    /// Original (untrimmed) size of the source sprite, as a plist string `"{w,h}"`.
    pub sprite_source_size: String,
    /// Whether the sprite was trimmed to remove transparent borders.
    pub sprite_trimmed: bool,
    /// Whether the frame is rotated 90 degrees clockwise in the atlas.
    pub texture_rotated: bool,
    /// Optional aliases (alternate names) for this frame. `None` when absent.
    pub aliases: Option<Vec<String>>,
}

/// Atlas-level metadata for a Cocos plist document.
#[derive(Clone, Debug, PartialEq)]
pub struct CocosPlistMetadata {
    /// Plist format version (2 = old-style, 3 = new-style sprite-prefixed keys).
    pub format: i64,
    /// Size of the atlas texture, as a plist string `"{w,h}"`.
    pub size: String,
    /// File name of the atlas texture image.
    pub texture_file_name: String,
}

impl Default for CocosPlistMetadata {
    fn default() -> Self {
        Self {
            format: 0,
            size: "{0,0}".to_string(),
            texture_file_name: String::new(),
        }
    }
}

/// A parsed Cocos plist atlas document.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CocosPlistDocument {
    /// Frame name → frame descriptor, in document order. The TS `Record` is an
    /// insertion-ordered object iterated by `Object.entries`; an ordered `Vec`
    /// preserves that frame ordering in the produced [`SpritesheetData`].
    pub frames: Vec<(String, CocosPlistFrame)>,
    /// Atlas metadata.
    pub metadata: CocosPlistMetadata,
}
