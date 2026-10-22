// flight-lint: allow-file(contract-vocabulary) D17 cube targets expose native glow handles, Rc context ownership, and Result diagnostics

use std::rc::Rc;

use flight_entity::EntityRuntimeSlot;
use flight_texture::RenderTargetColorSpace;
use glow::{HasContext, PixelUnpackData};

use crate::{
    GlCubeRenderTarget, GlCubeRenderTargetOptions, GlRenderPass, GlRenderState,
    GlRenderTargetSnapshot, GlViewportRect, SavedGlCubeFaceState, acquire_gl_render_pass_handle,
    release_gl_render_pass_handle,
};

pub fn create_gl_cube_render_target(
    state: &GlRenderState,
    size: f32,
    options: Option<&GlCubeRenderTargetOptions>,
) -> Result<GlCubeRenderTarget, String> {
    let normalized_size = size.ceil().max(1.0).min(u32::MAX as f32) as u32;
    let mut previous_viewport = [0; 4];
    // SAFETY: queries and allocation occur on the current GL thread.
    let (previous_framebuffer, previous_renderbuffer, previous_cube_texture) = unsafe {
        state
            .gl
            .get_parameter_i32_slice(glow::VIEWPORT, &mut previous_viewport);
        (
            state
                .gl
                .get_parameter_framebuffer(glow::FRAMEBUFFER_BINDING),
            state
                .gl
                .get_parameter_renderbuffer(glow::RENDERBUFFER_BINDING),
            state
                .gl
                .get_parameter_texture(glow::TEXTURE_BINDING_CUBE_MAP),
        )
    };
    // SAFETY: creation occurs on the current GL thread.
    let framebuffer = unsafe { state.gl.create_framebuffer() }
        .map_err(|error| format!("createGlCubeRenderTarget: {error}"))?;
    // SAFETY: creation occurs on the current GL thread.
    let texture = match unsafe { state.gl.create_texture() } {
        Ok(texture) => texture,
        Err(error) => {
            // SAFETY: framebuffer has not escaped.
            unsafe { state.gl.delete_framebuffer(framebuffer) };
            return Err(format!("createGlCubeRenderTarget: {error}"));
        }
    };
    let mut depth_stencil_renderbuffer = None;
    let result = (|| {
        // SAFETY: all handles in this allocation bracket belong to the current context.
        unsafe {
            state.gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
            for face in 0..6 {
                state.gl.tex_image_2d(
                    glow::TEXTURE_CUBE_MAP_POSITIVE_X + face,
                    0,
                    glow::RGBA16F as i32,
                    normalized_size as i32,
                    normalized_size as i32,
                    0,
                    glow::RGBA,
                    glow::HALF_FLOAT,
                    PixelUnpackData::Slice(None),
                );
            }
            state.gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_MIN_FILTER,
                glow::LINEAR as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_MAG_FILTER,
                glow::LINEAR as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_WRAP_S,
                glow::CLAMP_TO_EDGE as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_WRAP_T,
                glow::CLAMP_TO_EDGE as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_CUBE_MAP,
                glow::TEXTURE_WRAP_R,
                glow::CLAMP_TO_EDGE as i32,
            );
            state
                .gl
                .bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
            state.gl.framebuffer_texture_2d(
                glow::FRAMEBUFFER,
                glow::COLOR_ATTACHMENT0,
                glow::TEXTURE_CUBE_MAP_POSITIVE_X,
                Some(texture),
                0,
            );
            if options.and_then(|value| value.depth).unwrap_or(true) {
                let renderbuffer = state
                    .gl
                    .create_renderbuffer()
                    .map_err(|error| format!("createGlCubeRenderTarget: {error}"))?;
                depth_stencil_renderbuffer = Some(renderbuffer);
                state
                    .gl
                    .bind_renderbuffer(glow::RENDERBUFFER, Some(renderbuffer));
                state.gl.renderbuffer_storage(
                    glow::RENDERBUFFER,
                    glow::DEPTH24_STENCIL8,
                    normalized_size as i32,
                    normalized_size as i32,
                );
                state.gl.framebuffer_renderbuffer(
                    glow::FRAMEBUFFER,
                    glow::DEPTH_STENCIL_ATTACHMENT,
                    glow::RENDERBUFFER,
                    Some(renderbuffer),
                );
            }
        }
        return Ok::<(), String>(());
    })();
    // SAFETY: close the allocation bracket by restoring every captured binding.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, previous_framebuffer);
        state
            .gl
            .bind_renderbuffer(glow::RENDERBUFFER, previous_renderbuffer);
        state
            .gl
            .bind_texture(glow::TEXTURE_CUBE_MAP, previous_cube_texture);
    }
    if let Err(error) = result {
        // SAFETY: partial resources have not escaped.
        unsafe {
            if let Some(renderbuffer) = depth_stencil_renderbuffer {
                state.gl.delete_renderbuffer(renderbuffer);
            }
            state.gl.delete_texture(texture);
            state.gl.delete_framebuffer(framebuffer);
        }
        return Err(error);
    }
    return Ok(initialize_gl_cube_render_target(
        Rc::clone(&state.gl),
        normalized_size,
        framebuffer,
        texture,
        depth_stencil_renderbuffer,
        state
            .context_state
            .runtime_state
            .borrow()
            .delete_queue
            .clone(),
    ));
}

