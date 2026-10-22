// flight-lint: allow-file(contract-vocabulary) D17 the render walk is generic dispatch over render-wgpu state and caller-owned proxies
//! The 2D render walk and the plain display-object renderer (TS `wgpuNode2D.ts`).

use flight_entity::get_entity_id;
use flight_geometry::{Matrix, create_matrix, multiply_matrix};
use flight_node::NodeRef;
use flight_render::{
    NodeRenderer, RenderProxies2D, RenderProxy2D, RenderState, is_render_proxy_visible,
    noop_renderer_data,
};
use flight_render_wgpu::{WgpuRenderPass, WgpuRenderState};

use crate::wgpu_quad_batch_writer::flush_wgpu_quad_batch_writer;

/// The plain display-object renderer (TS `wgpuScene2DRenderer`): no geometry of its own.
pub static WGPU_SCENE2D_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: draw_wgpu_scene2d,
};

/// Draws a plain display object (TS `drawWgpuScene2D`): plain display objects have no visual
/// geometry of their own.
pub fn draw_wgpu_scene2d(
    _state: &mut WgpuRenderState,
    _render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
}

/// Walks `source`'s prepared subtree in paint order and submits every visible proxy to its renderer
/// inside `pass` (TS `renderWgpuScene2D`), then flushes the batch and unwinds open clips. An optional
/// `render_transform` is pre-multiplied onto every proxy's transform for this walk only.
// flight-lint: allow(conform-params) D17 render proxies are an explicit caller-owned store beside the pass's state
pub fn render_wgpu_scene2d(
    pass: &mut WgpuRenderPass<'_>,
    proxies: &mut RenderProxies2D<WgpuRenderState>,
    source: &NodeRef,
    render_transform: Option<&Matrix>,
) {
    let state = &mut *pass.state;
    let mut temp_stack = std::mem::take(&mut proxies.temp_stack);
    temp_stack.clear();
    let clip_hooks = state.render_registries().clip_hooks;
    let mut scratch = render_transform.map(|_| create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));

    temp_stack.push(source.clone());

    while let Some(current) = temp_stack.pop() {
        if !current.read().unwrap().node_fields().enabled {
            continue;
        }

        let Some(index) = proxies
            .by_uid
            .get(&get_entity_id(&*current.read().unwrap()))
            .copied()
        else {
            continue;
        };
        let Some(data) = proxies
            .entries
            .get_mut(index)
            .and_then(|entry| entry.as_mut())
        else {
            continue;
        };

        let saved_transform = data.transform_2d.clone();
        if let (Some(render_transform), Some(scratch)) = (render_transform, scratch.as_mut()) {
            multiply_matrix(scratch, render_transform, &saved_transform);
            data.transform_2d = scratch.clone();
        }

        if let Some(hooks) = clip_hooks {
            (hooks.pop_clip)(state, data, &current);
        }

        if !is_render_proxy_visible(data) {
            if render_transform.is_some() {
                data.transform_2d = saved_transform;
            }
            continue;
        }

        if let Some(hooks) = clip_hooks {
            (hooks.push_clip)(state, data, &current);
        }

        if let Some(renderer) = data.renderer {
            (renderer.submit)(state, data);
        }
        if data.traverse_children {
            let children = current.read().unwrap().node_runtime().children.clone();
            if let Some(children) = children {
                for child in children.iter().rev() {
                    temp_stack.push(child.clone());
                }
            }
        }

        if render_transform.is_some() {
            data.transform_2d = saved_transform;
        }
    }

    proxies.temp_stack = temp_stack;
    flush_wgpu_quad_batch_writer(state);
    if let Some(hooks) = clip_hooks {
        (hooks.finalize)(state);
    }
}
