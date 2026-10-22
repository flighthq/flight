// flight-lint: allow-file(contract-vocabulary) D17 targets expose native glow ownership, open render-target traits, and Result diagnostics

use std::rc::Rc;

use flight_entity::{EntityRuntimeSlot, get_entity_id};
use flight_geometry::{Matrix, create_matrix, multiply_matrix};
use flight_render::{
    RenderProxy2D, RenderTargetAxes, RenderTargetDepth, RenderTargetDescriptor, RenderTargetFormat,
    RenderTargetFormatPolicy, explain_render_target_axes, resolve_render_target_descriptor,
};
use flight_texture::RenderTargetColorSpace;
use glow::{HasContext, PixelUnpackData};

use crate::{
    GlDeleteQueue, GlRenderPass, GlRenderState, GlRenderTarget, GlScreenRenderTarget,
    GlTextureRealization, GlTextureRenderTarget, GlTextureRenderTargetStorage,
    RenderTargetExplanation, bind_gl_texture_realization, draw_gl_quad, set_gl_attributes,
    set_gl_base_uniforms, set_gl_matrix_from_transform, use_gl_program,
};

struct GlFormat {
    internal_format: u32,
    format: u32,
    data_type: u32,
}

// flight-lint: allow(conform-params) D17 native screen targets retain explicit dimensions because glow has no canvas owner
pub fn create_gl_screen_render_target(
    gl: Rc<glow::Context>,
    width: u32,
    height: u32,
) -> GlScreenRenderTarget {
    return GlScreenRenderTarget {
        runtime: EntityRuntimeSlot::default(),
        gl,
        width,
        height,
        color_space: RenderTargetColorSpace::Srgb,
    };
}

pub fn create_gl_texture_render_target(
    state: &GlRenderState,
    descriptor: &RenderTargetDescriptor,
    format_policy: Option<RenderTargetFormatPolicy>,
) -> Result<Option<GlTextureRenderTarget>, String> {
    let requested = resolve_render_target_descriptor(descriptor);
    let Some(effective) = resolve_effective_gl_render_target_axes(
        &state.gl,
        &requested,
        format_policy.unwrap_or(RenderTargetFormatPolicy::Preferred),
    ) else {
        return Ok(None);
    };
    // SAFETY: allocation occurs on the render state's owning GL thread.
    let framebuffer = unsafe { state.gl.create_framebuffer() }
        .map_err(|error| format!("createGlTextureRenderTarget: {error}"))?;
    let storage =
        match allocate_gl_texture_render_target_storage(state, effective.clone(), framebuffer) {
            Ok(storage) => storage,
            Err(error) => {
                // SAFETY: allocation failed before the framebuffer escaped this function.
                unsafe { state.gl.delete_framebuffer(framebuffer) };
                return Err(error);
            }
        };
    let target = initialize_gl_texture_render_target(
        Rc::clone(&state.gl),
        requested,
        storage,
        state
            .context_state
            .runtime_state
            .borrow()
            .delete_queue
            .clone(),
    )?;
    let current_framebuffer = state.gl_runtime.borrow().current_framebuffer;
    // SAFETY: restoring the tracked framebuffer is part of the allocation bracket.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, current_framebuffer);
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_texture_realization = None;
    return Ok(Some(target));
}

// flight-lint: allow(conform-params) D17 native target construction takes resolved ownership storage and its deferred deletion queue
pub fn initialize_gl_texture_render_target(
    gl: Rc<glow::Context>,
    requested: RenderTargetAxes,
    storage: GlTextureRenderTargetStorage,
    delete_queue: GlDeleteQueue,
) -> Result<GlTextureRenderTarget, String> {
    let Some(texture) = storage.textures.first().copied() else {
        return Err("initializeGlTextureRenderTarget: color attachment 0 is missing".to_string());
    };
    return Ok(GlTextureRenderTarget {
        runtime: EntityRuntimeSlot::default(),
        gl,
        requested_axes: requested,
        axes: storage.axes,
        framebuffer: storage.framebuffer,
        resolve_framebuffer: storage.resolve_framebuffer,
        textures: storage.textures,
        texture,
        depth_texture: storage.depth_texture,
        color_renderbuffers: storage.color_renderbuffers,
        depth_stencil_renderbuffer: storage.depth_stencil_renderbuffer,
        delete_queue,
        destroyed: false,
    });
}

