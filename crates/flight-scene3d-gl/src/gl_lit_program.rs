use flight_lighting::MAX_DIRECTIONAL_SHADOW_PCF_RADIUS;
use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeProgram};

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlLitProgram, GlMeshProgram, Scene3DLightBlock};

pub const SHADOW_MAP_TEXTURE_UNIT: i32 = 8;
pub const IBL_IRRADIANCE_TEXTURE_UNIT: i32 = 9;
pub const IBL_PREFILTERED_TEXTURE_UNIT: i32 = 10;
pub const IBL_BRDF_TEXTURE_UNIT: i32 = 11;

fn bind_gl_ibl(state: &GlRenderState, program: &GlLitProgram) {
    let gl = &state.gl;
    let ibl = get_gl_scene3d_runtime(state, |rt| rt.ibl.clone());

    unsafe {
        if let Some(ibl) = ibl {
            gl.active_texture(glow::TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT as u32);
            gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.irradiance_cube));
            if let Some(ref loc) = program.ibl_irradiance_location {
                gl.uniform_1_i32(Some(loc), IBL_IRRADIANCE_TEXTURE_UNIT);
            }
            gl.active_texture(glow::TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT as u32);
            gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.prefiltered_cube));
            if let Some(ref loc) = program.ibl_prefiltered_location {
                gl.uniform_1_i32(Some(loc), IBL_PREFILTERED_TEXTURE_UNIT);
            }
            gl.active_texture(glow::TEXTURE0 + IBL_BRDF_TEXTURE_UNIT as u32);
            gl.bind_texture(glow::TEXTURE_2D, Some(ibl.brdf_lut));
            if let Some(ref loc) = program.ibl_brdf_location {
                gl.uniform_1_i32(Some(loc), IBL_BRDF_TEXTURE_UNIT);
            }
            if let Some(ref loc) = program.ibl_enabled_location {
                gl.uniform_1_f32(Some(loc), 1.0);
            }
            gl.active_texture(glow::TEXTURE0);
        } else if let Some(ref loc) = program.ibl_enabled_location {
            gl.uniform_1_f32(Some(loc), 0.0);
        }
    }
}

pub fn bind_gl_mesh_light_block(
    state: &GlRenderState,
    program: &GlLitProgram,
    lights: &Scene3DLightBlock,
) {
    let gl = &state.gl;

    unsafe {
        if let Some(ref loc) = program.directional_direction_location {
            gl.uniform_3_f32(
                Some(loc),
                lights.directional_direction[0],
                lights.directional_direction[1],
                lights.directional_direction[2],
            );
        }
        if let Some(ref loc) = program.directional_color_location {
            gl.uniform_3_f32(
                Some(loc),
                lights.directional_color[0],
                lights.directional_color[1],
                lights.directional_color[2],
            );
        }
        if let Some(ref loc) = program.ambient_color_location {
            gl.uniform_3_f32(
                Some(loc),
                lights.ambient_color[0],
                lights.ambient_color[1],
                lights.ambient_color[2],
            );
        }

        if let Some(ref loc) = program.point_light_count_location {
            gl.uniform_1_i32(Some(loc), lights.point_light_count as i32);
        }
        if let Some(ref loc) = program.spot_light_count_location {
            gl.uniform_1_i32(Some(loc), lights.spot_light_count as i32);
        }
    }

    bind_gl_shadow(state, program);
    bind_gl_ibl(state, program);
}

fn bind_gl_shadow(state: &GlRenderState, program: &GlLitProgram) {
    let gl = &state.gl;
    let shadow = get_gl_scene3d_runtime(state, |rt| rt.shadow.clone());

    unsafe {
        if let Some(shadow) = shadow {
            gl.active_texture(glow::TEXTURE0 + SHADOW_MAP_TEXTURE_UNIT as u32);
            gl.bind_texture(glow::TEXTURE_2D, Some(shadow.depth_texture));
            if let Some(ref loc) = program.shadow_bias_location {
                gl.uniform_1_f32(Some(loc), shadow.shadow_bias);
            }
            if let Some(ref loc) = program.shadow_map_location {
                gl.uniform_1_i32(Some(loc), SHADOW_MAP_TEXTURE_UNIT);
            }
            if let Some(ref loc) = program.shadow_matrix_location {
                gl.uniform_matrix_4_f32_slice(Some(loc), false, &shadow.light_view_projection.m);
            }
            if let Some(ref loc) = program.shadow_enabled_location {
                gl.uniform_1_f32(Some(loc), 1.0);
            }
        } else if let Some(ref loc) = program.shadow_enabled_location {
            gl.uniform_1_f32(Some(loc), 0.0);
        }
    }
}

