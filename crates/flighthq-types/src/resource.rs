use crate::alpha::AlphaType;
use crate::entity::Entity;
use crate::image::PixelFormat;
use flighthq_signals::Signal;

// ---------------------------------------------------------------------------
// ImageResource
// ---------------------------------------------------------------------------

/// Backend-agnostic image resource: pixel dimensions plus CPU pixel data.
///
/// On native there is no canvas element; `data` is the primary representation.
/// `version` is bumped whenever pixels change so backends know to re-upload.
#[derive(Clone, Debug)]
pub struct ImageResource {
    pub alpha_type: AlphaType,
    /// Raw pixel bytes laid out per `format`, or `None` for element-only resources.
    pub data: Option<Vec<u8>>,
    /// Layout of `data` (channel order + type).
    pub format: PixelFormat,
    pub height: u32,
    /// Bumped whenever pixels change; backends compare to decide when to re-upload.
    pub version: u32,
    pub width: u32,
}

impl Entity for ImageResource {}

impl Default for ImageResource {
    fn default() -> Self {
        Self {
            alpha_type: AlphaType::Straight,
            data: None,
            format: PixelFormat::Rgba8Unorm,
            height: 0,
            version: 0,
            width: 0,
        }
    }
}

/// A Surface narrows `data` to `Some` and adds a color space field.
#[derive(Clone, Debug)]
pub struct Surface {
    pub alpha_type: AlphaType,
    pub data: Vec<u8>,
    pub format: PixelFormat,
    pub height: u32,
    pub version: u32,
    pub width: u32,
    pub color_space: ColorSpace,
}

impl Entity for Surface {}

/// Color space for surface pixel data.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ColorSpace {
    #[default]
    Srgb,
    DisplayP3,
}

// ---------------------------------------------------------------------------
// AudioResource
// ---------------------------------------------------------------------------

/// State of an audio playback channel.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum AudioChannelState {
    Complete,
    Paused,
    #[default]
    Stopped,
    Playing,
}

/// Audio playback channel.
///
/// `loops_remaining` is internal playback bookkeeping (the TS port keeps it in
/// a runtime WeakMap; Rust channels are value types with no stable identity, so
/// it lives on the channel and is managed by `flighthq-media`). It is not part
/// of the user-facing playback options.
#[derive(Debug, Default)]
pub struct AudioChannel {
    pub current_time: f64,
    pub gain: f32,
    pub length: f64,
    pub loops: i32,
    pub loops_remaining: i32,
    pub playback_rate: f32,
    pub source: Option<AudioResource>,
    pub state: AudioChannelState,
    pub on_complete: Signal<()>,
}

/// Options for starting audio playback.
#[derive(Clone, Debug, Default)]
pub struct AudioPlayOptions {
    pub current_time: Option<f64>,
    pub gain: Option<f32>,
    pub loops: Option<i32>,
    pub playback_rate: Option<f32>,
}

/// A raw audio resource (decoded PCM buffer or platform-native handle).
#[derive(Clone, Debug, Default)]
pub struct AudioResource {
    /// Decoded audio data, or `None` until loaded.
    pub buffer: Option<Vec<u8>>,
}

/// URL descriptor for loading an audio resource.
#[derive(Clone, Debug)]
pub struct AudioResourceUrl {
    pub url: String,
    pub mime_type: Option<String>,
}

// ---------------------------------------------------------------------------
// VideoResource
// ---------------------------------------------------------------------------

/// State of a video playback channel.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum VideoChannelState {
    Complete,
    Paused,
    #[default]
    Stopped,
    Playing,
}

/// Video playback channel.
///
/// `loops_remaining` is internal playback bookkeeping (the TS port keeps it in
/// a runtime WeakMap; Rust channels are value types with no stable identity, so
/// it lives on the channel and is managed by `flighthq-media`). It is not part
/// of the user-facing playback options.
#[derive(Debug, Default)]
pub struct VideoChannel {
    pub current_time: f64,
    pub gain: f32,
    pub length: f64,
    pub loops: i32,
    pub loops_remaining: i32,
    pub playback_rate: f32,
    pub source: Option<VideoResource>,
    pub state: VideoChannelState,
    pub on_complete: Signal<()>,
}

/// Options for starting video playback.
#[derive(Clone, Debug, Default)]
pub struct VideoPlayOptions {
    pub current_time: Option<f64>,
    pub gain: Option<f32>,
    pub loops: Option<i32>,
    pub playback_rate: Option<f32>,
}