fn allocate_gl_texture_render_target_storage(
    state: &GlRenderState,
    axes: RenderTargetAxes,
    framebuffer: glow::NativeFramebuffer,
) -> Result<GlTextureRenderTargetStorage, String> {
    let gl = &state.gl;
    let multisampled = axes.sample_count > 1;
    let resolve_framebuffer = if multisampled {
        // SAFETY: allocation occurs on the current GL thread.
        Some(
            unsafe { gl.create_framebuffer() }
                .map_err(|error| format!("allocateGlTextureRenderTargetStorage: {error}"))?,
        )
    } else {
        None
    };
    let texture_framebuffer = resolve_framebuffer.unwrap_or(framebuffer);
    let mut textures = Vec::with_capacity(axes.color_attachments as usize);
    let mut color_renderbuffers = Vec::new();
    let mut depth_texture = None;
    let mut depth_stencil_renderbuffer = None;
    let result = (|| {
        // SAFETY: all objects allocated in this bracket belong to this current context.
        unsafe {
            gl.bind_framebuffer(glow::FRAMEBUFFER, Some(texture_framebuffer));
            for (index, format) in axes.color_formats.iter().copied().enumerate() {
                let mapped = map_gl_format(format);
                let texture = gl
                    .create_texture()
                    .map_err(|error| format!("allocateGlTextureRenderTargetStorage: {error}"))?;
                textures.push(texture);
                gl.bind_texture(glow::TEXTURE_2D, Some(texture));
                gl.tex_image_2d(
                    glow::TEXTURE_2D,
                    0,
                    mapped.internal_format as i32,
                    axes.width as i32,
                    axes.height as i32,
                    0,
                    mapped.format,
                    mapped.data_type,
                    PixelUnpackData::Slice(None),
                );
                let filter = if state.render.allow_smoothing {
                    glow::LINEAR
                } else {
                    glow::NEAREST
                };
                gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, filter as i32);
                gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, filter as i32);
                gl.tex_parameter_i32(
                    glow::TEXTURE_2D,
                    glow::TEXTURE_WRAP_S,
                    glow::CLAMP_TO_EDGE as i32,
                );
                gl.tex_parameter_i32(
                    glow::TEXTURE_2D,
                    glow::TEXTURE_WRAP_T,
                    glow::CLAMP_TO_EDGE as i32,
                );
                gl.framebuffer_texture_2d(
                    glow::FRAMEBUFFER,
                    glow::COLOR_ATTACHMENT0 + index as u32,
                    glow::TEXTURE_2D,
                    Some(texture),
                    0,
                );
            }
            if axes.color_attachments > 1 {
                gl.draw_buffers(&build_draw_buffers(axes.color_attachments as usize));
            }
            if multisampled {
                gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
                for (index, format) in axes.color_formats.iter().copied().enumerate() {
                    let renderbuffer = gl.create_renderbuffer().map_err(|error| {
                        format!("allocateGlTextureRenderTargetStorage: {error}")
                    })?;
                    color_renderbuffers.push(renderbuffer);
                    gl.bind_renderbuffer(glow::RENDERBUFFER, Some(renderbuffer));
                    gl.renderbuffer_storage_multisample(
                        glow::RENDERBUFFER,
                        axes.sample_count as i32,
                        map_gl_format(format).internal_format,
                        axes.width as i32,
                        axes.height as i32,
                    );
                    gl.framebuffer_renderbuffer(
                        glow::FRAMEBUFFER,
                        glow::COLOR_ATTACHMENT0 + index as u32,
                        glow::RENDERBUFFER,
                        Some(renderbuffer),
                    );
                }
                if axes.color_attachments > 1 {
                    gl.draw_buffers(&build_draw_buffers(axes.color_attachments as usize));
                }
            }
            if axes.depth != RenderTargetDepth::None {
                if axes.depth == RenderTargetDepth::DepthStencilSampled {
                    let texture = gl.create_texture().map_err(|error| {
                        format!("allocateGlTextureRenderTargetStorage: {error}")
                    })?;
                    depth_texture = Some(texture);
                    gl.bind_texture(glow::TEXTURE_2D, Some(texture));
                    gl.tex_image_2d(
                        glow::TEXTURE_2D,
                        0,
                        glow::DEPTH24_STENCIL8 as i32,
                        axes.width as i32,
                        axes.height as i32,
                        0,
                        glow::DEPTH_STENCIL,
                        glow::UNSIGNED_INT_24_8,
                        PixelUnpackData::Slice(None),
                    );
                    gl.tex_parameter_i32(
                        glow::TEXTURE_2D,
                        glow::TEXTURE_MIN_FILTER,
                        glow::NEAREST as i32,
                    );
                    gl.tex_parameter_i32(
                        glow::TEXTURE_2D,
                        glow::TEXTURE_MAG_FILTER,
                        glow::NEAREST as i32,
                    );
                    gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
                    gl.framebuffer_texture_2d(
                        glow::FRAMEBUFFER,
                        glow::DEPTH_STENCIL_ATTACHMENT,
                        glow::TEXTURE_2D,
                        Some(texture),
                        0,
                    );
                } else {
                    let renderbuffer = gl.create_renderbuffer().map_err(|error| {
                        format!("allocateGlTextureRenderTargetStorage: {error}")
                    })?;
                    depth_stencil_renderbuffer = Some(renderbuffer);
                    gl.bind_renderbuffer(glow::RENDERBUFFER, Some(renderbuffer));
                    if multisampled {
                        gl.renderbuffer_storage_multisample(
                            glow::RENDERBUFFER,
                            axes.sample_count as i32,
                            glow::DEPTH24_STENCIL8,
                            axes.width as i32,
                            axes.height as i32,
                        );
                    } else {
                        gl.renderbuffer_storage(
                            glow::RENDERBUFFER,
                            glow::DEPTH24_STENCIL8,
                            axes.width as i32,
                            axes.height as i32,
                        );
                    }
                    gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
                    gl.framebuffer_renderbuffer(
                        glow::FRAMEBUFFER,
                        glow::DEPTH_STENCIL_ATTACHMENT,
                        glow::RENDERBUFFER,
                        Some(renderbuffer),
                    );
                }
            }
            gl.bind_renderbuffer(glow::RENDERBUFFER, None);
            gl.bind_texture(glow::TEXTURE_2D, None);
        }
        return Ok::<(), String>(());
    })();
    if let Err(error) = result {
        // SAFETY: partial allocations have not escaped and are deleted exactly once here.
        unsafe {
            for texture in textures {
                gl.delete_texture(texture);
            }
            for renderbuffer in color_renderbuffers {
                gl.delete_renderbuffer(renderbuffer);
            }
            if let Some(texture) = depth_texture {
                gl.delete_texture(texture);
            }
            if let Some(renderbuffer) = depth_stencil_renderbuffer {
                gl.delete_renderbuffer(renderbuffer);
            }
            if let Some(framebuffer) = resolve_framebuffer {
                gl.delete_framebuffer(framebuffer);
            }
        }
        return Err(error);
    }
    return Ok(GlTextureRenderTargetStorage {
        axes,
        framebuffer,
        resolve_framebuffer,
        textures,
        depth_texture,
        color_renderbuffers,
        depth_stencil_renderbuffer,
    });
}

