// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_entity::throw_error;
use flight_particleemitter::ParticleEmitter2D;
use flight_render::{NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data};
use flight_render_gl::{
    GlBoundShader, GlParticleResources, GlParticleShader, GlRenderState, create_gl_program,
    resolve_gl_texture,
};
use flight_texture::{get_texture_height, get_texture_width, has_texture_source};
use flight_textureatlas::TextureAtlasRotation;
use glow::HasContext;

use crate::gl_quad_batch_writer::{flush_gl_quad_batch_writer, get_gl_viewport_size, gl_f32_bytes};

// Per-instance layout (14 floats = 56 bytes):
// [0]  px         float
// [1]  py         float
// [2]  cosScale   float
// [3]  sinScale   float
// [4]  r          float
// [5]  g          float
// [6]  b          float
// [7]  alpha      float
// [8]  u0         float
// [9]  v0         float
// [10] u1         float
// [11] v1         float
// [12] signed width  float   (< 0 marks clockwise atlas packing)
// [13] signed height float   (< 0 marks counterclockwise atlas packing)
const INSTANCE_FLOATS: usize = 14;
const INSTANCE_STRIDE: i32 = (INSTANCE_FLOATS * 4) as i32;

const PARTICLE_VS: &str = "#version 300 es
precision mediump float;

in vec2 a_corner;

layout(location = 1) in vec2  a_pos;
layout(location = 2) in float a_cosScale;
layout(location = 3) in float a_sinScale;
layout(location = 4) in vec4  a_color;
layout(location = 5) in vec4  a_uvRect;
layout(location = 6) in vec2  a_size;

uniform mat3 u_world;

out vec2 v_uv;
out vec4 v_color;

void main() {
  bool clockwise = a_size.x < 0.0;
  bool counterclockwise = a_size.y < 0.0;
  float lx = a_corner.x * abs(a_size.x);
  float ly = a_corner.y * abs(a_size.y);
  float rx = a_cosScale * lx - a_sinScale * ly + a_pos.x;
  float ry = a_sinScale * lx + a_cosScale * ly + a_pos.y;
  vec3 clip = u_world * vec3(rx, ry, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = clockwise
    ? vec2(mix(a_uvRect.z, a_uvRect.x, a_corner.y), mix(a_uvRect.y, a_uvRect.w, a_corner.x))
    : counterclockwise
      ? vec2(mix(a_uvRect.x, a_uvRect.z, a_corner.y), mix(a_uvRect.w, a_uvRect.y, a_corner.x))
      : mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_color = a_color;
}";

// Premultiplied-alpha tint: tex.rgb is already multiplied by tex.a, so the correct tinted
// premultiplied output is (tex.rgb * color.rgb * alpha, tex.a * alpha).
const PARTICLE_FS: &str = "#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  if (u_straightTextureAlpha) tex.rgb *= tex.a;
  fragColor = vec4(tex.rgb * v_color.rgb, tex.a) * v_color.a;
  if (fragColor.a <= 0.0) discard;
}";

pub static GL_PARTICLE_EMITTER2D_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_gl_particle_emitter2d,
};

fn compile_particle_shader(gl: &glow::Context) -> GlParticleShader {
    let program = create_gl_program(gl, PARTICLE_VS, PARTICLE_FS, Some("Particle emitter"))
        .unwrap_or_else(|error| throw_error(&error));
    // SAFETY: location queries occur on the GL thread for a program created by this context.
    unsafe {
        return GlParticleShader {
            program,
            loc_corner: gl.get_attrib_location(program, "a_corner").unwrap_or(0),
            loc_pos: 1,
            loc_cos_scale: 2,
            loc_sin_scale: 3,
            loc_color: 4,
            loc_uv_rect: 5,
            loc_size: 6,
            loc_world_matrix: gl.get_uniform_location(program, "u_world"),
            loc_texture: gl.get_uniform_location(program, "u_texture"),
            loc_straight_texture_alpha: gl.get_uniform_location(program, "u_straightTextureAlpha"),
        };
    }
}

