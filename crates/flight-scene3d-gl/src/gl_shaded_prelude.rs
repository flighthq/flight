// flight-lint: allow-file(contract-vocabulary) D17 shaded program compile drives glow native handles over thread-bound render-gl state; D16 heterogeneous Ref<dyn Modifier> stacks

use std::cell::Cell;
use std::collections::HashSet;
use std::rc::Rc;
use std::sync::PoisonError;

use flight_entity::Ref;
use flight_lighting::MAX_FORWARD_LIGHTS;
use flight_registry::KindMap;
use flight_render_gl::{
    GlColorAdjustmentMaterialFeature, GlModifierSnippet, GlRenderState,
    get_gl_color_adjustment_material_feature,
};
use flight_shading::{
    MODIFIER_SLOT_DIFFUSE, MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL,
    MODIFIER_SLOT_SPECULAR, MODIFIER_SLOT_VERTEX, Modifier, order_modifier_stack,
};
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
use crate::types::{GlShadedDefineKey, GlShadedProgram};

// Assembles the ShadedMaterial fragment body for an ordered modifier stack: each FRAGMENT-slot
// modifier's declarations are collected at the top, and each contribution is injected at the hook for
// its slot (Normal perturbs the normal before lighting, Diffuse/Specular adjust the surface terms,
// Emissive adds self-illumination, Effect post-processes the shaded radiance). Vertex-slot modifiers
// are skipped here — they inject into the vertex body (assemble_gl_shaded_vertex_body). A modifier
// whose kind has no registered GL snippet contributes nothing. An empty stack leaves every hook empty,
// yielding the lean plain-ShadedMaterial variant that pays nothing for modifiers it does not carry.
fn assemble_gl_shaded_fragment_body(
    ordered_modifiers: &[Ref<dyn Modifier>],
    registry: &KindMap<&'static GlModifierSnippet>,
) -> String {
    let mut declarations = String::new();
    let mut normal = String::new();
    let mut diffuse = String::new();
    let mut specular = String::new();
    let mut emissive = String::new();
    let mut effect = String::new();
    for (index, modifier) in ordered_modifiers.iter().enumerate() {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let Some(snippet) =
            resolve_gl_modifier_snippet_source(registry, &modifier.modifier_fields().kind)
        else {
            continue;
        };
        if snippet.slot == MODIFIER_SLOT_VERTEX {
            continue;
        }
        if let Some(declare) = snippet.declarations {
            declarations += &format!("{}\n", declare(&*modifier, index));
        }
        let contribution = format!("{}\n", (snippet.contribution)(&*modifier, index));
        if snippet.slot == MODIFIER_SLOT_NORMAL {
            normal += &contribution;
        } else if snippet.slot == MODIFIER_SLOT_DIFFUSE {
            diffuse += &contribution;
        } else if snippet.slot == MODIFIER_SLOT_SPECULAR {
            specular += &contribution;
        } else if snippet.slot == MODIFIER_SLOT_EMISSIVE {
            emissive += &contribution;
        } else if snippet.slot == MODIFIER_SLOT_EFFECT {
            effect += &contribution;
        }
    }
    return SHADED_FRAGMENT_TEMPLATE
        .replacen(
            "//@DECLARATIONS",
            &dedupe_gl_shaded_declarations(&declarations),
            1,
        )
        .replacen("//@NORMAL", &normal, 1)
        .replacen("//@DIFFUSE", &diffuse, 1)
        .replacen("//@SPECULAR", &specular, 1)
        .replacen("//@EMISSIVE", &emissive, 1)
        .replacen("//@EFFECT", &effect, 1);
}