/// A raw video resource (platform-native handle or file path).
#[derive(Clone, Debug, Default)]
pub struct VideoResource {
    /// On native: a path or decoded frame source. On web: an HTML video element proxy.
    pub path: Option<String>,
}

/// URL descriptor for loading a video resource.
#[derive(Clone, Debug)]
pub struct VideoResourceUrl {
    pub url: String,
    pub mime_type: Option<String>,
}

// ---------------------------------------------------------------------------
// FontResource / Font
// ---------------------------------------------------------------------------

/// A loaded font face (platform-native handle).
#[derive(Clone, Debug, Default)]
pub struct FontResource {
    pub family: String,
    /// Platform font face handle — opaque on native, holds font bytes or a native ref.
    pub face: Option<Vec<u8>>,
}

/// Registered font entity.
#[derive(Clone, Debug)]
pub struct Font {
    pub name: String,
}

impl Entity for Font {}

/// URL descriptor for loading a font.
#[derive(Clone, Debug)]
pub struct FontUrl {
    pub url: String,
    pub format: Option<String>,
}

// ---------------------------------------------------------------------------
// TextureAtlas / TextureAtlasRegion
// ---------------------------------------------------------------------------

/// A texture atlas: one image plus a list of named/indexed regions.
#[derive(Clone, Debug, Default)]
pub struct TextureAtlas {
    pub image: Option<ImageResource>,
    pub regions: Vec<TextureAtlasRegion>,
}

impl Entity for TextureAtlas {}

/// A single region within a `TextureAtlas`.
///
/// `name` is an optional identifier (e.g. a frame name from a packed
/// spritesheet); the trim/rotation fields describe how the region was packed:
/// `trimmed` whitespace, `rotated` 90°, with `source_x`/`source_y` the trimmed
/// offset and `original_width`/`original_height` the untrimmed source size.
#[derive(Clone, Debug, Default)]
pub struct TextureAtlasRegion {
    pub height: f32,
    pub id: u32,
    pub name: Option<String>,
    pub original_height: Option<f32>,
    pub original_width: Option<f32>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: bool,
    pub source_x: f32,
    pub source_y: f32,
    pub trimmed: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

impl Entity for TextureAtlasRegion {}

/// A `TextureAtlasRegion`-like value (no entity identity).
#[derive(Clone, Debug, Default)]
pub struct TextureAtlasRegionLike {
    pub height: f32,
    pub id: u32,
    pub name: Option<String>,
    pub original_height: Option<f32>,
    pub original_width: Option<f32>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: bool,
    pub source_x: f32,
    pub source_y: f32,
    pub trimmed: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

// ---------------------------------------------------------------------------
// Tileset
// ---------------------------------------------------------------------------

/// A tileset: a texture atlas plus tile dimensions.
///
/// `margin` is the pixel padding between the tile grid and the image edge;
/// `spacing` is the pixel gap between adjacent tiles.
#[derive(Clone, Debug, Default)]
pub struct Tileset {
    pub atlas: Option<TextureAtlas>,
    pub columns: u32,
    pub margin: f32,
    pub rows: u32,
    pub spacing: f32,
    pub tile_height: f32,
    pub tile_width: f32,
}

impl Entity for Tileset {}

// ---------------------------------------------------------------------------
// ResourceLoader signals
// ---------------------------------------------------------------------------

/// Progress payload for a batch resource-loading operation.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ResourceLoadProgress {
    /// Number of resources finished loading so far.
    pub loaded: u32,
    /// Total number of resources in the batch.
    pub total: u32,
}

/// Error payload delivered through `ResourceLoader::on_error`. Carries the
/// boxed error plus the failing item's key (`None` for batch-level errors that
/// predate the new keyed loader).
#[derive(Debug)]
pub struct ResourceLoadErrorEvent {
    pub error: Box<dyn std::error::Error + Send + Sync>,
    pub key: Option<String>,
}

/// Signals for a batch resource-loading operation.
///
/// `on_complete` carries the per-item [`crate::ResourceLoadReport`] list;
/// `on_error` carries the failing item's error and key; `on_cancel`,
/// `on_pause`, and `on_resume` are bare notifications.
#[derive(Debug, Default)]
pub struct ResourceLoader {
    pub on_cancel: Signal<()>,
    pub on_complete: Signal<Vec<crate::resource_load::ResourceLoadReport>>,
    pub on_error: Signal<ResourceLoadErrorEvent>,
    pub on_pause: Signal<()>,
    pub on_progress: Signal<ResourceLoadProgress>,
    pub on_resume: Signal<()>,
}
