//! `flighthq-harness` — the shared Rust render harness (backend-switch seam).
//!
//! This is the Rust analogue of the TypeScript `tools/harness`: the one reviewed
//! place that owns the incidental render plumbing — building a display-object
//! graph from plain shape data, registering the per-backend renderer, and walking
//! the graph — so a caller focuses on *what* to draw, not *how* each backend
//! draws it. The functional matrix runner and the example runners both consume
//! it, which is what keeps the wgpu/gl/skia switch in one place instead of
//! hand-copied into every runner.
//!
//! **Not part of Flight's public API.** It is `publish = false` and is never
//! re-exported from `flighthq-sdk`; it exists only for tests and tools.
//!
//! The seam is two-layered, because a Rust render target is a matched pair of a
//! renderer and a surface owner:
//!
//! - [`build_scene_graph`] turns a slice of [`HarnessShape`]s (the neutral
//!   currency every caller lowers its own scene form to) into a [`SceneGraph`]:
//!   the id hierarchy, kinds, prepared `RenderProxy2D` map, and per-shape fill
//!   regions. Pure CPU, backend-agnostic, thread-safe.
//! - The render entry points consume that graph. [`render_scene_graph_to_rgba_skia`]
//!   and [`render_scene_graph_to_rgba_gl`] own their whole headless render (create
//!   state, register, walk, read back RGBA). The wgpu path is
//!   [`draw_scene_graph_wgpu`], a walk into a caller-owned `WgpuRenderState` — the
//!   caller (a winit host per frame, or a headless capture pass) owns
//!   presentation, and full-frame effects wrap that walk on the caller's side.
//!
//! [`render_scene_graph_to_rgba_with`] dispatches the two headless RGBA paths by
//! [`RenderTarget`]; `Wgpu` returns `None` here (it has no self-owned headless
//! path — use a capture state around [`draw_scene_graph_wgpu`]).

mod render_gl;
mod render_skia;
mod render_wgpu;
mod scene_graph;
mod shape;
mod target;

pub use render_gl::render_scene_graph_to_rgba_gl;
pub use render_skia::render_scene_graph_to_rgba_skia;
pub use render_wgpu::draw_scene_graph_wgpu;
pub use scene_graph::{STAGE_ID, SceneGraph, build_scene_graph};
pub use shape::{HarnessShape, ShapeCommand};
pub use target::RenderTarget;

/// Renders a prepared scene graph to tightly packed straight-alpha RGBA bytes
/// through a self-owning headless `target`, or `None` when that target is
/// unavailable (no adapter/context) or has no self-owned headless path.
///
/// [`RenderTarget::Skia`] and [`RenderTarget::Gl`] create their own state and
/// read pixels back. [`RenderTarget::Wgpu`] returns `None`: the wgpu shape walk
/// ([`draw_scene_graph_wgpu`]) draws into a caller-owned state, so a headless
/// wgpu capture is composed by the caller (it also owns any effect chain), not
/// dispatched here.
pub fn render_scene_graph_to_rgba_with(
    target: RenderTarget,
    graph: &SceneGraph,
    width: u32,
    height: u32,
    background: u32,
) -> Option<Vec<u8>> {
    match target {
        RenderTarget::Skia => render_scene_graph_to_rgba_skia(graph, width, height, background),
        RenderTarget::Gl => render_scene_graph_to_rgba_gl(graph, width, height, background),
        RenderTarget::Wgpu => None,
    }
}
