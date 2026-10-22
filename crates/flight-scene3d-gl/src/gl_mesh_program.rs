use std::rc::Rc;

use flight_camera::{Camera3D, get_camera_3d_position, get_camera_3d_view_projection_matrix4};
use flight_geometry::{Matrix3, Matrix4, Vector3};
use flight_materials::Material3D;
use flight_meshgeometry::{MeshGeometry, MeshSubset};
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
pub use flight_render_gl::create_gl_program;
use flight_texture::{TextureVariant, has_texture_source, has_texture_uv_transform, get_texture_uv_matrix};
use glow::{HasContext, NativeProgram, NativeUniformLocation};

use crate::gl_mesh_upload::ensure_gl_mesh_upload;
use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::GlMeshProgram;

pub fn begin_gl_mesh_draw(state: &GlRenderState, program: &GlMeshProgram, double_sided: bool) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.active_mesh_program = Some(program.program);
    });

    let gl = &state.gl;
    unsafe {
        gl.use_program(Some(program.program));
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LESS);

        let blended = get_gl_scene3d_runtime_blended(state);
        gl.depth_mask(!blended);

        if double_sided {
            gl.disable(glow::CULL_FACE);
        } else {
            gl.enable(glow::CULL_FACE);
            gl.cull_face(glow::BACK);
        }
    }
}

pub fn compile_gl_mesh_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
) -> Result<NativeProgram, String> {
    return create_gl_program(gl, vertex_source, fragment_source, Some("Mesh"));
}

pub fn destroy_gl_mesh_program(state: &GlRenderState, program: &GlMeshProgram) {
    unsafe {
        state.gl.delete_program(program.program);
    }
}

pub fn set_gl_mesh_view_projection(
    state: &GlRenderState,
    loc: Option<NativeUniformLocation>,
    camera: &Camera3D,
) {
    let aspect = get_gl_scene3d_viewport_aspect(state);
    let mut vp = Matrix4::default();
    get_camera_3d_view_projection_matrix4(&mut vp, camera, aspect);
    if let Some(loc) = loc {
        unsafe {
            state.gl.uniform_matrix_4_f32_slice(Some(&loc), false, &vp.m);
        }
    }
}

pub fn set_gl_mesh_camera_position(
    gl: &glow::Context,
    loc: Option<NativeUniformLocation>,
    camera: &Camera3D,
) {
    let mut pos = Vector3::default();
    get_camera_3d_position(&mut pos, camera);
    if let Some(loc) = loc {
        unsafe {
            gl.uniform_3_f32(Some(&loc), pos.x, pos.y, pos.z);
        }
    }
}

pub fn upload_gl_mesh_draw_alpha(
    gl: &glow::Context,
    program: &GlMeshProgram,
    alpha: f32,
) {
    if let Some(ref loc) = program.object_alpha_location {
        unsafe {
            gl.uniform_1_f32(Some(loc), alpha);
        }
    }
}

pub fn ensure_gl_scene3d_program<T, F>(state: &GlRenderState, key: &str, compile: F) -> T
where
    T: Clone + 'static,
    F: FnOnce(&glow::Context) -> T,
{
    get_gl_scene3d_runtime_mut(state, |rt| {
        if let Some(existing) = rt.program_cache.get(key) {
            if let Some(program) = existing.downcast_ref::<T>() {
                return program.clone();
            }
        }
        let program = compile(&state.gl);
        rt.program_cache.insert(key.to_string(), Box::new(program.clone()));
        return program;
    })
}

fn is_mirroring_world_matrix(m: &[f32; 16]) -> bool {
    return m[0] * (m[5] * m[10] - m[6] * m[9])
        - m[4] * (m[1] * m[10] - m[2] * m[9])
        + m[8] * (m[1] * m[6] - m[2] * m[5])
        < 0.0;
}

pub const SKIN_PALETTE_TEXTURE_UNIT: u32 = 12;
pub const SKIN_NORMAL_PALETTE_TEXTURE_UNIT: u32 = 13;
pub const INSTANCE_PALETTE_TEXTURE_UNIT: u32 = 14;
pub const INSTANCE_COLOR_PALETTE_TEXTURE_UNIT: u32 = 15;

pub const GL_UV_TRANSFORM_VERTEX_GLSL: &str = r#"
#ifdef HAS_UV_TRANSFORM
uniform mat3 u_uvTransform;
vec2 applyUvTransform(vec2 uv) { return (u_uvTransform * vec3(uv, 1.0)).xy; }
#else
vec2 applyUvTransform(vec2 uv) { return uv; }
#endif
"#;

pub const GL_INSTANCE_VERTEX_DECLARATIONS_GLSL: &str = r#"
uniform highp sampler2D u_instancePalette;
uniform highp sampler2D u_instanceColorPalette;

vec4 instanceColor() {
  int id = gl_InstanceID;
  int w = textureSize(u_instanceColorPalette, 0).x;
  return texelFetch(u_instanceColorPalette, ivec2(id % w, id / w), 0);
}

mat4 instanceModelMatrix() {
  int x = gl_InstanceID * 4;
  int w = textureSize(u_instancePalette, 0).x;
  return mat4(
    texelFetch(u_instancePalette, ivec2(x % w, x / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 1) % w, (x + 1) / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 2) % w, (x + 2) / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 3) % w, (x + 3) / w), 0)
  );
}
"#;

pub fn draw_gl_mesh_subset(
    state: &GlRenderState,
    program: &GlMeshProgram,
    world_matrix: &Matrix4,
    normal_matrix: &Matrix3,
    alpha: f32,
    subset: &MeshSubset,
    geometry: &MeshGeometry,
    gpu_skinned: bool,
) {
    let gl = &state.gl;
    unsafe {
        if let Some(ref loc) = program.model_location {
            gl.uniform_matrix_4_f32_slice(Some(loc), false, &world_matrix.m);
        }
        if let Some(ref loc) = program.normal_matrix_location {
            gl.uniform_matrix_3_f32_slice(Some(loc), false, &normal_matrix.m);
        }

        let cw = is_mirroring_world_matrix(&world_matrix.m);
        gl.front_face(if cw { glow::CW } else { glow::CCW });

        upload_gl_mesh_draw_alpha(gl, program, alpha);

        ensure_gl_mesh_upload(state, geometry, gpu_skinned, |upload| {
            let element_size: i32 = if upload.index_type == glow::UNSIGNED_INT { 4 } else { 2 };
            gl.draw_elements(
                upload.primitive_mode,
                subset.index_count as i32,
                upload.index_type,
                (subset.index_offset as i32) * element_size,
            );
        });

        gl.front_face(glow::CCW);
    }
}

pub fn has_gl_uv_transform(texture: Option<&dyn TextureVariant>) -> bool {
    return match texture {
        Some(tex) => has_texture_source(tex) && has_texture_uv_transform(tex),
        None => false,
    };
}

pub fn bind_gl_uv_transform(
    gl: &glow::Context,
    program: NativeProgram,
    texture: Option<&dyn TextureVariant>,
) {
    let loc = unsafe { gl.get_uniform_location(program, "u_uvTransform") };
    if loc.is_none() {
        return;
    }
    if let Some(tex) = texture {
        let mut uv_mat = Matrix3::default();
        get_texture_uv_matrix(&mut uv_mat, tex);
        unsafe {
            gl.uniform_matrix_3_f32_slice(loc.as_ref(), false, &uv_mat.m);
        }
    }
}

fn get_gl_scene3d_runtime_blended(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.active_blended_run);
}