pub fn gl_directional_shadow_glsl() -> String {
    return format!(
        r#"
uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMatrix;
uniform float u_shadowEnabled;
uniform int u_shadowPcfRadius;
uniform float u_shadowBias;
uniform float u_shadowNormalBiasWorld;

float compareDirectionalShadow(vec2 uv, float current) {{
  float closest = texture(u_shadowMap, uv).r;
  return current <= closest ? 1.0 : 0.0;
}}

float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal) {{
  if (u_shadowEnabled < 0.5) return 1.0;
  vec3 biasedWorldPos = worldPos + geometricNormal * u_shadowNormalBiasWorld;
  vec4 clip = u_shadowMatrix * vec4(biasedWorldPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec3 uvz = ndc * 0.5 + 0.5;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  float current = uvz.z - u_shadowBias;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  int radius = clamp(u_shadowPcfRadius, 0, {pcf_radius});
  if (radius == 0) return compareDirectionalShadow(uvz.xy, current);

  float sum = 0.0;
  if (radius == 1) {{
    for (int x = -1; x <= 1; ++x) {{
      for (int y = -1; y <= 1; ++y) {{
        sum += compareDirectionalShadow(uvz.xy + vec2(float(x), float(y)) * texel, current);
      }}
    }}
    return sum / 9.0;
  }}
  for (int x = -{pcf_radius}; x <= {pcf_radius}; ++x) {{
    for (int y = -{pcf_radius}; y <= {pcf_radius}; ++y) {{
      sum += compareDirectionalShadow(uvz.xy + vec2(float(x), float(y)) * texel, current);
    }}
  }}
  float diameter = float({pcf_diameter});
  return sum / (diameter * diameter);
}}
"#,
        pcf_radius = MAX_DIRECTIONAL_SHADOW_PCF_RADIUS,
        pcf_diameter = MAX_DIRECTIONAL_SHADOW_PCF_RADIUS * 2 + 1,
    );
}

pub fn gl_mesh_light_block_glsl() -> String {
    return format!(
        r#"
uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;
uniform vec3 u_cameraPosition;

uniform vec4 u_pointLights[MAX_FORWARD_LIGHTS * 2];
uniform vec4 u_spotLights[MAX_FORWARD_LIGHTS * 4];
uniform vec4 u_hemisphereLights[MAX_FORWARD_LIGHTS * 3];
uniform int u_pointCount;
uniform int u_spotCount;
uniform int u_hemisphereCount;

float rangeWindow(float dist2, float invSqrRange) {{
  float factor = dist2 * invSqrRange;
  float windowed = clamp(1.0 - factor * factor, 0.0, 1.0);
  return windowed * windowed;
}}
{shadow}
"#,
        shadow = gl_directional_shadow_glsl(),
    );
}

pub fn resolve_gl_lit_locations(gl: &glow::Context, program: NativeProgram) -> GlLitProgram {
    return GlLitProgram {
        base: GlMeshProgram {
            program,
            model_location: unsafe { gl.get_uniform_location(program, "u_model") },
            view_projection_location: unsafe { gl.get_uniform_location(program, "u_viewProjection") },
            normal_matrix_location: unsafe { gl.get_uniform_location(program, "u_normalMatrix") },
            camera_position_location: unsafe { gl.get_uniform_location(program, "u_cameraPosition") },
            object_alpha_location: unsafe { gl.get_uniform_location(program, "u_objectAlpha") },
            alpha_is_coverage_location: unsafe { gl.get_uniform_location(program, "u_alphaIsCoverage") },
        },
        ambient_color_location: unsafe { gl.get_uniform_location(program, "u_ambientRadiance") },
        ambient_count_location: unsafe { gl.get_uniform_location(program, "u_ambientCount") },
        directional_color_location: unsafe { gl.get_uniform_location(program, "u_directionalRadiance") },
        directional_direction_location: unsafe { gl.get_uniform_location(program, "u_directional") },
        directional_count_location: unsafe { gl.get_uniform_location(program, "u_directionalCount") },
        point_light_colors_location: unsafe { gl.get_uniform_location(program, "u_pointLights") },
        point_light_positions_location: None,
        point_light_ranges_location: None,
        point_light_count_location: unsafe { gl.get_uniform_location(program, "u_pointCount") },
        spot_light_colors_location: unsafe { gl.get_uniform_location(program, "u_spotLights") },
        spot_light_positions_location: None,
        spot_light_directions_location: None,
        spot_light_ranges_location: None,
        spot_light_angles_location: None,
        spot_light_count_location: unsafe { gl.get_uniform_location(program, "u_spotCount") },
        hemisphere_light_location: unsafe { gl.get_uniform_location(program, "u_hemisphereLights") },
        hemisphere_count_location: unsafe { gl.get_uniform_location(program, "u_hemisphereCount") },
        shadow_map_location: unsafe { gl.get_uniform_location(program, "u_shadowMap") },
        shadow_matrix_location: unsafe { gl.get_uniform_location(program, "u_shadowMatrix") },
        shadow_enabled_location: unsafe { gl.get_uniform_location(program, "u_shadowEnabled") },
        shadow_bias_location: unsafe { gl.get_uniform_location(program, "u_shadowBias") },
        shadow_normal_bias_world_location: unsafe { gl.get_uniform_location(program, "u_shadowNormalBiasWorld") },
        shadow_pcf_radius_location: unsafe { gl.get_uniform_location(program, "u_shadowPcfRadius") },
        ibl_irradiance_location: unsafe { gl.get_uniform_location(program, "u_iblIrradiance") },
        ibl_prefiltered_location: unsafe { gl.get_uniform_location(program, "u_iblPrefiltered") },
        ibl_brdf_location: unsafe { gl.get_uniform_location(program, "u_iblBrdf") },
        ibl_enabled_location: unsafe { gl.get_uniform_location(program, "u_iblEnabled") },
        ibl_intensity_location: unsafe { gl.get_uniform_location(program, "u_iblIntensity") },
        ibl_max_mip_location: unsafe { gl.get_uniform_location(program, "u_iblMaxMip") },
    };
}

pub const GL_IBL_FRAGMENT_GLSL: &str = r#"
uniform samplerCube u_iblIrradiance;
uniform samplerCube u_iblPrefiltered;
uniform sampler2D u_iblBrdf;
uniform float u_iblEnabled;
uniform float u_iblIntensity;
uniform float u_iblMaxMip;
"#;
