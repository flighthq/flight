// flight-lint: allow-file(contract-vocabulary) D17 the particle pass draws through native glow handles on thread-bound render-gl state

use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::throw_error;
use flight_lighting::Scene3DLightsLike;
use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL, BLEND_MODE_SCREEN};
use flight_node::NodeRef;
use flight_node::contract::{get_node_runtime, get_node_world_matrix4};
use flight_particleemitter::{PARTICLE_EMITTER_3D_KIND, ParticleEmitter3D};
use flight_render::prepare_scene_3d_render;
use flight_render_gl::{
    GlRenderState, GlScene3DPass, create_gl_program, enable_gl_blend_mode_support,
    invalidate_gl_render_state_cache, resolve_gl_texture,
};
use flight_texture::{get_texture_height, get_texture_width, has_texture_source};
use flight_textureatlas::TextureAtlasRotation;
use glow::{HasContext, NativeBuffer, NativeProgram, NativeUniformLocation, NativeVertexArray};

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;

// Per-instance layout (16 floats = 64 bytes):
// [0]  px         float   world x
// [1]  py         float   world y
// [2]  pz         float   world z
// [3]  cosScale   float   cos(rotation) * scale
// [4]  sinScale   float   sin(rotation) * scale
// [5]  r          float
// [6]  g          float
// [7]  b          float
// [8]  alpha      float
// [9]  u0         float
// [10] v0         float
// [11] u1         float
// [12] v1         float
// [13] signed width  float   (< 0 marks clockwise atlas packing)
// [14] signed height float   (< 0 marks counterclockwise atlas packing)
// [15] _pad       float   (alignment to 64 bytes)
const INSTANCE_FLOATS: usize = 16;
const INSTANCE_STRIDE: i32 = (INSTANCE_FLOATS * 4) as i32;

const PARTICLE_TRANSFORM_STRIDE: usize = 4;

/// TS `GlParticle3DShader` (module-private): the billboard program, its buffers and the CPU
/// instance staging array.
#[derive(Clone, Debug)]
pub(crate) struct GlParticle3DShader {
    pub(crate) corner_buffer: NativeBuffer,
    pub(crate) index_buffer: NativeBuffer,
    pub(crate) instance_buffer: NativeBuffer,
    pub(crate) instance_data: Vec<f32>,
    pub(crate) loc_camera_right: Option<NativeUniformLocation>,
    pub(crate) loc_camera_up: Option<NativeUniformLocation>,
    pub(crate) loc_color: u32,
    pub(crate) loc_corner: u32,
    pub(crate) loc_cos_scale: u32,
    pub(crate) loc_has_texture: Option<NativeUniformLocation>,
    pub(crate) loc_pos: u32,
    pub(crate) loc_sin_scale: u32,
    pub(crate) loc_size: u32,
    pub(crate) loc_texture: Option<NativeUniformLocation>,
    pub(crate) loc_uv_rect: u32,
    pub(crate) loc_view_projection: Option<NativeUniformLocation>,
    pub(crate) program: NativeProgram,
    pub(crate) vao: NativeVertexArray,
}

