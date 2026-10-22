// flight-lint: allow-file(contract-vocabulary) D17: scene2d-wgpu contracts carry native wgpu values, host handles and the Rust callback/trait-object forms of the TS closure and CanvasRenderingContext2D types
// flight-lint: allow-file(file-structure, sugar-delegates) D16 renderer-data trait implementations are required plumbing beside the declarations
//! The scene2d-wgpu contract types (TS `types/src/Wgpu*.ts` owned by scene2d-wgpu), the concrete
//! forms of the opaque render-wgpu slots this package fills (color-adjustment feature, shape
//! rasterizer, velocity writers), the renderer-private scratch records, and the per-state package
//! record that replaces the source's module WeakMaps (D5).

use std::sync::Arc;

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_image::{ImageResolverState, ImageResource};
use flight_node::{NodeRef, RendererDataFields};
use flight_render::{CanvasHostSurfaces, RenderProxy2D};
use flight_render_wgpu::{
    WgpuColorAdjustmentFlush, WgpuColorScaleBiasInput, WgpuRenderState, WgpuRenderStateRuntime,
    WgpuShapeMeshBuffers, WgpuTextureRenderTarget,
};
use flight_shape::ShapeCommandToken;
use flight_surface::CanvasSurface;
use flight_text::RichText;
use flight_textlayout::TextLayoutResult;
use flight_velocity::VelocityField;

/// The opt-in color-adjustment capability installed in a state's registry slot (TS
/// `WgpuColorAdjustmentMaterialFeature`). render-wgpu retains it opaquely
/// (`WgpuColorAdjustmentMaterialFeatureSlot`); the batch writer narrows it here. `record` folds one
/// instance's adjustment into the active batch; `resolve_flush` returns a tinted batch's group-3
/// storage data and folded module, or `None` for the lean material path.
pub struct WgpuColorAdjustmentMaterialFeature {
    pub fragment_shader_chunk: &'static str,
    pub matrix_fragment_shader_chunk: &'static str,
    pub draw_shape_meshes: Option<
        fn(
            &mut WgpuRenderState,
            &RenderProxy2D<WgpuRenderState>,
            &[WgpuShapeMesh],
            &mut WgpuShapeMeshBuffers,
        ),
    >,
    pub record: fn(&mut WgpuRenderStateRuntime, Option<&WgpuColorScaleBiasInput>, u32),
    pub resolve_flush: fn(&mut WgpuRenderState, u32) -> Option<WgpuColorAdjustmentFlush>,
}

/// Per-frame GPU draw statistics for a render state (TS `WgpuRenderStats`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WgpuRenderStats {
    /// Number of GPU draw calls issued this frame.
    pub draw_call_count: u32,
    /// Total sprite/quad/particle instances drawn this frame.
    pub instance_count: u32,
    /// Number of quad-batch writer flushes triggered this frame.
    pub batch_flush_count: u32,
    /// Number of canvas-to-GPU texture uploads issued this frame.
    pub texture_upload_count: u32,
}

/// Draws editable-input chrome onto a rich text field's offscreen canvas (TS
/// `WgpuRichTextOverlay`): the context, the field, its layout, the field size and the displayed text.
pub type WgpuRichTextOverlay =
    fn(&CanvasRenderingContext2D, &RichText, &TextLayoutResult, f32, f32, &str);

/// One tessellated solid fill or stroke (TS `WgpuShapeMesh`): float2 positions, uint16 triangle
/// indices, the region's packed `0xRRGGBBAA` color and its alpha.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuShapeMesh {
    pub vertices: Vec<f32>,
    pub indices: Vec<u16>,
    pub color: u32,
    pub alpha: f32,
}

