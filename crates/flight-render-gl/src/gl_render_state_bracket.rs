// flight-lint: allow-file(contract-vocabulary) D17 scoped native state brackets use FnOnce to enforce exactly-once restoration

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use glow::HasContext;

use crate::{GlRenderState, SavedGlRenderState};

const GL_RENDER_STATE_TEXTURE_UNIT_COUNT: usize = 14;

pub fn pop_gl_render_state(state: &GlRenderState) {
    let Some(saved) = state.gl_runtime.borrow_mut().render_state_stack.pop() else {
        return;
    };
    let gl = &state.gl;
    // SAFETY: every saved value and handle was queried from this context in push_gl_render_state.
    unsafe {
        restore_gl_capability(gl, glow::DEPTH_TEST, saved.depth_test);
        gl.depth_mask(saved.depth_mask);
        gl.depth_func(saved.depth_func);
        restore_gl_capability(gl, glow::CULL_FACE, saved.cull_face);
        gl.cull_face(saved.cull_face_mode);
        gl.front_face(saved.front_face);
        restore_gl_capability(gl, glow::STENCIL_TEST, saved.stencil_test);
        gl.stencil_op_separate(
            glow::FRONT,
            saved.stencil_fail,
            saved.stencil_pass_depth_fail,
            saved.stencil_pass_depth_pass,
        );
        gl.stencil_op_separate(
            glow::BACK,
            saved.stencil_back_fail,
            saved.stencil_back_pass_depth_fail,
            saved.stencil_back_pass_depth_pass,
        );
        gl.stencil_func_separate(
            glow::FRONT,
            saved.stencil_function,
            saved.stencil_reference,
            saved.stencil_value_mask,
        );
        gl.stencil_func_separate(
            glow::BACK,
            saved.stencil_back_function,
            saved.stencil_back_reference,
            saved.stencil_back_value_mask,
        );
        gl.stencil_mask_separate(glow::FRONT, saved.stencil_write_mask);
        gl.stencil_mask_separate(glow::BACK, saved.stencil_back_write_mask);
        restore_gl_capability(gl, glow::BLEND, saved.blend);
        gl.blend_func_separate(
            saved.blend_src_rgb,
            saved.blend_dst_rgb,
            saved.blend_src_alpha,
            saved.blend_dst_alpha,
        );
        gl.blend_equation_separate(saved.blend_equation_rgb, saved.blend_equation_alpha);
        gl.color_mask(
            saved.color_mask[0],
            saved.color_mask[1],
            saved.color_mask[2],
            saved.color_mask[3],
        );
        gl.clear_color(
            saved.clear_color[0],
            saved.clear_color[1],
            saved.clear_color[2],
            saved.clear_color[3],
        );
        gl.bind_vertex_array(saved.vertex_array);
        gl.use_program(saved.program);
        gl.bind_framebuffer(glow::FRAMEBUFFER, saved.framebuffer);
        for (index, texture) in saved.texture_2d_by_unit.iter().enumerate() {
            gl.active_texture(glow::TEXTURE0 + index as u32);
            gl.bind_texture(glow::TEXTURE_2D, *texture);
        }
        gl.active_texture(saved.active_texture);
        restore_gl_capability(gl, glow::SCISSOR_TEST, saved.scissor_test);
        gl.scissor(
            saved.scissor_box[0],
            saved.scissor_box[1],
            saved.scissor_box[2],
            saved.scissor_box[3],
        );
        gl.viewport(
            saved.viewport[0],
            saved.viewport[1],
            saved.viewport[2],
            saved.viewport[3],
        );
    }
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_framebuffer = saved.current_framebuffer;
        runtime.current_scissor_rect = saved.current_scissor_rect;
        runtime.current_target = saved.current_render_target;
        runtime.render_target_viewport = saved.render_target_viewport;
    }
    let mut context = state.context_state.runtime_state.borrow_mut();
    context.binding = saved.current_shader;
    context.current_blend_signature = saved.current_blend_signature;
    context.current_texture_realization = saved.current_texture_realization;
    context.unpack_premultiply_alpha = saved.unpack_premultiply_alpha;
}

