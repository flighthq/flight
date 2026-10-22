// flight-lint: allow-file(contract-vocabulary) D17 matcap program compile and bind drive glow native handles over thread-bound render-gl state

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
    ensure_gl_scene3d_program,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMatcapDefineKey, GlMatcapProgram};

// Uploads the resolved matcap surface uniforms: the linear tint (already sRgb-decoded on the CPU), the
// optional matcap texture on texture unit 0, and the alpha-mask cutoff. The caller has already
// selected the program (begin_gl_mesh_draw), set the view-projection, and uploaded u_view.
pub fn bind_gl_matcap_surface(
    state: &mut GlRenderState,
    program: &GlMatcapProgram,
    tint: &LinearColor,
    matcap: Option<&Texture>,
    alpha_cutoff: f32,
) {
    let gl = state.gl.clone();
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_4_f32(program.loc_tint.as_ref(), tint.r, tint.g, tint.b, tint.a);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
    }

    if let Some(matcap) = matcap {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0) };
        if resolve_gl_texture(state, matcap, None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { gl.uniform_1_i32(program.loc_matcap.as_ref(), 0) };
        }
    }
}

fn build_define_source(key: &GlMatcapDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines += "#define ALPHA_MASK\n";
    }
    if key.has_matcap {
        defines += "#define HAS_MATCAP\n";
    }
    if key.has_skin == Some(true) {
        defines += "#define HAS_SKIN\n";
    }
    if key.has_instances == Some(true) {
        defines += "#define HAS_INSTANCES\n";
    }
    return defines;
}

// A short, stable, order-independent string identity for a matcap define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
pub fn build_gl_matcap_define_key(key: &GlMatcapDefineKey) -> String {
    let flag = |on: bool, mark: &'static str| -> &'static str {
        return if on { mark } else { "-" };
    };
    return format!(
        "{}{}{}{}",
        flag(key.alpha_mask_enabled, "m"),
        flag(key.has_matcap, "t"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
}

// Compiles the matcap shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensure_gl_matcap_program. `skin_declarations_glsl` is the HAS_SKIN vertex
// declarations supplied by the registered skinning capability; empty when skinning is not registered,
// which is also when key.has_skin is false.
pub fn compile_gl_matcap_program(
    gl: &glow::Context,
    key: &GlMatcapDefineKey,
    skin_declarations_glsl: Option<&str>,
) -> GlMatcapProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_matcap_vertex_source_for_key(key, skin_declarations_glsl),
        &get_gl_matcap_fragment_source_for_key(key),
    );
    let mut mesh = create_gl_mesh_program_record(program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        let loc_alpha_cutoff = gl.get_uniform_location(program, "u_alphaCutoff");
        mesh.loc_joint_normal_texture = Cell::new(Some(
            gl.get_uniform_location(program, "u_jointNormalTexture"),
        ));
        mesh.loc_joint_texture =
            Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        let loc_matcap = gl.get_uniform_location(program, "u_matcap");
        mesh.loc_model = gl.get_uniform_location(program, "u_model");
        mesh.loc_normal_matrix = gl.get_uniform_location(program, "u_normalMatrix");
        let loc_tint = gl.get_uniform_location(program, "u_tint");
        let loc_view = gl.get_uniform_location(program, "u_view");
        mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlMatcapProgram {
            mesh,
            loc_alpha_cutoff,
            loc_matcap,
            loc_tint,
            loc_view,
        };
    }
}

// Resolves the matcap program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `matcap:` family namespace.
pub fn ensure_gl_matcap_program(
    state: &GlRenderState,
    key: &GlMatcapDefineKey,
) -> Rc<GlMatcapProgram> {
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
        &format!("matcap:{}", build_gl_matcap_define_key(&full_key)),
        |gl| {
            return compile_gl_matcap_program(gl, &full_key, Some(skin_declarations_glsl));
        },
    );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_matcap_fragment_source_for_key(key: &GlMatcapDefineKey) -> String {
    return build_define_source(key) + MATCAP_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_matcap_vertex_source_for_key(
    key: &GlMatcapDefineKey,
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
    return build_define_source(key) + skin + instances + MATCAP_VERTEX_BODY;
}

macro_rules! matcap_vertex_body_glsl {
    () => {
        concat!(r#"#ifdef HAS_INSTANCES
// Per-instance tint, fetched once in the vertex stage and interpolated flat across the primitive.
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat3 u_normalMatrix;

out vec3 v_viewNormal;

void main() {
#ifdef HAS_INSTANCES
  v_instanceColor = instanceColor();
#endif
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = skinNormalMatrix() * a_normal;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
#endif
#ifdef HAS_INSTANCES
  mat4 instanceModel = u_model * instanceModelMatrix();
  vec4 worldPosition = instanceModel * localPosition;
  // mat3(instanceModel) approximates the normal transform for instanced draws (correct under
  // rotation and uniform scale — non-uniform per-instance scale would need the inverse-transpose,
  // which the instance buffer does not carry).
  v_viewNormal = mat3(u_view) * (mat3(instanceModel) * localNormal);
#else
  vec4 worldPosition = u_model * localPosition;
  // u_normalMatrix takes the object normal into world space (handles model rotation/scale);
  // mat3(u_view) rotates it into view space. Normalized in the fragment scene2d.
  v_viewNormal = mat3(u_view) * (u_normalMatrix * localNormal);
#endif
  gl_Position = u_viewProjection * worldPosition;
}
"#)
    };
}
const MATCAP_VERTEX_BODY: &str = matcap_vertex_body_glsl!();

macro_rules! matcap_fragment_body_glsl {
    () => {
        concat!(r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec3 v_viewNormal;

uniform vec4 u_tint;
#ifdef HAS_MATCAP
uniform sampler2D u_matcap;
#endif
#ifdef ALPHA_MASK
uniform float u_alphaCutoff;
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

// Texture.colorSpace selects the GPU format, so sampled matcap color is already linear here.
void main() {
  vec4 color = u_tint;
#ifdef HAS_INSTANCES
  color *= v_instanceColor;
#endif
#ifdef HAS_MATCAP
  // The view-space normal projected to 2D indexes the prebaked-lit sphere: uv = n.xy * 0.5 + 0.5.
  vec3 viewNormal = normalize(v_viewNormal);
  vec2 matcapUv = viewNormal.xy * 0.5 + 0.5;
  vec4 sampled = texture(u_matcap, matcapUv);
  color.rgb *= sampled.rgb;
  color.a *= sampled.a;
#endif
#ifdef ALPHA_MASK
  if (color.a < u_alphaCutoff) discard;
  color.a = 1.0;
#endif
  fragColor = color;
"#, gl_mesh_fragment_tail_glsl!(), r#"
}
"#)
    };
}
const MATCAP_FRAGMENT_BODY: &str = matcap_fragment_body_glsl!();
