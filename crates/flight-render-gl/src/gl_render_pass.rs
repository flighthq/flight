// flight-lint: allow-file(contract-vocabulary) D17 render passes accept native target traits and preserve source Result diagnostics

use std::cell::RefCell;
use std::rc::Rc;

use flight_entity::{EntityRuntimeSlot, get_entity_id};
use flight_node::Viewport;
use glow::HasContext;

use crate::{
    GlPassStackEntry, GlRenderPass, GlRenderPassHandle, GlRenderState, GlRenderStateRuntime,
    GlRenderTarget, GlRenderTargetSnapshot, GlScissorRect, GlViewportRect, RenderTargetClear,
    SavedGlPassState, SavedGlStencil, flush_gl_delete_queue,
};

// flight-lint: allow(conform-params) D17 generic render-state ownership replaces the source raw WebGL context parameter
pub fn acquire_gl_render_pass_handle(
    state: &GlRenderState,
    target: &dyn GlRenderTarget,
) -> GlRenderPass {
    let snapshot = snapshot_gl_render_target(target);
    let owner_id = get_entity_id(state);
    let mut context = state.context_state.runtime_state.borrow_mut();
    if let Some(handle) = context.pass_handle_pool.pop() {
        {
            let mut data = handle.0.borrow_mut();
            data.gl = Rc::clone(&state.gl);
            data.owner_id = owner_id;
            data.target = snapshot;
        }
        return handle;
    }
    return GlRenderPass(Rc::new(RefCell::new(GlRenderPassHandle {
        runtime: EntityRuntimeSlot::default(),
        gl: Rc::clone(&state.gl),
        owner_id,
        target: snapshot,
    })));
}

fn apply_gl_scissor(gl: &glow::Context, rect: Option<GlScissorRect>) {
    // SAFETY: the caller is at a GL-thread state boundary for this context.
    unsafe {
        let Some(rect) = rect else {
            gl.disable(glow::SCISSOR_TEST);
            return;
        };
        gl.enable(glow::SCISSOR_TEST);
        gl.scissor(rect.x, rect.y, rect.width, rect.height);
    }
}

pub fn begin_gl_render_pass(
    state: &GlRenderState,
    target: &dyn GlRenderTarget,
    clear: Option<&RenderTargetClear>,
    viewport: Option<&Viewport>,
) -> Result<GlRenderPass, String> {
    flush_gl_delete_queue(&state.context_state);
    let owner_id = get_entity_id(state);
    let target_snapshot = snapshot_gl_render_target(target);
    let (previous_owner_id, previous_runtime) = {
        let context = state.context_state.runtime_state.borrow();
        let previous_owner_id = context
            .pass_stack
            .last()
            .map_or(owner_id, |entry| entry.owner_id);
        let runtime = context
            .state_runtimes
            .get(&previous_owner_id)
            .and_then(std::rc::Weak::upgrade)
            .ok_or_else(|| {
                "beginGlRenderPass: previous render state is no longer live".to_string()
            })?;
        (previous_owner_id, runtime)
    };
    let previous_state = capture_gl_pass_state(&previous_runtime.borrow());
    let current_mask_depth = previous_state.current_mask_depth;
    if current_mask_depth > 0 && previous_state.framebuffer == target_snapshot.framebuffer {
        return Err(
            "beginGlRenderPass: cannot nest the active framebuffer while a contour clip is live"
                .to_string(),
        );
    }
    let owner_state = if previous_owner_id == owner_id {
        previous_state.clone()
    } else {
        capture_gl_pass_state(&state.gl_runtime.borrow())
    };
    let mut fallback_viewport = [0; 4];
    // SAFETY: pass entry is executed on the state context's owning GL thread.
    let depth_mask = unsafe {
        state
            .gl
            .get_parameter_i32_slice(glow::VIEWPORT, &mut fallback_viewport);
        state.gl.get_parameter_bool(glow::DEPTH_WRITEMASK)
    };
    let stencil = if current_mask_depth > 0 {
        Some(capture_gl_stencil(&state.gl))
    } else {
        None
    };
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .pass_stack
        .push(GlPassStackEntry {
            depth_mask,
            fallback_viewport,
            owner_id,
            owner_state,
            previous_state: previous_state.clone(),
            stencil,
        });

    let active_viewport = resolve_gl_pass_viewport(target_snapshot, viewport);
    let active_scissor = match previous_state.scissor_rect {
        None if viewport.is_none() => None,
        None => Some(active_viewport),
        Some(enclosing) => Some(intersect_gl_rects(enclosing, active_viewport)),
    };
    // SAFETY: all bindings belong to the current context and dimensions are clamped to i32.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, target_snapshot.framebuffer);
        state.gl.viewport(
            active_viewport.x,
            active_viewport.y,
            active_viewport.width,
            active_viewport.height,
        );
        apply_gl_scissor(&state.gl, active_scissor);
        if current_mask_depth > 0 {
            state.gl.disable(glow::STENCIL_TEST);
        }
    }
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_framebuffer = target_snapshot.framebuffer;
        runtime.current_target = Some(target_snapshot);
        runtime.render_target_viewport = Some(active_viewport);
        runtime.current_scissor_rect = active_scissor;
        runtime.scissor_stack = active_scissor.into_iter().collect();
        runtime.clip_forms.clear();
        runtime.current_mask_depth = 0;
    }
    invalidate_gl_pass_binding_cache(state);
    clear_gl_render_pass(state, target_snapshot, clear);

    let pass = acquire_gl_render_pass_handle(state, target);
    state.gl_runtime.borrow_mut().current_pass = Some(pass.clone());
    return Ok(pass);
}

