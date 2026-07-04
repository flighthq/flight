//! The shared base for every lit mesh-material family.
//!
//! Ports `@flighthq/scene-gl` `glLitProgram.ts`: the `GlLitProgram` locations
//! (light block + shadow + IBL), `bind_gl_mesh_light_block`, and
//! `resolve_gl_lit_locations`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::scene_render::SceneLightBlock;
use glow::HasContext;

use crate::gl_mesh_program::GlMeshProgram;
use crate::gl_scene_runtime::GlSceneRuntime;

/// A compiled lit program extending `GlMeshProgram` with the standard forward-
/// light uniform locations.
#[derive(Clone, Debug)]
pub struct GlLitProgram {
    pub base: GlMeshProgram,
    pub loc_ambient_count: Option<glow::UniformLocation>,
    pub loc_ambient_radiance: Option<glow::UniformLocation>,
    pub loc_camera_position: Option<glow::UniformLocation>,
    pub loc_directional: Option<glow::UniformLocation>,
    pub loc_directional_count: Option<glow::UniformLocation>,
    pub loc_directional_radiance: Option<glow::UniformLocation>,
    pub loc_ibl_brdf: Option<glow::UniformLocation>,
    pub loc_ibl_enabled: Option<glow::UniformLocation>,
    pub loc_ibl_intensity: Option<glow::UniformLocation>,
    pub loc_ibl_irradiance: Option<glow::UniformLocation>,
    pub loc_ibl_max_mip: Option<glow::UniformLocation>,
    pub loc_ibl_prefiltered: Option<glow::UniformLocation>,
    pub loc_shadow_enabled: Option<glow::UniformLocation>,
    pub loc_shadow_map: Option<glow::UniformLocation>,
    pub loc_shadow_matrix: Option<glow::UniformLocation>,
}

const SHADOW_MAP_TEXTURE_UNIT: u32 = 8;
const IBL_IRRADIANCE_TEXTURE_UNIT: u32 = 9;
const IBL_PREFILTERED_TEXTURE_UNIT: u32 = 10;
const IBL_BRDF_TEXTURE_UNIT: u32 = 11;

/// Uploads the packed light block to a lit program's standard light uniforms,
/// then binds the active directional shadow or disables shadowing, and binds
/// IBL if available.
pub fn bind_gl_mesh_light_block(
    state: &mut GlRenderState,
    scene: &GlSceneRuntime,
    program: &GlLitProgram,
    lights: &SceneLightBlock,
) {
    let gl = &state.gl;
    let data = &lights.data;
    unsafe {
        gl.uniform_4_f32(
            program.loc_directional.as_ref(),
            data[0],
            data[1],
            data[2],
            0.0,
        );
        gl.uniform_4_f32(
            program.loc_directional_radiance.as_ref(),
            data[4],
            data[5],
            data[6],
            0.0,
        );
        gl.uniform_3_f32(
            program.loc_ambient_radiance.as_ref(),
            data[8],
            data[9],
            data[10],
        );
        gl.uniform_1_f32(
            program.loc_directional_count.as_ref(),
            lights.directional_count as f32,
        );
        gl.uniform_1_f32(
            program.loc_ambient_count.as_ref(),
            lights.ambient_count as f32,
        );
    }

    // Shadow
    unsafe {
        if let Some(shadow) = &scene.shadow {
            gl.active_texture(glow::TEXTURE0 + SHADOW_MAP_TEXTURE_UNIT);
            gl.bind_texture(glow::TEXTURE_2D, Some(shadow.texture));
            gl.uniform_1_i32(
                program.loc_shadow_map.as_ref(),
                SHADOW_MAP_TEXTURE_UNIT as i32,
            );
            gl.uniform_matrix_4_f32_slice(
                program.loc_shadow_matrix.as_ref(),
                false,
                &shadow.matrix.m,
            );
            gl.uniform_1_f32(program.loc_shadow_enabled.as_ref(), 1.0);
        } else {
            gl.uniform_1_f32(program.loc_shadow_enabled.as_ref(), 0.0);
        }
    }

    // IBL
    unsafe {
        if let Some(ibl) = &scene.ibl {
            gl.active_texture(glow::TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
            gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.irradiance_cube));
            gl.uniform_1_i32(
                program.loc_ibl_irradiance.as_ref(),
                IBL_IRRADIANCE_TEXTURE_UNIT as i32,
            );
            gl.active_texture(glow::TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT);
            gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.prefiltered_cube));
            gl.uniform_1_i32(
                program.loc_ibl_prefiltered.as_ref(),
                IBL_PREFILTERED_TEXTURE_UNIT as i32,
            );
            gl.active_texture(glow::TEXTURE0 + IBL_BRDF_TEXTURE_UNIT);
            gl.bind_texture(glow::TEXTURE_2D, Some(ibl.brdf_lut));
            gl.uniform_1_i32(program.loc_ibl_brdf.as_ref(), IBL_BRDF_TEXTURE_UNIT as i32);
            gl.uniform_1_f32(program.loc_ibl_enabled.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_ibl_intensity.as_ref(), ibl.intensity);
            gl.uniform_1_f32(
                program.loc_ibl_max_mip.as_ref(),
                ibl.prefiltered_mip_count as f32 - 1.0,
            );
            gl.active_texture(glow::TEXTURE0);
        } else {
            gl.uniform_1_f32(program.loc_ibl_enabled.as_ref(), 0.0);
        }
    }
}