// Assembles the ShadedMaterial vertex body for an ordered modifier stack: only the VERTEX-slot
// modifiers contribute here (they deform the geometry). Their declarations go at the top-level
// //@VERTEX_DECLARATIONS hook and their contributions at the //@VERTEX hook — after localPosition/
// localNormal are computed (post-skin) but before the model transform, so displacement composes with
// skinning. Non-vertex slots are skipped (they inject into the fragment body). An empty vertex set
// leaves both hooks empty, yielding the plain vertex program.
fn assemble_gl_shaded_vertex_body(
    ordered_modifiers: &[Ref<dyn Modifier>],
    registry: &KindMap<&'static GlModifierSnippet>,
) -> String {
    let mut declarations = String::new();
    let mut vertex = String::new();
    for (index, modifier) in ordered_modifiers.iter().enumerate() {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let Some(snippet) =
            resolve_gl_modifier_snippet_source(registry, &modifier.modifier_fields().kind)
        else {
            continue;
        };
        if snippet.slot != MODIFIER_SLOT_VERTEX {
            continue;
        }
        if let Some(declare) = snippet.declarations {
            declarations += &format!("{}\n", declare(&*modifier, index));
        }
        vertex += &format!("{}\n", (snippet.contribution)(&*modifier, index));
    }
    return SHADED_VERTEX_BODY
        .replacen(
            "//@VERTEX_DECLARATIONS",
            &dedupe_gl_shaded_declarations(&declarations),
            1,
        )
        .replacen("//@VERTEX", &vertex, 1);
}

// The stable program-cache key for a ShadedMaterial variant: the base feature flags joined with the
// modifier stack's define-key. Two materials sharing both the same base flags AND the same modifier
// feature-set produce the same key and share one compiled program (and batch together); a different
// map set OR a different modifier feature-set breaks the batch. `modifier_define_key` follows
// flight_shading's get_modifier_define_key, so cross-slot authoring order never changes it.
pub fn build_gl_shaded_cache_key(key: &GlShadedDefineKey, modifier_define_key: &str) -> String {
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
    let base = format!(
        "{}{}{}{}{}{}{}{color}",
        flag(key.alpha_mask_enabled, "m"),
        flag(key.has_diffuse_map, "d"),
        flag(key.has_specular_map, "s"),
        flag(key.has_normal_map, "n"),
        flag(key.has_uv_transform, "u"),
        flag(key.has_skin == Some(true), "k"),
        flag(key.has_instances == Some(true), "i"),
    );
    return format!("shaded:{base}|{modifier_define_key}");
}

