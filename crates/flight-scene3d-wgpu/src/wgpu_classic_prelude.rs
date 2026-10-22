// flight-lint: allow-file(contract-vocabulary) D17: the classic family seams take and return native wgpu values
//! The classic (Lambert / Phong / BlinnPhong) uber-shader family (TS `wgpuClassicPrelude.ts`): the
//! define key, the WGSL module assembly (per-map and the shaded family's shared-sampler contract),
//! pipeline compilation and caching, and the per-material surface binding.

use flight_color::LinearColor;
use flight_render_wgpu::{
    WgpuColorAdjustmentMaterialFeature, WgpuRenderState, WgpuSkinningAdapter,
    create_wgpu_bind_group_layout, create_wgpu_shader_module,
    get_wgpu_color_adjustment_material_feature, get_wgpu_render_state_native_device,
    get_wgpu_texture_format_name, write_wgpu_buffer,
};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    WGPU_DIRECTIONAL_SHADOW_WGSL, create_wgpu_mesh_pipeline, ensure_wgpu_per_map_material_binding,
    ensure_wgpu_scene3d_pipeline, ensure_wgpu_shadow_sample_layout, get_wgpu_material_sampler,
    get_wgpu_mesh_prelude_wgsl, resolve_wgpu_material_texture_view,
    splice_wgpu_color_adjustment_prelude, stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

// Classic material uniform: diffuse vec4f + specular vec4f + params vec4f = 48 bytes / 12 floats.
// params.x = shininess, params.y = alphaCutoff.
const CLASSIC_UNIFORM_BYTES: u64 = 48;

fn assemble_wgpu_classic_module_source(
    key: &WgpuClassicDefineKey,
    skinned: bool,
    skinning: Option<&WgpuSkinningAdapter>,
    body: &str,
) -> String {
    return format!(
        "const LIGHTING_PHONG : bool = {};\nconst LIGHTING_BLINNPHONG : bool = {};\nconst ALPHA_MASK : bool = {};\nconst DOUBLE_SIDED : bool = {};\nconst HAS_DIFFUSE_MAP : bool = {};\nconst HAS_SPECULAR_MAP : bool = {};\nconst HAS_NORMAL_MAP : bool = {};\nconst HAS_ALPHA_MAP : bool = {};\n{}{}",
        key.lighting_model == WgpuClassicLightingModel::Phong,
        key.lighting_model == WgpuClassicLightingModel::BlinnPhong,
        key.alpha_mask_enabled,
        key.double_sided,
        key.has_diffuse_map,
        key.has_specular_map,
        key.has_normal_map,
        key.has_alpha_map == Some(true),
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        body
    );
}

