// flight-lint: allow-file(contract-vocabulary) D17 classic program compile drives glow native handles over thread-bound render-gl state

use std::cell::Cell;
use std::rc::Rc;

use flight_lighting::MAX_FORWARD_LIGHTS;
use flight_render_gl::{
    GlColorAdjustmentMaterialFeature, GlRenderState, get_gl_color_adjustment_material_feature,
};
use glow::HasContext;

use crate::gl_lit_program::{gl_mesh_light_block_glsl, resolve_gl_lit_locations};
use crate::gl_mesh_fragment_tail::{gl_mesh_fragment_tail_glsl, gl_mesh_fragment_tail_uniforms_glsl};
use crate::gl_mesh_program::{
    GL_INSTANCE_VERTEX_DECLARATIONS_GLSL, compile_gl_program, ensure_gl_scene3d_program,
    gl_uv_transform_vertex_glsl,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlClassicDefineKey, GlClassicLightingModel, GlClassicProgram};

// A short, stable, order-independent string identity for a classic define key, used as the program-
// cache key. The lighting model is encoded first (l/p/b) so the three models never collide, followed
// by the feature flags. Two keys with the same model + flags produce the same string and so share a
// compiled program.
pub fn build_gl_classic_define_key(key: &GlClassicDefineKey) -> String {
    let model = match key.lighting_model {
        GlClassicLightingModel::Phong => "p",
        GlClassicLightingModel::BlinnPhong => "b",
        GlClassicLightingModel::Lambert => "l",
    };
    let flag = |on: bool, mark: &'static str| -> &'static str {
        return if on { mark } else { "-" };
    };
    let color = if key.has_color_matrix == Some(true) {
        "x"
    } else if key.has_color_adjustment == Some(true) {
        "c"
    } else {
        ""
    };
    return format!(
        "{model}{}{}{}{}{}{}{}{}{color}",
        flag(key.alpha_mask_enabled, "m"),
        flag(key.has_diffuse_map, "d"),
        flag(key.has_specular_map, "s"),
        flag(key.has_normal_map, "n"),
        flag(key.has_alpha_map, "a"),
        flag(key.has_uv_transform, "u"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
}

// Compiles the classic uber-shader for a define key, links it, and resolves its uniform locations.
// Pure GL work — no caching — used by ensure_gl_classic_program. Panics (TS throws) on a compile/link
// failure, which is a programmer error (a malformed prelude), not an expected runtime condition.
// `skin_declarations_glsl` is the HAS_SKIN vertex declarations supplied by the registered skinning
// capability; empty when skinning is not registered, which is also when key.has_skin is false.
pub fn compile_gl_classic_program(
    gl: &glow::Context,
    key: &GlClassicDefineKey,
    color_adjustment_feature: Option<&GlColorAdjustmentMaterialFeature>,
    skin_declarations_glsl: Option<&str>,
) -> GlClassicProgram {
    let vertex_source = get_gl_classic_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_classic_fragment_source_for_key(key, color_adjustment_feature);
    let program = compile_gl_program(gl, &vertex_source, &fragment_source);
    let mut lit = resolve_gl_lit_locations(gl, program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        lit.mesh.loc_joint_normal_texture =
            Cell::new(Some(gl.get_uniform_location(program, "u_jointNormalTexture")));
        lit.mesh.loc_joint_texture = Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        lit.mesh.loc_model = gl.get_uniform_location(program, "u_model");
        lit.mesh.loc_normal_matrix = gl.get_uniform_location(program, "u_normalMatrix");
        lit.mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlClassicProgram {
            lit,
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_alpha_map: gl.get_uniform_location(program, "u_alphaMap"),
            loc_diffuse: gl.get_uniform_location(program, "u_diffuse"),
            loc_diffuse_map: gl.get_uniform_location(program, "u_diffuseMap"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            loc_shininess: gl.get_uniform_location(program, "u_shininess"),
            loc_specular: gl.get_uniform_location(program, "u_specular"),
            loc_specular_map: gl.get_uniform_location(program, "u_specularMap"),
        };
    }
}

// Resolves the classic program for a define key, compiling and caching it on first use through the
// shared scene program cache under the `classic:` family namespace, so each model + feature variant
// is compiled at most once per state and reused every frame.
pub fn ensure_gl_classic_program(state: &GlRenderState, key: &GlClassicDefineKey) -> Rc<GlClassicProgram> {
    // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
    // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
    let (full_key, skin_declarations_glsl) = {
        let runtime = get_gl_scene3d_runtime(state);
        let mut full_key = key.clone();
        full_key.has_color_adjustment = Some(runtime.active_color_adjustment_run);
        full_key.has_color_matrix = Some(runtime.active_color_matrix_run);
        full_key.has_instances = Some(runtime.active_instanced_run);
        full_key.has_skin = Some(runtime.active_skinned_run);
        let skin = runtime
            .mesh_skin_feature
            .map_or("", |feature| feature.vertex_declarations_glsl);
        (full_key, skin)
    };
    let color_adjustment_feature = get_gl_color_adjustment_material_feature(state);
    return ensure_gl_scene3d_program(
        state,
        &format!("classic:{}", build_gl_classic_define_key(&full_key)),
        |gl| {
            return compile_gl_classic_program(
                gl,
                &full_key,
                color_adjustment_feature,
                Some(skin_declarations_glsl),
            );
        },
    );
}

// The fragment shader body (everything after the "#version 300 es" + defines block). Implements the
// classic Lambert diffuse term plus an optional Phong / BlinnPhong specular lobe over one directional
// + one ambient light, and writes linear HDR radiance to fragColor.
pub fn get_gl_classic_fragment_source() -> String {
    return CLASSIC_FRAGMENT_BODY.to_string();
}

// The full fragment source for a define key (define block + body), ready to hand to the GL compiler.
pub fn get_gl_classic_fragment_source_for_key(
    key: &GlClassicDefineKey,
    color_adjustment_feature: Option<&GlColorAdjustmentMaterialFeature>,
) -> String {
    let mut body = CLASSIC_FRAGMENT_BODY.to_string();
    let has_color_matrix = key.has_color_matrix == Some(true);
    if (key.has_color_adjustment == Some(true) || has_color_matrix)
        && let Some(feature) = color_adjustment_feature
    {
        let chunk = if has_color_matrix {
            feature.matrix_fragment_shader_chunk
        } else {
            feature.fragment_shader_chunk
        };
        body = body.replacen(
            "precision highp float;",
            &format!("precision highp float;\n{chunk}"),
            1,
        );
    }
    return build_gl_classic_define_source(key) + &body;
}

// The vertex shader body (everything after the "#version 300 es" + defines block). Transforms the
// canonical mesh vertex (position/normal/tangent/uv0) by the model and view-projection matrices and
// passes world-space position, normal, tangent, and uv to the fragment stage — the same vertex shape
// as the PBR family.
pub fn get_gl_classic_vertex_source() -> String {
    return CLASSIC_VERTEX_BODY.to_string();
}

// The full vertex source for a define key (define block + optional skin declarations + body), ready to
// hand to the GL compiler. The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment
// shader), so it is spliced here rather than into the shared define block.
pub fn get_gl_classic_vertex_source_for_key(
    key: &GlClassicDefineKey,
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
    return build_gl_classic_define_source(key) + skin + instances + CLASSIC_VERTEX_BODY;
}

// Builds the leading "#version 300 es\n#define ..." block for a classic define key, to be prepended
// to the vertex and fragment prelude bodies before compile. Pure string assembly; the same key always
// yields the same source, which is what makes the program cache by define key sound.
fn build_gl_classic_define_source(key: &GlClassicDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {MAX_FORWARD_LIGHTS}\n");
    if key.lighting_model == GlClassicLightingModel::Phong {
        defines += "#define LIGHTING_PHONG\n";
    }
    if key.lighting_model == GlClassicLightingModel::BlinnPhong {
        defines += "#define LIGHTING_BLINNPHONG\n";
    }
    if key.alpha_mask_enabled {
        defines += "#define ALPHA_MASK\n";
    }
    if key.has_diffuse_map {
        defines += "#define HAS_DIFFUSE_MAP\n";
    }
    if key.has_specular_map {
        defines += "#define HAS_SPECULAR_MAP\n";
    }
    if key.has_normal_map {
        defines += "#define HAS_NORMAL_MAP\n";
    }
    if key.has_alpha_map {
        defines += "#define HAS_ALPHA_MAP\n";
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
    if key.has_color_matrix == Some(true) {
        defines += "#define HAS_COLOR_MATRIX\n";
    } else if key.has_color_adjustment == Some(true) {
        defines += "#define HAS_COLOR_ADJUSTMENT\n";
    }
    return defines;
}

macro_rules! classic_vertex_body_glsl {
    () => {
        concat!(r#"#ifdef HAS_INSTANCES
// Per-instance tint, fetched once in the vertex stage and interpolated flat across the primitive.
flat out vec4 v_instanceColor;
#endif

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;

uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
"#, gl_uv_transform_vertex_glsl!(), r#"
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

void main() {
#ifdef HAS_INSTANCES
  v_instanceColor = instanceColor();
#endif
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
  mat3 modelRotation = mat3(u_model);
#endif
  // A tangent is a TRUE SURFACE VECTOR and follows the model matrix, the same one a position
  // follows. Only the normal is a covector needing the inverse-transpose. The two agree under
  // rotation and uniform scale, which is why sharing u_normalMatrix looked correct, and diverge
  // under non-uniform scale, tilting the tangent off the surface it is supposed to lie in.
  // tangent.w is HANDEDNESS, and a model transform that mirrors (negative determinant) reverses it:
  // the bitangent is rebuilt as w * cross(N, T), so without this the whole frame is flipped on every
  // mirrored instance. Guarded rather than sign(), because sign() returns 0 for a singular matrix
  // and a zero w collapses the bitangent entirely — a worse failure than keeping the original hand.
  float tangentHandedness = a_tangent.w * (determinant(modelRotation) < 0.0 ? -1.0 : 1.0);
  v_tangent = vec4(modelRotation * localTangent, tangentHandedness);
  v_uv0 = applyUvTransform(a_uv0);
  gl_Position = u_viewProjection * worldPosition;
}
"#)
    };
}
const CLASSIC_VERTEX_BODY: &str = classic_vertex_body_glsl!();

// LIGHTING_PHONG / LIGHTING_BLINNPHONG select the specular geometry; neither define = Lambert (no
// specular branch). u_specular / u_shininess / u_normalMap / u_normalScale exist only when a specular
// model is compiled in, so they are guarded by the same #ifdef as their use.
macro_rules! classic_fragment_body_glsl {
    () => {
        concat!(r#"
precision highp float;
#ifdef HAS_INSTANCES
flat in vec4 v_instanceColor;
#endif

in vec3 v_worldPosition;
in vec3 v_normal;
in vec4 v_tangent;
in vec2 v_uv0;

uniform vec4 u_diffuse;
uniform float u_alphaCutoff;
#ifdef HAS_COLOR_MATRIX
uniform vec4 u_flightColorMatrix0;
uniform vec4 u_flightColorMatrix1;
uniform vec4 u_flightColorMatrix2;
uniform vec4 u_flightColorMatrix3;
uniform vec4 u_flightColorMatrixOffset;
#elif defined(HAS_COLOR_ADJUSTMENT)
uniform vec4 u_flightColorScale;
uniform vec4 u_flightColorBias;
#endif
"#, gl_mesh_light_block_glsl!(), r#"
#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
#endif

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#ifdef HAS_ALPHA_MAP
uniform sampler2D u_alphaMap;
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

// The classic shading for ONE light: Lambert diffuse plus the optional Phong/BlinnPhong specular
// lobe. Every light type (directional, point, spot) routes through this one BRDF so they never fork
// the shading model — the caller supplies the surface->light direction and the light's (attenuated,
// cone-scaled) radiance. Specular reads the view vector and material specular/shininess from globals.
vec3 shadeClassicLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb) {
  float nDotL = max(dot(normal, lightDir), 0.0);
  vec3 result = diffuseRgb * nDotL * lightColor;
#if defined(LIGHTING_PHONG) || defined(LIGHTING_BLINNPHONG)
  if (nDotL > 0.0) {
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    vec3 specularColor = u_specular.rgb;
  #ifdef HAS_SPECULAR_MAP
    specularColor *= texture(u_specularMap, v_uv0).rgb;
  #endif
  #ifdef LIGHTING_PHONG
    // Phong: reflection-vector specular.
    vec3 reflectDir = reflect(-lightDir, normal);
    float specAngle = max(dot(reflectDir, viewDir), 0.0);
  #else
    // BlinnPhong: half-vector specular.
    vec3 halfVec = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfVec), 0.0);
  #endif
    float specular = pow(specAngle, max(u_shininess, 1.0));
    result += specular * specularColor * lightColor;
  }
#endif
  return result;
}

void main() {
  vec4 diffuse = u_diffuse;
#ifdef HAS_INSTANCES
  diffuse *= v_instanceColor;
#endif
#ifdef HAS_DIFFUSE_MAP
  vec4 sampledDiffuse = texture(u_diffuseMap, v_uv0);
  diffuse.rgb *= sampledDiffuse.rgb;
  diffuse.a *= sampledDiffuse.a;
#endif

  // Dedicated coverage (opacity) map: its green channel is linear data, multiplied into alpha before
  // the alpha-mask cutoff so 'mask' cutout and 'blend' transparency both see the combined coverage.
#ifdef HAS_ALPHA_MAP
  diffuse.a *= texture(u_alphaMap, v_uv0).g;
#endif

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
  diffuse.a = 1.0;
#endif

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

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // Only the directional term is shadow-mapped (mirrors the PBR path); point/spot/ambient stay unshadowed.
  // sampleDirectionalShadow returns 1.0 when no shadow map is bound (u_shadowEnabled == 0), so a classic
  // scene that never calls renderGlScene3DShadowMap is unchanged.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    radiance += shadeClassicLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb)
                * sampleDirectionalShadow(v_worldPosition, geometricNormal);
  }

  // Point lights: surface->light direction with a smooth inverse-square range falloff.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeClassicLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb);
  }

  // Spot lights: point attenuation times a smooth cone falloff between the inner/outer cosines.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_spotCount) break;
    vec3 toLight = u_spotLights[i * 4 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_spotLights[i * 4 + 1].w) / max(dist2, 1e-4);
    float cone = smoothstep(u_spotLights[i * 4 + 3].y, u_spotLights[i * 4 + 3].x,
                            dot(normalize(u_spotLights[i * 4 + 2].xyz), -lightDir));
    radiance += shadeClassicLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb);
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (u_ambientCount > 0.5) {
    radiance += diffuse.rgb * u_ambientRadiance;
  }

  // Hemisphere fill: sky/ground gradient blended by the normal's vertical component.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_hemisphereCount) break;
    float f = 0.5 + 0.5 * dot(normal, u_hemisphereLights[i * 3 + 2].xyz);
    radiance += mix(u_hemisphereLights[i * 3 + 1].rgb, u_hemisphereLights[i * 3 + 0].rgb, f) * diffuse.rgb;
  }

  fragColor = vec4(radiance, diffuse.a);
#ifdef HAS_COLOR_MATRIX
  fragColor = applyFlightColorMatrix(fragColor, u_flightColorMatrix0, u_flightColorMatrix1,
    u_flightColorMatrix2, u_flightColorMatrix3, u_flightColorMatrixOffset);
#elif defined(HAS_COLOR_ADJUSTMENT)
  fragColor = applyFlightColorAdjustment(fragColor, u_flightColorScale, u_flightColorBias);
#endif
"#, gl_mesh_fragment_tail_glsl!(), r#"
}
"#)
    };
}
const CLASSIC_FRAGMENT_BODY: &str = classic_fragment_body_glsl!();