// flight-lint: allow(conform-params) D17 native cube target construction returns the owned value and retains its deferred deletion queue
pub fn initialize_gl_cube_render_target(
    gl: Rc<glow::Context>,
    size: u32,
    framebuffer: glow::NativeFramebuffer,
    texture: glow::NativeTexture,
    depth_stencil_renderbuffer: Option<glow::NativeRenderbuffer>,
    delete_queue: crate::GlDeleteQueue,
) -> GlCubeRenderTarget {
    return GlCubeRenderTarget {
        runtime: EntityRuntimeSlot::default(),
        gl,
        color_space: RenderTargetColorSpace::Linear,
        depth_stencil_renderbuffer,
        framebuffer,
        size,
        texture,
        delete_queue,
        destroyed: false,
    };
}

pub fn begin_gl_cube_render_face(
    state: &mut GlRenderState,
    target: &GlCubeRenderTarget,
    face: i32,
) -> Result<GlRenderPass, String> {
    if !(0..6).contains(&face) {
        return Err("beginGlCubeRenderFace face must be an integer from 0 through 5".to_string());
    }
    let flush = state.gl_runtime.borrow().flush_pending_draws;
    if let Some(flush) = flush {
        flush(state);
    }
    let mut viewport = [0; 4];
    let mut scissor_box = [0; 4];
    // SAFETY: state capture and face binding run on the target context's owning GL thread.
    let saved_physical = unsafe {
        state
            .gl
            .get_parameter_i32_slice(glow::VIEWPORT, &mut viewport);
        state
            .gl
            .get_parameter_i32_slice(glow::SCISSOR_BOX, &mut scissor_box);
        (
            state.gl.get_parameter_bool(glow::DEPTH_WRITEMASK),
            state
                .gl
                .get_parameter_framebuffer(glow::FRAMEBUFFER_BINDING),
            state.gl.is_enabled(glow::SCISSOR_TEST),
            state.gl.is_enabled(glow::STENCIL_TEST),
        )
    };
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        let saved = SavedGlCubeFaceState {
            clip_forms: runtime.clip_forms.clone(),
            current_framebuffer: runtime.current_framebuffer,
            current_mask_depth: runtime.current_mask_depth,
            current_render_target: runtime.current_target,
            current_scissor_rect: runtime.current_scissor_rect,
            depth_mask: saved_physical.0,
            framebuffer: saved_physical.1,
            render_target_viewport: runtime.render_target_viewport,
            scissor_box,
            scissor_stack: runtime.scissor_stack.clone(),
            scissor_test: saved_physical.2,
            stencil_test: saved_physical.3,
            viewport,
        };
        runtime.cube_face_stack.push(saved);
    }
    // SAFETY: target handles belong to this context; face was range-checked above.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        state.gl.framebuffer_texture_2d(
            glow::FRAMEBUFFER,
            glow::COLOR_ATTACHMENT0,
            glow::TEXTURE_CUBE_MAP_POSITIVE_X + face as u32,
            Some(target.texture),
            0,
        );
        state
            .gl
            .viewport(0, 0, target.size as i32, target.size as i32);
        state.gl.disable(glow::SCISSOR_TEST);
        state.gl.disable(glow::STENCIL_TEST);
    }
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_framebuffer = Some(target.framebuffer);
        runtime.current_target = Some(GlRenderTargetSnapshot {
            color_attachments: 1,
            color_texture: None,
            framebuffer: Some(target.framebuffer),
            height: target.size,
            id: flight_entity::get_entity_id(target),
            resolve_framebuffer: None,
            sample_count: 1,
            width: target.size,
        });
        runtime.render_target_viewport = Some(target_viewport(target.size));
        runtime.current_scissor_rect = None;
        runtime.scissor_stack.clear();
        runtime.clip_forms.clear();
        runtime.current_mask_depth = 0;
    }
    invalidate_gl_cube_face_binding_cache(state);
    // SAFETY: clear operations target the face framebuffer bound immediately above.
    unsafe {
        state
            .gl
            .clear_buffer_f32_slice(glow::COLOR, 0, &[0.0, 0.0, 0.0, 0.0]);
        if target.depth_stencil_renderbuffer.is_some() {
            state.gl.depth_mask(true);
            state
                .gl
                .clear_buffer_depth_stencil(glow::DEPTH_STENCIL, 0, 1.0, 0);
        }
    }
    return Ok(acquire_gl_render_pass_handle(state, target));
}