pub fn draw_gl_particle_emitter2d(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) {
    let source = render_proxy.source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<ParticleEmitter2D>() else {
        return;
    };
    let data = &source.data;
    let particle_count = data.particle_count;
    let Some(atlas) = &data.atlas else {
        return;
    };
    let atlas = atlas.read().unwrap();
    let Some(texture) = &atlas.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    if !has_texture_source(&*texture) || particle_count == 0 {
        return;
    }

    let shader = ensure_particle_shader(state);
    ensure_instance_capacity(state, particle_count);

    if let Some(apply_blend_mode) = state.apply_blend_mode {
        apply_blend_mode(state, render_proxy.blend_mode.as_ref());
    }
    if resolve_gl_texture(
        state,
        &*texture,
        Some(true),
        Some(SCENE2D_WORKING_COLOR_SPACE),
    )
    .is_none()
    {
        return;
    }

    let regions = &atlas.regions;
    let num_regions = regions.len();
    let node_alpha = render_proxy.alpha;
    let t = &render_proxy.transform_2d;
    let (viewport_width, viewport_height) = get_gl_viewport_size(state);
    let iw = 1.0 / get_texture_width(&*texture).max(1) as f32;
    let ih = 1.0 / get_texture_height(&*texture).max(1) as f32;
    let colors = &data.colors;
    let mut instance_data = state
        .gl_runtime
        .borrow_mut()
        .particle_instance_data
        .take()
        .unwrap_or_default();

    // Build per-instance CPU buffer.
    let mut base = 0;
    let mut draw_count = 0;
    for index in 0..particle_count {
        let id = data.ids[index] as usize;
        if id >= num_regions {
            continue;
        }
        let region = regions[id].read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }

        let tt = index * 4;
        let px = data.transforms[tt];
        let py = data.transforms[tt + 1];
        let rotation = data.transforms[tt + 2];
        let scale = data.transforms[tt + 3];
        let cos_r = rotation.cos() * scale;
        let sin_r = rotation.sin() * scale;

        // u_world encodes (node transform × viewport projection), so raw local coords pass through.
        let ct = index * 3;
        let has_colors = colors.len() > ct + 2;
        let r = if has_colors { colors[ct] } else { 1.0 };
        let g = if has_colors { colors[ct + 1] } else { 1.0 };
        let b = if has_colors { colors[ct + 2] } else { 1.0 };

        instance_data[base] = px;
        instance_data[base + 1] = py;
        instance_data[base + 2] = cos_r;
        instance_data[base + 3] = sin_r;
        instance_data[base + 4] = r;
        instance_data[base + 5] = g;
        instance_data[base + 6] = b;
        instance_data[base + 7] = node_alpha * data.alphas[index];
        instance_data[base + 8] = region.x * iw;
        instance_data[base + 9] = region.y * ih;
        instance_data[base + 10] = (region.x + region.width) * iw;
        instance_data[base + 11] = (region.y + region.height) * ih;
        // A negative stored width marks clockwise packing; a negative height marks libGDX's opposite
        // convention. The shader takes abs for geometry, so direction costs no extra instance bytes.
        let rotated = region.rotation != TextureAtlasRotation::None;
        let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
        instance_data[base + 12] = if rotated && !counterclockwise {
            -region.height
        } else if rotated {
            region.height
        } else {
            region.width
        };
        instance_data[base + 13] = if rotated && counterclockwise {
            -region.width
        } else if rotated {
            region.width
        } else {
            region.height
        };
        base += INSTANCE_FLOATS;
        draw_count += 1;
    }

    let resources = state
        .context_state
        .runtime_state
        .borrow()
        .particle_resources
        .clone()
        .unwrap();
    let gl = std::rc::Rc::clone(&state.gl);
    if draw_count == 0 {
        state.gl_runtime.borrow_mut().particle_instance_data = Some(instance_data);
        return;
    }

    // SAFETY: the particle buffers belong to this context; uploads occur on the GL thread.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(resources.instance_buffer));
        gl.buffer_sub_data_u8_slice(
            glow::ARRAY_BUFFER,
            0,
            gl_f32_bytes(&instance_data[..draw_count * INSTANCE_FLOATS]),
        );
    }
    state.gl_runtime.borrow_mut().particle_instance_data = Some(instance_data);

    // Activate the particle shader program.
    {
        let mut context = state.context_state.runtime_state.borrow_mut();
        if context.binding.as_ref().map(|binding| binding.program) != Some(shader.program) {
            // SAFETY: the program belongs to this context and binding occurs on the GL thread.
            unsafe { gl.use_program(Some(shader.program)) };
        }
        context.binding = Some(GlBoundShader {
            locations: None,
            program: shader.program,
        });
    }

    // Compute and upload the emitter node → clip-space world matrix. In world-space mode particle
    // positions are already in world (pixel) space, so the node transform is skipped.
    let clip_w = 2.0 / viewport_width;
    let clip_h = 2.0 / viewport_height;
    let matrix = {
        let mut runtime = state.gl_runtime.borrow_mut();
        let m = &mut runtime.matrix_array;
        if data.world_space {
            *m = [clip_w, 0.0, 0.0, 0.0, -clip_h, 0.0, -1.0, 1.0, 1.0];
        } else {
            *m = [
                t.a * clip_w,
                -t.b * clip_h,
                0.0,
                t.c * clip_w,
                -t.d * clip_h,
                0.0,
                t.tx * clip_w - 1.0,
                -t.ty * clip_h + 1.0,
                1.0,
            ];
        }
        *m
    };
    let (straight, index_buffer) = {
        let context = state.context_state.runtime_state.borrow();
        (
            context
                .current_texture_realization
                .is_some_and(|realization| realization.straight_alpha),
            context.quad_index_buffer,
        )
    };
    // SAFETY: the particle program and buffers belong to this context; the draw occurs on the GL
    // thread.
    unsafe {
        gl.uniform_matrix_3_f32_slice(shader.loc_world_matrix.as_ref(), false, &matrix);
        gl.uniform_1_i32(shader.loc_texture.as_ref(), 0);
        gl.uniform_1_i32(
            shader.loc_straight_texture_alpha.as_ref(),
            if straight { 1 } else { 0 },
        );

        // Per-vertex: corner buffer.
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(resources.corner_buffer));
        gl.enable_vertex_attrib_array(shader.loc_corner);
        gl.vertex_attrib_pointer_f32(shader.loc_corner, 2, glow::FLOAT, false, 8, 0);
        gl.vertex_attrib_divisor(shader.loc_corner, 0);

        // Per-instance: instance buffer.
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(resources.instance_buffer));
        for (location, size, offset) in [
            (shader.loc_pos, 2, 0),
            (shader.loc_cos_scale, 1, 8),
            (shader.loc_sin_scale, 1, 12),
            (shader.loc_color, 4, 16),
            (shader.loc_uv_rect, 4, 32),
            (shader.loc_size, 2, 48),
        ] {
            gl.enable_vertex_attrib_array(location);
            gl.vertex_attrib_pointer_f32(
                location,
                size,
                glow::FLOAT,
                false,
                INSTANCE_STRIDE,
                offset,
            );
            gl.vertex_attrib_divisor(location, 1);
        }

        // Single draw call for all particles.
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, index_buffer);
        gl.draw_elements_instanced(
            glow::TRIANGLES,
            6,
            glow::UNSIGNED_SHORT,
            0,
            draw_count as i32,
        );

        // Reset divisors so other renderers are not affected.
        for location in [
            shader.loc_pos,
            shader.loc_cos_scale,
            shader.loc_sin_scale,
            shader.loc_color,
            shader.loc_uv_rect,
            shader.loc_size,
        ] {
            gl.vertex_attrib_divisor(location, 0);
        }
    }
}

