// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::Ref;
use flight_entity::throw_type_error;
use flight_materials::{CLEARCOAT_PBR_EXTENSION_KIND, PbrExtension, PbrUvSet};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};
use flight_texture::Texture;

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of CLEARCOAT_PBR_EXTENSION_KIND (TS `clearcoatPbrGlExtension`).
pub static CLEARCOAT_PBR_GL_EXTENSION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_clearcoat_pbr_gl_extension,
    create_shader_contribution: create_clearcoat_pbr_gl_extension_shader_contribution,
    is_supported: is_clearcoat_pbr_gl_extension_supported,
};

fn create_clearcoat_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::Clearcoat(extension) = value else {
        throw_type_error("clearcoatPbrGlExtension: expected a Clearcoat extension");
    };
    let factor_map = context.is_texture_ready(extension.clearcoat_map.as_ref());
    let roughness_map = context.is_texture_ready(extension.clearcoat_roughness_map.as_ref());
    let normal_map = context.is_texture_ready(extension.clearcoat_normal_map.as_ref());
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: r#"
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  vec3 flightClearcoatN = flightClearcoatNormal(N, tangentDir, bitangentDir);
  float flightClearcoatNDotV = max(dot(flightClearcoatN, V), 1e-4);
  vec3 flightClearcoatF = fresnelSchlickRoughness(flightClearcoatNDotV, vec3(0.04), flightClearcoatRough) * flightClearcoatFactor;
  vec3 flightClearcoatR = reflect(-V, flightClearcoatN);
  vec3 flightClearcoatPrefiltered = textureLod(u_iblPrefiltered, flightClearcoatR, flightClearcoatRough * u_iblMaxMip).rgb;
  vec2 flightClearcoatBrdf = texture(u_iblBrdf, vec2(flightClearcoatNDotV, flightClearcoatRough)).rg;
  ambient = ambient * (1.0 - flightClearcoatF) +
    flightClearcoatPrefiltered * (flightClearcoatF * flightClearcoatBrdf.x + flightClearcoatBrdf.y) * occ * u_iblIntensity;"#.to_string(),
        contribute_punctual: r#"
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  vec3 flightClearcoatN = flightClearcoatNormal(N, tangentDir, bitangentDir);
  float flightClearcoatNDotV = max(dot(flightClearcoatN, V), 1e-4);
  float flightClearcoatNDotL = max(dot(flightClearcoatN, L), 0.0);
  float flightClearcoatNDotH = max(dot(flightClearcoatN, halfVec), 0.0);
  float flightClearcoatD = distributionGgx(flightClearcoatNDotH, flightClearcoatRough);
  float flightClearcoatVis = visibilitySmith(flightClearcoatNDotV, flightClearcoatNDotL, flightClearcoatRough);
  vec3 flightClearcoatF = fresnelSchlick(vDotH, vec3(0.04)) * flightClearcoatFactor;
  direct = direct * (1.0 - flightClearcoatF) +
    flightClearcoatD * flightClearcoatVis * flightClearcoatF * lightColor * flightClearcoatNDotL;"#.to_string(),
        finalize: String::new(),
        fragment_declarations: format!(r#"
uniform float u_flightClearcoat;
uniform float u_flightClearcoatRoughness;
uniform float u_flightClearcoatNormalScale;
{}
{}
{}"#, map_declarations("Clearcoat", factor_map), map_declarations("ClearcoatRoughness", roughness_map), map_declarations("ClearcoatNormal", normal_map)),
        fragment_functions: format!(r#"
{}
{}
{}
float flightClearcoatFactorSample() {{ return {}; }}
float flightClearcoatRoughnessSample() {{ return {}; }}
vec3 flightClearcoatNormal(vec3 N, vec3 tangentDir, vec3 bitangentDir) {{
  {}
}}"#, map_uv_function("Clearcoat", factor_map), map_uv_function("ClearcoatRoughness", roughness_map), map_uv_function("ClearcoatNormal", normal_map), if factor_map { "texture(u_flightClearcoatMap, flightClearcoatUv()).r" } else { "1.0" }, if roughness_map { "texture(u_flightClearcoatRoughnessMap, flightClearcoatRoughnessUv()).g" } else { "1.0" }, if normal_map { r#"vec3 tangentNormal = texture(u_flightClearcoatNormalMap, flightClearcoatNormalUv()).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_flightClearcoatNormalScale;
  vec3 T = normalize(tangentDir - N * dot(tangentDir, N));
  float handedness = dot(cross(N, T), bitangentDir) < 0.0 ? -1.0 : 1.0;
  vec3 B = normalize(cross(N, T)) * handedness;
  return normalize(mat3(T, B, N) * tangentNormal);"#.to_string() } else { "return N;".to_string() }),
        key: format!(r#"clearcoat:{}{}{}"#, if factor_map { "f" } else { "-" }, if roughness_map { "r" } else { "-" }, if normal_map { "n" } else { "-" }),
        samples_transmission_scene_color: None,
        texture_count: u32::from(factor_map) + u32::from(roughness_map) + u32::from(normal_map),
    };
}

fn bind_clearcoat_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::Clearcoat(extension) = value else {
        return;
    };
    context.set_float("u_flightClearcoat", extension.clearcoat);
    context.set_float("u_flightClearcoatRoughness", extension.clearcoat_roughness);
    context.set_float(
        "u_flightClearcoatNormalScale",
        extension.clearcoat_normal_scale,
    );
    bind_map(
        context,
        "Clearcoat",
        extension.clearcoat_map.as_ref(),
        extension.clearcoat_map_uv_set,
    );
    bind_map(
        context,
        "ClearcoatRoughness",
        extension.clearcoat_roughness_map.as_ref(),
        extension.clearcoat_roughness_map_uv_set,
    );
    bind_map(
        context,
        "ClearcoatNormal",
        extension.clearcoat_normal_map.as_ref(),
        extension.clearcoat_normal_map_uv_set,
    );
}

