// flight-lint: allow-file(contract-vocabulary) D17 quad-batch writer contracts expose glow native handles and thread-bound render-gl state

use flight_entity::{Ref, throw_error};
use flight_geometry::Matrix;
use flight_materials::{BlendMode, Material2D, MaterialData};
use flight_render_gl::{
    GlColorAdjustmentData, GlQuadBatchResources, GlQuadBatchShader, GlQuadMaterialRenderer,
    GlRenderState, GlTextureRealization, apply_gl_sampler_state, bind_gl_texture_realization,
    create_gl_program, get_gl_color_adjustment_material_feature_guard,
};
use flight_texture::Sampler;
use glow::{HasContext, NativeProgram, NativeTexture, NativeUniformLocation};

use crate::types::resolve_gl_color_adjustment_material_feature;

// Base per-instance layout (13 floats = 52 bytes, world-space axes + affine UVs + alpha):
// [0-1]  axisUX/Y     — world-space horizontal quad axis, already multiplied by width
// [2-3]  axisVX/Y     — world-space vertical quad axis, already multiplied by height
// [4-5]  tx, ty       — world-space translation
// [6-7]  uvOrigin     — UV at the drawn top-left corner
// [8-9]  uvAxisU      — UV delta across the drawn horizontal axis
// [10-11] uvAxisV     — UV delta across the drawn vertical axis
// [12]   alpha        — per-instance alpha
// Attribute locations 0 (a_corner) and 1-6 are a fixed contract; material shaders extend from
// location 7. The base buffer and a material's own per-instance buffer share only the instance
// count and divisor convention.
pub const QUAD_BATCH_INSTANCE_FLOATS: usize = 13;
const QUAD_BATCH_INSTANCE_STRIDE: i32 = (QUAD_BATCH_INSTANCE_FLOATS * 4) as i32;

// Highest per-instance attribute location any quad-batch writer material or the opt-in
// color-adjustment fold (a_colorScale/a_colorBias at 7/8) may use. Divisors for locations 1..this are
// reset after each flush so later non-instanced draws are not corrupted.
const MAX_INSTANCE_ATTRIB_LOCATION: u32 = 8;

pub const QUAD_BATCH_VS: &str = "#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec4 a_uvOriginAxisU;
layout(location = 5) in vec2 a_uvAxisV;
layout(location = 6) in float a_alpha;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;

void main() {
  vec2 worldPos = vec2(
    a_matAB.x * a_corner.x + a_matCD.x * a_corner.y + a_matTXTY.x,
    a_matAB.y * a_corner.x + a_matCD.y * a_corner.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = a_uvOriginAxisU.xy + a_uvOriginAxisU.zw * a_corner.x + a_uvAxisV * a_corner.y;
  v_alpha = a_alpha;
}";

const QUAD_BATCH_FS: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
}";

// Binds the corner buffer (location `loc_corner`, divisor 0) and the base instance attributes
// (locations 1-6, divisor 1) from the active quad-batch writer instance buffer. Shared by every
// quad-batch writer material renderer regardless of its program, since the base layout is fixed.
pub fn bind_gl_quad_batch_base_attributes(state: &GlRenderState, loc_corner: u32) {
    let (corner_buffer, instance_buffer) = {
        let context = state.context_state.runtime_state.borrow();
        let resources = context.quad_batch_resources.as_ref().unwrap_or_else(|| {
            throw_error("bindGlQuadBatchBaseAttributes: no quad-batch resources")
        });
        (resources.corner_buffer, resources.writer_instance_buffer)
    };
    let gl = &state.gl;
    let stride = QUAD_BATCH_INSTANCE_STRIDE;
    // SAFETY: the buffers belong to this context and binding occurs on the owning GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(corner_buffer));
        gl.enable_vertex_attrib_array(loc_corner);
        gl.vertex_attrib_pointer_f32(loc_corner, 2, glow::FLOAT, false, 8, 0);
        gl.vertex_attrib_divisor(loc_corner, 0);

        gl.bind_buffer(glow::ARRAY_BUFFER, instance_buffer);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_f32(1, 2, glow::FLOAT, false, stride, 0);
        gl.vertex_attrib_divisor(1, 1);
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_f32(2, 2, glow::FLOAT, false, stride, 8);
        gl.vertex_attrib_divisor(2, 1);
        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_f32(3, 2, glow::FLOAT, false, stride, 16);
        gl.vertex_attrib_divisor(3, 1);
        gl.enable_vertex_attrib_array(4);
        gl.vertex_attrib_pointer_f32(4, 4, glow::FLOAT, false, stride, 24);
        gl.vertex_attrib_divisor(4, 1);
        gl.enable_vertex_attrib_array(5);
        gl.vertex_attrib_pointer_f32(5, 2, glow::FLOAT, false, stride, 40);
        gl.vertex_attrib_divisor(5, 1);
        gl.enable_vertex_attrib_array(6);
        gl.vertex_attrib_pointer_f32(6, 1, glow::FLOAT, false, stride, 48);
        gl.vertex_attrib_divisor(6, 1);
    }
}