fn ensure_instance_capacity(state: &GlRenderState, count: usize) {
    let needed = count * INSTANCE_FLOATS;
    let current = state
        .gl_runtime
        .borrow()
        .particle_instance_data
        .as_ref()
        .map_or(0, |data| data.len());
    if current >= needed {
        return;
    }
    // Double capacity each time.
    let new_size = needed.max(current * 2);
    state.gl_runtime.borrow_mut().particle_instance_data = Some(vec![0.0; new_size]);
    // Resize the GPU buffer to match.
    let instance_buffer = state
        .context_state
        .runtime_state
        .borrow()
        .particle_resources
        .as_ref()
        .map(|resources| resources.instance_buffer);
    // SAFETY: the instance buffer belongs to this context; reallocation occurs on the GL thread.
    unsafe {
        state.gl.bind_buffer(glow::ARRAY_BUFFER, instance_buffer);
        state.gl.buffer_data_size(
            glow::ARRAY_BUFFER,
            (new_size * 4) as i32,
            glow::DYNAMIC_DRAW,
        );
    }
}

fn ensure_particle_shader(state: &GlRenderState) -> GlParticleShader {
    if let Some(resources) = &state
        .context_state
        .runtime_state
        .borrow()
        .particle_resources
    {
        return resources.shader.clone();
    }

    let gl = &state.gl;
    let shader = compile_particle_shader(gl);

    // Static corner buffer: (0,0),(1,0),(1,1),(0,1)
    let corner_data: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    // SAFETY: allocation and upload occur on the owning GL thread; the slice outlives the call.
    let (corner_buffer, instance_buffer) = unsafe {
        let corner = gl
            .create_buffer()
            .unwrap_or_else(|error| throw_error(&format!("drawGlParticleEmitter2D: {error}")));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(corner));
        gl.buffer_data_u8_slice(
            glow::ARRAY_BUFFER,
            gl_f32_bytes(&corner_data),
            glow::STATIC_DRAW,
        );
        // Dynamic instance buffer — starts empty, grows as needed.
        let instance = gl
            .create_buffer()
            .unwrap_or_else(|error| throw_error(&format!("drawGlParticleEmitter2D: {error}")));
        (corner, instance)
    };
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .particle_resources = Some(GlParticleResources {
        corner_buffer,
        instance_buffer,
        shader: shader.clone(),
    });
    state.gl_runtime.borrow_mut().particle_instance_data = Some(Vec::new());

    return shader;
}

fn submit_gl_particle_emitter2d(state: &mut GlRenderState, node: &RenderProxy2D<GlRenderState>) {
    flush_gl_quad_batch_writer(state);
    draw_gl_particle_emitter2d(state, node);
}
