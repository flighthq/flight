use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_fragment_tail::{GL_MESH_FRAGMENT_TAIL, GL_MESH_FRAGMENT_TAIL_UNIFORMS};
use crate::gl_mesh_program::{
    compile_gl_mesh_program, ensure_gl_scene3d_program, GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
    GL_UV_TRANSFORM_VERTEX_GLSL,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMeshProgram, GlUnlitDefineKey, GlUnlitProgram};

fn build_define_source(key: &GlUnlitDefineKey) -> String {
    let mut defines = String::from("#version 300 es\n");
    if key.alpha_mask_enabled {
        defines.push_str("#define ALPHA_MASK\n");
    }
    if key.has_color_map {
        defines.push_str("#define HAS_COLOR_MAP\n");
    }
    if key.vertex_color {
        defines.push_str("#define VERTEX_COLOR\n");
    }
    if key.has_skin {
        defines.push_str("#define HAS_SKIN\n");
    }
    if key.has_instanced {
        defines.push_str("#define HAS_INSTANCES\n");
    }
    return defines;
}

pub fn build_gl_unlit_define_key(key: &GlUnlitDefineKey) -> String {
    return format!(
        "{}{}{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.has_color_map { 'c' } else { '-' },
        if key.vertex_color { 'v' } else { '-' },
        if key.has_skin { 'k' } else { '-' },
        if key.has_instanced { 'i' } else { '-' },
    );
}

pub fn compile_gl_unlit_program(
    gl: &glow::Context,
    key: &GlUnlitDefineKey,
    skin_declarations_glsl: &str,
) -> GlUnlitProgram {
    let vertex_source = get_gl_unlit_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source = get_gl_unlit_fragment_source_for_key(key);
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
    return unsafe {
        GlUnlitProgram {
            alpha_cutoff_location: gl.get_uniform_location(program, "u_alphaCutoff"),
            color_location: gl.get_uniform_location(program, "u_color"),
            color_map_location: gl.get_uniform_location(program, "u_colorMap"),
            intensity_location: gl.get_uniform_location(program, "u_intensity"),
            base,
        }
    };
}

pub fn ensure_gl_unlit_program(
    state: &GlRenderState,
    key: &GlUnlitDefineKey,
) -> GlUnlitProgram {
    let full_key = GlUnlitDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        has_color_map: key.has_color_map,
        has_skin: get_gl_scene3d_runtime(state, |rt| rt.active_skinned_run),
        has_instanced: get_gl_scene3d_runtime(state, |rt| rt.active_instanced_run),
        has_uv_transform: key.has_uv_transform,
        vertex_color: key.vertex_color,
    };
    let skin_glsl = get_gl_scene3d_runtime(state, |rt| {
        rt.mesh_skin_feature
            .as_ref()
            .map(|f| f.skin_declarations_glsl.clone())
            .unwrap_or_default()
    });
    let cache_key = format!("unlit:{}", build_gl_unlit_define_key(&full_key));
    return ensure_gl_scene3d_program(state, &cache_key, |gl| {
        compile_gl_unlit_program(gl, &full_key, &skin_glsl)
    });
}

pub fn get_gl_unlit_fragment_source_for_key(key: &GlUnlitDefineKey) -> String {
    let mut src = build_define_source(key);
    src.push_str(&get_unlit_fragment_body());
    return src;
}

pub fn get_gl_unlit_vertex_source_for_key(
    key: &GlUnlitDefineKey,
    skin_declarations_glsl: &str,
) -> String {
    let mut src = build_define_source(key);
    if key.has_skin {
        src.push_str(skin_declarations_glsl);
    }
    if key.has_instanced {
        src.push_str(GL_INSTANCE_VERTEX_DECLARATIONS_GLSL);
    }
    src.push_str(&get_unlit_vertex_body());
    return src;
}

fn get_unlit_fragment_body() -> String {
    return format!(
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

{GL_MESH_FRAGMENT_TAIL_UNIFORMS}

out vec4 fragColor;

void main() {{
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
{GL_MESH_FRAGMENT_TAIL}
}}
"#
    );
}

fn get_unlit_vertex_body() -> String {
    return format!(
        r#"#ifdef HAS_INSTANCES
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
{GL_UV_TRANSFORM_VERTEX_GLSL}
out vec2 v_uv0;

void main() {{
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
}}
"#
    );
}