fn capture_gl_pass_state(runtime: &GlRenderStateRuntime) -> SavedGlPassState {
    return SavedGlPassState {
        clip_forms: runtime.clip_forms.clone(),
        current_mask_depth: runtime.current_mask_depth,
        framebuffer: runtime.current_framebuffer,
        render_target: runtime.current_target,
        render_target_viewport: runtime.render_target_viewport,
        scissor_rect: runtime.current_scissor_rect,
        scissor_stack: runtime.scissor_stack.clone(),
    };
}

fn capture_gl_stencil(gl: &glow::Context) -> SavedGlStencil {
    // SAFETY: called with this context current at pass entry.
    unsafe {
        return SavedGlStencil {
            fail: gl.get_parameter_i32(glow::STENCIL_FAIL) as u32,
            function: gl.get_parameter_i32(glow::STENCIL_FUNC) as u32,
            pass_depth_fail: gl.get_parameter_i32(glow::STENCIL_PASS_DEPTH_FAIL) as u32,
            pass_depth_pass: gl.get_parameter_i32(glow::STENCIL_PASS_DEPTH_PASS) as u32,
            reference: gl.get_parameter_i32(glow::STENCIL_REF),
            value_mask: gl.get_parameter_i32(glow::STENCIL_VALUE_MASK) as u32,
            write_mask: gl.get_parameter_i32(glow::STENCIL_WRITEMASK) as u32,
        };
    }
}

fn clamp_gl_pass_edge(value: f32, extent: i32) -> i32 {
    if value.is_nan() {
        return 0;
    }
    return value.max(0.0).min(extent as f32) as i32;
}

