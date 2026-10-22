// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{PbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of TRANSMISSION_VOLUME_PBR_EXTENSION_KIND (TS `transmissionVolumePbrGlExtension`).
pub static TRANSMISSION_VOLUME_PBR_GL_EXTENSION: GlPbrExtensionRegistration =
    GlPbrExtensionRegistration {
        bind: bind_transmission_volume_pbr_gl_extension,
        create_shader_contribution: create_transmission_volume_pbr_gl_extension_shader_contribution,
        is_supported: is_transmission_volume_pbr_gl_extension_supported,
    };

fn create_transmission_volume_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::TransmissionVolume(extension) = value else {
        throw_type_error(
            "transmissionVolumePbrGlExtension: expected a TransmissionVolume extension",
        );
    };
    let transmission_map = context.is_texture_ready(extension.transmission_map.as_ref());
    let thickness_map = context.is_texture_ready(extension.thickness_map.as_ref());
    let scene_color = context.has_transmission_scene_color();
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: if scene_color {
            format!(
                r#"
  float flightTransmissionFactor = clamp(u_flightTransmission * {}, 0.0, 1.0);
  float flightTransmissionThickness = max(u_flightTransmissionThickness * {}, 0.0);
  float flightTransmissionEta = 1.0 / max(u_flightTransmissionIor, 1.0);
  vec3 flightTransmissionRefracted = refract(-viewDir, normal, flightTransmissionEta);
  vec4 flightTransmissionRefractedClip = u_viewProjection * vec4(
    v_worldPosition + flightTransmissionRefracted * max(flightTransmissionThickness, 0.01), 1.0);
  vec2 flightTransmissionScreenUv =
    flightTransmissionRefractedClip.xy / max(flightTransmissionRefractedClip.w, 1e-5) * 0.5 + 0.5;
  float flightTransmissionLod = roughness * u_flightTransmissionMaxLod;
  vec3 flightTransmissionBackground = textureLod(
    u_flightTransmissionSceneColor, clamp(flightTransmissionScreenUv, vec2(0.0), vec2(1.0)), flightTransmissionLod).rgb;
  vec3 flightTransmissionAbsorption = u_flightAttenuationDistance > 0.0 && !isinf(u_flightAttenuationDistance)
    ? pow(max(u_flightAttenuationColor, vec3(1e-4)), vec3(flightTransmissionThickness / u_flightAttenuationDistance))
    : vec3(1.0);
  vec3 flightTransmissionFresnel = fresnelSchlick(max(dot(normal, viewDir), 0.0), f0);
  vec3 flightTransmissionThrough = flightTransmissionBackground * flightTransmissionAbsorption;
  radiance = mix(radiance, radiance * flightTransmissionFresnel + flightTransmissionThrough * (1.0 - flightTransmissionFresnel), flightTransmissionFactor);"#,
                if transmission_map {
                    "texture(u_flightTransmissionMap, flightTransmissionUv()).r"
                } else {
                    "1.0"
                },
                if thickness_map {
                    "texture(u_flightTransmissionThicknessMap, flightTransmissionThicknessUv()).g"
                } else {
                    "1.0"
                }
            )
        } else {
            String::new()
        },
        fragment_declarations: format!(
            r#"
uniform float u_flightTransmission;
uniform float u_flightTransmissionThickness;
uniform float u_flightTransmissionIor;
uniform float u_flightAttenuationDistance;
uniform vec3 u_flightAttenuationColor;
{}
{}
{}
{}"#,
            if scene_color {
                "uniform sampler2D u_flightTransmissionSceneColor;"
            } else {
                ""
            },
            if scene_color {
                "uniform float u_flightTransmissionMaxLod; uniform mat4 u_viewProjection;"
            } else {
                ""
            },
            if transmission_map {
                "uniform sampler2D u_flightTransmissionMap; uniform int u_flightTransmissionMapUvSet; uniform mat3 u_flightTransmissionMapTransform;"
            } else {
                ""
            },
            if thickness_map {
                "uniform sampler2D u_flightTransmissionThicknessMap; uniform int u_flightTransmissionThicknessMapUvSet; uniform mat3 u_flightTransmissionThicknessMapTransform;"
            } else {
                ""
            }
        ),
        fragment_functions: format!(
            r#"
{}
{}"#,
            if transmission_map {
                "vec2 flightTransmissionUv() { vec2 uv = u_flightTransmissionMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightTransmissionMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            },
            if thickness_map {
                "vec2 flightTransmissionThicknessUv() { vec2 uv = u_flightTransmissionThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightTransmissionThicknessMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            }
        ),
        key: format!(
            r#"transmission:{}{}{}"#,
            if scene_color { "s" } else { "-" },
            if transmission_map { "f" } else { "-" },
            if thickness_map { "t" } else { "-" }
        ),
        samples_transmission_scene_color: Some(scene_color),
        texture_count: u32::from(scene_color)
            + u32::from(transmission_map)
            + u32::from(thickness_map),
    };
}

fn bind_transmission_volume_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::TransmissionVolume(extension) = value else {
        return;
    };
    context.set_float("u_flightTransmission", extension.transmission);
    context.set_float("u_flightTransmissionThickness", extension.thickness);
    context.set_float("u_flightTransmissionIor", extension.ior);
    context.set_float(
        "u_flightAttenuationDistance",
        extension.attenuation_distance,
    );
    context.set_linear_color("u_flightAttenuationColor", extension.attenuation_color);
    context.bind_texture(
        "u_flightTransmissionMap",
        "u_flightTransmissionMapUvSet",
        "u_flightTransmissionMapTransform",
        extension.transmission_map.as_ref(),
        extension.transmission_map_uv_set,
    );
    context.bind_texture(
        "u_flightTransmissionThicknessMap",
        "u_flightTransmissionThicknessMapUvSet",
        "u_flightTransmissionThicknessMapTransform",
        extension.thickness_map.as_ref(),
        extension.thickness_map_uv_set,
    );
    context.bind_transmission_scene_color(
        "u_flightTransmissionSceneColor",
        "u_flightTransmissionMaxLod",
    );
}

// The built-in is always supported (TS `isSupported(): boolean { return true; }`); the registry
// calls the registration's own callback, so a custom registration may decline.
fn is_transmission_volume_pbr_gl_extension_supported(_extension: &PbrExtension) -> bool {
    return true;
}

// Registers the transmission volume GL realization for TRANSMISSION_VOLUME_PBR_EXTENSION_KIND on this state.
pub fn register_gl_transmission_volume_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
        &TRANSMISSION_VOLUME_PBR_GL_EXTENSION,
    );
}
