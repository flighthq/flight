//! GL instanced sprite batch — accumulates quad-instance data and flushes.
//!
//! Base instance layout per sprite (13 × f32 = 52 bytes):
//!   [0-1]  a, b       — 2D matrix column 1
//!   [2-3]  c, d       — 2D matrix column 2
//!   [4-5]  tx, ty     — translation
//!   [6-7]  width, height — region size in pixels
//!   [8-11] u0,v0,u1,v1  — atlas UV rect
//!   [12]   alpha      — per-instance alpha

use glow::HasContext;

use crate::draw::apply_gl_blend_mode;
use crate::render_state::{GlRenderState, bytemuck_f32};

/// Number of base per-instance floats (transform + size + uv + alpha).
pub const SPRITE_INSTANCE_FLOATS: usize = 13;
/// Byte stride of one base instance record.
pub const SPRITE_INSTANCE_STRIDE: i32 = (SPRITE_INSTANCE_FLOATS * 4) as i32;

/// Highest per-instance attribute location any sprite-batch material may use.
/// Divisors for locations 1..=this are reset after each flush so later
/// non-instanced draws are not corrupted.
const MAX_INSTANCE_ATTRIB_LOCATION: u32 = 8;

/// Instanced quad-batch vertex shader. Expands a per-instance transform + size
/// + UV rect over a static corner buffer.
pub const QUAD_BATCH_VS: &str = "#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;
layout(location = 6) in float a_alpha;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;

void main() {
  vec2 local = a_corner * a_size;
  vec2 worldPos = vec2(
    a_matAB.x * local.x + a_matCD.x * local.y + a_matTXTY.x,
    a_matAB.y * local.x + a_matCD.y * local.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_alpha = a_alpha;
}";

/// Instanced quad-batch fragment shader. Samples the atlas and applies the
/// per-instance alpha (premultiplied alpha convention).
pub const QUAD_BATCH_FS: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
}";

/// Static corner buffer data: the four unit-quad corners (TL, TR, BR, BL).
pub const QUAD_BATCH_CORNERS: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];

/// Per-state sprite batch runtime fields. Embedded in `GlRenderStateRuntime`.
#[derive(Default)]
pub struct GlSpriteBatchRuntime {
    pub blend_mode: Option<flighthq_types::blend::BlendMode>,
    /// Currently bound texture key (id used as opaque identity).
    pub texture_key: u64,
    pub material_id: u64,
    pub material_renderer_id: u64,
    pub material_floats: u32,
    pub count: u32,
    pub instance_data: Vec<f32>,
    pub material_data: Vec<f32>,
    pub instance_buffer: Option<glow::Buffer>,
    pub material_buffer: Option<glow::Buffer>,
    /// Corner buffer (loc 0, divisor 0) for instanced draw.
    pub corner_buffer: Option<glow::Buffer>,
    /// Compiled instanced quad-batch shader.
    pub quad_batch_shader: Option<GlQuadBatchShader>,
}