fn compile_particle_3d_shader(gl: &glow::Context) -> GlParticle3DShader {
    let program = create_gl_program(gl, PARTICLE_3D_VS, PARTICLE_3D_FS, Some("ParticleEmitter3D"))
        .unwrap_or_else(|error| throw_error(&error));

    // Bind the emitter's dedicated VAO before creating buffers. This compile runs lazily inside the
    // first particle draw — mid render_gl_scene3d, with the last mesh's VAO still bound — so the
    // ELEMENT_ARRAY_BUFFER binding below must land in this VAO, not in that mesh's cached VAO (which
    // would leave it drawing against this 6-index quad buffer on later frames).
    // SAFETY: resource creation and location queries on the owning GL thread.
    unsafe {
        let vao = gl.create_vertex_array().unwrap_or_else(|error| throw_error(&error));
        gl.bind_vertex_array(Some(vao));

        let corner_data: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
        let corner_buffer = gl.create_buffer().unwrap_or_else(|error| throw_error(&error));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(corner_buffer));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, f32_bytes(&corner_data), glow::STATIC_DRAW);

        let index_data: [u16; 6] = [0, 1, 2, 0, 2, 3];
        let index_buffer = gl.create_buffer().unwrap_or_else(|error| throw_error(&error));
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
        gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            std::slice::from_raw_parts(index_data.as_ptr().cast::<u8>(), std::mem::size_of_val(&index_data)),
            glow::STATIC_DRAW,
        );

        let instance_buffer = gl.create_buffer().unwrap_or_else(|error| throw_error(&error));

        gl.bind_vertex_array(None);

        return GlParticle3DShader {
            corner_buffer,
            index_buffer,
            instance_buffer,
            instance_data: Vec::new(),
            loc_camera_right: gl.get_uniform_location(program, "u_cameraRight"),
            loc_camera_up: gl.get_uniform_location(program, "u_cameraUp"),
            loc_color: 4,
            loc_corner: gl.get_attrib_location(program, "a_corner").unwrap_or(0),
            loc_cos_scale: 2,
            loc_has_texture: gl.get_uniform_location(program, "u_hasTexture"),
            loc_pos: 1,
            loc_sin_scale: 3,
            loc_size: 6,
            loc_texture: gl.get_uniform_location(program, "u_texture"),
            loc_uv_rect: 5,
            loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
            program,
            vao,
        };
    }
}

// The state's shader, lent out of its runtime slot for one pass (TS: the module WeakMap entry).
fn ensure_particle_3d_shader(state: &GlRenderState) -> GlParticle3DShader {
    if let Some(shader) = get_gl_scene3d_runtime(state).particle_emitter3d_shader.take() {
        return shader;
    }
    return compile_particle_3d_shader(&state.gl);
}

fn ensure_instance_capacity(shader: &mut GlParticle3DShader, gl: &glow::Context, count: usize) {
    let needed = count * INSTANCE_FLOATS;
    if shader.instance_data.len() >= needed {
        return;
    }
    let new_size = needed.max(shader.instance_data.len() * 2);
    shader.instance_data = vec![0.0; new_size];
    // SAFETY: the instance buffer belongs to this context.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(shader.instance_buffer));
        gl.buffer_data_size(glow::ARRAY_BUFFER, (new_size * 4) as i32, glow::DYNAMIC_DRAW);
    }
}

fn collect_particle_emitter_3d_nodes(node: &NodeRef, out: &mut Vec<NodeRef>) {
    let children = {
        let guard = node.read().unwrap();
        let fields = guard.node_fields();
        if !fields.enabled {
            return;
        }
        if fields.kind == PARTICLE_EMITTER_3D_KIND {
            out.push(node.clone());
        }
        get_node_runtime(&*guard).children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            collect_particle_emitter_3d_nodes(child, out);
        }
    }
}

// ParticleBlendMode uses serialized lowercase spellings; translate them to the canonical fixed-function
// BlendMode family so particles and surface meshes share render-gl's one overridable realization table.
// Assumes BLEND is already enabled.
fn apply_gl_particle_blend_mode(state: &mut GlRenderState, mode: Option<&str>) {
    if state.apply_blend_mode.is_none() {
        enable_gl_blend_mode_support(state);
    }
    let Some(apply) = state.apply_blend_mode else {
        return;
    };
    let blend_mode = match mode {
        Some("add") => BLEND_MODE_ADD,
        Some("multiply") => BLEND_MODE_MULTIPLY,
        Some("screen") => BLEND_MODE_SCREEN,
        _ => BLEND_MODE_NORMAL,
    };
    apply(state, Some(&blend_mode.to_string()));
}

