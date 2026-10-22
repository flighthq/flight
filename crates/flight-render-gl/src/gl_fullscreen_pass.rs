// flight-lint: allow-file(contract-vocabulary) D17 fullscreen passes accept native targets, glow names, closures, and Result diagnostics

use flight_render::RenderTargetClear;
use flight_geometry::Rectangle;
use glow::HasContext;

use crate::{
    GlBlendSignature, GlBoundShader, GlFillProgram, GlFullscreenProgram, GlRenderPass,
    GlRenderState, GlRenderTarget, GlRenderTargetSnapshot, create_gl_program,
    native_glsl_source,
};

pub const FULLSCREEN_GL_VERTEX_SOURCE: &str = "#version 300 es\nin vec2 a_position;\nin vec2 a_texCoord;\nout vec2 v_texCoord;\nvoid main() {\n  gl_Position = vec4(a_position, 0.0, 1.0);\n  v_texCoord = a_texCoord;\n}";

const FILL_GL_FRAGMENT_SOURCE: &str = "#version 300 es\nprecision highp float;\nuniform vec4 u_color;\nout vec4 o_color;\nvoid main() {\n  o_color = u_color;\n}";

fn apply_normal_gl_blend_mode(state: &GlRenderState) {
    let signature = GlBlendSignature {
        dst: glow::ONE_MINUS_SRC_ALPHA,
        equation: glow::FUNC_ADD,
        src: glow::ONE,
    };
    let mut context = state.context_state.runtime_state.borrow_mut();
    if context.current_blend_signature == Some(signature) {
        return;
    }
    // SAFETY: fixed-function blend state is owned by the current render operation.
    unsafe {
        state.gl.blend_equation(glow::FUNC_ADD);
        state.gl.blend_func(glow::ONE, glow::ONE_MINUS_SRC_ALPHA);
    }
    context.current_blend_signature = Some(signature);
}

fn bind_gl_render_target(state: &GlRenderState, target: Option<&dyn GlRenderTarget>) {
    let framebuffer = target.and_then(GlRenderTarget::framebuffer);
    let mut runtime = state.gl_runtime.borrow_mut();
    if runtime.current_framebuffer != framebuffer {
        // SAFETY: target belongs to the same render context by contract.
        unsafe {
            state.gl.bind_framebuffer(glow::FRAMEBUFFER, framebuffer);
        }
        runtime.current_framebuffer = framebuffer;
    }
    let (width, height) = target.map_or_else(
        || {
            let mut viewport = [0; 4];
            // SAFETY: query occurs on the owning GL thread.
            unsafe {
                state
                    .gl
                    .get_parameter_i32_slice(glow::VIEWPORT, &mut viewport);
            }
            (viewport[2].max(0), viewport[3].max(0))
        },
        |target| (target.width() as i32, target.height() as i32),
    );
    // SAFETY: dimensions are normalized by target construction.
    unsafe { state.gl.viewport(0, 0, width, height) };
    runtime.render_target_viewport = target.map(|_| crate::GlViewportRect {
        height,
        width,
        x: 0,
        y: 0,
    });
    runtime.current_target = target.map(|target| GlRenderTargetSnapshot {
        color_attachments: target.color_attachments(),
        color_texture: target.color_texture(),
        framebuffer,
        height: target.height(),
        id: flight_entity::get_entity_id(target),
        resolve_framebuffer: target.resolve_framebuffer(),
        sample_count: target.sample_count(),
        width: target.width(),
    });
}

fn clear_gl_depth_stencil(
    gl: &glow::Context,
    depth: Option<f32>,
    stencil: Option<i32>,
    save_restore: bool,
) {
    // SAFETY: clear operations target the framebuffer selected by the caller.
    unsafe {
        let depth_mask_was = if save_restore && depth.is_some() {
            gl.get_parameter_bool(glow::DEPTH_WRITEMASK)
        } else {
            true
        };
        match (depth, stencil) {
            (Some(depth), Some(stencil)) => {
                if !depth_mask_was {
                    gl.depth_mask(true);
                }
                gl.clear_buffer_depth_stencil(glow::DEPTH_STENCIL, 0, depth, stencil);
            }
            (Some(depth), None) => {
                if !depth_mask_was {
                    gl.depth_mask(true);
                }
                gl.clear_buffer_f32_slice(glow::DEPTH, 0, &[depth]);
            }
            (None, Some(stencil)) => {
                gl.clear_buffer_i32_slice(glow::STENCIL, 0, &[stencil]);
            }
            (None, None) => {}
        }
        if save_restore && !depth_mask_was {
            gl.depth_mask(false);
        }
    }
}

