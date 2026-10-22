use flight_camera::Camera3D;
use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeTexture};

use crate::gl_mesh_program::ensure_gl_scene3d_program;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlMeshProgram;

pub fn render_gl_environment_skybox(
    state: &GlRenderState,
    camera: &Camera3D,
) {
    let cube = get_gl_scene3d_runtime(state, |rt| rt.environment_source_cube);
    let cube = match cube {
        Some(c) => c,
        None => return,
    };

    let program = ensure_gl_scene3d_program(state, "skybox", |gl| {
        compile_skybox_program(gl)
    });
    let gl = &state.gl;
    unsafe {
        gl.use_program(Some(program.program));
        if let Some(ref loc) = program.view_projection_location {
            gl.uniform_matrix_4_f32_slice(Some(loc), false, &camera.view_projection.m);
        }
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(cube));
        gl.depth_func(glow::LEQUAL);
        gl.draw_arrays(glow::TRIANGLES, 0, 36);
        gl.depth_func(glow::LESS);
    }
}

fn compile_skybox_program(gl: &glow::Context) -> GlMeshProgram {
    let vs = r#"#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
out vec3 v_texCoord;
const vec3 SKYBOX_VERTICES[36] = vec3[](
  vec3(-1,-1,-1), vec3(1,-1,-1), vec3(1,1,-1),
  vec3(-1,-1,-1), vec3(1,1,-1), vec3(-1,1,-1),
  vec3(-1,-1,1), vec3(1,1,1), vec3(1,-1,1),
  vec3(-1,-1,1), vec3(-1,1,1), vec3(1,1,1),
  vec3(-1,1,-1), vec3(1,1,-1), vec3(1,1,1),
  vec3(-1,1,-1), vec3(1,1,1), vec3(-1,1,1),
  vec3(-1,-1,-1), vec3(1,-1,1), vec3(1,-1,-1),
  vec3(-1,-1,-1), vec3(-1,-1,1), vec3(1,-1,1),
  vec3(-1,-1,-1), vec3(-1,1,1), vec3(-1,-1,1),
  vec3(-1,-1,-1), vec3(-1,1,-1), vec3(-1,1,1),
  vec3(1,-1,-1), vec3(1,-1,1), vec3(1,1,1),
  vec3(1,-1,-1), vec3(1,1,1), vec3(1,1,-1)
);
void main() {
  vec3 pos = SKYBOX_VERTICES[gl_VertexID];
  v_texCoord = pos;
  vec4 clipPos = u_viewProjection * vec4(pos, 0.0);
  gl_Position = clipPos.xyww;
}
"#;
    let fs = r#"#version 300 es
precision highp float;
in vec3 v_texCoord;
uniform samplerCube u_skybox;
out vec4 fragColor;
void main() {
  fragColor = texture(u_skybox, v_texCoord);
}
"#;
    let program = crate::gl_mesh_program::create_gl_program(gl, vs, fs, Some("skybox")).expect("skybox program");
    return GlMeshProgram {
        program,
        model_location: None,
        view_projection_location: unsafe { gl.get_uniform_location(program, "u_viewProjection") },
        normal_matrix_location: None,
        camera_position_location: None,
        object_alpha_location: None,
        alpha_is_coverage_location: None,
    };
}