/// Ensures (cached per material key) the classic material bind group (uniform, one sampler per map,
/// the diffuse/specular/normal/alpha views) and rewrites its uniform with the surface's linear
/// diffuse and specular colors, shininess and alpha cutoff (TS `bindWgpuClassicSurface`). Returns the
/// bind group for the caller to set at group(2).
pub fn bind_wgpu_classic_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuClassicPipeline,
    material_key: u64,
    diffuse: &LinearColor,
    specular: &LinearColor,
    shininess: f32,
    alpha_cutoff: f32,
    diffuse_map: Option<&Texture>,
    specular_map: Option<&Texture>,
    normal_map: Option<&Texture>,
    alpha_map: Option<&Texture>,
) -> wgpu::BindGroup {
    // Re-resolve the samplers and map views every bind so a live map mutation is picked up; the
    // binding rebuilds its bind group only when one actually differs.
    let samplers = [
        get_wgpu_material_sampler(state, diffuse_map),
        get_wgpu_material_sampler(state, specular_map),
        get_wgpu_material_sampler(state, normal_map),
        get_wgpu_material_sampler(state, alpha_map),
    ];
    let views = [
        resolve_wgpu_material_texture_view(state, diffuse_map),
        resolve_wgpu_material_texture_view(state, specular_map),
        resolve_wgpu_material_texture_view(state, normal_map),
        resolve_wgpu_material_texture_view(state, alpha_map),
    ];
    let binding = ensure_wgpu_per_map_material_binding(
        state,
        material_key,
        &pipeline.material_bind_group_layout,
        CLASSIC_UNIFORM_BYTES,
        &samplers,
        &views,
    );

    let values: [f32; 12] = [
        diffuse.r,
        diffuse.g,
        diffuse.b,
        diffuse.a,
        specular.r,
        specular.g,
        specular.b,
        specular.a,
        shininess,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
    // The diffuse map's uv transform drives the shared vertex uv the classic maps sample.
    stash_wgpu_uv_transform(state, diffuse_map);
    return binding.bind_group;
}

/// A short, stable string identity for a classic define key (TS `buildWgpuClassicDefineKey`): the
/// lighting model first (l/p/b) so the three models never collide, then the feature flags.
pub fn build_wgpu_classic_define_key(key: &WgpuClassicDefineKey) -> String {
    let model = match key.lighting_model {
        WgpuClassicLightingModel::Phong => 'p',
        WgpuClassicLightingModel::BlinnPhong => 'b',
        WgpuClassicLightingModel::Lambert => 'l',
    };
    let adjustment = if key.has_color_matrix == Some(true) {
        "x"
    } else if key.has_color_adjustment == Some(true) {
        "c"
    } else {
        ""
    };
    return format!(
        "{}{}{}{}{}{}{}{}",
        model,
        flag(key.alpha_mask_enabled, 'm'),
        flag(key.double_sided, 'd'),
        flag(key.has_diffuse_map, 'd'),
        flag(key.has_specular_map, 's'),
        flag(key.has_normal_map, 'n'),
        flag(key.has_alpha_map == Some(true), 'a'),
        adjustment
    );
}

/// Compiles the classic module for a define key and builds its pipeline for `format`, with the
/// group(2) layout (uniform, four samplers, four map textures) and the group(3) shadow-sample layout
/// (TS `compileWgpuClassicPipeline`). No caching.
pub fn compile_wgpu_classic_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    skinned: Option<bool>,
    color_adjustment_feature: Option<&WgpuColorAdjustmentMaterialFeature>,
) -> WgpuClassicPipeline {
    let blended = blended.unwrap_or(false);
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_classic_module_source_for_key(
            key,
            Some(skinned),
            skinning,
            color_adjustment_feature,
        ),
    );
    let mut entries = vec![uniform_entry(0)];
    for binding in 1..=4 {
        entries.push(sampler_entry(binding));
    }
    for binding in 5..=8 {
        entries.push(texture_entry(binding));
    }
    let material_bind_group_layout = create_wgpu_bind_group_layout(&native, &entries);
    // The group(3) shadow-sample layout opts this pipeline into directional shadow reception.
    let shadow_bind_group_layout = ensure_wgpu_shadow_sample_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: Some(blended),
            double_sided: key.double_sided,
            extra_bind_group_layout: None,
            format,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: Some(shadow_bind_group_layout),
            skinned: Some(skinned),
            topology: None,
        },
    );
}

/// Resolves the classic pipeline for a define key and color format through the shared scene
/// pipeline cache under the `classic:` namespace (TS `ensureWgpuClassicPipeline`), folding the
/// active color-adjustment run into the key.
pub fn ensure_wgpu_classic_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuClassicPipeline {
    let runtime = get_wgpu_scene3d_runtime(state);
    let mut full_key = *key;
    full_key.has_color_adjustment = Some(runtime.active_color_adjustment_run);
    full_key.has_color_matrix = Some(runtime.active_color_matrix_run);
    let cache_key = format!(
        "classic:{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_classic_define_key(&full_key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        let feature = get_wgpu_color_adjustment_material_feature(state);
        return compile_wgpu_classic_pipeline(
            state,
            &full_key,
            format,
            Some(blended),
            Some(skinned),
            feature,
        );
    });
}

fn flag(value: bool, letter: char) -> char {
    return if value { letter } else { '-' };
}

// The classic material block and fs_main (TS `CLASSIC_WGSL_BODY`): the fragment tail, the material
// bindings, the shared directional shadow sampling and the classic BRDF over every light family.
fn get_classic_wgsl_body() -> String {
    return format!(
        "{}{}{}{}",
        WGPU_MESH_FRAGMENT_TAIL, CLASSIC_WGSL_PRE, WGPU_DIRECTIONAL_SHADOW_WGSL, CLASSIC_WGSL_POST
    );
}