fn clear_gl_render_pass(
    state: &GlRenderState,
    target: GlRenderTargetSnapshot,
    clear: Option<&RenderTargetClear>,
) {
    let Some(clear) = clear else {
        return;
    };
    // SAFETY: clear commands target the framebuffer just bound by begin_gl_render_pass.
    unsafe {
        if let Some(colors) = &clear.colors {
            for (index, color) in colors.iter().enumerate() {
                if let Some(color) = color {
                    state
                        .gl
                        .clear_buffer_f32_slice(glow::COLOR, index as u32, color);
                }
            }
        } else if let Some(color) = clear.color {
            for index in 0..target.color_attachments {
                state.gl.clear_buffer_f32_slice(glow::COLOR, index, &color);
            }
        }
        match (clear.depth, clear.stencil) {
            (Some(depth), Some(stencil)) => {
                state.gl.depth_mask(true);
                state
                    .gl
                    .clear_buffer_depth_stencil(glow::DEPTH_STENCIL, 0, depth, stencil);
            }
            (Some(depth), None) => {
                state.gl.depth_mask(true);
                state.gl.clear_buffer_f32_slice(glow::DEPTH, 0, &[depth]);
            }
            (None, Some(stencil)) => {
                state
                    .gl
                    .clear_buffer_i32_slice(glow::STENCIL, 0, &[stencil]);
            }
            (None, None) => {}
        }
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_blend_signature = None;
}

// flight-lint: allow(conform-params) D17 generic render-pass restoration requires its explicit owning render state
pub fn end_gl_render_pass(state: &GlRenderState, pass: &GlRenderPass) -> Result<(), String> {
    let owner_id = get_entity_id(state);
    if pass.0.borrow().owner_id != owner_id {
        return Err("endGlRenderPass called without a matching beginGlRenderPass".to_string());
    }
    let saved = {
        let mut context = state.context_state.runtime_state.borrow_mut();
        if context
            .pass_stack
            .last()
            .is_none_or(|entry| entry.owner_id != owner_id)
        {
            return Err("endGlRenderPass called without a matching beginGlRenderPass".to_string());
        }
        context.pass_stack.pop().unwrap()
    };
    release_gl_render_pass_handle(state, pass.clone());

    let ended = {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_pass = None;
        let ended = runtime.current_target;
        restore_gl_pass_state(&mut runtime, &saved.owner_state);
        ended
    };
    let viewport = saved.previous_state.render_target_viewport;
    let restored_viewport = viewport.map_or(saved.fallback_viewport, |value| {
        [value.x, value.y, value.width, value.height]
    });
    // SAFETY: the saved state came from this exact context at pass entry.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, saved.previous_state.framebuffer);
        state.gl.viewport(
            restored_viewport[0],
            restored_viewport[1],
            restored_viewport[2],
            restored_viewport[3],
        );
        apply_gl_scissor(&state.gl, saved.previous_state.scissor_rect);
        restore_gl_stencil(&state.gl, saved.stencil);
        state.gl.depth_mask(saved.depth_mask);
    }
    invalidate_gl_pass_binding_cache(state);
    if let Some(target) = ended {
        resolve_gl_render_target_snapshot(state, target);
    }
    return Ok(());
}

pub fn get_gl_current_render_pass(state: &GlRenderState) -> Option<GlRenderPass> {
    return state.gl_runtime.borrow().current_pass.clone();
}

// flight-lint: allow(conform-extra) Native helper exposes the exact source viewport/scissor intersection for direct CPU testing
pub fn intersect_gl_rects(a: GlScissorRect, b: GlViewportRect) -> GlScissorRect {
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let top = (a.y + a.height).min(b.y + b.height);
    return GlScissorRect {
        height: (top - y).max(0),
        width: (right - x).max(0),
        x,
        y,
    };
}

fn invalidate_gl_pass_binding_cache(state: &GlRenderState) {
    let mut context = state.context_state.runtime_state.borrow_mut();
    context.binding = None;
    context.current_blend_signature = None;
    context.current_texture_realization = None;
}

// flight-lint: allow(conform-params) D17 pass recycling uses the owning generic render state instead of a raw context
pub fn release_gl_render_pass_handle(state: &GlRenderState, handle: GlRenderPass) {
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .pass_handle_pool
        .push(handle);
}