fn compile_quad_batch_writer_shader(gl: &glow::Context) -> GlQuadBatchShader {
    let program = create_gl_program(gl, QUAD_BATCH_VS, QUAD_BATCH_FS, Some("Sprite-batch"))
        .unwrap_or_else(|error| throw_error(&error));
    // SAFETY: uniform queries occur on the GL thread for a program created by this context.
    unsafe {
        return GlQuadBatchShader {
            program,
            loc_corner: 0,
            loc_mat_ab: 1,
            loc_mat_cd: 2,
            loc_mat_txty: 3,
            loc_uv_origin_axis_u: 4,
            loc_uv_axis_v: 5,
            loc_alpha: 6,
            loc_world_matrix: gl.get_uniform_location(program, "u_world"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
            loc_straight_texture_alpha: gl.get_uniform_location(program, "u_straightTextureAlpha"),
        };
    }
}

pub fn ensure_gl_quad_batch_shader(state: &GlRenderState) -> GlQuadBatchShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .quad_batch_resources
    {
        return resources.shader.clone();
    }

    let gl = &state.gl;
    let shader = compile_quad_batch_writer_shader(gl);

    let corner_data: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    // SAFETY: allocation and upload occur on the owning GL thread; the slice outlives the call.
    let corner_buffer = unsafe {
        let buffer = gl
            .create_buffer()
            .unwrap_or_else(|error| throw_error(&format!("ensureGlQuadBatchShader: {error}")));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            gl_f32_bytes(&corner_data),
            glow::STATIC_DRAW,
        );
        buffer
    };
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .quad_batch_resources = Some(GlQuadBatchResources {
        corner_buffer,
        shader: shader.clone(),
        writer_color_scale_bias_buffer: None,
        writer_instance_buffer: None,
        writer_material_buffer: None,
    });

    return shader;
}