/// Resolves the standard lit uniform locations from a linked program.
pub fn resolve_gl_lit_locations(gl: &glow::Context, program: glow::Program) -> GlLitProgram {
    unsafe {
        GlLitProgram {
            base: GlMeshProgram {
                loc_model: gl.get_uniform_location(program, "u_model"),
                loc_normal_matrix: gl.get_uniform_location(program, "u_normalMatrix"),
                loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
                program,
            },
            loc_ambient_count: gl.get_uniform_location(program, "u_ambientCount"),
            loc_ambient_radiance: gl.get_uniform_location(program, "u_ambientRadiance"),
            loc_camera_position: gl.get_uniform_location(program, "u_cameraPosition"),
            loc_directional: gl.get_uniform_location(program, "u_directional"),
            loc_directional_count: gl.get_uniform_location(program, "u_directionalCount"),
            loc_directional_radiance: gl.get_uniform_location(program, "u_directionalRadiance"),
            loc_ibl_brdf: gl.get_uniform_location(program, "u_iblBrdf"),
            loc_ibl_enabled: gl.get_uniform_location(program, "u_iblEnabled"),
            loc_ibl_intensity: gl.get_uniform_location(program, "u_iblIntensity"),
            loc_ibl_irradiance: gl.get_uniform_location(program, "u_iblIrradiance"),
            loc_ibl_max_mip: gl.get_uniform_location(program, "u_iblMaxMip"),
            loc_ibl_prefiltered: gl.get_uniform_location(program, "u_iblPrefiltered"),
            loc_shadow_enabled: gl.get_uniform_location(program, "u_shadowEnabled"),
            loc_shadow_map: gl.get_uniform_location(program, "u_shadowMap"),
            loc_shadow_matrix: gl.get_uniform_location(program, "u_shadowMatrix"),
        }
    }
}

/// The GLSL 300 es declaration of the standard forward-light + shadow uniforms.
pub const GL_MESH_LIGHT_BLOCK_GLSL: &str = r#"
uniform vec4 u_directional;
uniform vec4 u_directionalRadiance;
uniform vec3 u_ambientRadiance;
uniform float u_directionalCount;
uniform float u_ambientCount;
uniform vec3 u_cameraPosition;
uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMatrix;
uniform float u_shadowEnabled;

float sampleDirectionalShadow(vec3 worldPos) {
  if (u_shadowEnabled < 0.5) return 1.0;
  vec4 clip = u_shadowMatrix * vec4(worldPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec3 uvz = ndc * 0.5 + 0.5;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  float current = uvz.z - 0.0025;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  float sum = 0.0;
  for (int x = -1; x <= 1; ++x) {
    for (int y = -1; y <= 1; ++y) {
      float closest = texture(u_shadowMap, uvz.xy + vec2(float(x), float(y)) * texel).r;
      sum += current <= closest ? 1.0 : 0.0;
    }
  }
  return sum / 9.0;
}
"#;
