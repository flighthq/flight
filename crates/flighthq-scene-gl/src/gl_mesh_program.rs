//! The minimal shared handoff every mesh-material family shares between bind and
//! draw.
//!
//! Ports `@flighthq/scene-gl` `glMeshProgram.ts`: the base `GlMeshProgram`
//! locations (model/normal/view-projection), the per-bind head
//! (`begin_gl_mesh_draw`), the per-draw tail (`draw_gl_mesh_subset`), the
//! shared program compile/destroy, the ensure cache, and the camera upload
//! helpers.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::{Camera, Projection};
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::scene_render::SceneRenderProxy;
use glow::HasContext;

use crate::gl_mesh_upload::ensure_gl_mesh_upload;
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The minimal handoff every mesh-material family shares. `bind` compiles and
/// selects a family program (extending this base); `draw` reads it back to set
/// per-draw matrices and issue the indexed draw.
#[derive(Clone, Debug)]
pub struct GlMeshProgram {
    pub loc_model: Option<glow::UniformLocation>,
    pub loc_normal_matrix: Option<glow::UniformLocation>,
    pub loc_view_projection: Option<glow::UniformLocation>,
    pub program: glow::Program,
}

/// The shared per-bind head: stores the program as the active handoff, selects
/// it, and fixes depth + face-cull state.
pub fn begin_gl_mesh_draw(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    program: &GlMeshProgram,
    double_sided: bool,
) {
    scene.active_mesh_program = Some(program.clone());
    let gl = &state.gl;
    unsafe {
        gl.use_program(Some(program.program));
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LESS);
        gl.depth_mask(true);
        if double_sided {
            gl.disable(glow::CULL_FACE);
        } else {
            gl.enable(glow::CULL_FACE);
            gl.cull_face(glow::BACK);
        }
    }
}

/// Compiles a vertex + fragment source pair into a linked GL program.
///
/// # Panics
/// Panics on compile or link failure (programmer error).
pub fn compile_gl_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
) -> glow::Program {
    unsafe {
        let vertex_shader = compile_gl_shader(gl, glow::VERTEX_SHADER, vertex_source);
        let fragment_shader = compile_gl_shader(gl, glow::FRAGMENT_SHADER, fragment_source);
        let program = gl.create_program().expect("create_program");
        gl.attach_shader(program, vertex_shader);
        gl.attach_shader(program, fragment_shader);
        gl.link_program(program);
        gl.delete_shader(vertex_shader);
        gl.delete_shader(fragment_shader);
        if !gl.get_program_link_status(program) {
            panic!(
                "scene-gl program link error: {}",
                gl.get_program_info_log(program)
            );
        }
        program
    }
}

/// Frees the linked GL program.
pub fn destroy_gl_mesh_program(state: &mut GlRenderState, program: &GlMeshProgram) {
    unsafe {
        state.gl.delete_program(program.program);
    }
}

/// The shared per-draw tail: uploads model + normal matrices, ensures geometry
/// upload, and issues the indexed (or array) draw.
pub fn draw_gl_mesh_subset(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    program: &GlMeshProgram,
    proxy: &SceneRenderProxy,
    geometry_id: u64,
) {
    let gl = &state.gl;
    unsafe {
        gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &proxy.world_matrix.m);
        if let Some(loc) = &program.loc_normal_matrix {
            gl.uniform_matrix_3_f32_slice(Some(loc), false, &proxy.normal_matrix.m);
        }
    }

    let upload = scene
        .upload_cache
        .entry(geometry_id)
        .or_insert_with(GlMeshUpload::default);
    let subset = proxy.subset;

    let gl = &state.gl;
    unsafe {
        if upload.index_buffer.is_some() {
            let element_size = if upload.index_type == glow::UNSIGNED_INT {
                4
            } else {
                2
            };
            gl.draw_elements(
                glow::TRIANGLES,
                subset.index_count as i32,
                upload.index_type,
                (subset.index_offset * element_size) as i32,
            );
        } else {
            gl.draw_arrays(
                glow::TRIANGLES,
                subset.index_offset as i32,
                subset.index_count as i32,
            );
        }
    }
}

/// Resolves a compiled program for a string cache key, compiling via the factory
/// on first use. Every family routes through this one cache.
pub fn ensure_gl_scene_program<F>(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &str,
    compile: F,
) -> GlMeshProgram
where
    F: FnOnce(&glow::Context) -> GlMeshProgram,
{
    if let Some(program) = scene.program_cache.get(key) {
        return program.clone();
    }
    let program = compile(&state.gl);
    scene.program_cache.insert(key.to_string(), program.clone());
    program
}

/// Uploads the camera world position to a lit family's camera-position uniform.
pub fn set_gl_mesh_camera_position(
    gl: &glow::Context,
    loc_camera_position: Option<&glow::UniformLocation>,
    camera: &Camera,
) {
    let mut inverse_view = Matrix4Like::default();
    let view_like = Matrix4Like { m: camera.view.m };
    inverse_matrix4(&mut inverse_view, &view_like);
    let mut camera_position = Vector3Like::default();
    get_matrix4_position(&mut camera_position, &inverse_view);
    unsafe {
        gl.uniform_3_f32(
            loc_camera_position,
            camera_position.x,
            camera_position.y,
            camera_position.z,
        );
    }
}

/// Uploads the camera view-projection matrix.
pub fn set_gl_mesh_view_projection(
    gl: &glow::Context,
    loc_view_projection: Option<&glow::UniformLocation>,
    camera: &Camera,
) {
    let aspect = match &camera.projection {
        Projection::Perspective(p) => {
            if p.aspect != 0.0 {
                p.aspect
            } else {
                1.0
            }
        }
        Projection::Orthographic(_) => 1.0,
    };
    let mut view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut view_projection, camera, aspect);
    unsafe {
        gl.uniform_matrix_4_f32_slice(loc_view_projection, false, &view_projection.m);
    }
}

unsafe fn compile_gl_shader(gl: &glow::Context, shader_type: u32, source: &str) -> glow::Shader {
    unsafe {
        let shader = gl.create_shader(shader_type).expect("create_shader");
        gl.shader_source(shader, source);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            panic!(
                "scene-gl shader compile error: {}",
                gl.get_shader_info_log(shader)
            );
        }
        shader
    }
}