// Builds the leading "#version 300 es\n#define ..." block shared by the vertex and fragment stages
// for a base key. Modifier variants are NOT #defines — they are injected as GLSL by
// assemble_gl_shaded_fragment_body — so only the base map/alpha flags appear here.
fn build_gl_shaded_define_source(key: &GlShadedDefineKey) -> String {
    let mut defines = format!("#version 300 es\n#define MAX_FORWARD_LIGHTS {MAX_FORWARD_LIGHTS}\n");
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

// Compiles the ShadedMaterial uber-shader for a base key and an ORDERED modifier stack: assembles the
// base lit source (reusing GL_MESH_LIGHT_BLOCK_GLSL for lighting — no second light loop) with each
// modifier's GLSL injected at its slot hook, links it, and resolves the base + time uniform
// locations. Pure GL work — no caching — used by ensure_gl_shaded_program. Panics (TS throws) on a
// compile/link failure (a programmer error: a malformed base or modifier snippet), not an expected
// runtime case. `skin_declarations_glsl` is the HAS_SKIN vertex declarations supplied by the
// registered skinning capability; empty when skinning is not registered, which is also when
// key.has_skin is false.
// flight-lint: allow(conform-params) TS also accepts a shading ModifierRegistry whose entries are GL snippets; Rust's ModifierRegistry stores GLSL-free ModifierDefinitions, so only the GL snippet table is representable
pub fn compile_gl_shaded_program(
    gl: &glow::Context,
    key: &GlShadedDefineKey,
    ordered_modifiers: &[Ref<dyn Modifier>],
    registry: &KindMap<&'static GlModifierSnippet>,
    color_adjustment_feature: Option<&GlColorAdjustmentMaterialFeature>,
    skin_declarations_glsl: Option<&str>,
) -> GlShadedProgram {
    let define_source = build_gl_shaded_define_source(key);
    // The skin GLSL is vertex-only (its `in` attributes are illegal in a fragment shader), so it is
    // spliced into the vertex source alone, never the fragment. The Vertex-slot modifiers are likewise
    // vertex-only — they deform the geometry — so they inject into the vertex body, not the fragment.
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
    let vertex_source = define_source.clone()
        + skin
        + instances
        + &assemble_gl_shaded_vertex_body(ordered_modifiers, registry);
    let mut fragment_body = assemble_gl_shaded_fragment_body(ordered_modifiers, registry);
    let has_color_matrix = key.has_color_matrix == Some(true);
    if (key.has_color_adjustment == Some(true) || has_color_matrix)
        && let Some(feature) = color_adjustment_feature
    {
        let chunk = if has_color_matrix {
            feature.matrix_fragment_shader_chunk
        } else {
            feature.fragment_shader_chunk
        };
        fragment_body = fragment_body.replacen(
            "precision highp float;",
            &format!("precision highp float;\n{chunk}"),
            1,
        );
    }
    let fragment_source = define_source + &fragment_body;
    let program = compile_gl_program(gl, &vertex_source, &fragment_source);
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
        return GlShadedProgram {
            lit,
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_diffuse: gl.get_uniform_location(program, "u_diffuse"),
            loc_diffuse_map: gl.get_uniform_location(program, "u_diffuseMap"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            loc_shininess: gl.get_uniform_location(program, "u_shininess"),
            loc_specular: gl.get_uniform_location(program, "u_specular"),
            loc_specular_map: gl.get_uniform_location(program, "u_specularMap"),
            loc_time: gl.get_uniform_location(program, "u_time"),
        };
    }
}

// Collapses duplicate declaration lines in an assembled modifier declaration block, preserving the
// order of first appearance and dropping later exact repeats. Per-instance uniforms are unique (each
// name carries its stack-index suffix, e.g. `u_fogColor_2`), so they always survive; the SHARED
// un-suffixed lines a snippet declares — the IBL environment samplers an env-reflect modifier reads,
// or the value-noise helper a procedural dissolve declares — collapse to one when two modifiers of the
// same kind appear in one stack, avoiding a GLSL redefinition error. Blank lines are kept verbatim so
// helper-function bodies (whose braces span lines) stay intact.
fn dedupe_gl_shaded_declarations(declarations: &str) -> String {
    let mut seen: HashSet<String> = HashSet::new();
    let mut result = String::new();
    for line in declarations.split('\n') {
        let trimmed = line.trim();
        let is_shared_declaration =
            trimmed.starts_with("uniform ") && !has_gl_stack_index_suffix(trimmed);
        if is_shared_declaration {
            if seen.contains(trimmed) {
                continue;
            }
            seen.insert(trimmed.to_string());
        }
        result += line;
        result += "\n";
    }
    return result;
}

// Resolves the ShadedMaterial program for a base key and modifier stack, compiling and caching it on
// first use under the `shaded:` family namespace. Orders the stack and computes its define-key from
// this state's modifier-snippet registry (so the cache key captures every compile-time modifier
// variant), then keys the shared scene program cache by base-key + modifier-define-key — each variant
// compiles at most once per state and reused every frame.
pub fn ensure_gl_shaded_program(
    state: &GlRenderState,
    key: &GlShadedDefineKey,
    modifiers: &[Ref<dyn Modifier>],
) -> Rc<GlShadedProgram> {
    let registry = state.gl_registries.modifier_snippets.clone();
    let revision = state.gl_runtime.borrow().modifier_snippet_revision;
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, modifiers);
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
    let cache_key = format!(
        "{}|registry:{revision}",
        build_gl_shaded_cache_key(&full_key, &get_gl_modifier_define_key(modifiers, &registry))
    );
    let color_adjustment_feature = get_gl_color_adjustment_material_feature(state);
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        return compile_gl_shaded_program(
            gl,
            &full_key,
            &ordered,
            &registry,
            color_adjustment_feature,
            Some(skin_declarations_glsl),
        );
    });
}