fn build_draw_buffers(count: usize) -> Vec<u32> {
    return (0..count)
        .map(|index| glow::COLOR_ATTACHMENT0 + index as u32)
        .collect();
}

fn build_single_draw_buffer(index: u32, count: usize) -> Vec<u32> {
    return (0..count)
        .map(|candidate| {
            if candidate as u32 == index {
                glow::COLOR_ATTACHMENT0 + candidate as u32
            } else {
                glow::NONE
            }
        })
        .collect();
}

// flight-lint: allow(conform-params) D17 generic target dispatch requires the explicit destination target
pub fn declare_gl_render_target_color_space(
    state: &GlRenderState,
    target: &mut dyn GlRenderTarget,
    color_space: RenderTargetColorSpace,
) -> bool {
    let target_id = get_entity_id(target);
    if state
        .gl_runtime
        .borrow()
        .current_target
        .is_none_or(|current| current.id != target_id)
    {
        return false;
    }
    target.set_color_space(color_space);
    return true;
}

fn delete_gl_texture_render_target_storage(target: &mut GlTextureRenderTarget) {
    // SAFETY: resize is explicit on the owning GL thread; the primary framebuffer is retained.
    unsafe {
        for texture in target.textures.drain(..) {
            target.gl.delete_texture(texture);
        }
        for renderbuffer in target.color_renderbuffers.drain(..) {
            target.gl.delete_renderbuffer(renderbuffer);
        }
        if let Some(texture) = target.depth_texture.take() {
            target.gl.delete_texture(texture);
        }
        if let Some(renderbuffer) = target.depth_stencil_renderbuffer.take() {
            target.gl.delete_renderbuffer(renderbuffer);
        }
        if let Some(framebuffer) = target.resolve_framebuffer.take() {
            target.gl.delete_framebuffer(framebuffer);
        }
    }
}

