//! Backend-core runtime slot types embedded in [`WgpuRenderStateRuntime`].
//!
//! These are the **header** types for the per-subject leaf renderers that live
//! in `flighthq-displayobject-wgpu`. They are the Rust stand-in for the shared
//! `flighthq-types` wgpu runtime types: the upstream TS `@flighthq/types` package
//! holds `WgpuRenderStateRuntime` and its subsystem slots so both `render-wgpu`
//! and `displayobject-wgpu` can name them. The Rust `flighthq-types` crate does
//! not (yet) carry these wgpu types, so the backend core owns them here.
//!
//! The runtime struct embeds these slots; the leaf renderers read and write them
//! through `get_wgpu_render_state_runtime_mut`. The slot *types* are defined here
//! (subject-agnostic plumbing); the slot *behavior* (batch flush, velocity pass,
//! mesh tessellation, rich-text overlay) lives in the leaf crate.

use crate::render_state::WgpuRenderState;

// ---------------------------------------------------------------------------
// Sprite batch
// ---------------------------------------------------------------------------

/// Number of f32 written per base sprite instance.
pub const SPRITE_INSTANCE_FLOATS: u32 = 13;

/// Per-state sprite batch runtime fields. Embedded in `WgpuRenderStateRuntime`.
#[derive(Debug, Default)]
pub struct WgpuSpriteBatchRuntime {
    pub blend_mode: Option<flighthq_types::blend::BlendMode>,
    /// Currently bound texture key (id used as opaque identity).
    pub texture_key: u64,
    pub material_id: u64,
    pub material_renderer_id: u64,
    pub material_floats: u32,
    pub count: u32,
    pub instance_data: Vec<f32>,
    pub material_data: Vec<f32>,
    /// Reusable GPU instance buffers (ring-pooled across frames).
    pub buffer_pool: Vec<wgpu::Buffer>,
    pub buffer_pool_index: usize,
    /// Lazily-created instanced quad-batch pipeline resources.
    pub resources: Option<WgpuQuadBatchResources>,
}

/// Cached GPU resources for the instanced quad-batch pipeline.
#[derive(Debug)]
pub struct WgpuQuadBatchResources {
    pub corner_buffer: wgpu::Buffer,
    pub instance_bind_group_layout: wgpu::BindGroupLayout,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub base_pipeline_layout: wgpu::PipelineLayout,
    pub material_pipeline_layout: wgpu::PipelineLayout,
    /// Pipeline cache keyed by `"blendMode-stencilMode-format"`.
    pub pipelines: std::collections::HashMap<String, wgpu::RenderPipeline>,
}

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

/// Trait for a per-kind velocity writer. Each registered writer draws its node
/// kind's velocity into the bound velocity target.
pub trait WgpuVelocityWriter: Send + Sync {
    /// Draws `render_proxy_id`'s velocity contribution into the bound target.
    fn write(&self, state: &mut WgpuRenderState, render_proxy_id: u64);
}

/// Lazily-built velocity pipeline resources. Stored on the render-state runtime.
pub struct WgpuVelocityPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub uniform_buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
    pub cursor: u64,
}

// ---------------------------------------------------------------------------
// Rich text overlay
// ---------------------------------------------------------------------------

/// Overlay hook used to draw an editable text-input caret/selection on top of a
/// rich-text node. Registered by the text-input leaf renderer.
pub type WgpuRichTextOverlay = fn(state: &mut WgpuRenderState, render_proxy_id: u64);

// ---------------------------------------------------------------------------
// Shape mesh cache
// ---------------------------------------------------------------------------

/// A GPU triangle mesh for one solid-color fill region of a vector shape.
#[derive(Debug)]
pub struct WgpuShapeMesh {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub index_count: u32,
    /// Packed `0xRRGGBBaa` fill color (alpha already folded with the region alpha).
    pub color: u32,
}

/// Cached, uploaded meshes for one shape node, tagged with the source
/// `content_revision` so the cache can be invalidated when geometry changes.
#[derive(Debug)]
pub struct WgpuShapeMeshCacheEntry {
    pub content_revision: u32,
    pub meshes: Vec<WgpuShapeMesh>,
}