pub fn clear_gl_render_target(target: &dyn GlRenderTarget, clear: &RenderTargetClear) {
    clear_gl_render_target_inner(target, clear, false);
}

pub fn clear_gl_render_target_attachments(target: &dyn GlRenderTarget, clear: &RenderTargetClear) {
    clear_gl_render_target_inner(target, clear, true);
}

fn clear_gl_render_target_inner(
    target: &dyn GlRenderTarget,
    clear: &RenderTargetClear,
    use_attachment_colors: bool,
) {
    let gl = target.gl();
    // SAFETY: standalone clear owns the framebuffer binding for its duration.
    unsafe {
        gl.bind_framebuffer(glow::FRAMEBUFFER, target.framebuffer());
        gl.viewport(0, 0, target.width() as i32, target.height() as i32);
        let scissor_was = gl.is_enabled(glow::SCISSOR_TEST);
        if scissor_was {
            gl.disable(glow::SCISSOR_TEST);
        }
        if use_attachment_colors {
            if let Some(colors) = &clear.colors {
                for (index, color) in colors.iter().enumerate() {
                    if let Some(color) = color {
                        gl.clear_buffer_f32_slice(glow::COLOR, index as u32, color);
                    }
                }
            }
        } else if let Some(color) = clear.color {
            for index in 0..target.color_attachments() {
                gl.clear_buffer_f32_slice(glow::COLOR, index, &color);
            }
        }
        clear_gl_depth_stencil(gl, clear.depth, clear.stencil, true);
        if scissor_was {
            gl.enable(glow::SCISSOR_TEST);
        }
    }
}

pub fn compile_gl_fullscreen_program(
    gl: &glow::Context,
    fragment_source: &str,
) -> Result<GlFullscreenProgram, String> {
    let vertex_source = native_glsl_source(FULLSCREEN_GL_VERTEX_SOURCE);
    let fragment_source = native_glsl_source(fragment_source);
    let program = create_gl_program(
        gl,
        &vertex_source,
        &fragment_source,
        Some("Fullscreen pass"),
    )?;
    let mut textures = Vec::new();
    // SAFETY: uniform and attribute locations are queried from a linked program.
    unsafe {
        for index in 0..8 {
            if let Some(location) = gl.get_uniform_location(program, &format!("u_texture{index}")) {
                textures.push(Some(location));
            }
        }
        let single = gl.get_uniform_location(program, "u_texture");
        if textures.is_empty() && single.is_some() {
            textures.push(single.clone());
        }
        return Ok(GlFullscreenProgram {
            program,
            loc_position: gl
                .get_attrib_location(program, "a_position")
                .ok_or_else(|| {
                    "Fullscreen pass program link error: missing a_position attribute".to_string()
                })?,
            loc_tex_coord: gl
                .get_attrib_location(program, "a_texCoord")
                .ok_or_else(|| {
                    "Fullscreen pass program link error: missing a_texCoord attribute".to_string()
                })?,
            texture: textures.first().cloned().flatten().or(single),
            textures,
        });
    }
}