/// Locations for the instanced quad-batch program.
#[derive(Debug)]
pub struct GlQuadBatchShader {
    pub program: glow::Program,
    pub loc_corner: u32,
    pub loc_mat_ab: u32,
    pub loc_mat_cd: u32,
    pub loc_mat_txty: u32,
    pub loc_size: u32,
    pub loc_uv_rect: u32,
    pub loc_alpha: u32,
    pub loc_world_matrix: Option<glow::UniformLocation>,
    pub loc_texture: Option<glow::UniformLocation>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Binds the corner buffer (loc 0, divisor 0) and the base instance attribute
/// buffers (locs 1–6, divisor 1). Shared by all sprite-batch material renderers.
pub fn bind_gl_quad_batch_base_attributes(state: &mut GlRenderState, loc_corner: u32) {
    let corner_buffer = state.runtime.sprite_batch.corner_buffer;
    let instance_buffer = state.runtime.sprite_batch.instance_buffer;
    let stride = SPRITE_INSTANCE_STRIDE;
    unsafe {
        let gl = &state.gl;
        gl.bind_buffer(glow::ARRAY_BUFFER, corner_buffer);
        gl.enable_vertex_attrib_array(loc_corner);
        gl.vertex_attrib_pointer_f32(loc_corner, 2, glow::FLOAT, false, 8, 0);
        gl.vertex_attrib_divisor(loc_corner, 0);

        gl.bind_buffer(glow::ARRAY_BUFFER, instance_buffer);
        // (location, size, offset) for the base layout.
        for (loc, size, offset) in BASE_INSTANCE_ATTRIBS {
            gl.enable_vertex_attrib_array(loc);
            gl.vertex_attrib_pointer_f32(loc, size, glow::FLOAT, false, stride, offset);
            gl.vertex_attrib_divisor(loc, 1);
        }
    }
}

/// Lazily compiles and caches the instanced quad-batch shader on `state`.
pub fn ensure_gl_quad_batch_shader(state: &mut GlRenderState) -> &GlQuadBatchShader {
    if state.runtime.sprite_batch.quad_batch_shader.is_none() {
        let shader = unsafe { compile_quad_batch_shader(&state.gl) };
        let corner_buffer = unsafe {
            let buffer = state.gl.create_buffer().expect("create corner buffer");
            state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
            state.gl.buffer_data_u8_slice(
                glow::ARRAY_BUFFER,
                bytemuck_f32(&QUAD_BATCH_CORNERS),
                glow::STATIC_DRAW,
            );
            buffer
        };
        state.runtime.sprite_batch.quad_batch_shader = Some(shader);
        state.runtime.sprite_batch.corner_buffer = Some(corner_buffer);
    }
    state
        .runtime
        .sprite_batch
        .quad_batch_shader
        .as_ref()
        .expect("quad batch shader")
}

/// Flushes the accumulated sprite batch: uploads instance data, binds blend +
/// texture + program, issues `glDrawElementsInstanced`, and resets counters.
pub fn flush_gl_sprite_batch(state: &mut GlRenderState) {
    let count = state.runtime.sprite_batch.count;
    if count == 0 {
        return;
    }

    let blend_mode = state.runtime.sprite_batch.blend_mode;
    let floats = state.runtime.sprite_batch.material_floats as usize;
    let texture_key = state.runtime.sprite_batch.texture_key;

    state.runtime.sprite_batch.count = 0;
    state.runtime.sprite_batch.texture_key = 0;
    state.runtime.sprite_batch.blend_mode = None;
    state.runtime.sprite_batch.material_id = 0;
    state.runtime.sprite_batch.material_renderer_id = 0;
    state.runtime.sprite_batch.material_floats = 0;

    ensure_gl_quad_batch_shader(state);

    // Upload base instance data.
    let instance_byte_len = count as usize * SPRITE_INSTANCE_FLOATS;
    if state.runtime.sprite_batch.instance_buffer.is_none() {
        let total_bytes = (state.runtime.sprite_batch.instance_data.len() * 4) as i32;
        unsafe {
            let buffer = state.gl.create_buffer().expect("create instance buffer");
            state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
            state
                .gl
                .buffer_data_size(glow::ARRAY_BUFFER, total_bytes, glow::DYNAMIC_DRAW);
            state.runtime.sprite_batch.instance_buffer = Some(buffer);
        }
    } else {
        unsafe {
            state.gl.bind_buffer(
                glow::ARRAY_BUFFER,
                state.runtime.sprite_batch.instance_buffer,
            );
        }
    }
    let instance_bytes =
        bytemuck_f32(&state.runtime.sprite_batch.instance_data[..instance_byte_len]);
    // Copy out of the borrow before the next mutable use.
    let instance_bytes = instance_bytes.to_vec();
    unsafe {
        state
            .gl
            .buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, &instance_bytes);
    }

