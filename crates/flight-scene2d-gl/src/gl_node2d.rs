// flight-lint: allow-file(contract-vocabulary) D17 the render walk is generic dispatch over thread-bound render-gl state and caller-owned proxies

use flight_entity::get_entity_id;
use flight_geometry::{Matrix, create_matrix, multiply_matrix};
use flight_node::NodeRef;
use flight_render::{
    NodeRenderer, RenderProxies2D, RenderProxy2D, is_render_proxy_visible, noop_renderer_data,
};
use flight_render_gl::{GlRenderPass, GlRenderState};
use glow::HasContext;

use crate::gl_quad_batch_writer::flush_gl_quad_batch_writer;

pub static GL_SCENE2D_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: draw_gl_scene2d,
};

pub fn draw_gl_scene2d(_state: &mut GlRenderState, _render_proxy: &RenderProxy2D<GlRenderState>) {
    // Plain display objects have no visual geometry of their own.
}

// flight-lint: allow(conform-params) D17 the render state and caller-owned proxy store are explicit arguments; a native GlRenderPass handle does not carry its state
pub fn render_gl_scene2d(
    state: &mut GlRenderState,
    proxies: &mut RenderProxies2D<GlRenderState>,
    _pass: &GlRenderPass,
    source: &NodeRef,
    render_transform: Option<&Matrix>,
) {
    // SAFETY: fixed-function state changes occur on the owning GL thread.
    unsafe {
        state.gl.disable(glow::CULL_FACE);
        state.gl.disable(glow::DEPTH_TEST);
        state.gl.enable(glow::BLEND);
    }

    let mut temp_stack = std::mem::take(&mut proxies.temp_stack);
    temp_stack.clear();
    let clip_hooks = state.registries.clip_hooks;
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
    flush_gl_quad_batch_writer(state);
    if let Some(hooks) = clip_hooks {
        (hooks.finalize)(state);
    }
}
