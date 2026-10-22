// flight-lint: allow-file(contract-vocabulary) D17 lit-program helpers drive glow native handles over thread-bound render-gl state

use flight_lighting::{
    MAX_FORWARD_LIGHTS, SCENE_LIGHT_HEMISPHERE_OFFSET, SCENE_LIGHT_HEMISPHERE_STRIDE,
    SCENE_LIGHT_POINT_OFFSET, SCENE_LIGHT_POINT_STRIDE, SCENE_LIGHT_SPOT_OFFSET,
    SCENE_LIGHT_SPOT_STRIDE, Scene3DLightBlock,
};
use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeProgram, PixelUnpackData};

use crate::gl_mesh_program::create_gl_mesh_program_record;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlIblPlaceholders, GlLitProgram};

// The texture unit the directional shadow map binds to — above the material texture units (0–4). The
// IBL set sits above the shadow map: irradiance/prefiltered cubemaps + the BRDF LUT on units 9/10/11.
const SHADOW_MAP_TEXTURE_UNIT: u32 = 8;
const IBL_IRRADIANCE_TEXTURE_UNIT: u32 = 9;
const IBL_PREFILTERED_TEXTURE_UNIT: u32 = 10;
const IBL_BRDF_TEXTURE_UNIT: u32 = 11;