    // Upload per-instance material data, if any.
    if floats > 0 {
        let material_len = count as usize * floats;
        if state.runtime.sprite_batch.material_buffer.is_none() {
            let total_bytes = (state.runtime.sprite_batch.material_data.len() * 4) as i32;
            unsafe {
                let buffer = state.gl.create_buffer().expect("create material buffer");
                state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
                state
                    .gl
                    .buffer_data_size(glow::ARRAY_BUFFER, total_bytes, glow::DYNAMIC_DRAW);
                state.runtime.sprite_batch.material_buffer = Some(buffer);
            }
        } else {
            unsafe {
                state.gl.bind_buffer(
                    glow::ARRAY_BUFFER,
                    state.runtime.sprite_batch.material_buffer,
                );
            }
        }
        let material_bytes =
            bytemuck_f32(&state.runtime.sprite_batch.material_data[..material_len]).to_vec();
        unsafe {
            state
                .gl
                .buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, &material_bytes);
        }
    }

    apply_gl_blend_mode(state, blend_mode);

    // Bind the texture for this batch (key is the opaque cache identity).
    if let Some(&texture) = state.runtime.texture_cache.get(&texture_key) {
        if state.runtime.current_texture != Some(texture) {
            unsafe {
                state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            }
            state.runtime.current_texture = Some(texture);
        }
    }

    // Bind program + base attributes + world/texture uniforms.
    let shader = ensure_gl_quad_batch_shader(state);
    let program = shader.program;
    let loc_corner = shader.loc_corner;
    let loc_world = shader.loc_world_matrix.clone();
    let loc_texture = shader.loc_texture.clone();
    use_gl_quad_batch_program(state, program);
    bind_gl_quad_batch_base_attributes(state, loc_corner);
    if let (Some(loc_world), Some(loc_texture)) = (loc_world, loc_texture) {
        set_gl_quad_batch_world_and_texture(state, &loc_world, &loc_texture);
    }

    let index_buffer = state.runtime.quad_index_buffer;
    unsafe {
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, index_buffer);
        state
            .gl
            .draw_elements_instanced(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0, count as i32);
        for loc in 1..=MAX_INSTANCE_ATTRIB_LOCATION {
            state.gl.vertex_attrib_divisor(loc, 0);
        }
    }
}

/// Writes one instance's per-instance material floats into the material buffer
/// staging array at the given `instance_index`. No-op for uniform-only
/// materials. The actual float source is supplied via `material_floats`.
pub fn pack_gl_sprite_batch_material_instance(
    state: &mut GlRenderState,
    material_floats: &[f32],
    instance_index: u32,
) {
    let stride = state.runtime.sprite_batch.material_floats as usize;
    if stride == 0 || material_floats.is_empty() {
        return;
    }
    let offset = instance_index as usize * stride;
    let dst = &mut state.runtime.sprite_batch.material_data;
    let n = stride.min(material_floats.len());
    dst[offset..offset + n].copy_from_slice(&material_floats[..n]);
}

