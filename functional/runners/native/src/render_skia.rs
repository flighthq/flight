//! The `rnat:skia` cell: render a scene through `displayobject-skia` (tiny-skia).
//!
//! Pure CPU and bit-deterministic across machines — the software reference the
//! GPU cells are checked against. Needs no adapter, so it always renders the
//! shape scenes. Full-frame render effects are GPU passes (`effects-wgpu` /
//! `effects-gl`); the software backend has no CPU effect chain yet, so a scene
//! that carries effects returns `None` (a clean "unsupported on skia" cell)
//! rather than a base-only frame that would fail parity against the graded
//! reference.

use flighthq_displayobject_skia::{
    SkiaBitmapTexture, SkiaClipRectangle, SkiaShapeGeometry, clear_skia_pixmap,
    create_skia_render_state, read_skia_surface, register_skia_display_object_renderers,
    render_skia_display_object,
};

use crate::scene::Scene;
use crate::scene_graph::{SceneGraph, build_scene_graph};

/// Renders a scene to tightly packed straight-alpha RGBA bytes (`w*h*4`,
/// top-left origin) via the tiny-skia software backend. Returns `None` when the
/// pixmap cannot be allocated, or when the scene carries an effect chain the
/// software path does not yet apply.
pub fn render_scene_to_rgba_skia(scene: &Scene) -> Option<Vec<u8>> {
    // Effects are GPU passes; the software backend renders shapes only for now.
    if !(scene.effects)().is_empty() {
        return None;
    }

    let SceneGraph {
        stage_id,
        children,
        kinds,
        proxies,
        regions,
    } = build_scene_graph(scene);

    let mut state = create_skia_render_state(scene.width, scene.height)?;
    state.background_color = scene.background;
    clear_skia_pixmap(&mut state);
    register_skia_display_object_renderers(&mut state);

    let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
    let get_kind = |id: u64| kinds.get(&id).copied().unwrap_or_default();
    let get_proxy = |id: u64| proxies.get(&id).cloned();
    let get_shape_geometry = |id: u64| {
        regions
            .get(&id)
            .map(|(regions, _revision)| SkiaShapeGeometry {
                regions: regions.clone(),
            })
    };
    let get_bitmap_texture = |_id: u64| -> Option<SkiaBitmapTexture> { None };
    let get_clip_rectangle = |_id: u64| -> Option<SkiaClipRectangle> { None };

    render_skia_display_object(
        &mut state,
        stage_id,
        &get_children,
        &get_kind,
        &get_proxy,
        &get_shape_geometry,
        &get_bitmap_texture,
        &get_clip_rectangle,
    );

    Some(read_skia_surface(&state).data)
}
