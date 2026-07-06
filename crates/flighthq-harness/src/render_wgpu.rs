//! The `rnat:wgpu` cell's shape walk: draw a prepared scene graph through
//! `displayobject-wgpu` into an already-open wgpu render pass.
//!
//! Unlike the skia and gl cells, this does not own a render state or read pixels
//! back — the caller owns the `WgpuRenderState` (a winit host's surface state, or
//! a headless capture state) and drives presentation. This is the shared shape
//! draw both the example runner (windowed, per frame) and the functional wgpu
//! cell (headless, into a capture pass) call, so the pure-shape wgpu path lives
//! in one place. Full-frame effects wrap this walk with an effect pipeline; that
//! lives with the caller that needs effects (the functional harness), not here.

use std::collections::HashMap;

use flighthq_displayobject_wgpu::{
    WgpuBitmapTexture, WgpuClipRectangle, WgpuQuadBatchSource, WgpuShapeGeometry, WgpuSpriteSource,
    WgpuTilemapSource, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_render_wgpu::WgpuRenderState;

use crate::scene_graph::SceneGraph;

/// Registers the wgpu display-object renderer on `state` and walks `graph` into
/// the currently-open render pass. The caller opens the pass (background clear)
/// and submits/presents after. Shape scenes carry no bitmaps or clips, so those
/// resolvers always return `None`.
pub fn draw_scene_graph_wgpu(state: &mut WgpuRenderState, graph: &SceneGraph) {
    register_wgpu_display_object_renderer(state);

    // Wrap the backend-agnostic fill regions in the wgpu geometry type the walk
    // expects; the geometry cache keys on `content_revision`.
    let geometry: HashMap<u64, WgpuShapeGeometry> = graph
        .regions
        .iter()
        .map(|(&id, (regions, content_revision))| {
            (
                id,
                WgpuShapeGeometry {
                    regions: regions.clone(),
                    content_revision: *content_revision,
                },
            )
        })
        .collect();

    let get_children = |id: u64| graph.children.get(&id).cloned().unwrap_or_default();
    let get_kind = |id: u64| graph.kinds.get(&id).copied().unwrap_or_default();
    let get_proxy = |id: u64| graph.proxies.get(&id).cloned();
    let get_shape_geometry = |id: u64| {
        geometry.get(&id).map(|g| WgpuShapeGeometry {
            regions: g.regions.clone(),
            content_revision: g.content_revision,
        })
    };
    // Shape scenes carry no bitmaps, quad batches, sprites, tilemaps, or clips,
    // so these leaf resolvers always return None.
    let get_bitmap_texture = |_id: u64| -> Option<WgpuBitmapTexture> { None };
    let get_quad_batch_source = |_id: u64| -> Option<WgpuQuadBatchSource> { None };
    let get_sprite_source = |_id: u64| -> Option<WgpuSpriteSource> { None };
    let get_tilemap_source = |_id: u64| -> Option<WgpuTilemapSource> { None };
    let get_clip_rectangle = |_id: u64| -> Option<WgpuClipRectangle> { None };

    render_wgpu_display_object(
        state,
        graph.stage_id,
        &get_children,
        &get_kind,
        &get_proxy,
        &get_shape_geometry,
        &get_bitmap_texture,
        &get_quad_batch_source,
        &get_sprite_source,
        &get_tilemap_source,
        &get_clip_rectangle,
    );
}