/// Ensures the sprite batch can accept `max_instances` more instances with the
/// given texture / blend / material combination, flushing if any changes.
///
/// Returns the float index in `instance_data` where the caller should begin
/// writing base instance data.
pub fn prepare_gl_sprite_batch_write(
    state: &mut GlRenderState,
    texture_key: u64,
    blend_mode: Option<flighthq_types::blend::BlendMode>,
    material_id: u64,
    material_renderer_id: u64,
    max_instances: u32,
) -> usize {
    let sb = &state.runtime.sprite_batch;
    if texture_key != sb.texture_key || blend_mode != sb.blend_mode || material_id != sb.material_id
    {
        flush_gl_sprite_batch(state);
    }

    let material_floats = material_floats_for_renderer(state, material_renderer_id);
    let sb = &mut state.runtime.sprite_batch;
    sb.texture_key = texture_key;
    sb.blend_mode = blend_mode;
    sb.material_id = material_id;
    sb.material_renderer_id = material_renderer_id;
    sb.material_floats = material_floats;

    let needed = (sb.count + max_instances) as usize * SPRITE_INSTANCE_FLOATS;
    if needed > sb.instance_data.len() {
        let new_size = needed.max(sb.instance_data.len() * 2);
        sb.instance_data.resize(new_size, 0.0);
        if let Some(buffer) = sb.instance_buffer {
            unsafe {
                state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
                state.gl.buffer_data_size(
                    glow::ARRAY_BUFFER,
                    (new_size * 4) as i32,
                    glow::DYNAMIC_DRAW,
                );
            }
        }
    }

    let sb = &mut state.runtime.sprite_batch;
    if material_floats > 0 {
        let material_needed = (sb.count + max_instances) as usize * material_floats as usize;
        if material_needed > sb.material_data.len() {
            let new_size = material_needed.max(sb.material_data.len() * 2);
            sb.material_data.resize(new_size, 0.0);
            if let Some(buffer) = sb.material_buffer {
                unsafe {
                    state.gl.bind_buffer(glow::ARRAY_BUFFER, Some(buffer));
                    state.gl.buffer_data_size(
                        glow::ARRAY_BUFFER,
                        (new_size * 4) as i32,
                        glow::DYNAMIC_DRAW,
                    );
                }
            }
        }
    }

    state.runtime.sprite_batch.count as usize * SPRITE_INSTANCE_FLOATS
}

/// Sets the world-to-clip matrix and texture-unit uniforms for the active
/// quad-batch program.
pub fn set_gl_quad_batch_world_and_texture(
    state: &mut GlRenderState,
    loc_world_matrix: &glow::UniformLocation,
    loc_texture: &glow::UniformLocation,
) {
    let (vw, vh) = crate::shader::viewport_dimensions(state);
    pack_gl_quad_batch_world_matrix(&mut state.runtime.matrix_array, vw, vh);
    let m = state.runtime.matrix_array;
    unsafe {
        state
            .gl
            .uniform_matrix_3_f32_slice(Some(loc_world_matrix), false, &m);
        state.gl.uniform_1_i32(Some(loc_texture), 0);
    }
}

/// Packs one base sprite instance (13 floats) into `instance_data` at the given
/// `float_offset` and returns the next write offset. Pure CPU seam: the exact
/// byte/float ordering of the per-instance attribute record.
#[allow(clippy::too_many_arguments)]
pub fn pack_gl_sprite_instance(
    instance_data: &mut [f32],
    float_offset: usize,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) -> usize {
    let o = float_offset;
    instance_data[o] = a;
    instance_data[o + 1] = b;
    instance_data[o + 2] = c;
    instance_data[o + 3] = d;
    instance_data[o + 4] = tx;
    instance_data[o + 5] = ty;
    instance_data[o + 6] = width;
    instance_data[o + 7] = height;
    instance_data[o + 8] = u0;
    instance_data[o + 9] = v0;
    instance_data[o + 10] = u1;
    instance_data[o + 11] = v1;
    instance_data[o + 12] = alpha;
    o + SPRITE_INSTANCE_FLOATS
}

/// Writes one atlas-quad instance into the active sprite batch, preparing the
/// batch for the given texture / blend / material first. Convenience over
/// `prepare_gl_sprite_batch_write` + `pack_gl_sprite_instance` for the common
/// single-instance submit (bitmaps, sprites, tiles).
#[allow(clippy::too_many_arguments)]
pub fn submit_gl_sprite_instance(
    state: &mut GlRenderState,
    texture_key: u64,
    blend_mode: Option<flighthq_types::blend::BlendMode>,
    material_id: u64,
    material_renderer_id: u64,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    width: f32,
    height: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
    alpha: f32,
) {
    let offset = prepare_gl_sprite_batch_write(
        state,
        texture_key,
        blend_mode,
        material_id,
        material_renderer_id,
        1,
    );
    pack_gl_sprite_instance(
        &mut state.runtime.sprite_batch.instance_data,
        offset,
        a,
        b,
        c,
        d,
        tx,
        ty,
        width,
        height,
        u0,
        v0,
        u1,
        v1,
        alpha,
    );
    state.runtime.sprite_batch.count += 1;
}

