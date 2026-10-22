use flight_camera::{Camera3D, get_camera_3d_view_projection_matrix4};
use flight_geometry::Matrix4;
use flight_lighting::{DIRECTIONAL_SHADOW_MAP_SIZE, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS};
use flight_node::NodeRef;
use flight_render::RenderTargetDescriptor;
use flight_render_gl::{GlRenderState, create_gl_texture_render_target};
use glow::HasContext;

use crate::gl_mesh_program::{create_gl_program, ensure_gl_scene3d_program};
use crate::gl_mesh_upload::ensure_gl_mesh_upload;
use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::{GlMeshProgram, GlScene3DShadow};

pub fn render_gl_scene3d_shadow_map(
    state: &GlRenderState,
    _scene: &NodeRef,
    shadow_camera: &Camera3D,
    casts_shadow: bool,
    shadow_bias: f32,
) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.shadow = None;
    });

    if !casts_shadow {
        return;
    }

    let gl = &state.gl;

    let has_target = get_gl_scene3d_runtime(state, |rt| rt.shadow_target.is_some());
    if !has_target {
        let descriptor = RenderTargetDescriptor {
            width: DIRECTIONAL_SHADOW_MAP_SIZE as f32,
            height: DIRECTIONAL_SHADOW_MAP_SIZE as f32,
            format: None,
            color_attachments: None,
            color_formats: None,
            sample_count: None,
            depth: Some(flight_render::RenderTargetDepth::DepthStencil),
            color_space: None,
        };
        if let Ok(Some(target)) = create_gl_texture_render_target(state, &descriptor, None) {
            get_gl_scene3d_runtime_mut(state, |rt| {
                rt.shadow_target = Some(target);
            });
        }
    }

    let depth_texture = get_gl_scene3d_runtime(state, |rt| {
        rt.shadow_target.as_ref().and_then(|t| t.depth_texture)
    });
    let depth_texture = match depth_texture {
        Some(t) => t,
        None => return,
    };

    let program = ensure_gl_scene3d_program(state, "shadow:depth", |gl| {
        compile_shadow_depth_program(gl)
    });

    unsafe {
        gl.use_program(Some(program.program));
        if let Some(ref loc) = program.view_projection_location {
            let aspect = get_gl_scene3d_viewport_aspect(state);
            let mut vp = Matrix4::default();
            get_camera_3d_view_projection_matrix4(&mut vp, shadow_camera, aspect);
            gl.uniform_matrix_4_f32_slice(Some(loc), false, &vp.m);
        }
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LESS);
        gl.depth_mask(true);
        gl.enable(glow::CULL_FACE);
        gl.cull_face(glow::FRONT);
        gl.clear(glow::DEPTH_BUFFER_BIT | glow::COLOR_BUFFER_BIT);
    }

    unsafe {
        gl.active_texture(glow::TEXTURE0);
        gl.disable(glow::CULL_FACE);
        gl.cull_face(glow::BACK);
    }

    let aspect = get_gl_scene3d_viewport_aspect(state);
    let mut light_vp = Matrix4::default();
    get_camera_3d_view_projection_matrix4(&mut light_vp, shadow_camera, aspect);
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.shadow = Some(GlScene3DShadow {
            depth_texture,
            light_view_projection: light_vp.clone(),
            shadow_bias,
            shadow_map_size: DIRECTIONAL_SHADOW_MAP_SIZE,
        });
    });
}

pub fn normalize_directional_shadow_pcf_radius(radius: f32) -> u32 {
    if !radius.is_finite() {
        return 0;
    }
    return (radius.floor() as u32).min(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS).max(0);
}

fn compile_shadow_depth_program(gl: &glow::Context) -> GlMeshProgram {
    let program = create_gl_program(
        gl,
        SHADOW_DEPTH_VERTEX,
        SHADOW_DEPTH_FRAGMENT,
        Some("shadow:depth"),
    ).expect("shadow depth program");
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

const SHADOW_DEPTH_VERTEX: &str = r#"#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
"#;

const SHADOW_DEPTH_FRAGMENT: &str = r#"#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
"#;
