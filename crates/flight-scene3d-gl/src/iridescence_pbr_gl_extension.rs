// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{IRIDESCENCE_PBR_EXTENSION_KIND, PbrExtension};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of IRIDESCENCE_PBR_EXTENSION_KIND (TS `iridescencePbrGlExtension`).
pub static IRIDESCENCE_PBR_GL_EXTENSION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_iridescence_pbr_gl_extension,
    create_shader_contribution: create_iridescence_pbr_gl_extension_shader_contribution,
    is_supported: is_iridescence_pbr_gl_extension_supported,
};

// Registers the iridescence GL realization for IRIDESCENCE_PBR_EXTENSION_KIND on this state.
pub fn register_gl_iridescence_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        IRIDESCENCE_PBR_EXTENSION_KIND.to_string(),
        &IRIDESCENCE_PBR_GL_EXTENSION,
    );
}

fn bind_iridescence_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::Iridescence(extension) = value else {
        return;
    };
    context.set_float("u_flightIridescence", extension.iridescence);
    context.set_float("u_flightIridescenceIor", extension.iridescence_ior);
    context.set_float(
        "u_flightIridescenceThicknessMin",
        extension.iridescence_thickness_min,
    );
    context.set_float(
        "u_flightIridescenceThicknessMax",
        extension.iridescence_thickness_max,
    );
    context.bind_texture(
        "u_flightIridescenceMap",
        "u_flightIridescenceMapUvSet",
        "u_flightIridescenceMapTransform",
        extension.iridescence_map.as_ref(),
        extension.iridescence_map_uv_set,
    );
    context.bind_texture(
        "u_flightIridescenceThicknessMap",
        "u_flightIridescenceThicknessMapUvSet",
        "u_flightIridescenceThicknessMapTransform",
        extension.iridescence_thickness_map.as_ref(),
        extension.iridescence_thickness_map_uv_set,
    );
}

fn create_iridescence_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::Iridescence(extension) = value else {
        throw_type_error("iridescencePbrGlExtension: expected an Iridescence extension");
    };
    let factor_map = context.is_texture_ready(extension.iridescence_map.as_ref());
    let thickness_map = context.is_texture_ready(extension.iridescence_thickness_map.as_ref());
    return GlPbrExtensionShaderContribution {
        apply_surface: r#"
  float flightIridescenceFactor = clamp(u_flightIridescence * flightIridescenceFactorSample(), 0.0, 1.0);
  float flightIridescenceThickness = mix(u_flightIridescenceThicknessMin, u_flightIridescenceThicknessMax, flightIridescenceThicknessSample());
  f0 = mix(f0, flightIridescentFresnel(nDotV, f0, flightIridescenceThickness, u_flightIridescenceIor), flightIridescenceFactor);"#.to_string(),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: String::new(),
        fragment_declarations: format!(r#"
uniform float u_flightIridescence;
uniform float u_flightIridescenceIor;
uniform float u_flightIridescenceThicknessMin;
uniform float u_flightIridescenceThicknessMax;
{}
{}"#, if factor_map { "uniform sampler2D u_flightIridescenceMap; uniform int u_flightIridescenceMapUvSet; uniform mat3 u_flightIridescenceMapTransform;" } else { "" }, if thickness_map { "uniform sampler2D u_flightIridescenceThicknessMap; uniform int u_flightIridescenceThicknessMapUvSet; uniform mat3 u_flightIridescenceThicknessMapTransform;" } else { "" }),
        fragment_functions: format!(r#"
{}
{}
float flightIridescenceFactorSample() {{ return {}; }}
float flightIridescenceThicknessSample() {{ return {}; }}
vec3 flightIridescentFresnel(float cosTheta, vec3 baseF0, float thicknessNm, float filmIor) {{
  float opd = 2.0 * filmIor * thicknessNm * cosTheta;
  vec3 phase = 2.0 * PI * opd / vec3(580.0, 540.0, 460.0);
  vec3 shift = 0.5 + 0.5 * cos(phase);
  return mix(fresnelSchlick(cosTheta, baseF0), shift, clamp(thicknessNm / 1000.0, 0.0, 1.0));
}}"#, if factor_map { "vec2 flightIridescenceUv() { vec2 uv = u_flightIridescenceMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightIridescenceMapTransform * vec3(uv, 1.0)).xy; }" } else { "" }, if thickness_map { "vec2 flightIridescenceThicknessUv() { vec2 uv = u_flightIridescenceThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightIridescenceThicknessMapTransform * vec3(uv, 1.0)).xy; }" } else { "" }, if factor_map { "texture(u_flightIridescenceMap, flightIridescenceUv()).r" } else { "1.0" }, if thickness_map { "texture(u_flightIridescenceThicknessMap, flightIridescenceThicknessUv()).g" } else { "1.0" }),
        key: format!(r#"iridescence:{}{}"#, if factor_map { "f" } else { "-" }, if thickness_map { "t" } else { "-" }),
        samples_transmission_scene_color: None,
        texture_count: u32::from(factor_map) + u32::from(thickness_map),
    };
}

// Every iridescence extension value is supported; the variant check keeps a kind registered against the
// wrong closed variant a plain-data unsupported-extension issue instead of a mis-bound draw.
fn is_iridescence_pbr_gl_extension_supported(value: &PbrExtension) -> bool {
    return matches!(value, PbrExtension::Iridescence(_));
}