// TS getGlModifierDefineKey over the GL snippet table: the ordered stack's kinds, each followed by its
// snippet's define signature when it has one, joined by `+`.
fn get_gl_modifier_define_key(
    stack: &[Ref<dyn Modifier>],
    registry: &KindMap<&'static GlModifierSnippet>,
) -> String {
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, stack);
    let mut key = String::new();
    for modifier in &ordered {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let kind = &modifier.modifier_fields().kind;
        let snippet = resolve_gl_modifier_snippet_source(registry, kind);
        let signature = snippet
            .and_then(|snippet| snippet.get_define_signature)
            .map_or(String::new(), |get_define_signature| {
                get_define_signature(&*modifier)
            });
        let token = if signature.is_empty() {
            kind.clone()
        } else {
            format!("{kind}:{signature}")
        };
        key = if key.is_empty() {
            token
        } else {
            format!("{key}+{token}")
        };
    }
    return key;
}

// The TS `/_\d+\b/` test: whether a declaration line carries a stack-index suffix (`_` + digits ending
// at a word boundary), marking a per-instance uniform that must never be deduped.
fn has_gl_stack_index_suffix(line: &str) -> bool {
    let bytes = line.as_bytes();
    for (start, byte) in bytes.iter().enumerate() {
        if *byte != b'_' {
            continue;
        }
        let mut end = start + 1;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        let at_boundary =
            end == bytes.len() || !(bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_');
        if end > start + 1 && at_boundary {
            return true;
        }
    }
    return false;
}

fn resolve_gl_modifier_snippet_source(
    registry: &KindMap<&'static GlModifierSnippet>,
    kind: &str,
) -> Option<&'static GlModifierSnippet> {
    return registry.entries.get(kind).copied();
}