pub fn flush_gl_quad_batch_writer(state: &mut GlRenderState) {
    let (
        count,
        texture,
        sampler,
        straight_alpha,
        blend_mode,
        material,
        renderer,
        floats,
        smoothing,
    ) = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let count = runtime.quad_batch_writer_count;
        if count == 0 {
            return;
        }
        let values = (
            count,
            runtime.quad_batch_writer_texture,
            runtime.quad_batch_writer_sampler.take(),
            runtime.quad_batch_writer_straight_alpha,
            runtime.quad_batch_writer_blend_mode.take(),
            runtime.quad_batch_writer_material.take(),
            runtime.quad_batch_writer_material_renderer,
            runtime.quad_batch_writer_material_floats,
            runtime.quad_batch_writer_smoothing,
        );
        runtime.quad_batch_writer_count = 0;
        runtime.quad_batch_writer_texture = None;
        runtime.quad_batch_writer_straight_alpha = false;
        runtime.quad_batch_writer_smoothing = None;
        runtime.quad_batch_writer_material_renderer = None;
        runtime.quad_batch_writer_material_floats = 0;
        values
    };
    let texture = texture.unwrap_or_else(|| {
        throw_error("flushGlQuadBatchWriter: batched instances have no texture")
    });
    let renderer = renderer.unwrap_or_else(|| {
        throw_error("flushGlQuadBatchWriter: batched instances have no material renderer")
    });

    let gl = std::rc::Rc::clone(&state.gl);

    if state
        .context_state
        .runtime_state
        .borrow()
        .quad_batch_resources
        .is_none()
    {
        ensure_gl_quad_batch_shader(state);
    }
    {
        let runtime = state.gl_runtime.borrow();
        let mut context = state.context_state.runtime_state.borrow_mut();
        let resources = context.quad_batch_resources.as_mut().unwrap();
        // SAFETY: the instance buffer belongs to this context; uploads occur on the GL thread.
        unsafe {
            match resources.writer_instance_buffer {
                None => {
                    let buffer = gl.create_buffer().unwrap_or_else(|error| {
                        throw_error(&format!("flushGlQuadBatchWriter: {error}"))
                    });
                    resources.writer_instance_buffer = Some(buffer);
                    gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
                    gl.buffer_data_size(
                        glow::ARRAY_BUFFER,
                        (runtime.quad_batch_writer_instance_data.len() * 4) as i32,
                        glow::DYNAMIC_DRAW,
                    );
                }
                Some(buffer) => gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer)),
            }
            gl.buffer_sub_data_u8_slice(
                glow::ARRAY_BUFFER,
                0,
                gl_f32_bytes(
                    &runtime.quad_batch_writer_instance_data[..count * QUAD_BATCH_INSTANCE_FLOATS],
                ),
            );
        }
    }

    if let Some(apply_blend_mode) = state.apply_blend_mode {
        apply_blend_mode(state, blend_mode.as_ref());
    }
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha,
            texture,
        }),
    );
    apply_gl_sampler_state(state, texture, sampler.as_ref(), smoothing);

    // The color-adjustment fold is opt-in (register_gl_color_adjustment_material_feature): when
    // installed it selects and binds its program for a tinted batch, returning true; when absent, or
    // for an untinted batch, the lean material path runs.
    let ct_handled = match resolve_gl_color_adjustment_material_feature(state) {
        Some(feature) => (feature.flush)(state, count),
        None => false,
    };
    if !ct_handled {
        if floats > 0 {
            let runtime = state.gl_runtime.borrow();
            let mut context = state.context_state.runtime_state.borrow_mut();
            let resources = context.quad_batch_resources.as_mut().unwrap();
            // SAFETY: the material buffer belongs to this context; uploads occur on the GL thread.
            unsafe {
                match resources.writer_material_buffer {
                    None => {
                        let buffer = gl.create_buffer().unwrap_or_else(|error| {
                            throw_error(&format!("flushGlQuadBatchWriter: {error}"))
                        });
                        resources.writer_material_buffer = Some(buffer);
                        gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
                        gl.buffer_data_size(
                            glow::ARRAY_BUFFER,
                            (runtime.quad_batch_writer_material_data.len() * 4) as i32,
                            glow::DYNAMIC_DRAW,
                        );
                    }
                    Some(buffer) => gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer)),
                }
                gl.buffer_sub_data_u8_slice(
                    glow::ARRAY_BUFFER,
                    0,
                    gl_f32_bytes(&runtime.quad_batch_writer_material_data[..count * floats]),
                );
            }
        }
        // Resolved renderer owns program selection, uniforms, and all attribute setup.
        let material_guard = material.as_ref().map(|value| value.read().unwrap());
        let material_ref: Option<&dyn Material2D> = material_guard.as_deref();
        renderer.bind(state, material_ref);
    }

    let index_buffer = state.context_state.runtime_state.borrow().quad_index_buffer;
    // SAFETY: the shared quad index buffer belongs to this context; drawing occurs on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, index_buffer);
        gl.draw_elements_instanced(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0, count as i32);
        for location in 1..=MAX_INSTANCE_ATTRIB_LOCATION {
            gl.vertex_attrib_divisor(location, 0);
        }
    }
}

/// The effective viewport size (TS `renderTargetViewport ?? gl.drawingBuffer*`). Native GL exposes no
/// drawing-buffer size, so the fallback reads the live viewport, as render-gl's matrix helper does.
pub(crate) fn get_gl_viewport_size(state: &GlRenderState) -> (f32, f32) {
    if let Some(viewport) = state.gl_runtime.borrow().render_target_viewport {
        return (viewport.width as f32, viewport.height as f32);
    }
    let mut values = [0; 4];
    // SAFETY: viewport query occurs on the owning GL thread.
    unsafe {
        state
            .gl
            .get_parameter_i32_slice(glow::VIEWPORT, &mut values)
    };
    return (values[2] as f32, values[3] as f32);
}

/// Reinterprets an `f32` slice as its native-endian bytes for a GL upload (TS passes the typed array).
pub(crate) fn gl_f32_bytes(values: &[f32]) -> &[u8] {
    return bytemuck::cast_slice(values);
}

/// Reinterprets a `u16` slice as its native-endian bytes for a GL upload.
pub(crate) fn gl_u16_bytes(values: &[u16]) -> &[u8] {
    return bytemuck::cast_slice(values);
}

/// Reinterprets a `u32` slice as its native-endian bytes for a GL upload.
pub(crate) fn gl_u32_bytes(values: &[u32]) -> &[u8] {
    return bytemuck::cast_slice(values);
}