fn draw_particle_emitter_3d_node(
    state: &mut GlRenderState,
    shader: &mut GlParticle3DShader,
    emitter_node: &NodeRef,
) {
    let gl = state.gl.clone();
    // The scalar fields are copied out first: no node lock may be held while the world matrix resolves.
    let (particle_count, world_space, atlas) = {
        let emitter_guard = emitter_node.read().unwrap();
        let Some(emitter) = emitter_guard.as_any().downcast_ref::<ParticleEmitter3D>() else {
            return;
        };
        let data = &emitter.data;
        // World-space particles are already baked into world coordinates at spawn (see
        // update_particle_emitter_3d), so they must NOT be re-transformed by the emitter's world matrix.
        (data.particle_count, data.world_space, data.atlas.clone())
    };
    if particle_count == 0 {
        return;
    }

    ensure_instance_capacity(shader, &gl, particle_count);

    let atlas_guard = atlas.as_ref().map(|atlas| atlas.read().unwrap());
    let atlas_texture = atlas_guard.as_ref().and_then(|atlas| atlas.texture.clone());
    let atlas_texture_guard = atlas_texture.as_ref().map(|texture| texture.read().unwrap());
    let resolved_atlas = match atlas_texture_guard.as_deref() {
        Some(texture) if has_texture_source(texture) => resolve_gl_texture(state, texture, Some(false), None),
        _ => None,
    };
    let has_atlas = resolved_atlas.is_some();
    let regions = if has_atlas {
        atlas_guard.as_ref().map(|atlas| &atlas.regions)
    } else {
        None
    };
    let num_regions = regions.map_or(0, |regions| regions.len());
    let (iw, ih) = match (has_atlas, atlas_texture_guard.as_deref()) {
        (true, Some(texture)) => (
            1.0 / get_texture_width(texture).max(1) as f32,
            1.0 / get_texture_height(texture).max(1) as f32,
        ),
        _ => (0.0, 0.0),
    };

    let world_matrix = get_node_world_matrix4(emitter_node, &mut state.runtime.node_revisions);
    let wm = &world_matrix.m;

    let emitter_guard = emitter_node.read().unwrap();
    let Some(emitter) = emitter_guard.as_any().downcast_ref::<ParticleEmitter3D>() else {
        return;
    };
    let data = &emitter.data;
    let (alphas, colors, ids, positions_z, transforms) =
        (&data.alphas, &data.colors, &data.ids, &data.positions_z, &data.transforms);

    let instance_data = &mut shader.instance_data;
    let mut base = 0;
    let mut draw_count = 0;

    for i in 0..particle_count {
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let lx = transforms[tt];
        let ly = transforms[tt + 1];
        let rotation = transforms[tt + 2];
        let scale = transforms[tt + 3];
        let lz = positions_z[i];

        let wx = if world_space { lx } else { wm[0] * lx + wm[4] * ly + wm[8] * lz + wm[12] };
        let wy = if world_space { ly } else { wm[1] * lx + wm[5] * ly + wm[9] * lz + wm[13] };
        let wz = if world_space { lz } else { wm[2] * lx + wm[6] * ly + wm[10] * lz + wm[14] };

        let cos_r = rotation.cos() * scale;
        let sin_r = rotation.sin() * scale;

        let ct = i * 3;
        let has_colors = colors.len() > ct + 2;
        let r = if has_colors { colors[ct] } else { 1.0 };
        let g = if has_colors { colors[ct + 1] } else { 1.0 };
        let b = if has_colors { colors[ct + 2] } else { 1.0 };

        let mut u0 = 0.0;
        let mut v0 = 0.0;
        let mut u1 = 1.0;
        let mut v1 = 1.0;
        let mut region_w = 1.0;
        let mut region_h = 1.0;
        let mut rotated = false;
        let mut counterclockwise = false;

        if let Some(regions) = regions {
            let id = ids[i] as usize;
            if id >= num_regions {
                continue;
            }
            let region = regions[id].read().unwrap();
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }
            u0 = region.x * iw;
            v0 = region.y * ih;
            u1 = (region.x + region.width) * iw;
            v1 = (region.y + region.height) * ih;
            rotated = region.rotation != TextureAtlasRotation::None;
            counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
            region_w = if rotated { region.height } else { region.width };
            region_h = if rotated { region.width } else { region.height };
        }

        instance_data[base] = wx;
        instance_data[base + 1] = wy;
        instance_data[base + 2] = wz;
        instance_data[base + 3] = cos_r;
        instance_data[base + 4] = sin_r;
        instance_data[base + 5] = r;
        instance_data[base + 6] = g;
        instance_data[base + 7] = b;
        instance_data[base + 8] = alphas[i];
        instance_data[base + 9] = u0;
        instance_data[base + 10] = v0;
        instance_data[base + 11] = u1;
        instance_data[base + 12] = v1;
        // The atlas region's pixel dimensions set the billboard's aspect ratio, not its world size: a 3D
        // particle's world extent is its `scale` (folded into cosScale/sinScale above), so the base quad
        // is normalized to a unit square with the larger axis = 1. Using the raw pixel dims here would
        // make a 64px sprite a 64-world-unit quad — screen-covering, with crippling overdraw.
        let max_dim = if region_w >= region_h { region_w } else { region_h };
        instance_data[base + 13] = (if rotated && !counterclockwise { -region_w } else { region_w }) / max_dim;
        instance_data[base + 14] = (if rotated && counterclockwise { -region_h } else { region_h }) / max_dim;
        instance_data[base + 15] = 0.0;
        base += INSTANCE_FLOATS;
        draw_count += 1;
    }

    if draw_count == 0 {
        return;
    }

    // SAFETY: the shader objects and the resolved atlas belong to this context; drawing on its thread.
    unsafe {
        // Bind a dedicated VAO before setting any buffer/attribute state. This instanced draw configures
        // ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, pointers, and divisors; without its own VAO those writes
        // land in whatever VAO is currently bound — typically the last mesh VAO left bound by
        // render_gl_scene3d. The VAO isolates all of it.
        gl.bind_vertex_array(Some(shader.vao));

        gl.bind_buffer(glow::ARRAY_BUFFER, Some(shader.instance_buffer));
        gl.buffer_sub_data_u8_slice(
            glow::ARRAY_BUFFER,
            0,
            f32_bytes(&shader.instance_data[..draw_count * INSTANCE_FLOATS]),
        );

        gl.uniform_1_i32(shader.loc_has_texture.as_ref(), if has_atlas { 1 } else { 0 });
        if has_atlas {
            gl.active_texture(glow::TEXTURE0);
            gl.bind_texture(glow::TEXTURE_2D, resolved_atlas);
            gl.uniform_1_i32(shader.loc_texture.as_ref(), 0);
        }

        gl.bind_buffer(glow::ARRAY_BUFFER, Some(shader.corner_buffer));
        gl.enable_vertex_attrib_array(shader.loc_corner);
        gl.vertex_attrib_pointer_f32(shader.loc_corner, 2, glow::FLOAT, false, 8, 0);
        gl.vertex_attrib_divisor(shader.loc_corner, 0);

        gl.bind_buffer(glow::ARRAY_BUFFER, Some(shader.instance_buffer));

        gl.enable_vertex_attrib_array(shader.loc_pos);
        gl.vertex_attrib_pointer_f32(shader.loc_pos, 3, glow::FLOAT, false, INSTANCE_STRIDE, 0);
        gl.vertex_attrib_divisor(shader.loc_pos, 1);

        gl.enable_vertex_attrib_array(shader.loc_cos_scale);
        gl.vertex_attrib_pointer_f32(shader.loc_cos_scale, 1, glow::FLOAT, false, INSTANCE_STRIDE, 12);
        gl.vertex_attrib_divisor(shader.loc_cos_scale, 1);

        gl.enable_vertex_attrib_array(shader.loc_sin_scale);
        gl.vertex_attrib_pointer_f32(shader.loc_sin_scale, 1, glow::FLOAT, false, INSTANCE_STRIDE, 16);
        gl.vertex_attrib_divisor(shader.loc_sin_scale, 1);

        gl.enable_vertex_attrib_array(shader.loc_color);
        gl.vertex_attrib_pointer_f32(shader.loc_color, 4, glow::FLOAT, false, INSTANCE_STRIDE, 20);
        gl.vertex_attrib_divisor(shader.loc_color, 1);

        gl.enable_vertex_attrib_array(shader.loc_uv_rect);
        gl.vertex_attrib_pointer_f32(shader.loc_uv_rect, 4, glow::FLOAT, false, INSTANCE_STRIDE, 36);
        gl.vertex_attrib_divisor(shader.loc_uv_rect, 1);

        gl.enable_vertex_attrib_array(shader.loc_size);
        gl.vertex_attrib_pointer_f32(shader.loc_size, 2, glow::FLOAT, false, INSTANCE_STRIDE, 52);
        gl.vertex_attrib_divisor(shader.loc_size, 1);

        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(shader.index_buffer));
        gl.draw_elements_instanced(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0, draw_count as i32);

        // Restore the default VAO. The instance divisors set above are recorded in shader.vao, so
        // isolating them here means a following mesh draw never inherits per-instance stepping.
        gl.bind_vertex_array(None);
    }
}