pub fn destroy_gl_texture_render_target(target: &mut GlTextureRenderTarget) {
    if target.destroyed {
        return;
    }
    // SAFETY: explicit destruction runs on the target context's owning GL thread.
    unsafe {
        target.gl.delete_framebuffer(target.framebuffer);
        if let Some(framebuffer) = target.resolve_framebuffer {
            target.gl.delete_framebuffer(framebuffer);
        }
        for texture in &target.textures {
            target.gl.delete_texture(*texture);
        }
        for renderbuffer in &target.color_renderbuffers {
            target.gl.delete_renderbuffer(*renderbuffer);
        }
        if let Some(texture) = target.depth_texture {
            target.gl.delete_texture(texture);
        }
        if let Some(renderbuffer) = target.depth_stencil_renderbuffer {
            target.gl.delete_renderbuffer(renderbuffer);
        }
    }
    target.destroyed = true;
}

// flight-lint: allow(conform-params) D17 the native pass does not retain an unsafe state pointer
pub fn draw_gl_texture_render_target_result(
    state: &mut GlRenderState,
    pass: &GlRenderPass,
    render_proxy: &RenderProxy2D<GlRenderState>,
    target: &GlTextureRenderTarget,
    transform: &Matrix,
) -> Result<(), String> {
    if target.axes.width == 0 || target.axes.height == 0 {
        return Ok(());
    }
    if pass.0.borrow().owner_id != get_entity_id(state) {
        return Err("drawGlTextureRenderTargetResult: pass belongs to another state".to_string());
    }
    use_gl_program(state, None)?;
    if let Some(apply_blend_mode) = state.apply_blend_mode {
        apply_blend_mode(state, render_proxy.blend_mode.as_ref());
    }
    let locations = state
        .context_state
        .runtime_state
        .borrow()
        .binding
        .as_ref()
        .and_then(|binding| binding.locations.clone())
        .ok_or_else(|| {
            "drawGlTextureRenderTargetResult: shader locations unavailable".to_string()
        })?;
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture: target.texture,
        }),
    );
    let mut quad_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    multiply_matrix(&mut quad_transform, &render_proxy.transform_2d, transform);
    set_gl_attributes(&state.gl, &locations);
    let viewport = state.gl_runtime.borrow().render_target_viewport;
    let (viewport_width, viewport_height) = viewport.map_or_else(
        || {
            let mut values = [0; 4];
            // SAFETY: viewport query occurs on the pass's owning render thread.
            unsafe {
                state
                    .gl
                    .get_parameter_i32_slice(glow::VIEWPORT, &mut values)
            };
            (values[2].max(1) as f32, values[3].max(1) as f32)
        },
        |viewport| (viewport.width.max(1) as f32, viewport.height.max(1) as f32),
    );
    set_gl_matrix_from_transform(
        &state.gl,
        &locations,
        &mut state.gl_runtime.borrow_mut().matrix_array,
        &quad_transform,
        viewport_width,
        viewport_height,
    );
    set_gl_base_uniforms(&state.gl, &locations, &render_proxy.proxy);
    return draw_gl_quad(
        state,
        0.0,
        0.0,
        target.axes.width as f32,
        target.axes.height as f32,
        0.0,
        1.0,
        1.0,
        0.0,
    );
}