// Writes one instance's per-instance material floats into the active material buffer at the given
// instance index, converting the supplied per-instance material data. No-op for uniform-only
// materials (floats == 0). Color transform is folded separately by
// record_gl_quad_batch_color_scale_bias — it is not a material.
pub fn pack_gl_quad_batch_material_instance(
    state: &mut GlRenderState,
    material_data: Option<&dyn MaterialData>,
    instance_index: usize,
) {
    let (renderer, offset, mut data) = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let Some(renderer) = runtime.quad_batch_writer_material_renderer else {
            return;
        };
        let offset = instance_index * runtime.quad_batch_writer_material_floats;
        (
            renderer,
            offset,
            std::mem::take(&mut runtime.quad_batch_writer_material_data),
        )
    };
    renderer.pack_instance(state, material_data, &mut data, offset);
    state
        .gl_runtime
        .borrow_mut()
        .quad_batch_writer_material_data = data;
}

// Ensures the quad-batch writer can accept up to `max_instances` more instances for the given
// texture, blend mode, material, and smoothing. Flushes the current batch when any of them changes
// (material is compared by identity) or capacity is exceeded. Returns the index of the instance the
// caller writes first, which is the ONLY valid source for that index: this may flush, and a flush
// resets quad_batch_writer_count to 0.
pub fn prepare_gl_quad_batch_write(
    state: &mut GlRenderState,
    texture: NativeTexture,
    straight_alpha: bool,
    sampler: Option<&Sampler>,
    blend_mode: Option<&BlendMode>,
    material: Option<&Ref<dyn Material2D>>,
    material_renderer: &'static dyn GlQuadMaterialRenderer,
    max_instances: usize,
    smoothing: Option<bool>,
) -> usize {
    let changed = {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.flush_pending_draws = Some(flush_gl_quad_batch_writer);
        let same_material = match (material, &runtime.quad_batch_writer_material) {
            (None, None) => true,
            (Some(a), Some(b)) => std::sync::Arc::ptr_eq(a, b),
            _ => false,
        };
        Some(texture) != runtime.quad_batch_writer_texture
            || straight_alpha != runtime.quad_batch_writer_straight_alpha
            || sampler != runtime.quad_batch_writer_sampler.as_ref()
            || blend_mode != runtime.quad_batch_writer_blend_mode.as_ref()
            || !same_material
            || smoothing != runtime.quad_batch_writer_smoothing
    };
    if changed {
        flush_gl_quad_batch_writer(state);
    }
    let floats = material_renderer.instance_float_count();
    let (resize_instance, resize_material, count) = {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.quad_batch_writer_texture = Some(texture);
        if runtime.quad_batch_writer_sampler.as_ref() != sampler {
            runtime.quad_batch_writer_sampler = sampler.cloned();
        }
        runtime.quad_batch_writer_straight_alpha = straight_alpha;
        runtime.quad_batch_writer_smoothing = smoothing;
        if runtime.quad_batch_writer_blend_mode.as_ref() != blend_mode {
            runtime.quad_batch_writer_blend_mode = blend_mode.cloned();
        }
        runtime.quad_batch_writer_material = material.cloned();
        runtime.quad_batch_writer_material_renderer = Some(material_renderer);
        runtime.quad_batch_writer_material_floats = floats;

        let mut resize_instance = None;
        let needed = (runtime.quad_batch_writer_count + max_instances) * QUAD_BATCH_INSTANCE_FLOATS;
        if needed > runtime.quad_batch_writer_instance_data.len() {
            let new_size = needed.max(runtime.quad_batch_writer_instance_data.len() * 2);
            runtime.quad_batch_writer_instance_data = vec![0.0; new_size];
            resize_instance = Some(new_size);
        }

        let mut resize_material = None;
        if floats > 0 {
            let material_needed = (runtime.quad_batch_writer_count + max_instances) * floats;
            if material_needed > runtime.quad_batch_writer_material_data.len() {
                let new_size =
                    material_needed.max(runtime.quad_batch_writer_material_data.len() * 2);
                runtime.quad_batch_writer_material_data = vec![0.0; new_size];
                resize_material = Some(new_size);
            }
        }
        (
            resize_instance,
            resize_material,
            runtime.quad_batch_writer_count,
        )
    };

    let (instance_buffer, material_buffer) = {
        let context = state.context_state.runtime_state.borrow();
        match &context.quad_batch_resources {
            Some(resources) => (
                resources.writer_instance_buffer,
                resources.writer_material_buffer,
            ),
            None => (None, None),
        }
    };
    // SAFETY: the existing writer buffers belong to this context; reallocation occurs on the GL thread.
    unsafe {
        if let (Some(new_size), Some(buffer)) = (resize_instance, instance_buffer) {
            state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
            state.gl.buffer_data_size(
                glow::ARRAY_BUFFER,
                (new_size * 4) as i32,
                glow::DYNAMIC_DRAW,
            );
        }
        if let (Some(new_size), Some(buffer)) = (resize_material, material_buffer) {
            state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
            state.gl.buffer_data_size(
                glow::ARRAY_BUFFER,
                (new_size * 4) as i32,
                glow::DYNAMIC_DRAW,
            );
        }
    }

    return count;
}

