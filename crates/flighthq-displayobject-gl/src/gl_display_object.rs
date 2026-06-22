//! GL display object renderer — scene-graph walk and per-node dispatch.

use flighthq_types::display::{bitmap_kind, display_object_kind, shape_kind};
use flighthq_types::kind::KindId;
use flighthq_types::{RenderProxy2D, ShapeFillRegion};

use crate::bitmap::draw_gl_bitmap;
use crate::shape_fill::draw_gl_shape_fill;
use crate::sprite_batch::flush_gl_sprite_batch;
use crate::sprite_renderer::submit_gl_sprite_node;
use flighthq_render_gl::{GlRenderState, GlRendererSlot};

/// Default GL renderer for plain `DisplayObject` containers.
pub struct DefaultGlDisplayObjectRenderer;

/// Resolved geometry for one shape node: its solid-fill regions and the source
/// `content_revision` that produced them. The draw walk passes this through to
/// the shape mesh cache so it rebuilds only when geometry changes. Mirrors
/// `flighthq_displayobject_wgpu::WgpuShapeGeometry`.
pub struct GlShapeGeometry {
    pub regions: Vec<ShapeFillRegion>,
    pub content_revision: u32,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a single container display object node. Plain containers have no
/// visual geometry of their own; this is a no-op present for completeness.
pub fn draw_gl_display_object(_state: &mut GlRenderState, _render_proxy_id: u64) {
    // No-op: containers carry no geometry.
}

/// Registers GL display object, bitmap, and shape renderers on `state`.
///
/// Call once after `create_gl_render_state` to enable the 2D display-object
/// pipeline. Registers renderers for `DisplayObjectKind`, `BitmapKind`, and
/// `ShapeKind`.
pub fn register_gl_display_object_renderer(state: &mut GlRenderState) {
    state
        .runtime
        .renderers
        .insert(display_object_kind(), GlRendererSlot::Container);
    state
        .runtime
        .renderers
        .insert(bitmap_kind(), GlRendererSlot::Bitmap);
    state
        .runtime
        .renderers
        .insert(shape_kind(), GlRendererSlot::Shape);
}

/// Walks the display-object subtree rooted at `root_id` in pre-order and draws
/// each visible node by its registered renderer, then flushes the sprite batch.
///
/// This mirrors `flighthq_displayobject_wgpu::render_wgpu_display_object`: an iterative
/// pre-order stack where a node is skipped when its render proxy is missing (the
/// prepare pass never built it — e.g. a disabled node) or not visible; otherwise
/// its resolved 2D transform, alpha, and blend mode are written into
/// `render_state` (the slots the leaf draws read) and the node is dispatched by
/// `get_kind` to its slot. Visible nodes that traverse push their children
/// (reversed, so pre-order is preserved).
///
/// Closures supply the graph topology and per-node data the id-based renderer
/// cannot read directly: `get_children` lists a node's child ids, `get_kind`
/// returns its `KindId`, `get_render_proxy` returns the prepared `RenderProxy2D`
/// (cloned from the render-state store), and `get_shape_geometry` resolves a
/// shape node's solid-fill regions (only consulted for `ShapeKind` nodes).
///
/// The render framework's prepare pass must run first to populate the proxies; a
/// node with no proxy is silently skipped.
///
/// Clip/mask handling is deferred — the push/pop clip hooks are not yet ported
/// here. TODO(clip): gate visibility and push/pop the scissor/stencil mask per
/// `clip_depth` once the clip subsystem is wired into the walk.
pub fn render_gl_display_object(
    state: &mut GlRenderState,
    root_id: u64,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    get_kind: &dyn Fn(u64) -> KindId,
    get_render_proxy: &dyn Fn(u64) -> Option<RenderProxy2D>,
    get_shape_geometry: &dyn Fn(u64) -> Option<GlShapeGeometry>,
) {
    let mut stack: Vec<u64> = vec![root_id];

    while let Some(current) = stack.pop() {
        let Some(proxy) = get_render_proxy(current) else {
            continue;
        };
        // TODO(clip): pop the clip stack for nodes whose clip layer ends here.
        if !is_gl_proxy_visible(&proxy) {
            continue;
        }
        // TODO(clip): push the clip stack for nodes that begin a clip layer.

        // Publish the node's resolved transform/alpha/blend into the single-node
        // slots the leaf draws read.
        state.render_state.render_transform_2d = Some(proxy.transform_2d);
        state.render_state.render_alpha = proxy.base.alpha;
        state.render_state.render_blend_mode = proxy.base.blend_mode;

        let kind = get_kind(current);
        if let Some(slot) = state.runtime.renderers.get(&kind).copied() {
            match slot {
                GlRendererSlot::Container => draw_gl_display_object(state, current),
                GlRendererSlot::Bitmap => draw_gl_bitmap(state, current),
                GlRendererSlot::Shape => {
                    if let Some(geometry) = get_shape_geometry(current) {
                        draw_gl_shape_fill(
                            state,
                            current,
                            &geometry.regions,
                            geometry.content_revision,
                        );
                    }
                }
                GlRendererSlot::Sprite => submit_gl_sprite_node(state, current),
            }
        }

        if proxy.traverse_children {
            let children = get_children(current);
            for child in children.into_iter().rev() {
                stack.push(child);
            }
        }
    }

    flush_gl_sprite_batch(state);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Mirrors `flighthq_render::is_render_proxy_visible` (visible, alpha > 0, non-zero
// scale) without taking a store borrow, so the walk can test a cloned proxy.
fn is_gl_proxy_visible(proxy: &RenderProxy2D) -> bool {
    proxy.base.visible
        && proxy.base.alpha > 0.0
        && !(proxy.transform_2d.a == 0.0 && proxy.transform_2d.d == 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::geometry::Matrix;

    fn visible_proxy() -> RenderProxy2D {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = true;
        proxy.base.alpha = 1.0;
        proxy.transform_2d = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        };
        proxy
    }

    // is_gl_proxy_visible

    #[test]
    fn is_gl_proxy_visible_true_for_normal_proxy() {
        assert!(is_gl_proxy_visible(&visible_proxy()));
    }

    #[test]
    fn is_gl_proxy_visible_false_when_hidden() {
        let mut proxy = visible_proxy();
        proxy.base.visible = false;
        assert!(!is_gl_proxy_visible(&proxy));
    }

    #[test]
    fn is_gl_proxy_visible_false_when_zero_alpha() {
        let mut proxy = visible_proxy();
        proxy.base.alpha = 0.0;
        assert!(!is_gl_proxy_visible(&proxy));
    }

    #[test]
    fn is_gl_proxy_visible_false_when_zero_scale() {
        let mut proxy = visible_proxy();
        proxy.transform_2d.a = 0.0;
        proxy.transform_2d.d = 0.0;
        assert!(!is_gl_proxy_visible(&proxy));
    }
}
