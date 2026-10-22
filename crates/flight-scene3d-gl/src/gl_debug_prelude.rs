// flight-lint: allow-file(contract-vocabulary) D17 debug program compile and bind drive glow native handles over thread-bound render-gl state

use std::cell::Cell;
use std::rc::Rc;

use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::Texture;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{gl_mesh_fragment_tail_glsl, gl_mesh_fragment_tail_uniforms_glsl};
use crate::gl_mesh_program::{
    GL_INSTANCE_VERTEX_DECLARATIONS_GLSL, compile_gl_program, create_gl_mesh_program_record,
    ensure_gl_scene3d_program,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlDebugProgram};

// Binds the optional tangent-space normal map (on texture unit 0) and its scale for the normal-mode
// debug material. The caller has already selected the program (begin_gl_mesh_draw) and set the
// view-projection. A no-op when no map is bound; depth mode never calls this.
pub fn bind_gl_debug_normal_map(
    state: &mut GlRenderState,
    program: &GlDebugProgram,
    normal_map: Option<&Texture>,
    normal_scale: f32,
) {
    let gl = state.gl.clone();
    // SAFETY: the program is bound on the owning GL thread.
    unsafe { gl.uniform_1_f32(program.loc_normal_scale.as_ref(), normal_scale) };

    if let Some(normal_map) = normal_map {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0) };
        if resolve_gl_texture(state, normal_map, None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { gl.uniform_1_i32(program.loc_normal_map.as_ref(), 0) };
        }
    }
}

// Uploads the depth-mode linearization range (the [near, far] eye-space window mapped to [0, 1]). The
// caller has already selected the program and set the view-projection. Normal mode never calls this.
pub fn bind_gl_debug_range(state: &GlRenderState, program: &GlDebugProgram, near: f32, far: f32) {
    let gl = &state.gl;
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_1_f32(program.loc_near.as_ref(), near);
        gl.uniform_1_f32(program.loc_far.as_ref(), far);
    }
}

fn build_define_source(key: &GlDebugDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.mode == GlDebugMode::Depth {
        defines += "#define DEPTH_MODE\n";
    } else {
        defines += "#define NORMAL_MODE\n";
    }
    if key.has_normal_map {
        defines += "#define HAS_NORMAL_MAP\n";
    }
    if key.has_skin == Some(true) {
        defines += "#define HAS_SKIN\n";
    }
    if key.has_instances == Some(true) {
        defines += "#define HAS_INSTANCES\n";
    }
    return defines;
}

// A short, stable, order-independent string identity for a debug define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
pub fn build_gl_debug_define_key(key: &GlDebugDefineKey) -> String {
    let flag = |on: bool, mark: &'static str| -> &'static str {
        return if on { mark } else { "-" };
    };
    return format!(
        "{}{}{}{}",
        if key.mode == GlDebugMode::Depth { "d" } else { "n" },
        flag(key.has_normal_map, "m"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
}

// Compiles the debug shader for a define key, links it, and resolves its uniform locations. Pure GL
// work — no caching — used by ensure_gl_debug_program. `skin_declarations_glsl` is the HAS_SKIN vertex
// declarations supplied by the registered skinning capability; empty when skinning is not registered,
// which is also when key.has_skin is false.
pub fn compile_gl_debug_program(
    gl: &glow::Context,
    key: &GlDebugDefineKey,
    skin_declarations_glsl: Option<&str>,
) -> GlDebugProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_debug_vertex_source_for_key(key, skin_declarations_glsl),
        &get_gl_debug_fragment_source_for_key(key),
    );
    let mut mesh = create_gl_mesh_program_record(program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        let loc_far = gl.get_uniform_location(program, "u_far");
        mesh.loc_joint_normal_texture = Cell::new(Some(gl.get_uniform_location(program, "u_jointNormalTexture")));
        mesh.loc_joint_texture = Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        mesh.loc_model = gl.get_uniform_location(program, "u_model");
        let loc_near = gl.get_uniform_location(program, "u_near");
        let loc_normal_map = gl.get_uniform_location(program, "u_normalMap");
        mesh.loc_normal_matrix = gl.get_uniform_location(program, "u_normalMatrix");
        let loc_normal_scale = gl.get_uniform_location(program, "u_normalScale");
        let loc_view = gl.get_uniform_location(program, "u_view");
        mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlDebugProgram {
            mesh,
            loc_far,
            loc_near,
            loc_normal_map,
            loc_normal_scale,
            loc_view,
        };
    }
}

