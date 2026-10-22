// flight-lint: allow-file(contract-vocabulary) D17 wireframe program compile drives glow native handles over thread-bound render-gl state

use std::cell::Cell;
use std::rc::Rc;

use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{gl_mesh_fragment_tail_glsl, gl_mesh_fragment_tail_uniforms_glsl};
use crate::gl_mesh_program::{compile_gl_program, create_gl_mesh_program_record, ensure_gl_scene3d_program};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlWireframeProgram;

// The GL wireframe prelude: a minimal GLSL 300 es shader that transforms the position attribute by the
// model + view-projection matrices and outputs a single flat LINE color. It has no lighting and no
// maps — the WireframeMaterial draws mesh edges as GL lines (see gl_wireframe_upload for the derived
// line-index buffer), so the fragment stage only needs the line color (decoded to linear on the CPU).
// Base and alpha-mask variants cache separately under the `wireframe:` key. Compiles the wireframe
// shader, links it, and resolves its uniform locations. Pure GL work — no caching — used by
// ensure_gl_wireframe_program.
pub fn compile_gl_wireframe_program(
    gl: &glow::Context,
    alpha_mask_enabled: Option<bool>,
    skinned: Option<bool>,
    skin_declarations_glsl: Option<&str>,
) -> GlWireframeProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_wireframe_vertex_source(skinned, skin_declarations_glsl),
        &get_gl_wireframe_fragment_source(alpha_mask_enabled),
    );
    let mut mesh = create_gl_mesh_program_record(program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        let loc_alpha_cutoff = gl.get_uniform_location(program, "u_alphaCutoff");
        let loc_color = gl.get_uniform_location(program, "u_color");
        mesh.loc_joint_normal_texture = Cell::new(Some(gl.get_uniform_location(program, "u_jointNormalTexture")));
        mesh.loc_joint_texture = Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        mesh.loc_model = gl.get_uniform_location(program, "u_model");
        mesh.loc_normal_matrix = None;
        mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlWireframeProgram {
            mesh,
            loc_alpha_cutoff,
            loc_color,
        };
    }
}

// Resolves the wireframe program, compiling and caching it on first use through the shared scene
// program cache under the `wireframe:` family namespace.
pub fn ensure_gl_wireframe_program(state: &GlRenderState, alpha_mask_enabled: Option<bool>) -> Rc<GlWireframeProgram> {
    let alpha_mask_enabled = alpha_mask_enabled.unwrap_or(false);
    let (skinned, skin_declarations_glsl) = {
        let runtime = get_gl_scene3d_runtime(state);
        let skin = runtime
            .mesh_skin_feature
            .map_or("", |feature| feature.vertex_declarations_glsl);
        (runtime.active_skinned_run, skin)
    };
    return ensure_gl_scene3d_program(
        state,
        &format!(
            "wireframe:{}|{}",
            if alpha_mask_enabled { "mask" } else { "base" },
            if skinned { "skin" } else { "rigid" }
        ),
        |gl| {
            return compile_gl_wireframe_program(
                gl,
                Some(alpha_mask_enabled),
                Some(skinned),
                Some(skin_declarations_glsl),
            );
        },
    );
}

// The wireframe fragment source: outputs the flat linear line color.
pub fn get_gl_wireframe_fragment_source(alpha_mask_enabled: Option<bool>) -> String {
    let mask = if alpha_mask_enabled.unwrap_or(false) {
        "#define ALPHA_MASK\n"
    } else {
        ""
    };
    return format!("#version 300 es\n{mask}{WIREFRAME_FRAGMENT}");
}

// The wireframe vertex source: position → clip space.
pub fn get_gl_wireframe_vertex_source(skinned: Option<bool>, skin_declarations_glsl: Option<&str>) -> String {
    let skin = if skinned.unwrap_or(false) {
        format!("#define HAS_SKIN\n{}", skin_declarations_glsl.unwrap_or(""))
    } else {
        String::new()
    };
    return format!("#version 300 es\n{skin}") + WIREFRAME_VERTEX;
}

macro_rules! wireframe_vertex_glsl {
    () => {
        concat!(r#"layout(location = 0) in vec3 a_position;

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
"#)
    };
}
const WIREFRAME_VERTEX: &str = wireframe_vertex_glsl!();

macro_rules! wireframe_fragment_glsl {
    () => {
        concat!(r#"precision highp float;

uniform vec4 u_color;

#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

void main() {
  fragColor = u_color;
#ifdef ALPHA_MASK
  if (fragColor.a < u_alphaCutoff) discard;
  fragColor.a = 1.0;
#endif
"#, gl_mesh_fragment_tail_glsl!(), r#"
}
"#)
    };
}
const WIREFRAME_FRAGMENT: &str = wireframe_fragment_glsl!();

