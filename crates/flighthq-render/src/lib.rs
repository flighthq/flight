#![allow(dead_code, unused_imports, unused_variables)]
//! `flighthq-render` — renderer registration, render state, update pipeline,
//! and backend draw contracts.
//!
//! This crate provides:
//! - [`RenderStateStore`]: the arena that owns per-frame counters, renderer
//!   registrations, and render-proxy maps.
//! - [`create_render_state`] / [`get_render_state`]: allocate and resolve
//!   render states by `RenderStateId`.
//! - [`register_renderer`]: bind a [`Renderer`] to a [`KindId`].
//! - [`prepare_display_object_render`]: the pre-render update pass for the 2D
//!   graph — propagates transforms, alpha, blend mode, material, and clip depth
//!   into each node's `RenderProxy2D`.
//! - Render-cache helpers: [`create_render_cache`], [`use_render_cache`],
//!   [`register_render_cache_renderer`].

pub mod appearance;
pub mod color;
pub mod material;
pub mod render_cache;
pub mod render_proxy;
pub mod render_proxy_adapter;
pub mod render_state;
pub mod render_target;
pub mod render_viewport;
pub mod renderer;
pub mod scene_render;
pub mod text_format;
pub mod transform2d;

// ---------------------------------------------------------------------------
// Re-exports — public surface at the crate root
// ---------------------------------------------------------------------------

// appearance
pub use appearance::update_render_proxy_appearance;

// color
pub use color::set_render_state_background_color;

// material
pub use material::update_render_proxy_material;

// render_cache
pub use render_cache::{
    RENDER_CACHE_KIND, RenderCacheAdapter, create_render_cache, create_render_cache_adapter,
    enable_render_cache_adapter_signals, get_render_proxy_cache, is_render_cache,
    is_render_cache_adapter, register_render_cache_renderer, use_render_cache,
};

// render_proxy
pub use render_proxy::{
    RenderProxyVisitor, begin_render_proxy_update, create_render_proxy, create_render_proxy_2d,
    dispose_display_object_render, dispose_render_proxy, get_or_create_render_proxy_2d,
    get_render_proxy_2d, install_render_adapt_hook, is_render_proxy_dirty, is_render_proxy_visible,
    prepare_display_object_render, update_node_clip, update_render_proxy_2d,
    update_render_proxy_renderer, walk_node,
};

// render_proxy_adapter
pub use render_proxy_adapter::{
    apply_render_proxy_adapter, get_render_proxy_adapter, set_render_proxy_adapter,
};

// render_state
pub use render_state::{
    RenderStateId, RenderStateRuntime, RenderStateStore, create_render_state,
    create_render_state_runtime, get_render_state, get_render_state_mut, get_render_state_runtime,
    get_render_state_runtime_mut,
};

// render_target
pub use render_target::{
    compute_display_object_render_target_transform, compute_render_cache_transform,
    compute_render_target_size,
};

// render_viewport
pub use render_viewport::{
    compute_render_proxy_world_bounds, create_render_viewport_2d, is_render_proxy_in_viewport,
    is_renderable_in_viewport,
};

// renderer
pub use renderer::{
    copy_all_renderers_from_render_state, copy_renderers_from_render_state, noop_renderer_data,
    register_renderer,
};

// scene_render
pub use scene_render::{SceneRenderList, pack_scene_light_block, prepare_scene_render};

// text_format
pub use text_format::compute_text_format_font_string;

// transform2d
pub use transform2d::{update_display_object_render_transform, update_render_proxy_2d_transform};

// Re-export core render types from flighthq-types for convenience.
pub use flighthq_types::{
    RenderCache, RenderCacheAdapterSignals, RenderProxy, RenderProxy2D, RenderProxyAdapter,
    RenderState, RenderTargetDepth, RenderTargetDescriptor, RenderTargetFormat, RenderViewport2D,
    Renderer, RendererData, SceneGraphSyncPolicy,
};