// Folds instance `instance_index`'s effective color adjustment into the active batch through the
// opt-in color-adjustment fold, without ever splitting the batch. When the capability was not
// enabled the fold slot is empty and the tint is skipped; an installed guard reports the miss.
pub fn record_gl_quad_batch_color_scale_bias(
    state: &mut GlRenderState,
    color_scale_bias: Option<&GlColorAdjustmentData>,
    instance_index: usize,
) {
    if let Some(feature) = resolve_gl_color_adjustment_material_feature(state) {
        (feature.record)(
            &mut state.gl_runtime.borrow_mut(),
            color_scale_bias,
            instance_index,
        );
        return;
    }
    if let Some(color_scale_bias) = color_scale_bias
        && let Some(guard) = get_gl_color_adjustment_material_feature_guard(state)
    {
        guard(state, color_scale_bias);
    }
}

pub fn set_gl_quad_batch_world_and_texture(
    state: &GlRenderState,
    loc_world_matrix: Option<&NativeUniformLocation>,
    loc_texture: Option<&NativeUniformLocation>,
    loc_straight_texture_alpha: Option<&NativeUniformLocation>,
) {
    let (viewport_width, viewport_height) = get_gl_viewport_size(state);
    let clip_w = 2.0 / viewport_width;
    let clip_h = 2.0 / viewport_height;
    let matrix = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let m = &mut runtime.matrix_array;
        m[0] = clip_w;
        m[1] = 0.0;
        m[2] = 0.0;
        m[3] = 0.0;
        m[4] = -clip_h;
        m[5] = 0.0;
        m[6] = -1.0;
        m[7] = 1.0;
        m[8] = 1.0;
        *m
    };
    let straight = state
        .context_state
        .runtime_state
        .borrow()
        .current_texture_realization
        .is_some_and(|realization| realization.straight_alpha);
    let gl = &state.gl;
    // SAFETY: the locations belong to the currently bound program on this GL thread.
    unsafe {
        gl.uniform_matrix_3_f32_slice(loc_world_matrix, false, &matrix);
        gl.uniform_1_i32(loc_texture, 0);
        gl.uniform_1_i32(loc_straight_texture_alpha, if straight { 1 } else { 0 });
    }
}

pub fn use_gl_quad_batch_program(state: &GlRenderState, program: NativeProgram) {
    let mut context = state.context_state.runtime_state.borrow_mut();
    if context.binding.as_ref().map(|binding| binding.program) != Some(program) {
        // SAFETY: the program belongs to this context and binding occurs on the GL thread.
        unsafe { state.gl.use_program(Some(program)) };
    }
    context.binding = Some(flight_render_gl::GlBoundShader {
        locations: None,
        program,
    });
}

pub fn write_gl_quad_batch_affine_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    width: f32,
    height: f32,
    uv_origin_x: f32,
    uv_origin_y: f32,
    uv_axis_ux: f32,
    uv_axis_uy: f32,
    uv_axis_vx: f32,
    uv_axis_vy: f32,
    alpha: f32,
) {
    data[base] = transform.a * width;
    data[base + 1] = transform.b * width;
    data[base + 2] = transform.c * height;
    data[base + 3] = transform.d * height;
    data[base + 4] = transform.tx;
    data[base + 5] = transform.ty;
    data[base + 6] = uv_origin_x;
    data[base + 7] = uv_origin_y;
    data[base + 8] = uv_axis_ux;
    data[base + 9] = uv_axis_uy;
    data[base + 10] = uv_axis_vx;
    data[base + 11] = uv_axis_vy;
    data[base + 12] = alpha;
}

// Packs the common axis-aligned UV rectangle into the affine base record. Geometry dimensions are
// folded into the world axes once per instance, freeing the same two floats for the second UV axis;
// the record therefore supports rotated atlas views without growing beyond 52 bytes.
pub fn write_gl_quad_batch_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) {
    write_gl_quad_batch_affine_instance(
        data,
        base,
        transform,
        width,
        height,
        u0,
        v0,
        u1 - u0,
        0.0,
        0.0,
        v1 - v0,
        alpha,
    );
}
