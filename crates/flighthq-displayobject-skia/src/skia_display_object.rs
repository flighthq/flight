//! Software display-object renderer registration and the scene-graph draw walk.
//!
//! Mirrors `flighthq-displayobject-wgpu`'s `render_wgpu_display_object` iterative
//! pre-order walk, but rasterizes each leaf into the tiny-skia `Pixmap` instead
//! of submitting GPU draws. Graph topology and per-node data reach the id-based
//! walk through closures, the same seam the GPU backend uses.

use flighthq_types::display::{bitmap_kind, display_object_kind, shape_kind};
use flighthq_types::kind::KindId;
use flighthq_types::{RenderProxy2D, ShapeFillRegion};

use crate::skia_bitmap::{SkiaBitmapTexture, draw_skia_bitmap};
use crate::skia_clip::{SkiaClipRectangle, pop_skia_clip_rectangle, push_skia_clip_rectangle};
use crate::skia_render_state::{SkiaRenderState, SkiaRendererSlot};
use crate::skia_shape::draw_skia_shape_fill;

/// Resolved geometry for one shape node: its solid-fill regions, resolved by the
/// caller's closure (gradient/bitmap fills are flattened into regions upstream).
pub struct SkiaShapeGeometry {
    pub regions: Vec<ShapeFillRegion>,
}

/// Registers the software display-object, bitmap, and shape renderers on `state`.
///
/// Opt-in: call once after `create_skia_render_state`. Registers slots for
/// `DisplayObjectKind`, `BitmapKind`, and `ShapeKind`. Insert replaces, matching
/// the TS registry. Text registration is deferred (see `skia_text`'s TODO).
pub fn register_skia_display_object_renderers(state: &mut SkiaRenderState) {
    state
        .renderers
        .insert(display_object_kind(), SkiaRendererSlot::Container);
    state
        .renderers
        .insert(bitmap_kind(), SkiaRendererSlot::Bitmap);
    state
        .renderers
        .insert(shape_kind(), SkiaRendererSlot::Shape);
}

/// Draws a single container node. Containers carry no geometry; this is a no-op
/// present for slot completeness (mirrors the GPU backend).
pub fn draw_skia_display_object(_state: &mut SkiaRenderState, _source_id: u64) {
    // No-op: containers carry no geometry.
}

/// Walks the display-object subtree rooted at `root_id` in pre-order and
/// rasterizes each visible node by its registered slot.
///
/// A node is skipped when its render proxy is missing (the prepare pass never
/// built it) or not visible; otherwise its resolved 2D transform, alpha, and
/// blend mode are published into the state's draw-context slots and the node is
/// dispatched by `get_kind`. Visible nodes that traverse push their children in
/// reverse so painter order (child[0] bottom, child[last] top) is preserved on
/// the LIFO stack.
///
/// Closures supply what the id-based walk cannot read directly: `get_children`
/// lists child ids, `get_kind` returns the node's `KindId`, `get_render_proxy`
/// returns the prepared `RenderProxy2D`, `get_shape_geometry` resolves a shape's
/// fill regions (only for `ShapeKind`), `get_bitmap_texture` resolves a bitmap's
/// pixel source, and `get_clip_rectangle` resolves a node's local-space clip.
///
/// When a node has a clip rectangle the walk pushes a clip mask (projected
/// through the node's transform) before drawing it and its subtree, and pops it
/// once the subtree is fully drawn -- achieved by interleaving a pop marker onto
/// the traversal stack beneath the node's children.
#[allow(clippy::too_many_arguments)]
pub fn render_skia_display_object(
    state: &mut SkiaRenderState,
    root_id: u64,
    get_children: &dyn Fn(u64) -> Vec<u64>,
    get_kind: &dyn Fn(u64) -> KindId,
    get_render_proxy: &dyn Fn(u64) -> Option<RenderProxy2D>,
    get_shape_geometry: &dyn Fn(u64) -> Option<SkiaShapeGeometry>,
    get_bitmap_texture: &dyn Fn(u64) -> Option<SkiaBitmapTexture>,
    get_clip_rectangle: &dyn Fn(u64) -> Option<SkiaClipRectangle>,
) {
    let mut stack: Vec<SkiaWalkStep> = vec![SkiaWalkStep::Visit(root_id)];

    while let Some(step) = stack.pop() {
        let current = match step {
            SkiaWalkStep::PopClip => {
                pop_skia_clip_rectangle(state);
                continue;
            }
            SkiaWalkStep::Visit(id) => id,
        };

        let Some(proxy) = get_render_proxy(current) else {
            continue;
        };
        if !is_skia_proxy_visible(&proxy) {
            continue;
        }

        if let Some(clip) = get_clip_rectangle(current) {
            push_skia_clip_rectangle(state, &clip, &proxy.transform_2d);
            stack.push(SkiaWalkStep::PopClip);
        }

        state.render_transform_2d = Some(proxy.transform_2d);
        state.render_alpha = proxy.base.alpha;
        state.render_blend_mode = proxy.base.blend_mode;

        let kind = get_kind(current);
        if let Some(slot) = state.renderers.get(&kind).copied() {
            match slot {
                SkiaRendererSlot::Container => draw_skia_display_object(state, current),
                SkiaRendererSlot::Bitmap => {
                    if let Some(texture) = get_bitmap_texture(current) {
                        draw_skia_bitmap(state, &texture);
                    }
                }
                SkiaRendererSlot::Shape => {
                    if let Some(geometry) = get_shape_geometry(current) {
                        draw_skia_shape_fill(state, &geometry.regions);
                    }
                }
            }
        }

        if proxy.traverse_children {
            let children = get_children(current);
            for child in children.into_iter().rev() {
                stack.push(SkiaWalkStep::Visit(child));
            }
        }
    }
}