// The GLSL 300 es declaration of the standard forward-light + shadow uniforms and the shared
// shadow-sampling helper, included once in every lit fragment prelude, in lockstep with the CPU upload
// (bind_gl_mesh_light_block). A lit family that wants shadows multiplies its directional contribution
// by sampleDirectionalShadow(worldPos, geometricNormal). The PCF cap is MAX_DIRECTIONAL_SHADOW_PCF_RADIUS
// (2), spelled as a literal so the source stays a compile-time constant.
macro_rules! gl_directional_shadow_glsl {
    () => {
        concat!(r#"
uniform sampler2D u_shadowMap;       // directional shadow depth map
uniform mat4 u_shadowMatrix;         // world -> shadow light-clip
uniform float u_shadowEnabled;       // 0 or 1 — gates shadow sampling
uniform int u_shadowPcfRadius;       // integer kernel radius: 0 = one tap, 1 = 3x3
uniform float u_shadowBias;          // normalized depth-compare bias
uniform float u_shadowNormalBiasWorld; // receiver offset along the geometric normal in world units

// Directional shadow factor at a world position: 1.0 fully lit, 0.0 fully shadowed. The compile-time
// radius cap bounds fragment cost. Radius 0 and 1 take dedicated one-tap and 3x3 paths, so the default
// does not execute the maximum kernel; radius 2 takes the bounded 5x5 path. Fragments outside the
// shadow frustum are treated as lit.
float compareDirectionalShadow(vec2 uv, float current) {
  float closest = texture(u_shadowMap, uv).r;
  return current <= closest ? 1.0 : 0.0;
}

float sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal) {
  if (u_shadowEnabled < 0.5) return 1.0;
  vec3 biasedWorldPos = worldPos + geometricNormal * u_shadowNormalBiasWorld;
  vec4 clip = u_shadowMatrix * vec4(biasedWorldPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec3 uvz = ndc * 0.5 + 0.5;
  if (uvz.x < 0.0 || uvz.x > 1.0 || uvz.y < 0.0 || uvz.y > 1.0 || uvz.z > 1.0) return 1.0;
  float current = uvz.z - u_shadowBias;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  int radius = clamp(u_shadowPcfRadius, 0, "#, "2", r#");
  if (radius == 0) return compareDirectionalShadow(uvz.xy, current);

  float sum = 0.0;
  if (radius == 1) {
    for (int x = -1; x <= 1; ++x) {
      for (int y = -1; y <= 1; ++y) {
        sum += compareDirectionalShadow(uvz.xy + vec2(float(x), float(y)) * texel, current);
      }
    }
    return sum / 9.0;
  }
  for (int x = -"#, "2", r#"; x <= "#, "2", r#"; ++x) {
    for (int y = -"#, "2", r#"; y <= "#, "2", r#"; ++y) {
      sum += compareDirectionalShadow(uvz.xy + vec2(float(x), float(y)) * texel, current);
    }
  }
  float diameter = float("#, "5", r#");
  return sum / (diameter * diameter);
}
"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_directional_shadow_glsl;

pub const GL_DIRECTIONAL_SHADOW_GLSL: &str = gl_directional_shadow_glsl!();

macro_rules! gl_mesh_light_block_glsl {
    () => {
        concat!(r#"
uniform vec4 u_directional;          // xyz = light travel direction (surface->light is -xyz)
uniform vec4 u_directionalRadiance;  // rgb = linear radiance, premultiplied by intensity
uniform vec3 u_ambientRadiance;      // linear ambient irradiance
uniform float u_directionalCount;    // 0 or 1 — gates the directional term
uniform float u_ambientCount;        // 0 or 1 — gates the ambient term
uniform vec3 u_cameraPosition;       // world-space camera position for view-dependent terms

// Punctual (point/spot/hemisphere) forward-light arrays. Fixed MAX_FORWARD_LIGHTS-wide; each count
// uniform bounds its loop. Layout matches Scene3DLightBlock.data (packScene3DLightBlock) byte-for-byte:
//   point[i]      = u_pointLights[i*2+0]={pos.xyz,range}, [i*2+1]={radiance.rgb,invSqrRange}
//   spot[i]       = u_spotLights[i*4+0..1] as point, [i*4+2]={dir.xyz,_}, [i*4+3]={cosInner,cosOuter,_,_}
//   hemisphere[i] = u_hemisphereLights[i*3+0]={sky.rgb,_}, [i*3+1]={ground.rgb,_}, [i*3+2]={up.xyz,_}
uniform vec4 u_pointLights[MAX_FORWARD_LIGHTS * 2];
uniform vec4 u_spotLights[MAX_FORWARD_LIGHTS * 4];
uniform vec4 u_hemisphereLights[MAX_FORWARD_LIGHTS * 3];
uniform int u_pointCount;
uniform int u_spotCount;
uniform int u_hemisphereCount;

// Smooth inverse-square range window (glTF/UE4): 1 near the light, eased to 0 at the range. invSqrRange
// is 1/range^2 (0 = infinite range, no cutoff). dist2 is the squared surface->light distance.
float rangeWindow(float dist2, float invSqrRange) {
  float factor = dist2 * invSqrRange;
  float windowed = clamp(1.0 - factor * factor, 0.0, 1.0);
  return windowed * windowed;
}
"#, gl_directional_shadow_glsl!(), r#"
"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_mesh_light_block_glsl;

pub const GL_MESH_LIGHT_BLOCK_GLSL: &str = gl_mesh_light_block_glsl!();

// Uploads the packed light block to a lit program's standard light uniforms, then binds the active
// directional shadow (set by render_gl_scene3d_shadow_map on the scene runtime) or disables shadowing,
// and the baked IBL set or its placeholders. The light uniforms persist on the program across frames,
// so an unchanged block (same identity and version) is not re-uploaded; the shadow and IBL binds run
// every draw.
pub fn bind_gl_mesh_light_block(state: &GlRenderState, program: &GlLitProgram, lights: &Scene3DLightBlock) {
    let gl = &state.gl;
    let identity = lights as *const Scene3DLightBlock as usize;
    let uploaded = get_gl_scene3d_runtime(state)
        .uploaded_light_blocks
        .get(&program.program)
        .copied();
    if uploaded != Some((identity, lights.version)) {
        let data = &lights.data;
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            gl.uniform_4_f32(program.loc_directional.as_ref(), data[0], data[1], data[2], 0.0);
            gl.uniform_4_f32(program.loc_directional_radiance.as_ref(), data[4], data[5], data[6], 0.0);
            gl.uniform_3_f32(program.loc_ambient_radiance.as_ref(), data[8], data[9], data[10]);
            gl.uniform_1_f32(program.loc_directional_count.as_ref(), lights.directional_count as f32);
            gl.uniform_1_f32(program.loc_ambient_count.as_ref(), lights.ambient_count as f32);
            gl.uniform_4_f32_slice(
                program.loc_point_lights.as_ref(),
                &data[SCENE_LIGHT_POINT_OFFSET
                    ..SCENE_LIGHT_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS],
            );
            gl.uniform_4_f32_slice(
                program.loc_spot_lights.as_ref(),
                &data[SCENE_LIGHT_SPOT_OFFSET
                    ..SCENE_LIGHT_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS],
            );
            gl.uniform_4_f32_slice(
                program.loc_hemisphere_lights.as_ref(),
                &data[SCENE_LIGHT_HEMISPHERE_OFFSET
                    ..SCENE_LIGHT_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS],
            );
            gl.uniform_1_i32(program.loc_point_count.as_ref(), lights.point_count as i32);
            gl.uniform_1_i32(program.loc_spot_count.as_ref(), lights.spot_count as i32);
            gl.uniform_1_i32(program.loc_hemisphere_count.as_ref(), lights.hemisphere_count as i32);
        }
        get_gl_scene3d_runtime(state)
            .uploaded_light_blocks
            .insert(program.program, (identity, lights.version));
    }

    let (shadow, ibl) = {
        let runtime = get_gl_scene3d_runtime(state);
        let ibl = runtime
            .ibl
            .filter(|ibl| ibl.environment_source_revision == runtime.environment_source_revision);
        (runtime.shadow.clone(), ibl)
    };
    // SAFETY: texture and uniform binds run on the owning GL thread.
    unsafe {
        match &shadow {
            Some(shadow) if shadow.enabled => {
                gl.active_texture(glow::TEXTURE0 + SHADOW_MAP_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_2D, Some(shadow.texture));
                gl.uniform_1_f32(program.loc_shadow_bias.as_ref(), shadow.shadow_bias);
                gl.uniform_1_i32(program.loc_shadow_map.as_ref(), SHADOW_MAP_TEXTURE_UNIT as i32);
                gl.uniform_matrix_4_f32_slice(program.loc_shadow_matrix.as_ref(), false, &shadow.matrix.m);
                gl.uniform_1_f32(program.loc_shadow_normal_bias_world.as_ref(), shadow.normal_bias_world);
                gl.uniform_1_i32(program.loc_shadow_pcf_radius.as_ref(), shadow.pcf_radius as i32);
                gl.uniform_1_f32(program.loc_shadow_enabled.as_ref(), 1.0);
            }
            _ => {
                gl.uniform_1_f32(program.loc_shadow_enabled.as_ref(), 0.0);
            }
        }
    }

    match ibl {
        Some(ibl) => {
            // SAFETY: texture and uniform binds run on the owning GL thread.
            unsafe {
                gl.active_texture(glow::TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.irradiance_cube));
                gl.uniform_1_i32(program.loc_ibl_irradiance.as_ref(), IBL_IRRADIANCE_TEXTURE_UNIT as i32);
                gl.active_texture(glow::TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(ibl.prefiltered_cube));
                gl.uniform_1_i32(program.loc_ibl_prefiltered.as_ref(), IBL_PREFILTERED_TEXTURE_UNIT as i32);
                gl.active_texture(glow::TEXTURE0 + IBL_BRDF_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_2D, Some(ibl.brdf_lut));
                gl.uniform_1_i32(program.loc_ibl_brdf.as_ref(), IBL_BRDF_TEXTURE_UNIT as i32);
                gl.uniform_1_f32(program.loc_ibl_enabled.as_ref(), 1.0);
                gl.uniform_1_f32(program.loc_ibl_intensity.as_ref(), ibl.intensity);
                gl.uniform_1_f32(program.loc_ibl_max_mip.as_ref(), ibl.prefiltered_mip_count as f32 - 1.0);
                gl.active_texture(glow::TEXTURE0);
            }
        }
        None => {
            // Even with IBL disabled the PBR shader still declares the cube/2D IBL samplers; bind
            // correctly-typed 1x1 placeholders on the dedicated IBL units so sampler types never
            // collide with the material's unit-0 sampler. u_iblEnabled = 0 keeps them unsampled.
            let placeholders = ensure_gl_ibl_placeholders(state);
            // SAFETY: texture and uniform binds run on the owning GL thread.
            unsafe {
                gl.active_texture(glow::TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(placeholders.cube));
                gl.uniform_1_i32(program.loc_ibl_irradiance.as_ref(), IBL_IRRADIANCE_TEXTURE_UNIT as i32);
                gl.active_texture(glow::TEXTURE0 + IBL_PREFILTERED_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(placeholders.cube));
                gl.uniform_1_i32(program.loc_ibl_prefiltered.as_ref(), IBL_PREFILTERED_TEXTURE_UNIT as i32);
                gl.active_texture(glow::TEXTURE0 + IBL_BRDF_TEXTURE_UNIT);
                gl.bind_texture(glow::TEXTURE_2D, Some(placeholders.lut));
                gl.uniform_1_i32(program.loc_ibl_brdf.as_ref(), IBL_BRDF_TEXTURE_UNIT as i32);
                gl.uniform_1_f32(program.loc_ibl_enabled.as_ref(), 0.0);
                gl.active_texture(glow::TEXTURE0);
            }
        }
    }
}

// Lazily creates (and caches per state) the 1x1 placeholder cube + 2D textures bound to the IBL units
// when no environment is baked. Created on an IBL unit, never the active unit, so the shadow map bound
// on unit 8 is never clobbered.
fn ensure_gl_ibl_placeholders(state: &GlRenderState) -> GlIblPlaceholders {
    if let Some(placeholders) = get_gl_scene3d_runtime(state).ibl_placeholders {
        return placeholders;
    }
    let gl = &state.gl;
    let black: [u8; 4] = [0, 0, 0, 255];
    // SAFETY: allocation and upload run on the owning GL thread.
    let placeholders = unsafe {
        gl.active_texture(glow::TEXTURE0 + IBL_IRRADIANCE_TEXTURE_UNIT);
        let cube = gl
            .create_texture()
            .unwrap_or_else(|error| flight_entity::throw_error(&error));
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(cube));
        for face in 0..6 {
            gl.tex_image_2d(
                glow::TEXTURE_CUBE_MAP_POSITIVE_X + face,
                0,
                glow::RGBA as i32,
                1,
                1,
                0,
                glow::RGBA,
                glow::UNSIGNED_BYTE,
                PixelUnpackData::Slice(Some(&black)),
            );
        }
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);

        let lut = gl
            .create_texture()
            .unwrap_or_else(|error| flight_entity::throw_error(&error));
        gl.bind_texture(glow::TEXTURE_2D, Some(lut));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA as i32,
            1,
            1,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelUnpackData::Slice(Some(&black)),
        );
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        GlIblPlaceholders { cube, lut }
    };
    get_gl_scene3d_runtime(state).ibl_placeholders = Some(placeholders);
    return placeholders;
}

// Resolves the standard lit uniform locations from a linked program, so each lit family's compile
// reuses them rather than repeating the lookups. The names match GL_MESH_LIGHT_BLOCK_GLSL — change
// them together. The returned record's mesh part carries only `program`; the family fills its own
// model / normal / view-projection locations.
pub fn resolve_gl_lit_locations(gl: &glow::Context, program: NativeProgram) -> GlLitProgram {
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        return GlLitProgram {
            mesh: create_gl_mesh_program_record(program),
            loc_ambient_count: gl.get_uniform_location(program, "u_ambientCount"),
            loc_ambient_radiance: gl.get_uniform_location(program, "u_ambientRadiance"),
            loc_camera_position: gl.get_uniform_location(program, "u_cameraPosition"),
            loc_directional: gl.get_uniform_location(program, "u_directional"),
            loc_directional_count: gl.get_uniform_location(program, "u_directionalCount"),
            loc_directional_radiance: gl.get_uniform_location(program, "u_directionalRadiance"),
            loc_hemisphere_count: gl.get_uniform_location(program, "u_hemisphereCount"),
            loc_hemisphere_lights: gl.get_uniform_location(program, "u_hemisphereLights"),
            loc_ibl_brdf: gl.get_uniform_location(program, "u_iblBrdf"),
            loc_ibl_enabled: gl.get_uniform_location(program, "u_iblEnabled"),
            loc_ibl_intensity: gl.get_uniform_location(program, "u_iblIntensity"),
            loc_ibl_irradiance: gl.get_uniform_location(program, "u_iblIrradiance"),
            loc_ibl_max_mip: gl.get_uniform_location(program, "u_iblMaxMip"),
            loc_ibl_prefiltered: gl.get_uniform_location(program, "u_iblPrefiltered"),
            loc_point_count: gl.get_uniform_location(program, "u_pointCount"),
            loc_point_lights: gl.get_uniform_location(program, "u_pointLights"),
            loc_shadow_bias: gl.get_uniform_location(program, "u_shadowBias"),
            loc_shadow_enabled: gl.get_uniform_location(program, "u_shadowEnabled"),
            loc_shadow_map: gl.get_uniform_location(program, "u_shadowMap"),
            loc_shadow_matrix: gl.get_uniform_location(program, "u_shadowMatrix"),
            loc_shadow_normal_bias_world: gl.get_uniform_location(program, "u_shadowNormalBiasWorld"),
            loc_shadow_pcf_radius: gl.get_uniform_location(program, "u_shadowPcfRadius"),
            loc_spot_count: gl.get_uniform_location(program, "u_spotCount"),
            loc_spot_lights: gl.get_uniform_location(program, "u_spotLights"),
        };
    }
}
