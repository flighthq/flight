use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{compile_gl_mesh_program, ensure_gl_scene3d_program};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMeshProgram, GlWireframeProgram};

pub fn compile_gl_wireframe_program(
    gl: &glow::Context,
    alpha_mask_enabled: bool,
    skinned: bool,
    skin_declarations_glsl: &str,
) -> GlWireframeProgram {
    let vertex_source = get_gl_wireframe_vertex_source(skinned, skin_declarations_glsl);
    let fragment_source = get_gl_wireframe_fragment_source(alpha_mask_enabled);
    let program = compile_gl_mesh_program(gl, &vertex_source, &fragment_source).unwrap();
    let base = unsafe {
        GlMeshProgram {
            program,
            model_location: gl.get_uniform_location(program, "u_model"),
            view_projection_location: gl.get_uniform_location(program, "u_viewProjection"),
            normal_matrix_location: None,
            camera_position_location: None,
            object_alpha_location: gl.get_uniform_location(program, "u_objectAlpha"),
            alpha_is_coverage_location: gl.get_uniform_location(program, "u_alphaIsCoverage"),
        }
    };
    return GlWireframeProgram {
        alpha_cutoff_location: unsafe { gl.get_uniform_location(program, "u_alphaCutoff") },
        color_location: unsafe { gl.get_uniform_location(program, "u_color") },
        base,
    };
}

pub fn ensure_gl_wireframe_program(
    state: &GlRenderState,
    alpha_mask_enabled: bool,
) -> GlWireframeProgram {
    let skinned = get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run);
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let key = format!(
        "wireframe:{}|{}",
        if alpha_mask_enabled { "mask" } else { "base" },
        if skinned { "skin" } else { "rigid" }
    );
    return ensure_gl_scene3d_program(state, &key, |gl| {
        compile_gl_wireframe_program(gl, alpha_mask_enabled, skinned, &skin_glsl)
    });
}

pub fn get_gl_wireframe_fragment_source(alpha_mask_enabled: bool) -> String {
    let mut src = String::from("#version 300 es\n");
    if alpha_mask_enabled {
        src.push_str("#define ALPHA_MASK\n");
    }
    src.push_str(&format!(
        r#"precision highp float;

uniform vec4 u_color;

#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {{
  fragColor = u_color;
#ifdef ALPHA_MASK
  if (fragColor.a < u_alphaCutoff) discard;
  fragColor.a = 1.0;
#endif
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    ));
    return src;
}

pub fn get_gl_wireframe_vertex_source(skinned: bool, skin_declarations_glsl: &str) -> String {
    let mut src = String::from("#version 300 es\n");
    if skinned {
        src.push_str("#define HAS_SKIN\n");
        src.push_str(skin_declarations_glsl);
    }
    src.push_str(WIREFRAME_VERTEX);
    return src;
}

const WIREFRAME_VERTEX: &str = r#"layout(location = 0) in vec3 a_position;

uniform mat4 u_viewProjection;
uniform mat4 u_model;

void main() {
#ifdef HAS_SKIN
  vec4 localPosition = skinMatrix() * vec4(a_position, 1.0);
#else
  vec4 localPosition = vec4(a_position, 1.0);
#endif
  gl_Position = u_viewProjection * u_model * localPosition;
}
"#;