pub fn destroy_gl_cube_render_target(target: &mut GlCubeRenderTarget) {
    if target.destroyed {
        return;
    }
    // SAFETY: explicit destruction occurs on the target context's owning thread.
    unsafe {
        target.gl.delete_framebuffer(target.framebuffer);
        target.gl.delete_texture(target.texture);
        if let Some(renderbuffer) = target.depth_stencil_renderbuffer {
            target.gl.delete_renderbuffer(renderbuffer);
        }
    }
    target.destroyed = true;
}

// flight-lint: allow(conform-params) D17 generic cube-face restoration requires its explicit owning render state
pub fn end_gl_cube_render_face(state: &GlRenderState, pass: &GlRenderPass) -> Result<(), String> {
    let saved = state
        .gl_runtime
        .borrow_mut()
        .cube_face_stack
        .pop()
        .ok_or_else(|| {
            "endGlCubeRenderFace called without a matching beginGlCubeRenderFace".to_string()
        })?;
    if pass.0.borrow().owner_id != flight_entity::get_entity_id(state) {
        return Err(
            "endGlCubeRenderFace called without a matching beginGlCubeRenderFace".to_string(),
        );
    }
    release_gl_render_pass_handle(state, pass.clone());
    // SAFETY: physical state was captured from this same context at face entry.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, saved.framebuffer);
        state.gl.viewport(
            saved.viewport[0],
            saved.viewport[1],
            saved.viewport[2],
            saved.viewport[3],
        );
        restore_gl_cube_face_capability(&state.gl, glow::SCISSOR_TEST, saved.scissor_test);
        state.gl.scissor(
            saved.scissor_box[0],
            saved.scissor_box[1],
            saved.scissor_box[2],
            saved.scissor_box[3],
        );
        restore_gl_cube_face_capability(&state.gl, glow::STENCIL_TEST, saved.stencil_test);
        state.gl.depth_mask(saved.depth_mask);
    }
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_framebuffer = saved.current_framebuffer;
        runtime.current_mask_depth = saved.current_mask_depth;
        runtime.current_scissor_rect = saved.current_scissor_rect;
        runtime.current_target = saved.current_render_target;
        runtime.render_target_viewport = saved.render_target_viewport;
        runtime.scissor_stack = saved.scissor_stack;
        runtime.clip_forms = saved.clip_forms;
    }
    invalidate_gl_cube_face_binding_cache(state);
    return Ok(());
}

fn invalidate_gl_cube_face_binding_cache(state: &GlRenderState) {
    let mut context = state.context_state.runtime_state.borrow_mut();
    context.binding = None;
    context.current_blend_signature = None;
    context.current_texture_realization = None;
}

fn restore_gl_cube_face_capability(gl: &glow::Context, capability: u32, enabled: bool) {
    // SAFETY: capability restoration occurs on the owning GL thread.
    unsafe {
        if enabled {
            gl.enable(capability);
        } else {
            gl.disable(capability);
        }
    }
}

fn target_viewport(size: u32) -> GlViewportRect {
    return GlViewportRect {
        height: size as i32,
        width: size as i32,
        x: 0,
        y: 0,
    };
}