pub fn explain_gl_texture_render_target(target: &GlTextureRenderTarget) -> RenderTargetExplanation {
    let requested = target.requested_axes.clone();
    let effective = target.axes.clone();
    return RenderTargetExplanation {
        differences: explain_render_target_axes(&requested, &effective),
        effective,
        requested,
    };
}

fn is_float_render_target_format(format: RenderTargetFormat) -> bool {
    return matches!(
        format,
        RenderTargetFormat::Rgba16F | RenderTargetFormat::Rgba32F
    );
}

pub fn is_gl_render_target_format_supported(
    state: &GlRenderState,
    format: RenderTargetFormat,
) -> bool {
    return is_gl_render_target_format_supported_by_context(&state.gl, format);
}

fn is_gl_render_target_format_supported_by_context(
    gl: &glow::Context,
    format: RenderTargetFormat,
) -> bool {
    return !is_float_render_target_format(format)
        || gl.supported_extensions().contains("EXT_color_buffer_float");
}

fn map_gl_format(format: RenderTargetFormat) -> GlFormat {
    return match format {
        RenderTargetFormat::Rgba16F => GlFormat {
            internal_format: glow::RGBA16F,
            format: glow::RGBA,
            data_type: glow::HALF_FLOAT,
        },
        RenderTargetFormat::Rgba32F => GlFormat {
            internal_format: glow::RGBA32F,
            format: glow::RGBA,
            data_type: glow::FLOAT,
        },
        RenderTargetFormat::Rgba8 => GlFormat {
            internal_format: glow::RGBA8,
            format: glow::RGBA,
            data_type: glow::UNSIGNED_BYTE,
        },
    };
}

pub fn resize_gl_texture_render_target(
    state: &GlRenderState,
    target: &mut GlTextureRenderTarget,
    width: f32,
    height: f32,
) -> Result<(), String> {
    let descriptor = RenderTargetDescriptor {
        width,
        height,
        format: Some(target.requested_axes.format),
        color_attachments: Some(target.requested_axes.color_attachments as f32),
        color_formats: Some(target.requested_axes.color_formats.clone()),
        sample_count: Some(target.requested_axes.sample_count as f32),
        depth: Some(target.requested_axes.depth),
        color_space: Some(target.requested_axes.color_space),
    };
    let requested = resolve_render_target_descriptor(&descriptor);
    let effective = resolve_effective_gl_render_target_axes(
        &state.gl,
        &requested,
        RenderTargetFormatPolicy::Preferred,
    )
    .unwrap();
    if effective.width == target.axes.width && effective.height == target.axes.height {
        return Ok(());
    }
    delete_gl_texture_render_target_storage(target);
    target.requested_axes = requested;
    target.axes = effective.clone();
    let storage = allocate_gl_texture_render_target_storage(state, effective, target.framebuffer)?;
    target.resolve_framebuffer = storage.resolve_framebuffer;
    target.textures = storage.textures;
    target.texture = target.textures[0];
    target.depth_texture = storage.depth_texture;
    target.color_renderbuffers = storage.color_renderbuffers;
    target.depth_stencil_renderbuffer = storage.depth_stencil_renderbuffer;
    let current_framebuffer = state.gl_runtime.borrow().current_framebuffer;
    // SAFETY: restoring the tracked framebuffer closes the resize allocation bracket.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, current_framebuffer);
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_texture_realization = None;
    return Ok(());
}

