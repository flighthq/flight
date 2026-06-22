//! wgpu display object renderer — scene-graph walk and per-node dispatch.

use flighthq_types::display::{bitmap_kind, display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;
use flighthq_types::kind::KindId;
use flighthq_types::{RenderProxy2D, ShapeFillRegion};

use crate::bitmap::{WgpuBitmapTexture, draw_wgpu_bitmap, draw_wgpu_bitmap_texture};
use crate::clip_rectangle::{WgpuClipRectangle, pop_wgpu_clip_rectangle, push_wgpu_clip_rectangle};
use crate::render_state::{WgpuRenderState, WgpuRendererSlot};
use crate::shape_mesh::draw_wgpu_shape_fill;
use crate::sprite::render_wgpu_sprite;
use crate::sprite_batch::flush_wgpu_sprite_batch;

/// Default wgpu renderer for plain `DisplayObject` containers.
pub struct DefaultWgpuDisplayObjectRenderer;

/// Resolved geometry for one shape node: its solid-fill regions and the source
/// `content_revision` that produced them. The draw walk passes this through to
/// the shape mesh cache so it rebuilds only when geometry changes.
pub struct WgpuShapeGeometry {
    pub regions: Vec<ShapeFillRegion>,
    pub content_revision: u32,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a single container display object node. Plain containers have no
/// visual geometry of their own; this is a no-op present for completeness.
pub fn draw_wgpu_display_object(_state: &mut WgpuRenderState, _render_proxy_id: u64) {
    // No-op: containers carry no geometry.
}

/// Registers wgpu display object, bitmap, and shape renderers on `state`.
///
/// Call once after `create_wgpu_render_state` to enable the 2D display-object
/// pipeline. Registers renderers for `DisplayObjectKind`, `BitmapKind`, and
/// `ShapeKind`.
pub fn register_wgpu_display_object_renderer(state: &mut WgpuRenderState) {
    state
        .runtime
        .renderers
        .insert(display_object_kind(), WgpuRendererSlot::Container);
    state
        .runtime
        .renderers
        .insert(bitmap_kind(), WgpuRendererSlot::Bitmap);
    state
        .runtime
        .renderers
        .insert(shape_kind(), WgpuRendererSlot::Shape);
}

/// Walks the display-object subtree rooted at `root_id` in pre-order and draws
/// each visible node by its registered renderer, then flushes the sprite batch.
///
/// This mirrors the TS `renderWebGPUDisplayObject` iterative pre-order stack: a
/// node is skipped when its render proxy is missing (the prepare pass never built
/// it — e.g. a disabled node) or not visible; otherwise its resolved 2D
/// transform, alpha, and blend mode are written into `render_state` (the slot the
/// leaf draws read) and the node is dispatched by `get_kind` to its slot. Visible
/// nodes that traverse push their children (reversed, so pre-order is preserved).
///
/// Closures supply the graph topology and per-node data the id-based renderer
/// cannot read directly: `get_children` lists a node's child ids, `get_kind`
/// returns its `KindId`, `get_render_proxy` returns the prepared `RenderProxy2D`
/// (cloned from the render-state store), and `get_shape_geometry` resolves a
/// shape node's solid-fill regions (only consulted for `ShapeKind` nodes).
///
/// `prepare_display_object_render` must run first to populate the proxies; a node
/// with no proxy is silently skipped, matching the TS `undefined` guard.
///
/// Bitmap and clip handling: `get_bitmap_texture` resolves a `BitmapKind` node's
/// texture source (uploaded and drawn as a quad); `get_clip_rectangle` resolves a
/// node's local-space clip rectangle. When a node has a clip rectangle the walk
/// pushes a scissor (projected through the node's transform) before drawing the
/// node and its subtree, and pops it once the subtree has been fully drawn —
/// achieved by interleaving a pop marker onto the traversal stack beneath the
/// node's children.
#[allow(clippy::too_many_arguments)]
pub fn render_wgpu_display_object(
    state: &mut WgpuRenderState,
    root_id: u64,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    get_kind: &dyn Fn(u64) -> KindId,
    get_render_proxy: &dyn Fn(u64) -> Option<RenderProxy2D>,
    get_shape_geometry: &dyn Fn(u64) -> Option<WgpuShapeGeometry>,
    get_bitmap_texture: &dyn Fn(u64) -> Option<WgpuBitmapTexture>,
    get_clip_rectangle: &dyn Fn(u64) -> Option<WgpuClipRectangle>,
) {
    let mut stack: Vec<WgpuWalkStep> = vec![WgpuWalkStep::Visit(root_id)];

    while let Some(step) = stack.pop() {
        let current = match step {
            // A scheduled scissor pop fires after a clipping node's subtree drew.
            WgpuWalkStep::PopClip => {
                pop_wgpu_clip_rectangle(state);
                continue;
            }
            WgpuWalkStep::Visit(id) => id,
        };

        let Some(proxy) = get_render_proxy(current) else {
            continue;
        };
        if !is_wgpu_proxy_visible(&proxy) {
            continue;
        }

        // Push the node's clip scissor (if any) before drawing it or its subtree,
        // scheduling the matching pop beneath the children so it fires last.
        if let Some(clip) = get_clip_rectangle(current) {
            push_wgpu_clip_rectangle(
                state,
                clip.x,
                clip.y,
                clip.width,
                clip.height,
                &proxy.transform_2d,
            );
            stack.push(WgpuWalkStep::PopClip);
        }

        // Publish the node's resolved transform/alpha/blend into the single-node
        // slots the leaf draws read.
        state.render_state.render_transform_2d = Some(proxy.transform_2d);
        state.render_state.render_alpha = proxy.base.alpha;
        state.render_state.render_blend_mode = proxy.base.blend_mode;

        let kind = get_kind(current);
        if let Some(slot) = state.runtime.renderers.get(&kind).copied() {
            match slot {
                WgpuRendererSlot::Container => draw_wgpu_display_object(state, current),
                WgpuRendererSlot::Bitmap => {
                    if let Some(texture) = get_bitmap_texture(current) {
                        draw_wgpu_bitmap_texture(state, &texture);
                    } else {
                        draw_wgpu_bitmap(state, current);
                    }
                }
                WgpuRendererSlot::Shape => {
                    if let Some(geometry) = get_shape_geometry(current) {
                        draw_wgpu_shape_fill(
                            state,
                            current,
                            &geometry.regions,
                            geometry.content_revision,
                        );
                    }
                }
                WgpuRendererSlot::Sprite => render_wgpu_sprite(state, current),
            }
        }

        if proxy.traverse_children {
            // Painter order: children draw back-to-front (child[0] bottom,
            // child[last] top). With this LIFO stack a node draws when it is
            // popped, so children must be pushed in REVERSE — child[last] pushed
            // first sinks to the bottom of the stack and pops last (drawing on
            // top), child[0] pushed last pops first (drawing at the bottom).
            // Pushing in forward order would invert paint order and let the
            // first child paint over the last. The clip pop (if any) is already
            // beneath all of them, so it fires after the whole subtree drew.
            let children = get_children(current);
            for child in children.into_iter().rev() {
                stack.push(WgpuWalkStep::Visit(child));
            }
        }
    }

    flush_wgpu_sprite_batch(state);
}

/// Composes a node's local-space clip rectangle through `transform` into the
/// axis-aligned viewport rectangle the walk pushes onto the scissor stack. Kept
/// here as the seam the walk and tests share; the projection itself lives in
/// `push_wgpu_clip_rectangle`.
pub fn compose_wgpu_clip_rectangle(clip: &WgpuClipRectangle, transform: &Matrix) -> [f32; 4] {
    let corners = [
        (clip.x, clip.y),
        (clip.x + clip.width, clip.y),
        (clip.x, clip.y + clip.height),
        (clip.x + clip.width, clip.y + clip.height),
    ];
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for (cx, cy) in corners {
        let x = transform.a * cx + transform.c * cy + transform.tx;
        let y = transform.b * cx + transform.d * cy + transform.ty;
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    [min_x, min_y, max_x - min_x, max_y - min_y]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// One entry on the iterative pre-order traversal stack: either a node to visit
// or a deferred clip pop. The pop marker is pushed beneath a clipping node's
// children so it fires only after the whole subtree has been drawn.
enum WgpuWalkStep {
    Visit(u64),
    PopClip,
}

// Mirrors `flighthq_render::is_render_proxy_visible` (visible, alpha > 0, non-zero
// scale) without taking a store borrow, so the walk can test a cloned proxy.
fn is_wgpu_proxy_visible(proxy: &RenderProxy2D) -> bool {
    proxy.base.visible
        && proxy.base.alpha > 0.0
        && !(proxy.transform_2d.a == 0.0 && proxy.transform_2d.d == 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::Matrix;

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

    #[test]
    fn compose_wgpu_clip_rectangle_identity_passes_rect_through() {
        let clip = WgpuClipRectangle {
            x: 10.0,
            y: 20.0,
            width: 30.0,
            height: 40.0,
        };
        let r = compose_wgpu_clip_rectangle(&clip, &Matrix::default());
        assert_eq!(r, [10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn compose_wgpu_clip_rectangle_applies_translation() {
        let clip = WgpuClipRectangle {
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
        };
        let transform = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 5.0,
            ty: 7.0,
        };
        let r = compose_wgpu_clip_rectangle(&clip, &transform);
        assert_eq!(r, [5.0, 7.0, 10.0, 10.0]);
    }

    #[test]
    fn is_wgpu_proxy_visible_true_for_normal_proxy() {
        assert!(is_wgpu_proxy_visible(&visible_proxy()));
    }

    #[test]
    fn is_wgpu_proxy_visible_false_when_hidden() {
        let mut proxy = visible_proxy();
        proxy.base.visible = false;
        assert!(!is_wgpu_proxy_visible(&proxy));
    }

    #[test]
    fn is_wgpu_proxy_visible_false_when_zero_scale() {
        let mut proxy = visible_proxy();
        proxy.transform_2d.a = 0.0;
        proxy.transform_2d.d = 0.0;
        assert!(!is_wgpu_proxy_visible(&proxy));
    }
}