pub fn push_gl_render_state(state: &mut GlRenderState) {
    let flush = state.gl_runtime.borrow().flush_pending_draws;
    if let Some(flush) = flush {
        flush(state);
    }
    let gl = &state.gl;
    let active_texture;
    let mut texture_2d_by_unit = Vec::with_capacity(GL_RENDER_STATE_TEXTURE_UNIT_COUNT);
    let mut viewport = [0; 4];
    let mut scissor_box = [0; 4];
    let mut clear_color = [0.0; 4];
    // SAFETY: push captures state from the current render context without retaining borrowed GL data.
    let mut saved = unsafe {
        active_texture = gl.get_parameter_i32(glow::ACTIVE_TEXTURE) as u32;
        for index in 0..GL_RENDER_STATE_TEXTURE_UNIT_COUNT {
            gl.active_texture(glow::TEXTURE0 + index as u32);
            texture_2d_by_unit.push(gl.get_parameter_texture(glow::TEXTURE_BINDING_2D));
        }
        gl.active_texture(active_texture);
        gl.get_parameter_i32_slice(glow::VIEWPORT, &mut viewport);
        gl.get_parameter_i32_slice(glow::SCISSOR_BOX, &mut scissor_box);
        gl.get_parameter_f32_slice(glow::COLOR_CLEAR_VALUE, &mut clear_color);
        SavedGlRenderState {
            active_texture,
            blend: gl.is_enabled(glow::BLEND),
            blend_dst_alpha: gl.get_parameter_i32(glow::BLEND_DST_ALPHA) as u32,
            blend_dst_rgb: gl.get_parameter_i32(glow::BLEND_DST_RGB) as u32,
            blend_equation_alpha: gl.get_parameter_i32(glow::BLEND_EQUATION_ALPHA) as u32,
            blend_equation_rgb: gl.get_parameter_i32(glow::BLEND_EQUATION_RGB) as u32,
            blend_src_alpha: gl.get_parameter_i32(glow::BLEND_SRC_ALPHA) as u32,
            blend_src_rgb: gl.get_parameter_i32(glow::BLEND_SRC_RGB) as u32,
            clear_color,
            color_mask: gl.get_parameter_bool_array::<4>(glow::COLOR_WRITEMASK),
            cull_face: gl.is_enabled(glow::CULL_FACE),
            cull_face_mode: gl.get_parameter_i32(glow::CULL_FACE_MODE) as u32,
            current_blend_signature: None,
            current_framebuffer: None,
            current_render_target: None,
            current_scissor_rect: None,
            current_shader: None,
            current_texture_realization: None,
            depth_func: gl.get_parameter_i32(glow::DEPTH_FUNC) as u32,
            depth_mask: gl.get_parameter_bool(glow::DEPTH_WRITEMASK),
            depth_test: gl.is_enabled(glow::DEPTH_TEST),
            framebuffer: gl.get_parameter_framebuffer(glow::FRAMEBUFFER_BINDING),
            front_face: gl.get_parameter_i32(glow::FRONT_FACE) as u32,
            program: gl.get_parameter_program(glow::CURRENT_PROGRAM),
            render_target_viewport: None,
            scissor_box,
            scissor_test: gl.is_enabled(glow::SCISSOR_TEST),
            stencil_back_fail: gl.get_parameter_i32(glow::STENCIL_BACK_FAIL) as u32,
            stencil_back_function: gl.get_parameter_i32(glow::STENCIL_BACK_FUNC) as u32,
            stencil_back_pass_depth_fail: gl.get_parameter_i32(glow::STENCIL_BACK_PASS_DEPTH_FAIL)
                as u32,
            stencil_back_pass_depth_pass: gl.get_parameter_i32(glow::STENCIL_BACK_PASS_DEPTH_PASS)
                as u32,
            stencil_back_reference: gl.get_parameter_i32(glow::STENCIL_BACK_REF),
            stencil_back_value_mask: gl.get_parameter_i32(glow::STENCIL_BACK_VALUE_MASK) as u32,
            stencil_back_write_mask: gl.get_parameter_i32(glow::STENCIL_BACK_WRITEMASK) as u32,
            stencil_fail: gl.get_parameter_i32(glow::STENCIL_FAIL) as u32,
            stencil_function: gl.get_parameter_i32(glow::STENCIL_FUNC) as u32,
            stencil_pass_depth_fail: gl.get_parameter_i32(glow::STENCIL_PASS_DEPTH_FAIL) as u32,
            stencil_pass_depth_pass: gl.get_parameter_i32(glow::STENCIL_PASS_DEPTH_PASS) as u32,
            stencil_reference: gl.get_parameter_i32(glow::STENCIL_REF),
            stencil_test: gl.is_enabled(glow::STENCIL_TEST),
            stencil_value_mask: gl.get_parameter_i32(glow::STENCIL_VALUE_MASK) as u32,
            stencil_write_mask: gl.get_parameter_i32(glow::STENCIL_WRITEMASK) as u32,
            texture_2d_by_unit,
            unpack_premultiply_alpha: false,
            vertex_array: gl.get_parameter_vertex_array(glow::VERTEX_ARRAY_BINDING),
            viewport,
        }
    };
    {
        let runtime = state.gl_runtime.borrow();
        saved.current_framebuffer = runtime.current_framebuffer;
        saved.current_render_target = runtime.current_target.clone();
        saved.current_scissor_rect = runtime.current_scissor_rect;
        saved.render_target_viewport = runtime.render_target_viewport;
    }
    {
        let context = state.context_state.runtime_state.borrow();
        saved.current_blend_signature = context.current_blend_signature;
        saved.current_shader = context.binding.clone();
        saved.current_texture_realization = context.current_texture_realization;
        saved.unpack_premultiply_alpha = context.unpack_premultiply_alpha;
    }
    state.gl_runtime.borrow_mut().render_state_stack.push(saved);
}

fn restore_gl_capability(gl: &glow::Context, capability: u32, enabled: bool) {
    // SAFETY: capability state is restored on the owning GL thread.
    unsafe {
        if enabled {
            gl.enable(capability);
        } else {
            gl.disable(capability);
        }
    }
}

pub fn with_gl_render_state<T, F>(state: &mut GlRenderState, callback: F) -> T
where
    F: FnOnce(&mut GlRenderState) -> T,
{
    push_gl_render_state(state);
    let result = catch_unwind(AssertUnwindSafe(|| callback(state)));
    pop_gl_render_state(state);
    return match result {
        Ok(value) => value,
        Err(payload) => resume_unwind(payload),
    };
}
