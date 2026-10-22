// flight-lint: allow-file(contract-vocabulary, file-structure) D17 GL renderer contracts carry thread-bound render-gl state, opaque host handles and backend-typed callbacks
//! The types scene2d-gl owns (TS `GlShapeRendererData.ts`, `GlRichTextOverlay.ts` and the
//! renderer-private scratch records). The color-adjustment feature contract and `GlShapeMesh` live
//! in render-gl, which types the registry slot (D8 lowest namer).

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_image::ImageResource;
use flight_node::RendererDataFields;
use flight_render_gl::GlShapeMesh;
use flight_surface::CanvasSurface;

/// NodeRenderer-private scratch for a Shape node on the GL backend (TS `GlShapeRendererData`). The
/// two halves are independent: `meshes` caches the tessellated form (`None` when some region has
/// none), and `surface`/`image` plus the `last_*` fields cache the rasterized form.
#[derive(Default)]
pub struct GlShapeRendererData {
    pub(crate) renderer_data: RendererDataFields,
    pub image: Option<Ref<ImageResource>>,
    pub last_content_id: i64,
    pub last_h: f32,
    pub last_pixel_ratio: f32,
    pub last_w: f32,
    pub mesh_version: i64,
    pub meshes: Option<Vec<GlShapeMesh>>,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// NodeRenderer-private scratch for a Scale9Shape node (TS `GlScale9ShapeData`): the device-pixel
/// raster surface, its uploadable image, and the inputs it was last rasterized under.
#[derive(Default)]
pub struct GlScale9ShapeData {
    pub(crate) renderer_data: RendererDataFields,
    pub image: Option<Ref<ImageResource>>,
    pub last_h: f32,
    pub last_scale_x: f32,
    pub last_scale_y: f32,
    pub last_content_id: i64,
    pub last_pixel_ratio: f32,
    pub last_w: f32,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// NodeRenderer-private scratch for a TextLabel (TS `GlTextLabelData`): the device-pixel raster
/// surface and its uploadable image, its allocation, the logical size of the last rasterization, and
/// the content revision and pixel ratio it was rasterized under.
#[derive(Default)]
pub struct GlTextLabelData {
    pub(crate) renderer_data: RendererDataFields,
    pub alloc_h: f32,
    pub alloc_w: f32,
    pub image: Option<Ref<ImageResource>>,
    pub last_content_id: i64,
    pub last_pixel_ratio: f32,
    pub log_h: f32,
    pub log_w: f32,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// NodeRenderer-private scratch for a RichText (TS `GlRichTextData`). The raster surface belongs to
/// the render node rather than the module; its Image identity is the GPU-cache key.
#[derive(Default)]
pub struct GlRichTextData {
    pub(crate) renderer_data: RendererDataFields,
    pub alloc_h: f32,
    pub alloc_w: f32,
    pub image: Option<Ref<ImageResource>>,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// Rasterizes an editable-field overlay onto a RichText's offscreen field canvas (TS
/// `GlRichTextOverlay`): context, source, layout, field width and height, and the displayed text.
pub type GlRichTextOverlay = fn(
    &CanvasRenderingContext2D,
    &Ref<flight_text::RichText>,
    &flight_textlayout::TextLayoutResult,
    f32,
    f32,
    &str,
);

/// The position-only stencil program of the contour clip path (TS `ClipProgram`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GlClipProgram {
    pub(crate) program: glow::NativeProgram,
    pub(crate) buffer: glow::NativeBuffer,
    pub(crate) position_location: u32,
    pub(crate) world_matrix_location: Option<glow::NativeUniformLocation>,
    pub(crate) projection_location: Option<glow::NativeUniformLocation>,
}

/// Per-context package record (TS module WeakMaps keyed by `GlContext`).
#[derive(Default)]
pub(crate) struct Scene2DGlContextRuntime {
    pub(crate) clip_program: Option<GlClipProgram>,
    pub(crate) velocity_program: Option<GlVelocityProgram>,
}

/// Per-state package record (TS module WeakMaps keyed by `GlRenderState`).
#[derive(Default)]
pub(crate) struct Scene2DGlRuntime {
    pub(crate) render_cache_targets: Option<Vec<GlRenderCacheTargetEntry>>,
    pub(crate) text_input_overlay: Option<GlRichTextOverlay>,
}

/// The lazily compiled velocity program of one context (TS `GlVelocityProgram`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GlVelocityProgram {
    pub(crate) program: glow::NativeProgram,
    pub(crate) quad_buffer: glow::NativeBuffer,
    pub(crate) loc_corner: u32,
    pub(crate) loc_clip_rect: Option<glow::NativeUniformLocation>,
    pub(crate) loc_velocity: Option<glow::NativeUniformLocation>,
}

/// One render cache's offscreen target, keyed by the cache's entity id (TS
/// `Map<RenderCache, GlTextureRenderTarget>`).
pub(crate) struct GlRenderCacheTargetEntry {
    pub(crate) cache: u64,
    pub(crate) target: std::rc::Rc<std::cell::RefCell<flight_render_gl::GlTextureRenderTarget>>,
}

flight_node::impl_renderer_data!(GlRichTextData);
flight_node::impl_renderer_data!(GlScale9ShapeData);
flight_node::impl_renderer_data!(GlShapeRendererData);
flight_node::impl_renderer_data!(GlTextLabelData);
