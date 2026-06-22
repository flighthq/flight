//! Starling / Sparrow XML schema — field names match the exported file.
//!
//! Reference: <https://doc.starling-framework.org/current/starling/textures/TextureAtlas.html>

// ---------------------------------------------------------------------------
// SubTexture
// ---------------------------------------------------------------------------

/// A single `<SubTexture>` element from a Starling / Sparrow XML atlas.
#[derive(Clone, Debug, Default)]
pub struct StarlingSubTexture {
    /// Original untrimmed frame height (present when the frame is trimmed).
    pub frame_height: Option<f32>,
    /// Original untrimmed frame width (present when the frame is trimmed).
    pub frame_width: Option<f32>,
    /// Left edge of the visible area within the original frame; typically
    /// negative.
    pub frame_x: Option<f32>,
    /// Top edge of the visible area within the original frame; typically
    /// negative.
    pub frame_y: Option<f32>,
    /// Height of the atlas rectangle.
    pub height: f32,
    /// Frame identifier used to look up the sub-texture at runtime.
    pub name: String,
    /// Absolute X pivot position in the original frame coordinate space.
    pub pivot_x: Option<f32>,
    /// Absolute Y pivot position in the original frame coordinate space.
    pub pivot_y: Option<f32>,
    /// Whether the frame is rotated 90° CW inside the atlas.
    pub rotated: Option<bool>,
    /// Width of the atlas rectangle.
    pub width: f32,
    /// Atlas X offset of the rectangle.
    pub x: f32,
    /// Atlas Y offset of the rectangle.
    pub y: f32,
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/// A parsed Starling / Sparrow XML atlas document.
#[derive(Clone, Debug, Default)]
pub struct StarlingDocument {
    /// Relative path to the atlas image file; value of the `imagePath`
    /// attribute on `<TextureAtlas>`.
    pub image_path: String,
    pub sub_textures: Vec<StarlingSubTexture>,
}