/// The per-node cache every shape strategy reads and writes (TS `WgpuShapeRendererData`): the
/// tessellated half (`meshes`, `mesh_buffers`) and the rasterized half (`surface`, `image`, `last_*`).
#[derive(Default)]
pub struct WgpuShapeRendererData {
    pub(crate) renderer_data: RendererDataFields,
    pub image: Option<Ref<ImageResource>>,
    pub last_content_id: i64,
    pub last_h: f32,
    pub last_pixel_ratio: f32,
    pub last_w: f32,
    pub mesh_buffers: WgpuShapeMeshBuffers,
    pub mesh_version: i64,
    pub meshes: Option<Vec<WgpuShapeMesh>>,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// The scratch a TextLabel node keeps on the WebGPU backend (TS `WgpuTextLabelData`): its raster
/// surface and image, the allocated pixel size, and the logical size last drawn.
#[derive(Default)]
pub struct WgpuTextLabelData {
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

/// The scratch a RichText node keeps on the WebGPU backend (TS `WgpuRichTextData`).
#[derive(Default)]
pub struct WgpuRichTextData {
    pub(crate) renderer_data: RendererDataFields,
    pub alloc_h: f32,
    pub alloc_w: f32,
    pub image: Option<Ref<ImageResource>>,
    pub surface: Option<Ref<CanvasSurface>>,
}

/// The scratch a Scale9Shape node keeps on the WebGPU backend (TS `WgpuScale9ShapeData`).
#[derive(Default)]
pub struct WgpuScale9ShapeData {
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

/// Replays a shape's command stream into a 2D context, for a backend that cannot express every fill
/// as GPU geometry (TS `ShapeRasterizer`, owned by render and not yet ported there). `state` is the
/// backend's own render state, passed through for registry-miss reporting only. render-wgpu retains
/// a `ShapeRasterizer<WgpuRenderState>` opaquely (`WgpuShapeRasterizerSlot`).
pub type ShapeRasterizer<S> =
    Arc<dyn Fn(&CanvasRenderingContext2D, &[ShapeCommandToken], &mut S) + Send + Sync>;

/// Options for re-baking a render cache (TS `RenderCacheRefreshOptions`, owned by render and not yet
/// ported there): transparent margin and minimum target size in source pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderCacheRefreshOptions {
    pub padding: Option<f32>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
}

/// What a velocity writer draws through (TS `WgpuVelocityContext`): the state, the velocity data,
/// the target's pixel size and the state's pixel ratio.
pub struct WgpuVelocityContext<'a> {
    pub state: &'a mut WgpuRenderState,
    pub field: &'a VelocityField,
    pub width: f32,
    pub height: f32,
    pub pixel_ratio: f32,
}

/// Draws one renderable kind's velocity into the bound velocity target (TS `WgpuVelocityWriter`).
/// render-wgpu retains it opaquely (`WgpuVelocityWriterSlot`).
pub type WgpuVelocityWriter = fn(&mut WgpuVelocityContext<'_>, &NodeRef);

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

/// One render cache's offscreen target, keyed by the cache's entity id (TS
/// `Map<RenderCache, WgpuTextureRenderTarget>`).
pub(crate) struct WgpuRenderCacheTargetEntry {
    pub(crate) cache: u64,
    pub(crate) target: Ref<WgpuTextureRenderTarget>,
}

/// The lazily compiled velocity pipeline of one state (TS `WgpuVelocityPipeline`).
pub(crate) struct WgpuVelocityPipeline {
    pub(crate) pipeline: wgpu::RenderPipeline,
    pub(crate) uniform_buffer: wgpu::Buffer,
    pub(crate) bind_group: wgpu::BindGroup,
    pub(crate) cursor: u32,
    pub(crate) scratch: [f32; 8],
}

/// The per-state record of this package (the source's module WeakMaps keyed by state), held in
/// render-wgpu's opaque `scene2d_runtime` slot (D5).
#[derive(Default)]
pub(crate) struct Scene2DWgpuRuntime {
    pub(crate) canvas_host_surfaces: CanvasHostSurfaces,
    // The dimension hooks raster images re-measure through on invalidation (D5: the source's
    // module-global resolver); empty, so an invalidation keeps the size the image host measured.
    pub(crate) image_resolver_state: ImageResolverState,
    pub(crate) render_cache_targets: Option<Vec<WgpuRenderCacheTargetEntry>>,
    pub(crate) stats: Option<WgpuRenderStats>,
    pub(crate) text_input_overlay: Option<WgpuRichTextOverlay>,
    pub(crate) velocity_pass: Option<wgpu::RenderPass<'static>>,
    pub(crate) velocity_pipeline: Option<WgpuVelocityPipeline>,
}

flight_node::impl_renderer_data!(WgpuShapeRendererData);
flight_node::impl_renderer_data!(WgpuTextLabelData);
flight_node::impl_renderer_data!(WgpuRichTextData);
flight_node::impl_renderer_data!(WgpuScale9ShapeData);