/// The full WGSL module for a define key (TS `getWgpuClassicModuleSourceForKey`): the const-flag
/// block, the shared mesh prelude and the classic material block + `fs_main`, with the registered
/// color-adjustment chunk spliced after the shade for a promoted variant.
pub fn get_wgpu_classic_module_source_for_key(
    key: &WgpuClassicDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
    color_adjustment_feature: Option<&WgpuColorAdjustmentMaterialFeature>,
) -> String {
    let skinned = skinned.unwrap_or(false);
    let mut source =
        assemble_wgpu_classic_module_source(key, skinned, skinning, &get_classic_wgsl_body());
    let color_matrix = key.has_color_matrix == Some(true);
    if (key.has_color_adjustment == Some(true) || color_matrix)
        && let Some(feature) = color_adjustment_feature
    {
        let apply = if color_matrix {
            "applyFlightColorMatrix(flightColor, draw.flightColorMatrix0, draw.flightColorMatrix1, draw.flightColorMatrix2, draw.flightColorMatrix3, draw.flightColorMatrixOffset)"
        } else {
            "applyFlightColorAdjustment(flightColor, draw.flightColorScale, draw.flightColorBias)"
        };
        source = splice_wgpu_color_adjustment_prelude(&source, feature, Some(color_matrix)).replacen(
            "  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));",
            &format!(
                "  var flightColor = vec4f(radiance, diffuse.a);\n  flightColor = {};\n  flightColor.a = flightMeshCoverage(flightColor.a, in.objectAlpha, draw.params.y);\n  return flightPremultipliedOutput(flightColor);",
                apply
            ),
            1,
        );
    }
    return source;
}

/// The classic module with the shaded family's legacy shared-sampler group(2) contract: one
/// sampler at binding 1, base textures at 2..5 and modifier textures from 6 (TS
/// `getWgpuClassicSharedSamplerModuleSourceForKey`).
pub fn get_wgpu_classic_shared_sampler_module_source_for_key(
    key: &WgpuClassicDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    let body = get_classic_wgsl_body()
        .replacen(
            "@group(2) @binding(1) var diffuseSampler : sampler;\n@group(2) @binding(2) var specularSampler : sampler;\n@group(2) @binding(3) var normalSampler : sampler;\n@group(2) @binding(4) var alphaSampler : sampler;\n@group(2) @binding(5) var diffuseTexture : texture_2d<f32>;\n@group(2) @binding(6) var specularTexture : texture_2d<f32>;\n@group(2) @binding(7) var normalTexture : texture_2d<f32>;\n@group(2) @binding(8) var alphaTexture : texture_2d<f32>;",
            "@group(2) @binding(1) var materialSampler : sampler;\n@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;\n@group(2) @binding(3) var specularTexture : texture_2d<f32>;\n@group(2) @binding(4) var normalTexture : texture_2d<f32>;\n@group(2) @binding(5) var alphaTexture : texture_2d<f32>;",
            1,
        )
        .replace("diffuseSampler", "materialSampler")
        .replace("specularSampler", "materialSampler")
        .replace("normalSampler", "materialSampler")
        .replace("alphaSampler", "materialSampler");
    return assemble_wgpu_classic_module_source(key, skinned.unwrap_or(false), skinning, &body);
}

fn sampler_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    };
}

fn texture_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    };
}

fn uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    };
}