pub fn destroy_gl_particle_emitter3d_shader(state: &GlRenderState) {
    let Some(shader) = get_gl_scene3d_runtime(state).particle_emitter3d_shader.take() else {
        return;
    };
    let gl = &state.gl;
    // SAFETY: the shader objects belong to this state's context.
    unsafe {
        gl.delete_program(shader.program);
        gl.delete_buffer(shader.corner_buffer);
        gl.delete_buffer(shader.index_buffer);
        gl.delete_buffer(shader.instance_buffer);
    }
}

pub fn draw_gl_scene3d_particle_emitter3_ds(
    state: &mut GlRenderState,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    let mut emitter_scratch: Vec<NodeRef> = Vec::new();
    collect_particle_emitter_3d_nodes(scene, &mut emitter_scratch);
    if emitter_scratch.is_empty() {
        return;
    }

    let aspect = get_gl_scene3d_viewport_aspect(state);
    let view_projection = prepare_scene_3d_render(state, scene, camera, lights, Some(aspect))
        .view_projection
        .m;

    let mut shader = ensure_particle_3d_shader(state);
    let gl = state.gl.clone();

    // Camera3D right and up from the view matrix rows (column-major storage).
    let vm = camera.view.read().unwrap().m;
    // SAFETY: the particle program belongs to this context; state changes on its owning thread.
    unsafe {
        gl.use_program(Some(shader.program));
        gl.uniform_matrix_4_f32_slice(shader.loc_view_projection.as_ref(), false, &view_projection);
        gl.uniform_3_f32(shader.loc_camera_right.as_ref(), vm[0], vm[4], vm[8]);
        gl.uniform_3_f32(shader.loc_camera_up.as_ref(), vm[1], vm[5], vm[9]);

        gl.enable(glow::DEPTH_TEST);
        gl.depth_mask(false);
        gl.enable(glow::BLEND);
    }

    for emitter in &emitter_scratch {
        // Each emitter picks its own blend func: 'add' is the canonical fire/glow mode (the fragment
        // shader premultiplies rgb by alpha, so ONE/ONE brightens and a black sprite background adds
        // nothing). A hardcoded SRC_ALPHA over-blend instead makes an additive sprite darken the scene.
        let blend_mode = emitter
            .read()
            .unwrap()
            .as_any()
            .downcast_ref::<ParticleEmitter3D>()
            .and_then(|emitter| emitter.blend_mode.clone());
        apply_gl_particle_blend_mode(state, blend_mode.as_deref());
        draw_particle_emitter_3d_node(state, &mut shader, emitter);
    }

    // SAFETY: restoring fixed-function state on the same context.
    unsafe {
        gl.depth_mask(true);
        gl.disable(glow::BLEND);
    }
    get_gl_scene3d_runtime(state).particle_emitter3d_shader = Some(shader);

    invalidate_gl_render_state_cache(state);
}

