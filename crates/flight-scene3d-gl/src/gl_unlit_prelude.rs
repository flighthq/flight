// flight-lint: allow-file(contract-vocabulary) D17 unlit program compile and bind drive glow native handles over thread-bound render-gl state

use std::cell::Cell;
use std::rc::Rc;

use flight_color::LinearColor;
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::Texture;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{
    gl_mesh_fragment_tail_glsl, gl_mesh_fragment_tail_uniforms_glsl,
};
use crate::gl_mesh_program::{
    GL_INSTANCE_VERTEX_DECLARATIONS_GLSL, compile_gl_program, create_gl_mesh_program_record,
    ensure_gl_scene3d_program, gl_uv_transform_vertex_glsl,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlUnlitDefineKey, GlUnlitProgram};

// Uploads the resolved unlit surface uniforms: the linear color (already sRgb-decoded on the CPU), the
// intensity scale (1 for Unlit/VertexColor, emissiveStrength for Emissive), the optional color map on
// texture unit 0, and the alpha-mask cutoff. The caller has already selected the program
// (begin_gl_mesh_draw) and set the view-projection.
pub fn bind_gl_unlit_surface(
    state: &mut GlRenderState,
    program: &GlUnlitProgram,
    color: &LinearColor,
    intensity: f32,
    color_map: Option<&Texture>,
    alpha_cutoff: f32,
) {
    let gl = state.gl.clone();
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_4_f32(
            program.loc_color.as_ref(),
            color.r,
            color.g,
            color.b,
            color.a,
        );
        gl.uniform_1_f32(program.loc_intensity.as_ref(), intensity);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
    }

    if let Some(color_map) = color_map {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0) };
        if resolve_gl_texture(state, color_map, None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { gl.uniform_1_i32(program.loc_color_map.as_ref(), 0) };
        }
    }
}

fn build_define_source(key: &GlUnlitDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines += "#define ALPHA_MASK\n";
    }
    if key.has_color_map {
        defines += "#define HAS_COLOR_MAP\n";
    }
    if key.has_uv_transform {
        defines += "#define HAS_UV_TRANSFORM\n";
    }
    if key.vertex_color {
        defines += "#define VERTEX_COLOR\n";
    }
    if key.has_skin == Some(true) {
        defines += "#define HAS_SKIN\n";
    }
    if key.has_instances == Some(true) {
        defines += "#define HAS_INSTANCES\n";
    }
    return defines;
}

// A short, stable, order-independent string identity for an unlit define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
pub fn build_gl_unlit_define_key(key: &GlUnlitDefineKey) -> String {
    let flag = |on: bool, mark: &'static str| -> &'static str {
        return if on { mark } else { "-" };
    };
    return format!(
        "{}{}{}{}{}{}",
        flag(key.alpha_mask_enabled, "m"),
        flag(key.has_color_map, "c"),
        flag(key.vertex_color, "v"),
        flag(key.has_uv_transform, "u"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
}

// Compiles the unlit shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensure_gl_unlit_program. `skin_declarations_glsl` is the HAS_SKIN vertex
// declarations supplied by the registered skinning capability; empty when skinning is not registered,
// which is also when key.has_skin is false.
pub fn compile_gl_unlit_program(
    gl: &glow::Context,
    key: &GlUnlitDefineKey,
    skin_declarations_glsl: Option<&str>,
) -> GlUnlitProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_unlit_vertex_source_for_key(key, skin_declarations_glsl),
        &get_gl_unlit_fragment_source_for_key(key),
    );
    let mut mesh = create_gl_mesh_program_record(program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        let loc_alpha_cutoff = gl.get_uniform_location(program, "u_alphaCutoff");
        let loc_color = gl.get_uniform_location(program, "u_color");
        let loc_color_map = gl.get_uniform_location(program, "u_colorMap");
        let loc_intensity = gl.get_uniform_location(program, "u_intensity");
        mesh.loc_joint_normal_texture = Cell::new(Some(
            gl.get_uniform_location(program, "u_jointNormalTexture"),
        ));
        mesh.loc_joint_texture =
            Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        mesh.loc_model = gl.get_uniform_location(program, "u_model");
        mesh.loc_normal_matrix = None;
        mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlUnlitProgram {
            mesh,
            loc_alpha_cutoff,
            loc_color,
            loc_color_map,
            loc_intensity,
        };
    }
}