// Binds one clearcoat map through the shared u_flight<name>Map / UvSet / Transform uniform triple.
fn bind_map(
    context: &mut dyn GlPbrExtensionBindContext,
    name: &str,
    texture: Option<&Ref<Texture>>,
    uv_set: PbrUvSet,
) {
    context.bind_texture(
        &format!(r#"u_flight{}Map"#, name),
        &format!(r#"u_flight{}MapUvSet"#, name),
        &format!(r#"u_flight{}MapTransform"#, name),
        texture,
        uv_set,
    );
}

// Every clearcoat extension value is supported; the variant check keeps a kind registered against the
// wrong closed variant a plain-data unsupported-extension issue instead of a mis-bound draw.
fn is_clearcoat_pbr_gl_extension_supported(value: &PbrExtension) -> bool {
    return matches!(value, PbrExtension::Clearcoat(_));
}

// The sampler / uv-set / transform declarations for one enabled clearcoat map (empty when disabled).
fn map_declarations(name: &str, enabled: bool) -> String {
    return if enabled {
        format!(
            r#"uniform sampler2D u_flight{}Map; uniform int u_flight{}MapUvSet; uniform mat3 u_flight{}MapTransform;"#,
            name, name, name
        )
    } else {
        "".to_string()
    };
}

// The uv selector function for one enabled clearcoat map (empty when disabled).
fn map_uv_function(name: &str, enabled: bool) -> String {
    return if enabled {
        format!(
            r#"vec2 flight{}Uv() {{ vec2 uv = u_flight{}MapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flight{}MapTransform * vec3(uv, 1.0)).xy; }}"#,
            name, name, name
        )
    } else {
        "".to_string()
    };
}

// Registers the clearcoat GL realization for CLEARCOAT_PBR_EXTENSION_KIND on this state.
pub fn register_gl_clearcoat_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
        &CLEARCOAT_PBR_GL_EXTENSION,
    );
}