const CLASSIC_WGSL_PRE: &str = r#"
struct ClassicMaterial {
  diffuse : vec4f,   // linear rgba
  specular : vec4f,  // linear rgb; a unused
  params : vec4f,    // x = shininess, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ClassicMaterial;
@group(2) @binding(1) var diffuseSampler : sampler;
@group(2) @binding(2) var specularSampler : sampler;
@group(2) @binding(3) var normalSampler : sampler;
@group(2) @binding(4) var alphaSampler : sampler;
@group(2) @binding(5) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(6) var specularTexture : texture_2d<f32>;
@group(2) @binding(7) var normalTexture : texture_2d<f32>;
@group(2) @binding(8) var alphaTexture : texture_2d<f32>;

"#;

const CLASSIC_WGSL_POST: &str = r#"

// Smooth finite-range window over inverse-square falloff. A non-positive inverse range means
// unlimited range, matching packScene3DLightBlock and the GL classic/PBR preludes.
fn rangeWindow(dist2 : f32, invSqrRange : f32) -> f32 {
  if (invSqrRange <= 0.0) {
    return 1.0;
  }
  let factor = clamp(1.0 - dist2 * invSqrRange, 0.0, 1.0);
  return factor * factor;
}

// One classic-light contribution shared by directional, point, and spot lights. Keeping the BRDF in
// one function prevents the positional families from drifting from the directional model.
fn shadeClassicLight(normal : vec3f, lightDir : vec3f, lightColor : vec3f, diffuseRgb : vec3f,
                     specularColor : vec3f, worldPosition : vec3f) -> vec3f {
  let nDotL = max(dot(normal, lightDir), 0.0);
  var result = diffuseRgb * nDotL * lightColor;
  if ((LIGHTING_PHONG || LIGHTING_BLINNPHONG) && nDotL > 0.0) {
    let viewDir = normalize(frame.cameraPosition.xyz - worldPosition);
    var specAngle = 0.0;
    if (LIGHTING_PHONG) {
      specAngle = max(dot(reflect(-lightDir, normal), viewDir), 0.0);
    } else {
      specAngle = max(dot(normal, normalize(lightDir + viewDir)), 0.0);
    }
    let specular = pow(specAngle, max(material.params.x, 1.0));
    result = result + specular * specularColor * lightColor;
  }
  return result;
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var diffuse = material.diffuse * in.instanceColor;
  if (HAS_DIFFUSE_MAP) {
    let sampled = textureSample(diffuseTexture, diffuseSampler, in.uv);
    diffuse = vec4f(diffuse.rgb * sampled.rgb, diffuse.a * sampled.a);
  }

  // Dedicated coverage (opacity) map: its green channel is linear data, multiplied into alpha before
  // the alpha-mask cutoff so 'mask' cutout and 'blend' transparency both see the combined coverage.
  if (HAS_ALPHA_MAP) {
    diffuse.a = diffuse.a * textureSample(alphaTexture, alphaSampler, in.uv).g;
  }

  if (ALPHA_MASK && diffuse.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    diffuse.a = 1.0;
  }

  var geometricNormal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    geometricNormal = -geometricNormal;
  }

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, normalSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  // Specular color is resolved here in UNIFORM control flow. WGSL forbids textureSample inside the
  // per-pixel lighting branch below (it depends on nDotL, a non-uniform value), so the map sample is
  // hoisted out. It starts at the material specular; when a specular map is present its sampled value
  // multiplies in just below (an absent map binds a placeholder view and this stays the flat specular).
  var specularColor = material.specular.rgb;
  if (HAS_SPECULAR_MAP) {
    let sampledSpecular = textureSample(specularTexture, specularSampler, in.uv);
    specularColor = specularColor * sampledSpecular.rgb;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction).
  // The whole directional contribution (diffuse + specular) is PCF shadow-mapped, mirroring the PBR path;
  // sampleDirectionalShadow returns 1.0 when no shadow map is bound, so an unshadowed scene is unchanged.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let direct = shadeClassicLight(normal, lightDir, frame.directionalRadiance.rgb, diffuse.rgb,
                                   specularColor, in.worldPosition);
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, geometricNormal);
  }

  // Point lights: surface-to-light direction with smooth inverse-square range falloff.
  let pointCount = u32(frame.punctualCounts.x);
  for (var point = 0u; point < 4u; point = point + 1u) {
    if (point >= pointCount) { break; }
    let toLight = frame.pointLights[point * 2u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.pointLights[point * 2u + 1u].w) / max(dist2, 1e-4);
    radiance = radiance + shadeClassicLight(normal, lightDir,
      frame.pointLights[point * 2u + 1u].xyz * atten, diffuse.rgb, specularColor, in.worldPosition);
  }

  // Spot lights: point attenuation multiplied by the smooth inner/outer cone window.
  let spotCount = u32(frame.punctualCounts.y);
  for (var spot = 0u; spot < 4u; spot = spot + 1u) {
    if (spot >= spotCount) { break; }
    let toLight = frame.spotLights[spot * 4u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.spotLights[spot * 4u + 1u].w) / max(dist2, 1e-4);
    let cone = smoothstep(frame.spotLights[spot * 4u + 3u].y, frame.spotLights[spot * 4u + 3u].x,
                          dot(normalize(frame.spotLights[spot * 4u + 2u].xyz), -lightDir));
    radiance = radiance + shadeClassicLight(normal, lightDir,
      frame.spotLights[spot * 4u + 1u].xyz * atten * cone, diffuse.rgb, specularColor, in.worldPosition);
  }

  // Ambient term: flat irradiance over the diffuse albedo.
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

  // Hemisphere fill: sky/ground gradient blended by the normal's up-axis alignment.
  let hemisphereCount = u32(frame.punctualCounts.z);
  for (var hemisphere = 0u; hemisphere < 4u; hemisphere = hemisphere + 1u) {
    if (hemisphere >= hemisphereCount) { break; }
    let factor = 0.5 + 0.5 * dot(normal, frame.hemisphereLights[hemisphere * 3u + 2u].xyz);
    radiance = radiance + mix(frame.hemisphereLights[hemisphere * 3u + 1u].xyz,
      frame.hemisphereLights[hemisphere * 3u].xyz, factor) * diffuse.rgb;
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));
}
"#;