// flight-lint: allow(conform-extra) Native helper exposes exact viewport fallback policy for direct CPU testing
pub fn resolve_gl_pass_viewport(
    target: GlRenderTargetSnapshot,
    viewport: Option<&Viewport>,
) -> GlViewportRect {
    let Some(viewport) = viewport else {
        return GlViewportRect {
            height: target.height.min(i32::MAX as u32) as i32,
            width: target.width.min(i32::MAX as u32) as i32,
            x: 0,
            y: 0,
        };
    };
    let pass_width = viewport.width.max(0.0);
    let pass_height = viewport.height.max(0.0);
    let raw_left = viewport.x.floor();
    let raw_right = if pass_width == 0.0 {
        raw_left
    } else {
        (viewport.x + pass_width).ceil()
    };
    let raw_top = viewport.y.floor();
    let raw_bottom = if pass_height == 0.0 {
        raw_top
    } else {
        (viewport.y + pass_height).ceil()
    };
    let extent_width = target.width.min(i32::MAX as u32) as i32;
    let extent_height = target.height.min(i32::MAX as u32) as i32;
    let left = clamp_gl_pass_edge(raw_left, extent_width);
    let right = clamp_gl_pass_edge(raw_right, extent_width);
    let top = clamp_gl_pass_edge(raw_top, extent_height);
    let bottom = clamp_gl_pass_edge(raw_bottom, extent_height);
    return GlViewportRect {
        height: (bottom - top).max(0),
        width: (right - left).max(0),
        x: left,
        y: extent_height - bottom,
    };
}

fn resolve_gl_render_target_snapshot(state: &GlRenderState, target: GlRenderTargetSnapshot) {
    let Some(resolve_framebuffer) = target.resolve_framebuffer else {
        return;
    };
    if target.sample_count <= 1 {
        return;
    }
    let restored = state.gl_runtime.borrow().current_framebuffer;
    let scissor = state.gl_runtime.borrow().current_scissor_rect;
    // SAFETY: both framebuffer handles came from this target/context.
    unsafe {
        if scissor.is_some() {
            state.gl.disable(glow::SCISSOR_TEST);
        }
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, target.framebuffer);
        state
            .gl
            .bind_framebuffer(glow::DRAW_FRAMEBUFFER, Some(resolve_framebuffer));
        for index in 0..target.color_attachments {
            state.gl.read_buffer(glow::COLOR_ATTACHMENT0 + index);
            state.gl.draw_buffers(&[glow::COLOR_ATTACHMENT0 + index]);
            state.gl.blit_framebuffer(
                0,
                0,
                target.width as i32,
                target.height as i32,
                0,
                0,
                target.width as i32,
                target.height as i32,
                glow::COLOR_BUFFER_BIT,
                glow::NEAREST,
            );
        }
        state.gl.bind_framebuffer(glow::READ_FRAMEBUFFER, restored);
        state.gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, restored);
        if let Some(scissor) = scissor {
            state.gl.enable(glow::SCISSOR_TEST);
            state
                .gl
                .scissor(scissor.x, scissor.y, scissor.width, scissor.height);
        }
        state.gl.flush();
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_texture_realization = None;
}

fn restore_gl_pass_state(runtime: &mut GlRenderStateRuntime, saved: &SavedGlPassState) {
    runtime.current_framebuffer = saved.framebuffer;
    runtime.current_mask_depth = saved.current_mask_depth;
    runtime.current_scissor_rect = saved.scissor_rect;
    runtime.current_target = saved.render_target;
    runtime.render_target_viewport = saved.render_target_viewport;
    runtime.scissor_stack.clone_from(&saved.scissor_stack);
    runtime.clip_forms.clone_from(&saved.clip_forms);
}

fn restore_gl_stencil(gl: &glow::Context, saved: Option<SavedGlStencil>) {
    // SAFETY: the values were queried from this context at pass entry.
    unsafe {
        let Some(saved) = saved else {
            gl.disable(glow::STENCIL_TEST);
            return;
        };
        gl.enable(glow::STENCIL_TEST);
        gl.stencil_mask(saved.write_mask);
        gl.stencil_func(saved.function, saved.reference, saved.value_mask);
        gl.stencil_op(saved.fail, saved.pass_depth_fail, saved.pass_depth_pass);
    }
}

fn snapshot_gl_render_target(target: &dyn GlRenderTarget) -> GlRenderTargetSnapshot {
    return GlRenderTargetSnapshot {
        color_attachments: target.color_attachments(),
        framebuffer: target.framebuffer(),
        height: target.height(),
        id: get_entity_id(target),
        resolve_framebuffer: target.resolve_framebuffer(),
        sample_count: target.sample_count(),
        width: target.width(),
    };
}