macro_rules! shaded_vertex_body_glsl {
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
uniform float u_time;
"#, gl_uv_transform_vertex_glsl!(), r#"
out vec3 v_worldPosition;
out vec3 v_normal;
out vec4 v_tangent;
out vec2 v_uv0;

//@VERTEX_DECLARATIONS

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
  vec2 vertexUv = a_uv0;

  // Vertex slot: read/write `localPosition` (the pre-model local vertex) and `localNormal`; the
  // procedural cases scroll by `u_time` and read `vertexUv` (the raw uv, before the uv transform).
  //@VERTEX

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
const SHADED_VERTEX_BODY: &str = shaded_vertex_body_glsl!();

// The ShadedMaterial fragment: a classic diffuse + half-vector-specular base over the shared light
// block, with five modifier slot hooks. The base is a self-contained blinn-phong assembly (the third
// such assembly over GL_MESH_LIGHT_BLOCK_GLSL, alongside classic + PBR); the //@HOOK markers are
// substituted with injected modifier GLSL at compile time. The variables each hook may read/write
// are documented at the marker — this is the injection contract a GL modifier snippet targets.
macro_rules! shaded_fragment_template_glsl {
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
uniform vec4 u_specular;
uniform float u_shininess;
uniform float u_normalScale;
uniform float u_alphaCutoff;
uniform float u_time;
"#, gl_mesh_light_block_glsl!(), r#"

#ifdef HAS_DIFFUSE_MAP
uniform sampler2D u_diffuseMap;
#endif
#ifdef HAS_SPECULAR_MAP
uniform sampler2D u_specularMap;
#endif
#ifdef HAS_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

"#, gl_mesh_fragment_tail_uniforms_glsl!(), r#"

out vec4 fragColor;

// Deterministic 2D value noise, declared in the base so any Effect-slot modifier (the procedural
// dissolve mask) can call it without redeclaring a function — a GLSL compiler drops it when no
// modifier references it, so a plain ShadedMaterial pays nothing for it.
float shadedHashNoise(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float shadedValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = shadedHashNoise(i + vec2(0.0, 0.0));
  float b = shadedHashNoise(i + vec2(1.0, 0.0));
  float c = shadedHashNoise(i + vec2(0.0, 1.0));
  float d = shadedHashNoise(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Diffuse + half-vector (BlinnPhong) specular for ONE light. Every light type routes through this so
// they never fork the shading model — the caller supplies the surface->light direction and the
// (attenuated) radiance.
vec3 shadeShadedLight(vec3 normal, vec3 lightDir, vec3 lightColor, vec3 diffuseRgb, vec3 specularColor, float shininess) {
  float nDotL = max(dot(normal, lightDir), 0.0);
  vec3 result = diffuseRgb * nDotL * lightColor;
  if (nDotL > 0.0) {
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfVec), 0.0);
    result += pow(specAngle, max(shininess, 1.0)) * specularColor * lightColor;
  }
  return result;
}

//@DECLARATIONS

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

  vec3 geometricNormal = normalize(v_normal);
  if (!gl_FrontFacing) geometricNormal = -geometricNormal;
  // Gram-Schmidt-reorthogonalize the interpolated tangent against the interpolated normal before
  // building the TBN: linear interpolation across a triangle leaves v_tangent no longer perpendicular
  // to v_normal, and skipping this step skews the tangent frame — the normal-map artifact this base
  // shader previously exhibited. Mirrors the PBR prelude's TBN construction exactly.
  vec3 tangent = normalize(v_tangent.xyz - geometricNormal * dot(v_tangent.xyz, geometricNormal));
  vec3 bitangent = cross(geometricNormal, tangent) * v_tangent.w;
  mat3 tbn = mat3(tangent, bitangent, geometricNormal);

  vec3 normal = geometricNormal;
#ifdef HAS_NORMAL_MAP
  vec3 baseTangentNormal = texture(u_normalMap, v_uv0).xyz * 2.0 - 1.0;
  baseTangentNormal.xy *= u_normalScale;
  normal = normalize(tbn * baseTangentNormal);
#endif

  // Normal slot: read/write `normal` (the world-space shading normal). `tbn` maps tangent- to
  // world-space; `v_uv0` and `u_time` drive scrolling perturbations.
  //@NORMAL

  vec3 specularColor = u_specular.rgb;
#ifdef HAS_SPECULAR_MAP
  specularColor *= texture(u_specularMap, v_uv0).rgb;
#endif
  float shininess = u_shininess;

  // Diffuse slot: read/write `diffuse` (vec4 linear albedo + alpha).
  //@DIFFUSE
  // Specular slot: read/write `specularColor` (linear) and `shininess`.
  //@SPECULAR

#ifdef ALPHA_MASK
  if (diffuse.a < u_alphaCutoff) discard;
  diffuse.a = 1.0;
#endif

  vec3 radiance = vec3(0.0);

  // Directional light: -direction is the surface->light vector; modulated by the shared shadow term.
  if (u_directionalCount > 0.5) {
    vec3 lightDir = normalize(-u_directional.xyz);
    float shadow = sampleDirectionalShadow(v_worldPosition, geometricNormal);
    radiance += shadeShadedLight(normal, lightDir, u_directionalRadiance.rgb, diffuse.rgb, specularColor, shininess) * shadow;
  }

  // Point lights: surface->light direction with a smooth inverse-square range falloff.
  for (int i = 0; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= u_pointCount) break;
    vec3 toLight = u_pointLights[i * 2 + 0].xyz - v_worldPosition;
    float dist2 = dot(toLight, toLight);
    vec3 lightDir = toLight * inversesqrt(max(dist2, 1e-8));
    float atten = rangeWindow(dist2, u_pointLights[i * 2 + 1].w) / max(dist2, 1e-4);
    radiance += shadeShadedLight(normal, lightDir, u_pointLights[i * 2 + 1].rgb * atten, diffuse.rgb, specularColor, shininess);
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
    radiance += shadeShadedLight(normal, lightDir, u_spotLights[i * 4 + 1].rgb * atten * cone, diffuse.rgb, specularColor, shininess);
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

  // Emissive slot: add self-illumination into `emissive` (linear radiance). `normal`, the light
  // uniforms, and `v_uv0` are available for facing gates and masks.
  vec3 emissive = vec3(0.0);
  //@EMISSIVE
  radiance += emissive;

  // Effect slot: post-process the shaded `radiance` (view-dependent rim, tint, etc). `viewDir` is
  // the world-space surface->camera direction; `normal` and `v_uv0` are available.
  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
  //@EFFECT

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
const SHADED_FRAGMENT_TEMPLATE: &str = shaded_fragment_template_glsl!();