// flight-lint: allow(conform-params) The native destination name is descriptive; its position and source semantics are unchanged
pub fn draw_gl_fullscreen_pass<F>(
    state: &mut GlRenderState,
    program: &GlFullscreenProgram,
    inputs: &[glow::NativeTexture],
    destination: Option<&dyn GlRenderTarget>,
    set_uniforms: F,
) -> Result<(), String>
where
    F: FnOnce(&glow::Context, &GlFullscreenProgram),
{
    {
        let mut context = state.context_state.runtime_state.borrow_mut();
        if context.binding.as_ref().map(|value| value.program) != Some(program.program) {
            // SAFETY: this linked program belongs to the current context.
            unsafe { state.gl.use_program(Some(program.program)) };
        }
        context.binding = Some(GlBoundShader {
            locations: None,
            program: program.program,
        });
    }
    bind_gl_render_target(state, destination);
    // SAFETY: input handles belong to this context and sampler locations belong to `program`.
    unsafe {
        for (index, input) in inputs.iter().enumerate() {
            state.gl.active_texture(glow::TEXTURE0 + index as u32);
            state.gl.bind_texture(glow::TEXTURE_2D, Some(*input));
            if let Some(Some(location)) = program.textures.get(index) {
                state.gl.uniform_1_i32(Some(location), index as i32);
            }
        }
        state.gl.active_texture(glow::TEXTURE0);
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_texture_realization = None;

    // SAFETY: fixed-function state is captured and restored around this owned quad draw.
    let saved = unsafe {
        (
            state.gl.is_enabled(glow::BLEND),
            state.gl.is_enabled(glow::CULL_FACE),
            state.gl.is_enabled(glow::DEPTH_TEST),
            state.gl.get_parameter_bool(glow::DEPTH_WRITEMASK),
        )
    };
    // SAFETY: state changes occur on the owning GL thread.
    unsafe {
        if !saved.0 {
            state.gl.enable(glow::BLEND);
        }
        if saved.1 {
            state.gl.disable(glow::CULL_FACE);
        }
        if saved.2 {
            state.gl.disable(glow::DEPTH_TEST);
        }
        if saved.3 {
            state.gl.depth_mask(false);
        }
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_blend_signature = None;
    apply_normal_gl_blend_mode(state);
    set_uniforms(&state.gl, program);
    draw_gl_fullscreen_quad(state, program)?;
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_blend_signature = None;
    apply_normal_gl_blend_mode(state);
    // SAFETY: restore the exact capability bits captured above.
    unsafe {
        if saved.3 {
            state.gl.depth_mask(true);
        }
        if saved.2 {
            state.gl.enable(glow::DEPTH_TEST);
        }
        if saved.1 {
            state.gl.enable(glow::CULL_FACE);
        }
        if !saved.0 {
            state.gl.disable(glow::BLEND);
        }
        for index in 0..inputs.len() {
            state.gl.active_texture(glow::TEXTURE0 + index as u32);
            state.gl.bind_texture(glow::TEXTURE_2D, None);
        }
        state.gl.active_texture(glow::TEXTURE0);
    }
    return Ok(());
}

fn draw_gl_fullscreen_quad(
    state: &mut GlRenderState,
    program: &GlFullscreenProgram,
) -> Result<(), String> {
    let (quad_vertex_array, quad_vertex_buffer, quad_index_buffer) = {
        let mut context = state.context_state.runtime_state.borrow_mut();
        let vertex_array = match context.quad_vertex_array {
            Some(vertex_array) => vertex_array,
            None => {
                // SAFETY: VAO allocation occurs on the current GL thread.
                let vertex_array = unsafe { state.gl.create_vertex_array() }
                    .map_err(|error| format!("drawGlFullscreenQuad: {error}"))?;
                context.quad_vertex_array = Some(vertex_array);
                vertex_array
            }
        };
        (
            vertex_array,
            context.quad_vertex_buffer.ok_or_else(|| {
                "drawGlFullscreenQuad: context vertex buffer is unavailable".to_string()
            })?,
            context.quad_index_buffer.ok_or_else(|| {
                "drawGlFullscreenQuad: context index buffer is unavailable".to_string()
            })?,
        )
    };
    let vertices = [
        -1.0_f32, -1.0, 0.0, 0.0, 1.0, -1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 0.0, 1.0,
    ];
    state.gl_runtime.borrow_mut().quad_vertex_data = vertices;
    let vertex_bytes = vertices
        .iter()
        .flat_map(|value| value.to_ne_bytes())
        .collect::<Vec<_>>();
    // SAFETY: the dedicated VAO isolates buffer and attribute mutations from caller VAOs.
    unsafe {
        state.gl.bind_vertex_array(Some(quad_vertex_array));
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(quad_vertex_buffer));
        state
            .gl
            .buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, &vertex_bytes);
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(quad_index_buffer));
        state.gl.enable_vertex_attrib_array(program.loc_position);
        state.gl.enable_vertex_attrib_array(program.loc_tex_coord);
        state
            .gl
            .vertex_attrib_pointer_f32(program.loc_position, 2, glow::FLOAT, false, 16, 0);
        state
            .gl
            .vertex_attrib_pointer_f32(program.loc_tex_coord, 2, glow::FLOAT, false, 16, 8);
        state
            .gl
            .draw_elements(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0);
        state.gl.bind_vertex_array(None);
    }
    state.gl_runtime.borrow_mut().stats.draw_calls += 1;
    return Ok(());
}

