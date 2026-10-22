use flight_camera::{Camera3D, get_camera_3d_view_projection_matrix4};
use flight_geometry::Matrix4;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_program::{create_gl_program, ensure_gl_scene3d_program};
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::GlMeshProgram;

pub fn render_gl_particle_emitter_3d(
    state: &GlRenderState,
    camera: &Camera3D,
    world_matrix: &Matrix4,
    particle_positions: &[f32],
    particle_colors: &[f32],
    particle_sizes: &[f32],
    particle_count: u32,
) {
    if particle_count == 0 {
        return;
    }

    let program = ensure_gl_scene3d_program(state, "particle:3d", |gl| {
        compile_particle_program(gl)
    });

    let gl = &state.gl;
    unsafe {
        gl.use_program(Some(program.program));
        if let Some(ref loc) = program.view_projection_location {
            let aspect = get_gl_scene3d_viewport_aspect(state);
            let mut vp = Matrix4::default();
            get_camera_3d_view_projection_matrix4(&mut vp, camera, aspect);
            gl.uniform_matrix_4_f32_slice(Some(loc), false, &vp.m);
        }
        if let Some(ref loc) = program.model_location {
            gl.uniform_matrix_4_f32_slice(Some(loc), false, &world_matrix.m);
        }
        gl.enable(glow::BLEND);
        gl.blend_func(glow::SRC_ALPHA, glow::ONE_MINUS_SRC_ALPHA);
        gl.depth_mask(false);
        gl.draw_arrays(glow::POINTS, 0, particle_count as i32);
        gl.depth_mask(true);
        gl.disable(glow::BLEND);
    }
}

fn compile_particle_program(gl: &glow::Context) -> GlMeshProgram {
    let program = create_gl_program(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT, Some("particle:3d")).expect("particle program");
    return GlMeshProgram {
        program,
        model_location: unsafe { gl.get_uniform_location(program, "u_model") },
        view_projection_location: unsafe { gl.get_uniform_location(program, "u_viewProjection") },
        normal_matrix_location: None,
        camera_position_location: None,
        object_alpha_location: None,
        alpha_is_coverage_location: None,
    };
}

const PARTICLE_VERTEX: &str = r#"#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
  gl_PointSize = 4.0;
}
"#;

const PARTICLE_FRAGMENT: &str = r#"#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
  vec2 crd = gl_PointCoord - 0.5;
  float dist = dot(crd, crd);
  if (dist > 0.25) discard;
  fragColor = v_color;
}
"#;
