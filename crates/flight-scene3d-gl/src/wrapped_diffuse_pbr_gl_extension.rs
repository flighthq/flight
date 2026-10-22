// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{PbrExtension, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of WRAPPED_DIFFUSE_PBR_EXTENSION_KIND (TS `wrappedDiffusePbrGlExtension`).
pub static WRAPPED_DIFFUSE_PBR_GL_EXTENSION: GlPbrExtensionRegistration =
    GlPbrExtensionRegistration {
        bind: bind_wrapped_diffuse_pbr_gl_extension,
        create_shader_contribution: create_wrapped_diffuse_pbr_gl_extension_shader_contribution,
        is_supported: is_wrapped_diffuse_pbr_gl_extension_supported,
    };

fn create_wrapped_diffuse_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::WrappedDiffuse(extension) = value else {
        throw_type_error("wrappedDiffusePbrGlExtension: expected a WrappedDiffuse extension");
    };
    let factor_map = context.is_texture_ready(extension.wrapped_diffuse_map.as_ref());
    let thickness_map = context.is_texture_ready(extension.thickness_map.as_ref());
    let factor = if factor_map {
        "texture(u_flightWrappedDiffuseMap, flightWrappedDiffuseUv()).r"
    } else {
        "1.0"
    };
    let thickness = if thickness_map {
        "texture(u_flightWrappedDiffuseThicknessMap, flightWrappedDiffuseThicknessUv()).g"
    } else {
        "1.0"
    };
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: format!(
            r#"
  float flightWrappedIblStrength = u_flightWrappedDiffuseStrength * {};
  float flightWrappedIblThickness = u_flightWrappedDiffuseThickness * {};
  ambient += u_flightWrappedDiffuseColor * diffuseColor * flightWrappedIblStrength /
    (1.0 + flightWrappedIblThickness) * occ * u_iblIntensity * 0.25;"#,
            factor, thickness
        ),
        contribute_punctual: format!(
            r#"
  float flightWrappedStrength = u_flightWrappedDiffuseStrength * {};
  float flightWrappedThickness = u_flightWrappedDiffuseThickness * {};
  float flightWrap = clamp((dot(N, L) + 0.5) / 2.25, 0.0, 1.0);
  direct += flightWrappedStrength / (1.0 + flightWrappedThickness) * flightWrap *
    u_flightWrappedDiffuseColor * diffuseColor * lightColor;"#,
            factor, thickness
        ),
        finalize: String::new(),
        fragment_declarations: format!(
            r#"
uniform float u_flightWrappedDiffuseStrength;
uniform float u_flightWrappedDiffuseThickness;
uniform vec3 u_flightWrappedDiffuseColor;
{}
{}"#,
            if factor_map {
                "uniform sampler2D u_flightWrappedDiffuseMap; uniform int u_flightWrappedDiffuseMapUvSet; uniform mat3 u_flightWrappedDiffuseMapTransform;"
            } else {
                ""
            },
            if thickness_map {
                "uniform sampler2D u_flightWrappedDiffuseThicknessMap; uniform int u_flightWrappedDiffuseThicknessMapUvSet; uniform mat3 u_flightWrappedDiffuseThicknessMapTransform;"
            } else {
                ""
            }
        ),
        fragment_functions: format!(
            r#"
{}
{}"#,
            if factor_map {
                "vec2 flightWrappedDiffuseUv() { vec2 uv = u_flightWrappedDiffuseMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightWrappedDiffuseMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            },
            if thickness_map {
                "vec2 flightWrappedDiffuseThicknessUv() { vec2 uv = u_flightWrappedDiffuseThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightWrappedDiffuseThicknessMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            }
        ),
        key: format!(
            r#"wrapped-diffuse:{}{}"#,
            if factor_map { "f" } else { "-" },
            if thickness_map { "t" } else { "-" }
        ),
        samples_transmission_scene_color: None,
        texture_count: u32::from(factor_map) + u32::from(thickness_map),
    };
}

fn bind_wrapped_diffuse_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::WrappedDiffuse(extension) = value else {
        return;
    };
    context.set_float(
        "u_flightWrappedDiffuseStrength",
        extension.wrapped_diffuse_strength,
    );
    context.set_float("u_flightWrappedDiffuseThickness", extension.thickness);
    context.set_linear_color(
        "u_flightWrappedDiffuseColor",
        extension.wrapped_diffuse_color,
    );
    context.bind_texture(
        "u_flightWrappedDiffuseMap",
        "u_flightWrappedDiffuseMapUvSet",
        "u_flightWrappedDiffuseMapTransform",
        extension.wrapped_diffuse_map.as_ref(),
        extension.wrapped_diffuse_map_uv_set,
    );
    context.bind_texture(
        "u_flightWrappedDiffuseThicknessMap",
        "u_flightWrappedDiffuseThicknessMapUvSet",
        "u_flightWrappedDiffuseThicknessMapTransform",
        extension.thickness_map.as_ref(),
        extension.thickness_map_uv_set,
    );
}

// The built-in is always supported (TS `isSupported(): boolean { return true; }`); the registry
// calls the registration's own callback, so a custom registration may decline.
fn is_wrapped_diffuse_pbr_gl_extension_supported(_extension: &PbrExtension) -> bool {
    return true;
}

// Registers the wrapped diffuse GL realization for WRAPPED_DIFFUSE_PBR_EXTENSION_KIND on this state.
pub fn register_gl_wrapped_diffuse_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string(),
        &WRAPPED_DIFFUSE_PBR_GL_EXTENSION,
    );
}