fn resolve_effective_gl_render_target_axes(
    gl: &glow::Context,
    requested: &RenderTargetAxes,
    format_policy: RenderTargetFormatPolicy,
) -> Option<RenderTargetAxes> {
    // SAFETY: capability queries occur on the current context thread.
    let max_samples = if requested.sample_count > 1 {
        unsafe { gl.get_parameter_i32(glow::MAX_SAMPLES) }.max(1) as u32
    } else {
        1
    };
    let sample_count = requested.sample_count.min(max_samples);
    let mut color_formats = Vec::with_capacity(requested.color_formats.len());
    for format in &requested.color_formats {
        color_formats.push(resolve_renderable_format(gl, *format, format_policy)?);
    }
    let depth = if requested.depth == RenderTargetDepth::DepthStencilSampled && sample_count > 1 {
        RenderTargetDepth::DepthStencil
    } else {
        requested.depth
    };
    return Some(RenderTargetAxes {
        width: requested.width,
        height: requested.height,
        format: color_formats[0],
        color_attachments: requested.color_attachments,
        color_formats,
        sample_count,
        depth,
        color_space: requested.color_space,
    });
}

pub fn resolve_gl_render_target_axes(
    state: &GlRenderState,
    descriptor: &RenderTargetDescriptor,
    format_policy: Option<RenderTargetFormatPolicy>,
) -> Option<RenderTargetAxes> {
    return resolve_effective_gl_render_target_axes(
        &state.gl,
        &resolve_render_target_descriptor(descriptor),
        format_policy.unwrap_or(RenderTargetFormatPolicy::Preferred),
    );
}

pub fn resolve_gl_texture_render_target(state: &GlRenderState, target: &GlTextureRenderTarget) {
    if target.axes.sample_count <= 1 || target.resolve_framebuffer.is_none() {
        return;
    }
    let current_framebuffer = state.gl_runtime.borrow().current_framebuffer;
    let scissor = state.gl_runtime.borrow().current_scissor_rect;
    // SAFETY: every handle belongs to the render state's current context.
    unsafe {
        if scissor.is_some() {
            state.gl.disable(glow::SCISSOR_TEST);
        }
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, Some(target.framebuffer));
        state
            .gl
            .bind_framebuffer(glow::DRAW_FRAMEBUFFER, target.resolve_framebuffer);
        for index in 0..target.textures.len() as u32 {
            state.gl.read_buffer(glow::COLOR_ATTACHMENT0 + index);
            let buffers = build_single_draw_buffer(index, target.textures.len());
            state.gl.draw_buffers(&buffers);
            state.gl.blit_framebuffer(
                0,
                0,
                target.axes.width as i32,
                target.axes.height as i32,
                0,
                0,
                target.axes.width as i32,
                target.axes.height as i32,
                glow::COLOR_BUFFER_BIT,
                glow::NEAREST,
            );
        }
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, current_framebuffer);
        state
            .gl
            .bind_framebuffer(glow::DRAW_FRAMEBUFFER, current_framebuffer);
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

// flight-lint: allow(conform-extra) Native format negotiation is exposed for deterministic capability-policy testing
pub fn resolve_renderable_format(
    gl: &glow::Context,
    format: RenderTargetFormat,
    format_policy: RenderTargetFormatPolicy,
) -> Option<RenderTargetFormat> {
    if is_gl_render_target_format_supported_by_context(gl, format) {
        return Some(format);
    }
    return (format_policy == RenderTargetFormatPolicy::Preferred)
        .then_some(RenderTargetFormat::Rgba8);
}
