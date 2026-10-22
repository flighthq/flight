// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{PbrExtension, SPECULAR_PBR_EXTENSION_KIND};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of SPECULAR_PBR_EXTENSION_KIND (TS `specularPbrGlExtension`).
pub static SPECULAR_PBR_GL_EXTENSION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_specular_pbr_gl_extension,
    create_shader_contribution: create_specular_pbr_gl_extension_shader_contribution,
    is_supported: is_specular_pbr_gl_extension_supported,
};

fn create_specular_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::Specular(extension) = value else {
        throw_type_error("specularPbrGlExtension: expected a Specular extension");
    };
    let factor_map = context.is_texture_ready(extension.specular_map.as_ref());
    let color_map = context.is_texture_ready(extension.specular_color_map.as_ref());
    return GlPbrExtensionShaderContribution {
        apply_surface: format!(
            r#"
  float flightSpecularFactor = u_flightSpecular * {};
  vec3 flightSpecularColor = u_flightSpecularColor * {};
  f0 = mix(min(0.04 * flightSpecularColor, vec3(1.0)) * flightSpecularFactor, albedo, metallic);"#,
            if factor_map {
                "texture(u_flightSpecularMap, flightSpecularUv()).a"
            } else {
                "1.0"
            },
            if color_map {
                "texture(u_flightSpecularColorMap, flightSpecularColorUv()).rgb"
            } else {
                "vec3(1.0)"
            }
        ),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: String::new(),
        fragment_declarations: format!(
            r#"
uniform float u_flightSpecular;
uniform vec3 u_flightSpecularColor;
{}
{}"#,
            if factor_map {
                "uniform sampler2D u_flightSpecularMap; uniform int u_flightSpecularMapUvSet; uniform mat3 u_flightSpecularMapTransform;"
            } else {
                ""
            },
            if color_map {
                "uniform sampler2D u_flightSpecularColorMap; uniform int u_flightSpecularColorMapUvSet; uniform mat3 u_flightSpecularColorMapTransform;"
            } else {
                ""
            }
        ),
        fragment_functions: format!(
            r#"
{}
{}"#,
            if factor_map {
                "vec2 flightSpecularUv() { vec2 uv = u_flightSpecularMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSpecularMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            },
            if color_map {
                "vec2 flightSpecularColorUv() { vec2 uv = u_flightSpecularColorMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSpecularColorMapTransform * vec3(uv, 1.0)).xy; }"
            } else {
                ""
            }
        ),
        key: format!(
            r#"specular:{}{}"#,
            if factor_map { "f" } else { "-" },
            if color_map { "c" } else { "-" }
        ),
        samples_transmission_scene_color: None,
        texture_count: u32::from(factor_map) + u32::from(color_map),
    };
}

fn bind_specular_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::Specular(extension) = value else {
        return;
    };
    context.set_float("u_flightSpecular", extension.specular);
    context.set_linear_color("u_flightSpecularColor", extension.specular_color);
    context.bind_texture(
        "u_flightSpecularMap",
        "u_flightSpecularMapUvSet",
        "u_flightSpecularMapTransform",
        extension.specular_map.as_ref(),
        extension.specular_map_uv_set,
    );
    context.bind_texture(
        "u_flightSpecularColorMap",
        "u_flightSpecularColorMapUvSet",
        "u_flightSpecularColorMapTransform",
        extension.specular_color_map.as_ref(),
        extension.specular_color_map_uv_set,
    );
}

// Every specular extension value is supported; the variant check keeps a kind registered against the
// wrong closed variant a plain-data unsupported-extension issue instead of a mis-bound draw.
fn is_specular_pbr_gl_extension_supported(value: &PbrExtension) -> bool {
    return matches!(value, PbrExtension::Specular(_));
}

// Registers the specular GL realization for SPECULAR_PBR_EXTENSION_KIND on this state.
pub fn register_gl_specular_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        SPECULAR_PBR_EXTENSION_KIND.to_string(),
        &SPECULAR_PBR_GL_EXTENSION,
    );
}
