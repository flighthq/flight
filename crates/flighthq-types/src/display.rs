use crate::geometry::Rectangle;
use crate::kind::KindId;
use crate::resource::ImageResource;
use flighthq_signals::Signal;

// ---------------------------------------------------------------------------
// Kind symbols
// ---------------------------------------------------------------------------

/// Lazy-initialized kind id for DisplayObject nodes.
pub fn display_object_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn bitmap_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn shape_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn sprite_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn stage_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn video_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn movie_clip_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn quad_batch_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn tilemap_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn particle_emitter_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn render_view_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn html_view_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn native_text_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn rich_text_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn scale9_shape_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

pub fn text_label_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

// ---------------------------------------------------------------------------
// StageSignals
// ---------------------------------------------------------------------------

/// Signals emitted by a Stage node.
#[derive(Debug, Default)]
pub struct StageSignals {
    pub on_fullscreen_changed: Signal<()>,
    pub on_orientation_changed: Signal<()>,
    pub on_resize: Signal<()>,
}

/// Per-Stage data payload.
#[derive(Clone, Debug, Default)]
pub struct StageData {
    /// Background fill color (packed RGBA), or `None` for transparent.
    pub color: Option<u32>,
    pub stage_height: f32,
    pub stage_width: f32,
}

// ---------------------------------------------------------------------------
// BitmapData
// ---------------------------------------------------------------------------

/// Per-Bitmap data payload.
#[derive(Clone, Debug, Default)]
pub struct BitmapData {
    pub image: Option<ImageResource>,
    pub smoothing: bool,
    pub source_rectangle: Option<Rectangle>,
}

// ---------------------------------------------------------------------------
// ShapeData
// ---------------------------------------------------------------------------

/// Per-Shape data payload. Commands are stored as a raw byte/opaque buffer until
/// a renderer processes them.
#[derive(Debug, Default)]
pub struct ShapeData {
    pub commands: Vec<Box<dyn std::any::Any + Send + Sync>>,
}

// ---------------------------------------------------------------------------
// Scale9ShapeData
// ---------------------------------------------------------------------------

/// Per-Scale9Shape data payload.
#[derive(Debug, Default)]
pub struct Scale9ShapeData {
    pub commands: Vec<Box<dyn std::any::Any + Send + Sync>>,
    pub scale9_grid: Rectangle,
}

// ---------------------------------------------------------------------------
// SpriteData (display object Sprite, backed by a TextureAtlas)
// ---------------------------------------------------------------------------

/// Per-Sprite data payload.
#[derive(Clone, Debug, Default)]
pub struct SpriteDisplayObjectData {
    pub atlas: Option<crate::resource::TextureAtlas>,
    pub id: u32,
    pub rect: Option<Rectangle>,
}

// ---------------------------------------------------------------------------
// VideoData
// ---------------------------------------------------------------------------

/// Per-Video data payload.
#[derive(Clone, Debug, Default)]
pub struct VideoData {
    pub smoothing: bool,
    pub source: Option<crate::resource::VideoResource>,
}

// ---------------------------------------------------------------------------
// MovieClipData / MovieClipSignals
// ---------------------------------------------------------------------------

/// Signals emitted by a MovieClip.
#[derive(Debug, Default)]
pub struct MovieClipSignals {
    pub on_enter_frame: Signal<()>,
    pub on_exit_frame: Signal<()>,
    pub on_frame_constructed: Signal<()>,
}

/// Per-MovieClip data payload.
#[derive(Debug, Default)]
pub struct MovieClipData {
    pub timeline: Option<crate::animation::Timeline>,
}

// ---------------------------------------------------------------------------
// QuadBatchData
// ---------------------------------------------------------------------------

/// How quad transforms are packed in `QuadBatchData.transforms`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum QuadTransformType {
    #[default]
    Vector2,
    Matrix3x2,
}

/// Per-QuadBatch data payload.
#[derive(Debug, Default)]
pub struct QuadBatchData {
    pub atlas: Option<crate::resource::TextureAtlas>,
    pub ids: Vec<u16>,
    pub instance_count: u32,
    pub material_data: Option<Vec<Option<Box<dyn crate::material::MaterialData>>>>,
    pub transforms: Vec<f32>,
    pub transform_type: QuadTransformType,
}

// ---------------------------------------------------------------------------
// TilemapData
// ---------------------------------------------------------------------------

/// Per-Tilemap data payload.
#[derive(Debug, Default)]
pub struct TilemapData {
    pub tileset: Option<crate::resource::Tileset>,
    pub columns: u32,
    pub rows: u32,
    pub tiles: Vec<i16>,
    pub material_data: Option<Vec<Option<Box<dyn crate::material::MaterialData>>>>,
}

// ---------------------------------------------------------------------------
// RenderViewData
// ---------------------------------------------------------------------------

/// Per-RenderView data payload.
#[derive(Clone, Debug, Default)]
pub struct RenderViewData {
    pub height: f32,
    pub width: f32,
    // The renderer reference is intentionally opaque here; backends cast it.
}

// ---------------------------------------------------------------------------
// HTMLViewData
// ---------------------------------------------------------------------------

/// Per-HTMLView data payload.
#[derive(Clone, Debug, Default)]
pub struct HtmlViewData {
    pub height: f32,
    pub width: f32,
    // `element` is a web-platform concept; on native this is None.
}