// Resolves the debug program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `debug:` family namespace.
pub fn ensure_gl_debug_program(state: &GlRenderState, key: &GlDebugDefineKey) -> Rc<GlDebugProgram> {
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
        &format!("debug:{}", build_gl_debug_define_key(&full_key)),
        |gl| {
            return compile_gl_debug_program(gl, &full_key, Some(skin_declarations_glsl));
        },
    );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_debug_fragment_source_for_key(key: &GlDebugDefineKey) -> String {
    return build_define_source(key) + DEBUG_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_debug_vertex_source_for_key(
    key: &GlDebugDefineKey,
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
    return build_define_source(key) + skin + instances + DEBUG_VERTEX_BODY;
}

macro_rules! debug_vertex_body_glsl {
    () => {
        concat!(r#"
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
#ifdef DEPTH_MODE
uniform mat4 u_view;
#endif

out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;
#ifdef DEPTH_MODE
out float v_viewDepth;
#endif

void main() {
#ifdef HAS_SKIN
  mat4 skin = skinMatrix();
  vec4 localPosition = skin * vec4(a_position, 1.0);
  vec3 localNormal = skinNormalMatrix() * a_normal;
  vec3 localTangent = mat3(skin) * a_tangent.xyz;
#else
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
  vec3 localTangent = a_tangent.xyz;
#endif
#ifdef HAS_INSTANCES
  mat4 instanceModel = u_model * instanceModelMatrix();
  vec4 worldPosition = instanceModel * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = mat3(instanceModel) * localNormal;
  mat3 modelRotation = mat3(instanceModel);
#else
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
  // A tangent is a TRUE SURFACE VECTOR and follows the model matrix, the same one a position
  // follows. Only the normal is a covector needing the inverse-transpose. The two agree under
  // rotation and uniform scale, which is why sharing u_normalMatrix looked correct, and diverge
  // under non-uniform scale, tilting the tangent off the surface it is supposed to lie in.
  // tangent.w is HANDEDNESS, and a model transform that mirrors (negative determinant) reverses it:
  // the bitangent is rebuilt as w * cross(N, T), so without this the whole frame is flipped on every
  // mirrored instance. Guarded rather than sign(), because sign() returns 0 for a singular matrix
  // and a zero w collapses the bitangent entirely — a worse failure than keeping the original hand.
  mat3 modelRotation = mat3(u_model);
#endif
  float tangentHandedness = a_tangent.w * (determinant(modelRotation) < 0.0 ? -1.0 : 1.0);
  v_tangent = vec4(modelRotation * localTangent, tangentHandedness);
  v_uv0 = a_uv0;
#ifdef DEPTH_MODE
  v_viewDepth = -(u_view * worldPosition).z;
#endif
  gl_Position = u_viewProjection * worldPosition;
}
"#)
    };
}
const DEBUG_VERTEX_BODY: &str = debug_vertex_body_glsl!();

macro_rules! debug_fragment_body_glsl {
    () => {
        concat!(r#"
precision highp float;

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

#ifdef DEPTH_MODE
in float v_viewDepth;
uniform float u_near;
uniform float u_far;
#endif
#ifdef NORMAL_MODE
uniform float u_normalScale;
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

void main() {
#ifdef DEPTH_MODE
  // Positive distance along the camera's view axis, computed before projection so perspective and
  // orthographic cameras agree. Map it across the material's visualization window to grayscale.
  float d = clamp((v_viewDepth - u_near) / max(u_far - u_near, 1e-6), 0.0, 1.0);
  fragColor = vec4(vec3(d), 1.0);
#endif
#ifdef NORMAL_MODE
  // Visualize the WORLD-space surface normal (the geometric normal carried through u_normalMatrix).
  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 tangent = normalize(v_tangent.xyz);
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  vec3 tangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_normalScale;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);
  normal = normalize(tbn * tangentNormal);
#endif

  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
#endif
"#, gl_mesh_fragment_tail_glsl!(), r#"
}
"#)
    };
}
const DEBUG_FRAGMENT_BODY: &str = debug_fragment_body_glsl!();