// Resolves the unlit program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `unlit:` family namespace.
pub fn ensure_gl_unlit_program(
    state: &GlRenderState,
    key: &GlUnlitDefineKey,
) -> Rc<GlUnlitProgram> {
    // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
    // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
    let (full_key, skin_declarations_glsl) = {
        let runtime = get_gl_scene3d_runtime(state);
        let mut full_key = key.clone();
        full_key.has_instances = Some(runtime.active_instanced_run);
        full_key.has_skin = Some(runtime.active_skinned_run);
        let skin = runtime
            .mesh_skin_feature
            .map_or("", |feature| feature.vertex_declarations_glsl);
        (full_key, skin)
    };
    return ensure_gl_scene3d_program(
        state,
        &format!("unlit:{}", build_gl_unlit_define_key(&full_key)),
        |gl| {
            return compile_gl_unlit_program(gl, &full_key, Some(skin_declarations_glsl));
        },
    );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_unlit_fragment_source_for_key(key: &GlUnlitDefineKey) -> String {
    return build_define_source(key) + UNLIT_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_unlit_vertex_source_for_key(
    key: &GlUnlitDefineKey,
    skin_declarations_glsl: Option<&str>,
) -> String {
    let skin = if key.has_skin == Some(true) {
        skin_declarations_glsl.unwrap_or("")
    } else {
        ""
    };
    let instances = if key.has_instances == Some(true) {
        GL_INSTANCE_VERTEX_DECLARATIONS_GLSL
    } else {
        ""
    };
    return build_define_source(key) + skin + instances + UNLIT_VERTEX_BODY;
}

macro_rules! unlit_vertex_body_glsl {
    () => {
        concat!(r#"#ifdef HAS_INSTANCES
// Per-instance tint, fetched once in the vertex stage and interpolated flat across the primitive.
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 3) in vec2 a_uv0;
#ifdef VERTEX_COLOR
layout(location = 4) in vec4 a_color0;
out vec4 v_color0;
#endif

uniform mat4 u_viewProjection;
uniform mat4 u_model;
"#, gl_uv_transform_vertex_glsl!(), r#"
out vec2 v_uv0;

void main() {
#ifdef HAS_INSTANCES
  v_instanceColor = instanceColor();
#endif
  v_uv0 = applyUvTransform(a_uv0);
#ifdef VERTEX_COLOR
  v_color0 = a_color0;
#endif
#ifdef HAS_INSTANCES
  gl_Position = u_viewProjection * u_model * instanceModelMatrix() * vec4(a_position, 1.0);
#elif defined(HAS_SKIN)
  gl_Position = u_viewProjection * u_model * skinMatrix() * vec4(a_position, 1.0);
#else
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
#endif
}
"#)
    };
}
const UNLIT_VERTEX_BODY: &str = unlit_vertex_body_glsl!();

macro_rules! unlit_fragment_body_glsl {
    () => {
        concat!(
            r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec2 v_uv0;
#ifdef VERTEX_COLOR
in vec4 v_color0;
#endif

uniform vec4 u_color;
uniform float u_intensity;
#ifdef HAS_COLOR_MAP
uniform sampler2D u_colorMap;
#endif
#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

"#,
            gl_mesh_fragment_tail_uniforms_glsl!(),
            r#"

out vec4 fragColor;

// Texture.colorSpace selects the GPU format, so sampled color is already linear here.
void main() {
  vec4 color = u_color;
#ifdef HAS_INSTANCES
  color *= v_instanceColor;
#endif
#ifdef VERTEX_COLOR
  color *= v_color0;
#endif
#ifdef HAS_COLOR_MAP
  vec4 sampled = texture(u_colorMap, v_uv0);
  color.rgb *= sampled.rgb;
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
  color.a = 1.0;
#endif
  fragColor = vec4(color.rgb * u_intensity, color.a);
"#,
            gl_mesh_fragment_tail_glsl!(),
            r#"
}
"#
        )
    };
}
const UNLIT_FRAGMENT_BODY: &str = unlit_fragment_body_glsl!();
