// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{PbrExtension, SHEEN_PBR_EXTENSION_KIND};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of SHEEN_PBR_EXTENSION_KIND (TS `sheenPbrGlExtension`).
pub static SHEEN_PBR_GL_EXTENSION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_sheen_pbr_gl_extension,
    create_shader_contribution: create_sheen_pbr_gl_extension_shader_contribution,
    is_supported: is_sheen_pbr_gl_extension_supported,
};

fn create_sheen_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::Sheen(extension) = value else {
        throw_type_error("sheenPbrGlExtension: expected a Sheen extension");
    };
    let color_map = context.is_texture_ready(extension.sheen_color_map.as_ref());
    let roughness_map = context.is_texture_ready(extension.sheen_roughness_map.as_ref());
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: format!(
            r#"
  vec3 flightSheenColor = u_flightSheenColor * {};
  float flightSheenRoughness = clamp(u_flightSheenRoughness * {}, 0.07, 1.0);
  vec3 flightSheenR = reflect(-V, N);
  ambient += flightSheenColor * textureLod(u_iblPrefiltered, flightSheenR, flightSheenRoughness * u_iblMaxMip).rgb *
    (1.0 - max(max(F.r, F.g), F.b)) * occ * u_iblIntensity;"#,
            if color_map {
                "texture(u_flightSheenColorMap, flightSheenColorUv()).rgb"
            } else {
                "vec3(1.0)"
            },
            if roughness_map {
                "texture(u_flightSheenRoughnessMap, flightSheenRoughnessUv()).a"
            } else {
                "1.0"
            }
        ),
        contribute_punctual: format!(
            r#"
  vec3 flightSheenColor = u_flightSheenColor * {};
  float flightSheenRoughness = clamp(u_flightSheenRoughness * {}, 0.07, 1.0);
  float flightSheenD = flightDistributionCharlie(nDotH, flightSheenRoughness);
  float flightSheenV = 1.0 / max(4.0 * (nDotL + nDotV - nDotL * nDotV), 1e-4);
  direct += flightSheenColor * flightSheenD * flightSheenV * lightColor * nDotL;"#,
            if color_map {
                "texture(u_flightSheenColorMap, flightSheenColorUv()).rgb"
            } else {
                "vec3(1.0)"
            },
            if roughness_map {
                "texture(u_flightSheenRoughnessMap, flightSheenRoughnessUv()).a"
            } else {
                "1.0"
            }
        ),
        finalize: String::new(),
        fragment_declarations: format!(
            r#"
uniform vec3 u_flightSheenColor;
uniform float u_flightSheenRoughness;
{}
{}"#,
            if color_map {
                "uniform sampler2D u_flightSheenColorMap; uniform int u_flightSheenColorMapUvSet; uniform mat3 u_flightSheenColorMapTransform;"
            } else {
                ""
            },
            if roughness_map {
                "uniform sampler2D u_flightSheenRoughnessMap; uniform int u_flightSheenRoughnessMapUvSet; uniform mat3 u_flightSheenRoughnessMapTransform;"
            } else {
                ""
            }
        ),
        fragment_functions: format!(
            r#"
{}
{}
float flightDistributionCharlie(float nDotH, float roughnessValue) {{
  float inverseRoughness = 1.0 / roughnessValue;
  return (2.0 + inverseRoughness) * pow(max(1.0 - nDotH * nDotH, 1e-4), inverseRoughness * 0.5) / (2.0 * PI);
}}"#,
            if color_map {
                "vec2 flightSheenColorUv() { vec2 uv = u_flightSheenColorMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSheenColorMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            },
            if roughness_map {
                "vec2 flightSheenRoughnessUv() { vec2 uv = u_flightSheenRoughnessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSheenRoughnessMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            }
        ),
        key: format!(
            r#"sheen:{}{}"#,
            if color_map { "c" } else { "-" },
            if roughness_map { "r" } else { "-" }
        ),
        samples_transmission_scene_color: None,
        texture_count: u32::from(color_map) + u32::from(roughness_map),
    };
}

fn bind_sheen_pbr_gl_extension(context: &mut dyn GlPbrExtensionBindContext, value: &PbrExtension) {
    let PbrExtension::Sheen(extension) = value else {
        return;
    };
    context.set_linear_color("u_flightSheenColor", extension.sheen_color);
    context.set_float("u_flightSheenRoughness", extension.sheen_roughness);
    context.bind_texture(
        "u_flightSheenColorMap",
        "u_flightSheenColorMapUvSet",
        "u_flightSheenColorMapTransform",
        extension.sheen_color_map.as_ref(),
        extension.sheen_color_map_uv_set,
    );
    context.bind_texture(
        "u_flightSheenRoughnessMap",
        "u_flightSheenRoughnessMapUvSet",
        "u_flightSheenRoughnessMapTransform",
        extension.sheen_roughness_map.as_ref(),
        extension.sheen_roughness_map_uv_set,
    );
}

// The built-in is always supported (TS `isSupported(): boolean { return true; }`); the registry
// calls the registration's own callback, so a custom registration may decline.
fn is_sheen_pbr_gl_extension_supported(_extension: &PbrExtension) -> bool {
    return true;
}

// Registers the sheen GL realization for SHEEN_PBR_EXTENSION_KIND on this state.
pub fn register_gl_sheen_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        SHEEN_PBR_EXTENSION_KIND.to_string(),
        &SHEEN_PBR_GL_EXTENSION,
    );
}