fn ensure_fill_program(state: &GlRenderState) -> Result<GlFillProgram, String> {
    if let Some(program) = state
        .context_state
        .runtime_state
        .borrow()
        .fill_program
        .clone()
    {
        return Ok(program);
    }
    let fullscreen = compile_gl_fullscreen_program(&state.gl, FILL_GL_FRAGMENT_SOURCE)?;
    // SAFETY: location belongs to the linked fill program.
    let loc_color = unsafe { state.gl.get_uniform_location(fullscreen.program, "u_color") };
    let program = GlFillProgram {
        program: fullscreen.program,
        fullscreen,
        loc_color,
    };
    state.context_state.runtime_state.borrow_mut().fill_program = Some(program.clone());
    return Ok(program);
}

// flight-lint: allow(conform-params) D17 fill requires the explicit owning generic render state in addition to its active pass
pub fn fill_gl_rect(
    state: &mut GlRenderState,
    pass: &GlRenderPass,
    color: u32,
    rectangle: Option<&Rectangle>,
) -> Result<(), String> {
    if pass.0.borrow().owner_id != flight_entity::get_entity_id(state) {
        return Err("fillGlRect: pass does not belong to render state".to_string());
    }
    let program = ensure_fill_program(state)?;
    {
        let mut context = state.context_state.runtime_state.borrow_mut();
        if context.binding.as_ref().map(|value| value.program) != Some(program.program) {
            // SAFETY: program belongs to the current context.
            unsafe { state.gl.use_program(Some(program.program)) };
        }
        context.binding = Some(GlBoundShader {
            locations: None,
            program: program.program,
        });
    }
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    // SAFETY: uniform belongs to the fill program just made current.
    unsafe {
        state
            .gl
            .uniform_4_f32(program.loc_color.as_ref(), r, g, b, a);
    }
    // SAFETY: capture and temporarily adjust fixed-function state for the fill draw.
    let (scissor_was_enabled, blend_enabled, depth_test_enabled) = unsafe {
        let scissor = state.gl.is_enabled(glow::SCISSOR_TEST);
        if let Some(rectangle) = rectangle {
            state.gl.enable(glow::SCISSOR_TEST);
            state.gl.scissor(
                rectangle.x as i32,
                rectangle.y as i32,
                rectangle.width as i32,
                rectangle.height as i32,
            );
        }
        (
            scissor,
            state.gl.is_enabled(glow::BLEND),
            state.gl.is_enabled(glow::DEPTH_TEST),
        )
    };
    // SAFETY: state is restored below.
    unsafe {
        if !blend_enabled {
            state.gl.enable(glow::BLEND);
        }
        if depth_test_enabled {
            state.gl.disable(glow::DEPTH_TEST);
        }
    }
    apply_normal_gl_blend_mode(state);
    draw_gl_fullscreen_quad(state, &program.fullscreen)?;
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_blend_signature = None;
    // SAFETY: restore capability state captured above.
    unsafe {
        if depth_test_enabled {
            state.gl.enable(glow::DEPTH_TEST);
        }
        if !blend_enabled {
            state.gl.disable(glow::BLEND);
        }
        if rectangle.is_some() && !scissor_was_enabled {
            state.gl.disable(glow::SCISSOR_TEST);
        }
    }
    return Ok(());
}