/// Submits the node identified by `render_proxy_id` as a single full-UV atlas
/// quad into the sprite batch, using the render state's current 2D transform,
/// alpha, and blend mode. The texture cache key is the proxy id.
///
/// Shared by the atlas-backed renderers (bitmap, sprite, tile, quad-batch
/// element, velocity). The texture upload keyed on the proxy id is the resource
/// layer's responsibility.
pub fn submit_gl_node_atlas_quad(
    state: &mut GlRenderState,
    render_proxy_id: u64,
    width: f32,
    height: f32,
) {
    let t = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let blend = state.render_state.render_blend_mode;
    submit_gl_sprite_instance(
        state,
        render_proxy_id,
        blend,
        0,
        0,
        t.a,
        t.b,
        t.c,
        t.d,
        t.tx,
        t.ty,
        width,
        height,
        0.0,
        0.0,
        1.0,
        1.0,
        alpha,
    );
}

/// Switches to the given quad-batch `program`, skipping `glUseProgram` on
/// redundant calls.
pub fn use_gl_quad_batch_program(state: &mut GlRenderState, program: glow::Program) {
    if state.runtime.current_program != Some(program) {
        unsafe {
            state.gl.use_program(Some(program));
        }
        state.runtime.current_program = Some(program);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Base instance attribute table: (location, component count, byte offset).
const BASE_INSTANCE_ATTRIBS: [(u32, i32, i32); 6] = [
    (1, 2, 0),
    (2, 2, 8),
    (3, 2, 16),
    (4, 2, 24),
    (5, 4, 32),
    (6, 1, 48),
];

/// Packs the world-to-clip matrix used by the quad-batch program (axis-aligned
/// screen-pixel to NDC). Pure CPU seam mirroring the TS implementation.
pub(crate) fn pack_gl_quad_batch_world_matrix(
    m: &mut [f32; 9],
    viewport_width: u32,
    viewport_height: u32,
) {
    let clip_w = 2.0 / viewport_width as f32;
    let clip_h = 2.0 / viewport_height as f32;
    m[0] = clip_w;
    m[1] = 0.0;
    m[2] = 0.0;
    m[3] = 0.0;
    m[4] = -clip_h;
    m[5] = 0.0;
    m[6] = -1.0;
    m[7] = 1.0;
    m[8] = 1.0;
}

/// Resolves the per-instance float count contributed by a material renderer.
/// The default (id 0) sprite renderer is uniform-only, so it contributes 0.
fn material_floats_for_renderer(_state: &GlRenderState, _material_renderer_id: u64) -> u32 {
    0
}

unsafe fn compile_quad_batch_shader(gl: &glow::Context) -> GlQuadBatchShader {
    unsafe {
        let vs = gl.create_shader(glow::VERTEX_SHADER).expect("create vs");
        gl.shader_source(vs, QUAD_BATCH_VS);
        gl.compile_shader(vs);
        let fs = gl.create_shader(glow::FRAGMENT_SHADER).expect("create fs");
        gl.shader_source(fs, QUAD_BATCH_FS);
        gl.compile_shader(fs);
        let program = gl.create_program().expect("create program");
        gl.attach_shader(program, vs);
        gl.attach_shader(program, fs);
        gl.link_program(program);
        gl.delete_shader(vs);
        gl.delete_shader(fs);
        GlQuadBatchShader {
            program,
            loc_corner: 0,
            loc_mat_ab: 1,
            loc_mat_cd: 2,
            loc_mat_txty: 3,
            loc_size: 4,
            loc_uv_rect: 5,
            loc_alpha: 6,
            loc_world_matrix: gl.get_uniform_location(program, "u_world"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // BASE_INSTANCE_ATTRIBS

    #[test]
    fn base_instance_attribs_cover_thirteen_floats() {
        // Locations 1-6 with sizes 2,2,2,2,4,1 = 13 floats total at stride 52.
        let total: i32 = BASE_INSTANCE_ATTRIBS.iter().map(|(_, size, _)| size).sum();
        assert_eq!(total, SPRITE_INSTANCE_FLOATS as i32);
        // Offsets are contiguous: each offset = previous offset + prev size*4.
        let mut expected_offset = 0;
        for (i, (loc, size, offset)) in BASE_INSTANCE_ATTRIBS.iter().enumerate() {
            assert_eq!(*loc as usize, i + 1);
            assert_eq!(*offset, expected_offset);
            expected_offset += size * 4;
        }
        assert_eq!(expected_offset, SPRITE_INSTANCE_STRIDE);
    }

    // pack_gl_sprite_instance

    #[test]
    fn pack_gl_sprite_instance_lays_out_thirteen_floats() {
        let mut data = vec![0.0_f32; SPRITE_INSTANCE_FLOATS * 2];
        let next = pack_gl_sprite_instance(
            &mut data, 0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 64.0, 32.0, 0.1, 0.2, 0.3, 0.4, 0.5,
        );
        assert_eq!(next, SPRITE_INSTANCE_FLOATS);
        assert_eq!(
            &data[0..13],
            &[
                1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 64.0, 32.0, 0.1, 0.2, 0.3, 0.4, 0.5
            ]
        );
    }

    #[test]
    fn pack_gl_sprite_instance_honors_offset() {
        let mut data = vec![0.0_f32; SPRITE_INSTANCE_FLOATS * 2];
        let next = pack_gl_sprite_instance(
            &mut data,
            SPRITE_INSTANCE_FLOATS,
            9.0,
            0.0,
            0.0,
            9.0,
            0.0,
            0.0,
            1.0,
            1.0,
            0.0,
            0.0,
            1.0,
            1.0,
            1.0,
        );
        assert_eq!(next, SPRITE_INSTANCE_FLOATS * 2);
        assert_eq!(data[SPRITE_INSTANCE_FLOATS], 9.0);
        assert_eq!(data[0], 0.0); // first instance slot untouched
    }

    // QUAD_BATCH_CORNERS

    #[test]
    fn quad_batch_corners_are_unit_quad() {
        assert_eq!(QUAD_BATCH_CORNERS, [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
    }

    // QUAD_BATCH_FS

    #[test]
    fn quad_batch_fs_declares_sampler_and_alpha() {
        assert!(QUAD_BATCH_FS.contains("uniform sampler2D u_texture"));
        assert!(QUAD_BATCH_FS.contains("in float v_alpha"));
        assert!(QUAD_BATCH_FS.contains("out vec4 fragColor"));
    }

    // QUAD_BATCH_VS

    #[test]
    fn quad_batch_vs_declares_instanced_attribute_locations() {
        assert!(QUAD_BATCH_VS.contains("layout(location = 0) in vec2 a_corner"));
        assert!(QUAD_BATCH_VS.contains("layout(location = 1) in vec2 a_matAB"));
        assert!(QUAD_BATCH_VS.contains("layout(location = 5) in vec4 a_uvRect"));
        assert!(QUAD_BATCH_VS.contains("layout(location = 6) in float a_alpha"));
        assert!(QUAD_BATCH_VS.contains("uniform mat3 u_world"));
    }

    // pack_gl_quad_batch_world_matrix

    #[test]
    fn pack_gl_quad_batch_world_matrix_maps_screen_to_clip() {
        let mut m = [0.0_f32; 9];
        pack_gl_quad_batch_world_matrix(&mut m, 800, 600);
        assert!((m[0] - 2.0 / 800.0).abs() < 1e-6);
        assert!((m[4] - (-2.0 / 600.0)).abs() < 1e-6);
        assert_eq!(m[6], -1.0);
        assert_eq!(m[7], 1.0);
        assert_eq!(m[8], 1.0);
    }
}
