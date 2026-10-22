// flight-lint: allow-file(contract-vocabulary) D17 PBR extension registrations are backend-typed dispatch records over thread-bound render-gl state

use flight_entity::throw_type_error;
use flight_materials::{ANISOTROPY_PBR_EXTENSION_KIND, PbrExtension};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;

// The GL realization of ANISOTROPY_PBR_EXTENSION_KIND (TS `anisotropyPbrGlExtension`).
pub static ANISOTROPY_PBR_GL_EXTENSION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_anisotropy_pbr_gl_extension,
    create_shader_contribution: create_anisotropy_pbr_gl_extension_shader_contribution,
    is_supported: is_anisotropy_pbr_gl_extension_supported,
};

// Registers the anisotropy GL realization for ANISOTROPY_PBR_EXTENSION_KIND on this state.
pub fn register_gl_anisotropy_pbr_extension(state: &mut GlRenderState) {
    register_gl_pbr_extension(
        state,
        ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
        &ANISOTROPY_PBR_GL_EXTENSION,
    );
}

fn bind_anisotropy_pbr_gl_extension(
    context: &mut dyn GlPbrExtensionBindContext,
    value: &PbrExtension,
) {
    let PbrExtension::Anisotropy(extension) = value else {
        return;
    };
    context.set_float("u_flightAnisotropyStrength", extension.anisotropy_strength);
    context.set_float("u_flightAnisotropyRotation", extension.anisotropy_rotation);
    context.bind_texture(
        "u_flightAnisotropyMap",
        "u_flightAnisotropyMapUvSet",
        "u_flightAnisotropyMapTransform",
        extension.anisotropy_map.as_ref(),
        extension.anisotropy_map_uv_set,
    );
}

fn create_anisotropy_pbr_gl_extension_shader_contribution(
    context: &dyn GlPbrExtensionShaderContext,
    value: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    let PbrExtension::Anisotropy(extension) = value else {
        throw_type_error("anisotropyPbrGlExtension: expected an Anisotropy extension");
    };
    let has_map = context.is_texture_ready(extension.anisotropy_map.as_ref());
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: r#"
  float flightAnisotropyIblStrength = clamp(u_flightAnisotropyStrength * flightAnisotropySample().z, 0.0, 1.0);
  float flightAnisotropyAngle = u_flightAnisotropyRotation + atan(flightAnisotropySample().y, flightAnisotropySample().x);
  vec3 flightAnisotropyTangent = normalize(cos(flightAnisotropyAngle) * tangentDir + sin(flightAnisotropyAngle) * bitangentDir);
  vec3 flightAnisotropyReflection = normalize(mix(reflect(-V, N), flightAnisotropyTangent, flightAnisotropyIblStrength * rough * 0.35));
  vec3 flightAnisotropyPrefiltered = textureLod(u_iblPrefiltered, flightAnisotropyReflection, rough * u_iblMaxMip).rgb;
  ambient += (flightAnisotropyPrefiltered - prefiltered) * (F * brdf.x + brdf.y) * flightAnisotropyIblStrength * occ * u_iblIntensity;"#.to_string(),
        contribute_punctual: r#"
  vec3 flightAnisotropyData = flightAnisotropySample();
  float flightAnisotropyStrength = clamp(u_flightAnisotropyStrength * flightAnisotropyData.z, 0.0, 1.0);
  float flightAnisotropyAngle = u_flightAnisotropyRotation + atan(flightAnisotropyData.y, flightAnisotropyData.x);
  vec3 flightAnisotropyTangent = normalize(cos(flightAnisotropyAngle) * tangentDir + sin(flightAnisotropyAngle) * bitangentDir);
  vec3 flightAnisotropyBitangent = normalize(cross(N, flightAnisotropyTangent));
  float flightAt = max(roughness * roughness * (1.0 + flightAnisotropyStrength), 1e-3);
  float flightAb = max(roughness * roughness * (1.0 - flightAnisotropyStrength), 1e-3);
  float flightAnisotropyD = flightDistributionGgxAnisotropic(
    nDotH, dot(flightAnisotropyTangent, halfVec), dot(flightAnisotropyBitangent, halfVec), flightAt, flightAb);
  float flightAnisotropyVis = flightVisibilitySmithGgxAnisotropic(
    nDotV,
    nDotL,
    dot(flightAnisotropyTangent, V),
    dot(flightAnisotropyBitangent, V),
    dot(flightAnisotropyTangent, L),
    dot(flightAnisotropyBitangent, L),
    flightAt,
    flightAb);
  direct += (flightAnisotropyD * flightAnisotropyVis - d * vis) * fresnel * lightColor * nDotL;"#.to_string(),
        finalize: String::new(),
        fragment_declarations: format!(r#"
uniform float u_flightAnisotropyStrength;
uniform float u_flightAnisotropyRotation;
{}"#, if has_map { "uniform sampler2D u_flightAnisotropyMap;\nuniform int u_flightAnisotropyMapUvSet;\nuniform mat3 u_flightAnisotropyMapTransform;" } else { "" }),
        fragment_functions: format!(r#"
vec3 flightAnisotropySample() {{
{}
}}
float flightDistributionGgxAnisotropic(float nDotH, float tDotH, float bDotH, float at, float ab) {{
  float value = tDotH * tDotH / (at * at) + bDotH * bDotH / (ab * ab) + nDotH * nDotH;
  return 1.0 / max(PI * at * ab * value * value, 1e-7);
}}
float flightSmithLambdaGgxAnisotropic(float nDotW, float tDotW, float bDotW, float at, float ab) {{
  float projectedRoughnessSquared = at * at * tDotW * tDotW + ab * ab * bDotW * bDotW;
  float nDotWSquared = max(nDotW * nDotW, 1e-7);
  return 0.5 * (sqrt(1.0 + projectedRoughnessSquared / nDotWSquared) - 1.0);
}}
float flightVisibilitySmithGgxAnisotropic(
  float nDotV, float nDotL, float tDotV, float bDotV, float tDotL, float bDotL, float at, float ab
) {{
  float lambdaV = flightSmithLambdaGgxAnisotropic(nDotV, tDotV, bDotV, at, ab);
  float lambdaL = flightSmithLambdaGgxAnisotropic(nDotL, tDotL, bDotL, at, ab);
  return 1.0 / max(1.0 + lambdaV + lambdaL, 1e-7);
}}"#, if has_map { "  vec2 uv = u_flightAnisotropyMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0;\n  vec3 value = texture(u_flightAnisotropyMap, (u_flightAnisotropyMapTransform * vec3(uv, 1.0)).xy).rgb;\n  return vec3(value.rg * 2.0 - 1.0, value.b);" } else { "  return vec3(1.0, 0.0, 1.0);" }),
        key: format!(r#"anisotropy:{}"#, if has_map { "m" } else { "-" }),
        samples_transmission_scene_color: None,
        texture_count: if has_map { 1 } else { 0 },
    };
}

// Every anisotropy extension value is supported; the variant check keeps a kind registered against the
// wrong closed variant a plain-data unsupported-extension issue instead of a mis-bound draw.
fn is_anisotropy_pbr_gl_extension_supported(value: &PbrExtension) -> bool {
    return matches!(value, PbrExtension::Anisotropy(_));
}
