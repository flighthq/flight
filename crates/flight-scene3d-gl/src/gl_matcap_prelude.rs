use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMatcapDefineKey, GlMatcapProgram, GlMeshProgram};

pub fn build_gl_matcap_define_key(key: &GlMatcapDefineKey) -> String {
    return format!(
        "{}{}{}{}",
        if key.has_alpha_mask { 'm' } else { '-' },
        if key.has_matcap_map { 't' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'i' } else { '-' },
    );
}

pub fn compile_gl_matcap_program(
    gl: &glow::Context,
    key: &GlMatcapDefineKey,
    skin_declarations_glsl: &str,
) -> GlMatcapProgram {
    let vertex_source = get_gl_matcap_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_matcap_fragment_source_for_key(key);
    let program = compile_gl_mesh_program(gl, &vertex_source, &fragment_source).unwrap();
    let base = unsafe {
        GlMeshProgram {
            program,
            model_location: gl.get_uniform_location(program, "u_model"),
            view_projection_location: gl.get_uniform_location(program, "u_viewProjection"),
            normal_matrix_location: gl.get_uniform_location(program, "u_normalMatrix"),
            camera_position_location: None,
            object_alpha_location: gl.get_uniform_location(program, "u_objectAlpha"),
            alpha_is_coverage_location: gl.get_uniform_location(program, "u_alphaIsCoverage"),
        }
    };
    return GlMatcapProgram {
        matcap_location: unsafe { gl.get_uniform_location(program, "u_matcap") },
        diffuse_color_location: unsafe { gl.get_uniform_location(program, "u_tint") },
        base,
    };
}

pub fn ensure_gl_matcap_program(
    state: &GlRenderState,
    key: &GlMatcapDefineKey,
) -> GlMatcapProgram {
    let full_key = GlMatcapDefineKey {
        has_matcap_map: key.has_matcap_map,
        has_normal_map: key.has_normal_map,
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
        has_color_adjustment: key.has_color_adjustment,
        has_color_matrix: key.has_color_matrix,
        has_alpha_mask: key.has_alpha_mask,
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("matcap:{}", build_gl_matcap_define_key(&full_key));
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_matcap_program(gl, &full_key, &skin_glsl)
    });
}

pub fn get_gl_matcap_fragment_source_for_key(key: &GlMatcapDefineKey) -> String {
    let mut src = build_define_source(key);
    src.push_str(&get_matcap_fragment_body());
    return src;
}

pub fn get_gl_matcap_vertex_source_for_key(
    key: &GlMatcapDefineKey,
    skin_declarations_glsl: &str,
) -> String {
    let mut src = build_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(MATCAP_VERTEX_BODY);
    return src;
}

fn build_define_source(key: &GlMatcapDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.has_alpha_mask {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_matcap_map {
        defines.push_str("#define HAS_MATCAP\n");
    }
    if key.has_skin {
        defines.push_str("#define HAS_SKIN\n");
    }
    if key.has_instanced {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    return defines;
}

const MATCAP_VERTEX_BODY: &str = r#"#ifdef HAS_INSTANCES
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
  v_viewNormal = mat3(u_view) * (mat3(instanceModel) * localNormal);
#else
  vec4 worldPosition = u_model * localPosition;
  v_viewNormal = mat3(u_view) * (u_normalMatrix * localNormal);
#endif
  gl_Position = u_viewProjection * worldPosition;
}
"#;

fn get_matcap_fragment_body() -> String {
    return format!(
        r#"
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

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {{
  vec4 color = u_tint;
#ifdef HAS_INSTANCES
  color *= v_instanceColor;
#endif
#ifdef HAS_MATCAP
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
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    );
}
