use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::geometry::Matrix;
use crate::kind::KindId;

// ---------------------------------------------------------------------------
// SceneGraphSyncPolicy
// ---------------------------------------------------------------------------

/// Controls whether a subsystem refreshes derived scene graph state before use.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SceneGraphSyncPolicy {
    /// Re-derives all cached state from raw fields each frame.
    #[default]
    RefreshDerivedState,
    /// Relies on explicit invalidate_* calls to mark stale derived state.
    RequiresInvalidation,
}

// ---------------------------------------------------------------------------
// RenderState
// ---------------------------------------------------------------------------

/// Per-render-state settings and frame counters shared across all backends.
#[derive(Clone, Debug)]
pub struct RenderState {
    pub allow_smoothing: bool,
    pub background_color: u32,
    pub current_clip_depth: i32,
    pub pixel_ratio: f32,
    pub render_alpha: f32,
    pub render_blend_mode: Option<BlendMode>,
    pub render_transform_2d: Option<Matrix>,
    pub round_pixels: bool,
    pub scene_graph_sync_policy: SceneGraphSyncPolicy,
}

impl Entity for RenderState {}

impl Default for RenderState {
    fn default() -> Self {
        Self {
            allow_smoothing: true,
            background_color: 0x000000ff,
            current_clip_depth: 0,
            pixel_ratio: 1.0,
            render_alpha: 1.0,
            render_blend_mode: None,
            render_transform_2d: None,
            round_pixels: false,
            scene_graph_sync_policy: SceneGraphSyncPolicy::RefreshDerivedState,
        }
    }
}

// ---------------------------------------------------------------------------
// RenderTargetDescriptor
// ---------------------------------------------------------------------------

/// Render target color format.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum RenderTargetFormat {
    #[default]
    Rgba8,
    Rgba16F,
    Rgba32F,
}

/// Render target depth/stencil attachment mode.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum RenderTargetDepth {
    #[default]
    None,
    DepthStencil,
    DepthStencilSampled,
}

/// Substrate-agnostic render target descriptor.
#[derive(Clone, Debug)]
pub struct RenderTargetDescriptor {
    pub width: u32,
    pub height: u32,
    pub format: RenderTargetFormat,
    pub color_attachments: u32,
    pub color_formats: Vec<RenderTargetFormat>,
    pub sample_count: u32,
    pub depth: RenderTargetDepth,
}

impl Default for RenderTargetDescriptor {
    fn default() -> Self {
        Self {
            width: 0,
            height: 0,
            format: RenderTargetFormat::Rgba8,
            color_attachments: 1,
            color_formats: Vec::new(),
            sample_count: 1,
            depth: RenderTargetDepth::None,
        }
    }
}

// ---------------------------------------------------------------------------
// Renderer trait
// ---------------------------------------------------------------------------

/// A node renderer registered against a `KindId` on a `RenderState`.
pub trait Renderer: Send + Sync {
    /// Which geometry accumulation pipeline this renderer submits into, if any.
    fn format(&self) -> Option<BatchFormat> {
        None
    }
    /// Allocates per-node renderer data; return `None` if none is needed.
    fn create_data(&self, state: &RenderState, source_id: u64) -> Option<Box<dyn RendererData>>;
    /// Frees any non-GC resources allocated into `data`. Called on replacement or proxy destruction.
    fn destroy_data(&self, _state: &RenderState, _data: Box<dyn RendererData>) {}
    /// Renders the node for this frame.
    fn submit(&self, state: &RenderState, node: &RenderProxy);
}

// ---------------------------------------------------------------------------
// RendererData trait
// ---------------------------------------------------------------------------

/// Per-node data allocated by a `Renderer`.
pub trait RendererData: std::any::Any + Send + Sync {}

// ---------------------------------------------------------------------------
// BatchFormat (imported from misc but declared here for renderer)
// ---------------------------------------------------------------------------

use crate::misc::BatchFormat;

// ---------------------------------------------------------------------------
// RenderProxy
// ---------------------------------------------------------------------------

/// A render-walk node carrying the resolved per-frame state for one renderable.
#[derive(Clone, Debug, Default)]
pub struct RenderProxy {
    /// The source renderable's node id.
    pub source_id: u64,
    pub kind: KindId,
    pub alpha: f32,
    pub appearance_frame_id: u64,
    pub blend_mode: Option<BlendMode>,
    pub last_appearance_id: u64,
    pub last_local_content_id: u64,
    pub last_local_transform_id: u64,
    pub name: Option<String>,
    pub renderer_map_id: u64,
    pub transform_frame_id: u64,
    pub visible: bool,
}

// ---------------------------------------------------------------------------
// RenderProxy2D
// ---------------------------------------------------------------------------

/// Unified 2D render node for display objects and sprites.
#[derive(Clone, Debug, Default)]
pub struct RenderProxy2D {
    pub base: RenderProxy,
    pub transform_2d: Matrix,
    pub traverse_children: bool,
    pub clip_depth: i32,
}

// ---------------------------------------------------------------------------
// RenderProxyAdapter / RenderProxyResolver / RenderCacheAdapter
// ---------------------------------------------------------------------------

/// Adapts a `Renderable` into a `RenderProxy2D` during the render walk.
pub trait RenderProxyAdapter: Send + Sync {
    /// Returns `Some(true)` to continue traversal, `Some(false)` to skip,
    /// or `None` to signal the default path.
    fn adapt(&self, state: &RenderState, source_id: u64, node: &mut RenderProxy2D) -> Option<bool>;
    /// Exposes the concrete adapter for downcasting (e.g. recognizing a render
    /// cache adapter). Implementations return `self`.
    fn as_any(&self) -> &dyn std::any::Any;
    /// Mutable counterpart to `as_any`, for in-place reuse of a concrete adapter.
    /// Implementations return `self`.
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any;
}

/// Resolves a `DisplayObject` into a `RenderProxy2D` during the render walk.
pub trait RenderProxyResolver: Send + Sync {
    fn resolve(
        &self,
        state: &RenderState,
        source_id: u64,
        node: &mut RenderProxy2D,
    ) -> Option<bool>;
}

// ---------------------------------------------------------------------------
// RenderCache
// ---------------------------------------------------------------------------

use flighthq_signals::Signal;

/// Backend-agnostic handle for a cached rendering.
#[derive(Clone, Debug)]
pub struct RenderCache {
    /// Identifies this as a render cache vs a plain node.
    pub kind: KindId,
    /// Places the cached content back at the source's scene position.
    pub transform: Matrix,
}

impl Entity for RenderCache {}

/// Signals associated with a `RenderCacheAdapter`.
#[derive(Debug, Default)]
pub struct RenderCacheAdapterSignals {
    pub on_prepare: Signal<()>,
}

/// Options for refreshing a render cache.
#[derive(Clone, Debug, Default)]
pub struct RenderCacheRefreshOptions {
    pub padding: Option<f32>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
}
