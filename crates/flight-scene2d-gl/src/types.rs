// flight-lint: allow-file(contract-vocabulary, file-structure) D17 GL renderer contracts carry thread-bound render-gl state, opaque host handles and backend-typed callbacks
//! The types scene2d-gl owns (TS `GlShapeMesh.ts`, `GlShapeRendererData.ts`,
//! `GlRichTextOverlay.ts`, and the concrete `GlColorAdjustmentMaterialFeature` contract whose
//! registry slot render-gl holds erased), plus the render-owned `ShapeRasterizer` callback, which
//! has no Rust home yet.

use std::sync::Arc;

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_image::ImageResource;
use flight_node::RendererDataFields;
use flight_render::RenderProxy2D;
use flight_render_gl::{GlColorAdjustmentData, GlRenderState, GlRenderStateRuntime};
use flight_shape::ShapeCommandToken;
use flight_surface::CanvasSurface;

/// One tessellated solid-fill region of a Shape, ready for the flat-color mesh path (TS
/// `GlShapeMesh`): interleaved xy `vertices`, triangle `indices`, a packed `0xRRGGBBAA` fill
/// `color`, and the region `alpha`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlShapeMesh {
    pub vertices: Vec<f32>,
    pub indices: Vec<u16>,
    pub color: u32,
    pub alpha: f32,
}

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

/// The opt-in inline color-adjustment fold for the GL sprite/quad batch (TS
/// `GlColorAdjustmentMaterialFeature`). Registered as persistent per-state policy by
/// `register_gl_color_adjustment_material_feature` into render-gl's erased registry slot.
pub struct GlColorAdjustmentMaterialFeature {
    pub fragment_shader_chunk: &'static str,
    pub matrix_fragment_shader_chunk: &'static str,
    pub draw_shape_meshes: fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>, &[GlShapeMesh]),
    pub flush: fn(&mut GlRenderState, usize) -> bool,
    pub record: fn(&mut GlRenderStateRuntime, Option<&GlColorAdjustmentData>, usize),
}

/// Replays a shape's command stream into a 2D context, for a backend that cannot express every fill
/// as GPU geometry (TS `ShapeRasterizer`, owned by render). `state` is the backend's own render
/// state, passed through for registry-miss reporting only.
pub type ShapeRasterizer<S> =
    Arc<dyn Fn(&CanvasRenderingContext2D, &[ShapeCommandToken], &mut S) + Send + Sync>;

/// The Canvas 2D drawing members the raster paths call (TS `CanvasRenderingContext2D`). A host's
/// opaque `flight_host::CanvasRenderingContext2D` handle narrows to an `Arc<dyn Canvas2DContext>`
/// (the D17 narrowing pattern of `WgpuCanvasContext`); implemented by host 2D providers and by test
/// fakes. Every member takes `&self`: a context is a shared host object.
pub trait Canvas2DContext: Send + Sync {
    fn begin_path(&self);
    fn clear_rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn clip(&self);
    fn fill_rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn fill_text(&self, text: &str, x: f32, y: f32);
    fn line_to(&self, x: f32, y: f32);
    fn measure_text(&self, text: &str) -> f32;
    fn move_to(&self, x: f32, y: f32);
    fn rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn restore(&self);
    fn save(&self);
    fn set_fill_style(&self, style: &str);
    fn set_font(&self, font: &str);
    fn set_global_alpha(&self, alpha: f32);
    fn set_line_width(&self, width: f32);
    fn set_stroke_style(&self, style: &str);
    fn set_text_align(&self, align: &str);
    fn set_text_baseline(&self, baseline: &str);
    fn set_transform(&self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32);
    fn stroke(&self);
    fn stroke_rect(&self, x: f32, y: f32, width: f32, height: f32);
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
}

/// Per-state package record (TS module WeakMaps keyed by `GlRenderState`).
#[derive(Default)]
pub(crate) struct Scene2DGlRuntime {
    pub(crate) render_cache_targets: Option<Vec<GlRenderCacheTargetEntry>>,
    pub(crate) text_input_overlay: Option<GlRichTextOverlay>,
}

/// Options for baking a render cache (TS `RenderCacheRefreshOptions`, owned by render; it has no
/// Rust home yet). `padding` is the transparent margin, in source pixels, baked around the content
/// on every side.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderCacheRefreshOptions {
    pub padding: Option<f32>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
}

/// One render cache's offscreen target, keyed by the cache's entity id (TS
/// `Map<RenderCache, GlTextureRenderTarget>`).
pub(crate) struct GlRenderCacheTargetEntry {
    pub(crate) cache: u64,
    pub(crate) target: std::rc::Rc<std::cell::RefCell<flight_render_gl::GlTextureRenderTarget>>,
}

/// Resolves render-gl's erased color-adjustment slot to this package's concrete feature contract.
pub(crate) fn resolve_gl_color_adjustment_material_feature(
    state: &GlRenderState,
) -> Option<&'static GlColorAdjustmentMaterialFeature> {
    let slot = state.gl_registries.color_adjustment_feature.as_ref()?;
    return slot
        .downcast_ref::<&'static GlColorAdjustmentMaterialFeature>()
        .copied();
}

flight_node::impl_renderer_data!(GlRichTextData);
flight_node::impl_renderer_data!(GlScale9ShapeData);
flight_node::impl_renderer_data!(GlShapeRendererData);
flight_node::impl_renderer_data!(GlTextLabelData);
