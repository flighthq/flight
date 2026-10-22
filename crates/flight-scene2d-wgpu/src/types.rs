// flight-lint: allow-file(contract-vocabulary) D17: scene2d-wgpu contracts carry native wgpu values, host handles and the Rust callback/trait-object forms of the TS closure and CanvasRenderingContext2D types
// flight-lint: allow-file(file-structure, sugar-delegates) D16 renderer-data trait implementations are required plumbing beside the declarations
//! The scene2d-wgpu contract types (TS `types/src/Wgpu*.ts` owned by scene2d-wgpu), the concrete
//! form of the opaque render-wgpu color-adjustment feature slot this package fills, the renderer-private scratch records, and the per-state package
//! record that replaces the source's module WeakMaps (D5).

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_image::ImageResource;
use flight_node::RendererDataFields;
use flight_registry::KindMap;
use flight_render::{CanvasHostSurfaces, NodeRenderer, RenderProxy2D};
use flight_render_wgpu::{
    WgpuColorAdjustmentFlush, WgpuColorScaleBiasInput, WgpuRenderRegistries, WgpuRenderState,
    WgpuRenderStateRuntime, WgpuShapeMeshBuffers, WgpuTextureRenderTarget,
};
use flight_surface::CanvasSurface;
use flight_text::RichText;
use flight_textlayout::TextLayoutResult;

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

/// A complete render configuration (TS `WgpuRenderRegistries` as the presets carry it): the
/// backend registries plus the node renderer table, which Rust keeps in the state's backend-neutral
/// `RenderRegistries`. Apply with `create_wgpu_render_state` options built from `registries` and
/// `register_node_renderers(state, &node_renderers)`.
pub struct WgpuScene2DRenderPreset {
    pub node_renderers: KindMap<&'static NodeRenderer<WgpuRenderState>>,
    pub registries: WgpuRenderRegistries,
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
    fn(&CanvasRenderingContext2D, &Ref<RichText>, &TextLayoutResult, f32, f32, &str);

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