pub fn register_gl_particle_emitter3d_pass(state: &mut GlRenderState) {
    let registries = &mut state.gl_registries;
    let pass: GlScene3DPass = draw_gl_scene3d_particle_emitter3_ds;
    if let Some(passes) = &registries.passes {
        if passes.iter().any(|existing| std::ptr::fn_addr_eq(*existing, pass)) {
            return;
        }
    }
    let mut next = registries.passes.as_ref().map_or_else(Vec::new, |passes| passes.to_vec());
    next.push(pass);
    registries.passes = Some(Arc::new(next));
}

fn f32_bytes(values: &[f32]) -> &[u8] {
    // SAFETY: f32 has no padding and u8 has alignment 1, so the view covers exactly the same bytes.
    return unsafe { std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values)) };
}

macro_rules! particle_3d_vs_glsl {
    () => {
        concat!(r#"#version 300 es
precision highp float;

in vec2 a_corner;

layout(location = 1) in vec3  a_pos;
layout(location = 2) in float a_cosScale;
layout(location = 3) in float a_sinScale;
layout(location = 4) in vec4  a_color;
layout(location = 5) in vec4  a_uvRect;
layout(location = 6) in vec2  a_size;

uniform mat4 u_viewProjection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

out vec2 v_uv;
out vec4 v_color;

void main() {
  bool clockwise = a_size.x < 0.0;
  bool counterclockwise = a_size.y < 0.0;
  float lx = (a_corner.x - 0.5) * abs(a_size.x);
  float ly = (a_corner.y - 0.5) * abs(a_size.y);
  float rx = a_cosScale * lx - a_sinScale * ly;
  float ry = a_sinScale * lx + a_cosScale * ly;
  vec3 worldPos = a_pos + u_cameraRight * rx + u_cameraUp * ry;
  gl_Position = u_viewProjection * vec4(worldPos, 1.0);
  v_uv = clockwise
    ? vec2(mix(a_uvRect.z, a_uvRect.x, a_corner.y), mix(a_uvRect.y, a_uvRect.w, a_corner.x))
    : counterclockwise
      ? vec2(mix(a_uvRect.x, a_uvRect.z, a_corner.y), mix(a_uvRect.w, a_uvRect.y, a_corner.x))
      : mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_color = a_color;
}"#)
    };
}

const PARTICLE_3D_VS: &str = particle_3d_vs_glsl!();

macro_rules! particle_3d_fs_glsl {
    () => {
        concat!(r#"#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;
uniform int u_hasTexture;

out vec4 fragColor;

// Both branches output premultiplied alpha, matching the blend funcs in applyGlParticleBlendMode.
// Textured particles keep the atlas straight through upload so an sRGB sample decodes before this
// multiply; multiplying encoded bytes first would produce decode(rgb * alpha), not decode(rgb) * alpha.
void main() {
  if (u_hasTexture != 0) {
    vec4 tex = texture(u_texture, v_uv);
    float alpha = tex.a * v_color.a;
    fragColor = vec4(tex.rgb * v_color.rgb * alpha, alpha);
  } else {
    float alpha = v_color.a;
    fragColor = vec4(v_color.rgb * alpha, alpha);
  }
  if (fragColor.a <= 0.0) discard;
}"#)
    };
}

const PARTICLE_3D_FS: &str = particle_3d_fs_glsl!();

