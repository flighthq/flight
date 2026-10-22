// flight-lint: allow-file(contract-vocabulary) D17 toon program compile drives glow native handles over thread-bound render-gl state

use std::cell::Cell;
use std::rc::Rc;

use flight_lighting::MAX_FORWARD_LIGHTS;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::{gl_mesh_light_block_glsl, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{
    gl_mesh_fragment_tail_glsl, gl_mesh_fragment_tail_uniforms_glsl,
};
use crate::gl_mesh_program::{
    GL_INSTANCE_VERTEX_DECLARATIONS_GLSL, compile_gl_program, ensure_gl_scene3d_program,
    gl_uv_transform_vertex_glsl,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlToonDefineKey, GlToonProgram};

// A short, stable, order-independent string identity for a Toon define key, used as the program-
// cache key. Two keys with the same flags produce the same string and so share a compiled program.
pub fn build_gl_toon_define_key(key: &GlToonDefineKey) -> String {
    let flag = |on: bool, mark: &'static str| -> &'static str {
        return if on { mark } else { "-" };
    };
    return format!(
        "{}{}{}{}{}{}",
        flag(key.alpha_mask_enabled, "m"),
        flag(key.has_base_color_map, "b"),
        flag(key.has_ramp, "r"),
        flag(key.has_uv_transform, "u"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
}

// Builds the leading "#version 300 es\n#define ..." block for a define key, to be prepended to the
// vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
fn build_gl_toon_define_source(key: &GlToonDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {MAX_FORWARD_LIGHTS}\n");
    if key.alpha_mask_enabled {
        defines += "#define ALPHA_MASK\n";
    }
    if key.has_base_color_map {
        defines += "#define HAS_BASE_COLOR_MAP\n";
    }
    if key.has_ramp {
        defines += "#define HAS_RAMP\n";
    }
    if key.has_uv_transform {
        defines += "#define HAS_UV_TRANSFORM\n";
    }
    if key.has_skin == Some(true) {
        defines += "#define HAS_SKIN\n";
    }
    if key.has_instances == Some(true) {
        defines += "#define HAS_INSTANCES\n";
    }
    return defines;
}

// Compiles the Toon uber-shader for a define key, links it, and resolves its uniform locations.
// Composes the standard lit locations (resolve_gl_lit_locations) then adds the Toon material uniforms
// plus the shared model/normal/view-projection vertex transforms. Pure GL work — no caching — used
// by ensure_gl_toon_program. Panics (TS throws) on a compile/link failure, which is a programmer error
// (a malformed prelude), not an expected runtime condition. `skin_declarations_glsl` is the HAS_SKIN
// vertex declarations supplied by the registered skinning capability; empty when skinning is not
// registered, which is also when key.has_skin is false.
pub fn compile_gl_toon_program(
    gl: &glow::Context,
    key: &GlToonDefineKey,
    skin_declarations_glsl: Option<&str>,
) -> GlToonProgram {
    let program = compile_gl_program(
        gl,
        &get_gl_toon_vertex_source_for_key(key, skin_declarations_glsl),
        &get_gl_toon_fragment_source_for_key(key),
    );
    let mut lit = resolve_gl_lit_locations(gl, program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        lit.mesh.loc_joint_normal_texture = Cell::new(Some(
            gl.get_uniform_location(program, "u_jointNormalTexture"),
        ));
        lit.mesh.loc_joint_texture =
            Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        lit.mesh.loc_model = gl.get_uniform_location(program, "u_model");
        lit.mesh.loc_normal_matrix = gl.get_uniform_location(program, "u_normalMatrix");
        lit.mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlToonProgram {
            lit,
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_base_color: gl.get_uniform_location(program, "u_baseColor"),
            loc_base_color_map: gl.get_uniform_location(program, "u_baseColorMap"),
            loc_ramp: gl.get_uniform_location(program, "u_ramp"),
            loc_steps: gl.get_uniform_location(program, "u_steps"),
        };
    }
}

// Resolves the Toon program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `toon:` family namespace, so each variant is compiled at most
// once per state and reused every frame.
pub fn ensure_gl_toon_program(state: &GlRenderState, key: &GlToonDefineKey) -> Rc<GlToonProgram> {
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
        &format!("toon:{}", build_gl_toon_define_key(&full_key)),
        |gl| {
            return compile_gl_toon_program(gl, &full_key, Some(skin_declarations_glsl));
        },
    );
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_toon_fragment_source_for_key(key: &GlToonDefineKey) -> String {
    return build_gl_toon_define_source(key) + TOON_FRAGMENT_BODY;
}

// The full vertex source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_toon_vertex_source_for_key(
    key: &GlToonDefineKey,
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
    return build_gl_toon_define_source(key) + skin + instances + TOON_VERTEX_BODY;
}

macro_rules! toon_vertex_body_glsl {
    () => {
        concat!(r#"#ifdef HAS_INSTANCES
// Per-instance tint, fetched once in the vertex stage and interpolated flat across the primitive.
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
"#, gl_uv_transform_vertex_glsl!(), r#"
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_uv0;

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
  v_worldPosition = worldPosition.xyz;
  v_normal = mat3(instanceModel) * localNormal;
#else
  vec4 worldPosition = u_model * localPosition;
  v_worldPosition = worldPosition.xyz;
  v_normal = u_normalMatrix * localNormal;
#endif
  v_uv0 = applyUvTransform(a_uv0);
  gl_Position = u_viewProjection * worldPosition;
}
"#)
    };
}
const TOON_VERTEX_BODY: &str = toon_vertex_body_glsl!();

macro_rules! toon_fragment_body_glsl {
    () => {
        concat!(r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_uv0;

uniform vec4 u_baseColor;   // already linear (decoded on the CPU at bind)
uniform float u_steps;      // band count for the stepped floor quantizer (no ramp)
uniform float u_alphaCutoff;
"#, gl_mesh_light_block_glsl!(), r#"
#ifdef HAS_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef HAS_RAMP
uniform sampler2D u_ramp;
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

void main() {
  vec4 baseColor = u_baseColor;
#ifdef HAS_INSTANCES
  baseColor *= v_instanceColor;
#endif
#ifdef HAS_BASE_COLOR_MAP
  vec4 sampled = texture(u_baseColorMap, v_uv0);
  baseColor.rgb *= sampled.rgb;
  baseColor.a *= sampled.a;
#endif

#ifdef ALPHA_MASK
  if (baseColor.a < u_alphaCutoff) discard;
  baseColor.a = 1.0;
#endif

  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // The raw N·L is quantized into cel bands — via a 1D ramp lookup or a stepped floor — then scales
  // the base color and the directional radiance. The banded contribution is shadow-mapped like the
  // classic/PBR directional term; sampleDirectionalShadow is 1.0 when no shadow map is bound, so a toon
  // scene that never calls renderGlScene3DShadowMap is unchanged.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
#ifdef HAS_RAMP
    vec3 band = texture(u_ramp, vec2(nDotL, 0.5)).rgb;
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#else
    float band = floor(nDotL * u_steps) / max(u_steps, 1.0);
    vec3 direct = baseColor.rgb * band * u_directionalRadiance.rgb;
#endif
    radiance += direct * sampleDirectionalShadow(v_worldPosition, normal);
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (u_ambientCount > 0.5) {
    radiance += baseColor.rgb * u_ambientRadiance;
  }

  fragColor = vec4(radiance, baseColor.a);
"#, gl_mesh_fragment_tail_glsl!(), r#"
}
"#)
    };
}
const TOON_FRAGMENT_BODY: &str = toon_fragment_body_glsl!();
