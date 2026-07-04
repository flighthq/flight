//! The Gl wireframe prelude.
//!
//! Ports `@flighthq/scene-gl` `glWireframePrelude.ts`.

use flighthq_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_program::{GlMeshProgram, compile_gl_program, ensure_gl_scene_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// A compiled wireframe program with a line-color uniform.
#[derive(Clone, Debug)]
pub struct GlWireframeProgram {
    pub base: GlMeshProgram,
    pub loc_color: Option<glow::UniformLocation>,
}

/// Compiles the wireframe shader.
pub fn compile_gl_wireframe_program(gl: &glow::Context) -> GlWireframeProgram {
    let program = compile_gl_program(
        gl,
        get_gl_wireframe_vertex_source(),
        get_gl_wireframe_fragment_source(),
    );
    unsafe {
        GlWireframeProgram {
            loc_color: gl.get_uniform_location(program, "u_color"),
            base: GlMeshProgram {
                loc_model: gl.get_uniform_location(program, "u_model"),
                loc_normal_matrix: None,
                loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
                program,
            },
        }
    }
}

/// Resolves the wireframe program, compiling on first use.
pub fn ensure_gl_wireframe_program(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
) -> GlWireframeProgram {
    let cache_key = "wireframe:";
    let _base = ensure_gl_scene_program(state, scene, cache_key, |gl| {
        let p = compile_gl_wireframe_program(gl);
        p.base.clone()
    });
    if let Some(cached) = scene.wireframe_program_cache.get(cache_key) {
        return cached.clone();
    }
    let p = compile_gl_wireframe_program(&state.gl);
    scene
        .wireframe_program_cache
        .insert(cache_key.to_string(), p.clone());
    p
}

/// The wireframe fragment source.
pub fn get_gl_wireframe_fragment_source() -> &'static str {
    WIREFRAME_FRAGMENT
}

/// The wireframe vertex source.
pub fn get_gl_wireframe_vertex_source() -> &'static str {
    WIREFRAME_VERTEX
}

const WIREFRAME_VERTEX: &str = r#"#version 300 es
layout(location = 0) in vec3 a_position;

uniform mat4 u_viewProjection;
uniform mat4 u_model;

void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
"#;

const WIREFRAME_FRAGMENT: &str = r#"#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
"#;