// One entry on the iterative pre-order stack: a node to visit or a deferred clip
// pop scheduled beneath a clipping node's children.
enum SkiaWalkStep {
    Visit(u64),
    PopClip,
}

// Mirrors `flighthq_render::is_render_proxy_visible` (visible, alpha > 0, non-zero
// scale) without a store borrow, so the walk can test a cloned proxy.
fn is_skia_proxy_visible(proxy: &RenderProxy2D) -> bool {
    proxy.base.visible
        && proxy.base.alpha > 0.0
        && !(proxy.transform_2d.a == 0.0 && proxy.transform_2d.d == 0.0)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use flighthq_types::Path;
    use flighthq_types::geometry::Matrix;
    use flighthq_types::misc::path_command;
    use flighthq_types::node_types::PathWinding;

    use super::*;
    use crate::skia_render_state::create_skia_render_state;

    fn identity_transform() -> Matrix {
        Matrix::default()
    }

    fn visible_proxy(transform: Matrix) -> RenderProxy2D {
        let mut proxy = RenderProxy2D::default();
        proxy.base.visible = true;
        proxy.base.alpha = 1.0;
        proxy.transform_2d = transform;
        proxy.traverse_children = true;
        proxy
    }

    fn box_region(color: u32) -> ShapeFillRegion {
        ShapeFillRegion {
            path: Path {
                commands: vec![
                    path_command::MOVE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                ],
                data: vec![0.0, 0.0, 20.0, 0.0, 20.0, 20.0, 0.0, 20.0, 0.0, 0.0],
                winding: PathWinding::NonZero,
            },
            color,
            alpha: 1.0,
        }
    }

    fn pixel(state: &SkiaRenderState, x: u32, y: u32) -> [u8; 4] {
        let p = state.pixmap.pixel(x, y).expect("pixel").demultiply();
        [p.red(), p.green(), p.blue(), p.alpha()]
    }

    #[test]
    fn register_skia_display_object_renderers_registers_three_kinds() {
        let mut state = create_skia_render_state(4, 4).expect("state");
        register_skia_display_object_renderers(&mut state);
        assert_eq!(
            state.renderers.get(&display_object_kind()),
            Some(&SkiaRendererSlot::Container)
        );
        assert_eq!(
            state.renderers.get(&bitmap_kind()),
            Some(&SkiaRendererSlot::Bitmap)
        );
        assert_eq!(
            state.renderers.get(&shape_kind()),
            Some(&SkiaRendererSlot::Shape)
        );
    }

    #[test]
    fn render_skia_display_object_draws_a_shape_leaf() {
        let mut state = create_skia_render_state(20, 20).expect("state");
        register_skia_display_object_renderers(&mut state);

        let mut proxies: HashMap<u64, RenderProxy2D> = HashMap::new();
        proxies.insert(1, visible_proxy(identity_transform()));

        render_skia_display_object(
            &mut state,
            1,
            &|_| Vec::new(),
            &|_| shape_kind(),
            &|id| proxies.get(&id).cloned(),
            &|_| {
                Some(SkiaShapeGeometry {
                    regions: vec![box_region(0xff0000ff)],
                })
            },
            &|_| None,
            &|_| None,
        );

        let c = pixel(&state, 10, 10);
        assert_eq!(c, [0xff, 0x00, 0x00, 0xff]);
    }

    #[test]
    fn render_skia_display_object_skips_invisible_node() {
        let mut state = create_skia_render_state(20, 20).expect("state");
        register_skia_display_object_renderers(&mut state);

        let mut proxy = visible_proxy(identity_transform());
        proxy.base.visible = false;
        let mut proxies = HashMap::new();
        proxies.insert(1, proxy);

        render_skia_display_object(
            &mut state,
            1,
            &|_| Vec::new(),
            &|_| shape_kind(),
            &|id| proxies.get(&id).cloned(),
            &|_| {
                Some(SkiaShapeGeometry {
                    regions: vec![box_region(0xff0000ff)],
                })
            },
            &|_| None,
            &|_| None,
        );

        assert_eq!(pixel(&state, 10, 10)[3], 0x00);
    }

    #[test]
    fn render_skia_display_object_paints_children_in_painter_order() {
        // Parent container with two overlapping shape children; the second child
        // (drawn last) must win at the overlap.
        let mut state = create_skia_render_state(20, 20).expect("state");
        register_skia_display_object_renderers(&mut state);

        let mut proxies = HashMap::new();
        proxies.insert(1, visible_proxy(identity_transform())); // container
        proxies.insert(2, visible_proxy(identity_transform())); // bottom child
        proxies.insert(3, visible_proxy(identity_transform())); // top child

        let kinds = |id: u64| {
            if id == 1 {
                display_object_kind()
            } else {
                shape_kind()
            }
        };
        let children = |id: u64| if id == 1 { vec![2, 3] } else { Vec::new() };
        let geometry = |id: u64| {
            let color = if id == 2 { 0x0000ffff } else { 0x00ff00ff };
            Some(SkiaShapeGeometry {
                regions: vec![box_region(color)],
            })
        };

        render_skia_display_object(
            &mut state,
            1,
            &children,
            &kinds,
            &|id| proxies.get(&id).cloned(),
            &geometry,
            &|_| None,
            &|_| None,
        );

        // Top child (green, id 3) drew last and wins.
        assert_eq!(pixel(&state, 10, 10), [0x00, 0xff, 0x00, 0xff]);
    }

    #[test]
    fn render_skia_display_object_clips_subtree() {
        // A clip rectangle on the container restricts where a child shape draws.
        let mut state = create_skia_render_state(20, 20).expect("state");
        register_skia_display_object_renderers(&mut state);

        let mut proxies = HashMap::new();
        proxies.insert(1, visible_proxy(identity_transform()));
        proxies.insert(2, visible_proxy(identity_transform()));

        let kinds = |id: u64| {
            if id == 1 {
                display_object_kind()
            } else {
                shape_kind()
            }
        };
        let children = |id: u64| if id == 1 { vec![2] } else { Vec::new() };
        let clip = |id: u64| {
            if id == 1 {
                Some(SkiaClipRectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 8.0,
                    height: 8.0,
                })
            } else {
                None
            }
        };

        render_skia_display_object(
            &mut state,
            1,
            &children,
            &kinds,
            &|id| proxies.get(&id).cloned(),
            &|_| {
                Some(SkiaShapeGeometry {
                    regions: vec![box_region(0xff0000ff)],
                })
            },
            &|_| None,
            &clip,
        );

        // Inside the clip the shape paints; outside it is masked away.
        assert_eq!(pixel(&state, 4, 4), [0xff, 0x00, 0x00, 0xff]);
        assert_eq!(pixel(&state, 15, 15)[3], 0x00);
        // After the walk the clip stack is empty again (pop fired).
        assert!(state.clip_stack.is_empty());
    }
}
