//! The `rnat:skia` cell: render a scene graph through `displayobject-skia`
//! (tiny-skia).
//!
//! Pure CPU and bit-deterministic across machines — the software reference the
//! GPU cells are checked against. Needs no adapter, so it always renders shape
//! graphs. Full-frame render effects are GPU passes (`effects-wgpu` /
//! `effects-gl`); the software backend has no CPU effect chain yet, so a caller
//! that carries effects should render through wgpu instead — this cell draws the
//! shapes only.

use flighthq_displayobject_skia::{
    SkiaBitmapTexture, SkiaClipRectangle, SkiaShapeGeometry, clear_skia_pixmap,
    create_skia_render_state, read_skia_surface, register_skia_display_object_renderers,
    render_skia_display_object,
};

use crate::scene_graph::SceneGraph;

/// Renders a prepared scene graph to tightly packed straight-alpha RGBA bytes
/// (`width*height*4`, top-left origin) via the tiny-skia software backend.
/// Returns `None` when the pixmap cannot be allocated.
pub fn render_scene_graph_to_rgba_skia(
    graph: &SceneGraph,
    width: u32,
    height: u32,
    background: u32,
) -> Option<Vec<u8>> {
    let mut state = create_skia_render_state(width, height)?;
    state.background_color = background;
    clear_skia_pixmap(&mut state);
    register_skia_display_object_renderers(&mut state);

    let get_children = |id: u64| graph.children.get(&id).cloned().unwrap_or_default();
    let get_kind = |id: u64| graph.kinds.get(&id).copied().unwrap_or_default();
    let get_proxy = |id: u64| graph.proxies.get(&id).cloned();
    let get_shape_geometry = |id: u64| {
        graph
            .regions
            .get(&id)
            .map(|(regions, _revision)| SkiaShapeGeometry {
                regions: regions.clone(),
            })
    };
    let get_bitmap_texture = |_id: u64| -> Option<SkiaBitmapTexture> { None };
    let get_clip_rectangle = |_id: u64| -> Option<SkiaClipRectangle> { None };

    render_skia_display_object(
        &mut state,
        graph.stage_id,
        &get_children,
        &get_kind,
        &get_proxy,
        &get_shape_geometry,
        &get_bitmap_texture,
        &get_clip_rectangle,
    );

    Some(read_skia_surface(&state).data)
}
