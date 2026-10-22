use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuMaterialBinding, WgpuMeshPipeline, WgpuPbrDefineKey, WgpuSkinningAdapter,
};
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_ibl_sample_layout, ensure_wgpu_scene3d_pipeline,
    ensure_wgpu_shadow_sample_layout, stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
};
use crate::wgpu_scene3d_runtime::{
    get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter,
};

const PBR_MATERIAL_BLOCK_BYTES: u64 = 192;

pub fn bind_wgpu_pbr_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    data: &[f32; 48],
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("pbr_material_uniform"),
                    size: PBR_MATERIAL_BLOCK_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("pbr_material_bind_group"),
                    layout: &pipeline.material_bind_group_layout,
                    entries: &[wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffer.as_entire_binding(),
                    }],
                });
                WgpuMaterialBinding {
                    bind_group,
                    buffer,
                    sampler: None,
                    samplers: None,
                    views: None,
                }
            });

        native
            .queue
            .write_buffer(&binding.buffer, 0, f32_as_bytes(data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn build_wgpu_pbr_define_key(key: &WgpuPbrDefineKey) -> String {
    return format!(
        "{}{}{}{}{}{}{}{}:{}{}{}{}{}{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_base_color_map { 'b' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
        if key.has_metallic_roughness_map { 'r' } else { '-' },
        if key.has_occlusion_map { 'o' } else { '-' },
        if key.has_emissive_map { 'e' } else { '-' },
        if key.has_alpha_map { 'a' } else { '-' },
        if key.clearcoat_enabled { 'C' } else { '-' },
        if key.sheen_enabled { 'S' } else { '-' },
        if key.anisotropy_enabled { 'A' } else { '-' },
        if key.iridescence_enabled { 'I' } else { '-' },
        if key.specular_enabled { 'P' } else { '-' },
        if key.subsurface_enabled { 'U' } else { '-' },
        if key.transmission_enabled { 'T' } else { '-' },
        if key.has_color_matrix {
            "x"
        } else if key.has_color_adjustment {
            "c"
        } else {
            ""
        },
    );
}

pub fn build_wgpu_pbr_define_source(key: &WgpuPbrDefineKey) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_BASE_COLOR_MAP : bool = {};\n\
         const HAS_NORMAL_MAP : bool = {};\n\
         const HAS_METALLIC_ROUGHNESS_MAP : bool = {};\n\
         const HAS_OCCLUSION_MAP : bool = {};\n\
         const HAS_EMISSIVE_MAP : bool = {};\n\
         const HAS_ALPHA_MAP : bool = {};\n\
         const CLEARCOAT : bool = {};\n\
         const SHEEN : bool = {};\n\
         const ANISOTROPY : bool = {};\n\
         const IRIDESCENCE : bool = {};\n\
         const SPECULAR_EXT : bool = {};\n\
         const SUBSURFACE : bool = {};\n\
         const TRANSMISSION : bool = {};\n",
        key.alpha_mask_enabled,
        key.double_sided,
        key.has_base_color_map,
        key.has_normal_map,
        key.has_metallic_roughness_map,
        key.has_occlusion_map,
        key.has_emissive_map,
        key.has_alpha_map,
        key.clearcoat_enabled,
        key.sheen_enabled,
        key.anisotropy_enabled,
        key.iridescence_enabled,
        key.specular_enabled,
        key.subsurface_enabled,
        key.transmission_enabled,
    );
}

pub fn compile_wgpu_pbr_pipeline(
    state: &WgpuRenderState,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_pbr_module_source_for_key(key, skinned, skinning.as_deref());
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pbr_shader"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("pbr_material_layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 5,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 6,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 7,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 8,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 9,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 10,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 11,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 12,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });

    let shadow_layout = ensure_wgpu_shadow_sample_layout(state);
    let ibl_layout = ensure_wgpu_ibl_sample_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &CreateWgpuMeshPipelineOptions {
            extra_bind_group_layout: None,
            blended,
            double_sided: key.double_sided,
            format,
            material_bind_group_layout: &material_bind_group_layout,
            module: &module,
            shadow_bind_group_layout: Some(&shadow_layout),
            pbr_sample_bind_group_layout: None,
            ibl_bind_group_layout: Some(&ibl_layout),
            skinned,
            topology: Some(wgpu::PrimitiveTopology::TriangleList),
        },
    );
}

pub fn ensure_wgpu_pbr_pipeline(
    state: &WgpuRenderState,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let full_key = WgpuPbrDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        anisotropy_enabled: key.anisotropy_enabled,
        clearcoat_enabled: key.clearcoat_enabled,
        double_sided: key.double_sided,
        has_alpha_map: key.has_alpha_map,
        has_alpha_mask: key.has_alpha_mask,
        has_base_color_map: key.has_base_color_map,
        has_color_adjustment: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_adjustment_run),
        has_color_matrix: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_matrix_run),
        has_emissive_map: key.has_emissive_map,
        has_ibl: key.has_ibl,
        has_metallic_roughness_map: key.has_metallic_roughness_map,
        has_normal_map: key.has_normal_map,
        has_occlusion_map: key.has_occlusion_map,
        has_shadow: key.has_shadow,
        has_skin: key.has_skin,
        iridescence_enabled: key.iridescence_enabled,
        modifier_define_key: key.modifier_define_key.clone(),
        sheen_enabled: key.sheen_enabled,
        specular_enabled: key.specular_enabled,
        subsurface_enabled: key.subsurface_enabled,
        transmission_enabled: key.transmission_enabled,
    };
    let cache_key = format!(
        "pbr:{:?}|{}",
        format,
        build_wgpu_pbr_define_key(&full_key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_pbr_pipeline(state, &full_key, format, blended, skinned);
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_pbr_module_body() -> &'static str {
    return PBR_WGSL_BODY;
}

pub fn get_wgpu_pbr_module_source_for_key(
    key: &WgpuPbrDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    let define_source = build_wgpu_pbr_define_source(key);
    return format!("{}{}", define_source, PBR_WGSL_BODY);
}

pub const PBR_WGSL_BODY: &str = r#"
const PI : f32 = 3.14159265359;
const MAX_FORWARD_LIGHTS : u32 = 4u;

struct MaterialBlock {
  baseColor : vec4f,
  emissive : vec4f,
  factors : vec4f,
  flags : vec4f,
  clearcoat : vec4f,
  sheen : vec4f,
  anisotropy : vec4f,
  iridescence : vec4f,
  specular : vec4f,
  subsurface : vec4f,
  thickness : vec4f,
  transmission : vec4f,
};

@group(2) @binding(0) var<uniform> material : MaterialBlock;
@group(2) @binding(1) var baseColorSampler : sampler;
@group(2) @binding(2) var metallicRoughnessSampler : sampler;
@group(2) @binding(3) var normalSampler : sampler;
@group(2) @binding(4) var occlusionSampler : sampler;
@group(2) @binding(5) var emissiveSampler : sampler;
@group(2) @binding(6) var alphaSampler : sampler;
@group(2) @binding(7) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(8) var metallicRoughnessTexture : texture_2d<f32>;
@group(2) @binding(9) var normalTexture : texture_2d<f32>;
@group(2) @binding(10) var occlusionTexture : texture_2d<f32>;
@group(2) @binding(11) var emissiveTexture : texture_2d<f32>;
@group(2) @binding(12) var alphaTexture : texture_2d<f32>;

struct ShadowUniforms {
  lightViewProjection : mat4x4f,
  bias : vec4f,
};

@group(3) @binding(0) var<uniform> shadow : ShadowUniforms;
@group(3) @binding(1) var shadowTexture : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

struct Ibl {
  params : vec4f,
};

@group(3) @binding(3) var<uniform> ibl : Ibl;
@group(3) @binding(4) var iblIrradiance : texture_cube<f32>;
@group(3) @binding(5) var iblPrefiltered : texture_cube<f32>;
@group(3) @binding(6) var iblBrdf : texture_2d<f32>;
@group(3) @binding(7) var iblSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
  @location(4) @interpolate(flat) objectAlpha : f32,
  @location(5) @interpolate(flat) instanceColor : vec4f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
  @location(6) instanceModel0 : vec4f,
  @location(7) instanceModel1 : vec4f,
  @location(8) instanceModel2 : vec4f,
  @location(9) instanceModel3 : vec4f,
  @location(10) instanceTint : vec4f,
) -> VertexOutput {
  var out : VertexOutput;
  let instanceModel = mat4x4f(instanceModel0, instanceModel1, instanceModel2, instanceModel3);
  let instanceBasis = mat3x3f(instanceModel[0].xyz, instanceModel[1].xyz, instanceModel[2].xyz);
  var localPosition = instanceModel * vec4f(position, 1.0);
  var localNormal = instanceBasis * normal;
  var localTangent = instanceBasis * tangent.xyz;
  let world = draw.world * localPosition;
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * localNormal;
  let tangentHandedness = tangent.w * select(1.0, -1.0, determinant(draw.normalMatrix) < 0.0);
  out.worldTangent = vec4f(draw.normalMatrix * localTangent, tangentHandedness);
  out.uv = (draw.uvTransform * vec3f(uv, 1.0)).xy;
  out.objectAlpha = draw.params.x;
  out.instanceColor = instanceTint;
  return out;
}

fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f) -> f32 {
  let biasedPos = worldPos + geometricNormal * shadow.bias.y;
  let lightClip = shadow.lightViewProjection * vec4f(biasedPos, 1.0);
  let ndc = lightClip.xyz / lightClip.w;
  let uv = ndc.xy * vec2f(0.5, -0.5) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 1.0;
  }
  let depth = ndc.z - shadow.bias.x;
  return textureSampleCompare(shadowTexture, shadowSampler, uv, depth);
}

fn distributionGgx(nDotH : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

fn visibilitySmith(nDotV : f32, nDotL : f32, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let k = a * 0.5;
  let gv = nDotV / (nDotV * (1.0 - k) + k);
  let gl = nDotL / (nDotL * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta : f32, f0 : vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn fresnelSchlickRoughness(cosTheta : f32, f0 : vec3f, roughness : f32) -> vec3f {
  let fMax = max(vec3f(1.0 - roughness), f0);
  return f0 + (fMax - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn sampleIblAmbient(N : vec3f, V : vec3f, rough : f32, f0 : vec3f, diffuseColor : vec3f, occ : f32) -> vec3f {
  let nv = max(dot(N, V), 1e-4);
  let F = fresnelSchlickRoughness(nv, f0, rough);
  let diffuse = textureSampleLevel(iblIrradiance, iblSampler, N, 0.0).rgb * diffuseColor;
  let R = reflect(-V, N);
  let prefiltered = textureSampleLevel(iblPrefiltered, iblSampler, R, rough * ibl.params.z).rgb;
  let brdf = textureSampleLevel(iblBrdf, iblSampler, vec2f(nv, rough), 0.0).rg;
  let specular = prefiltered * (F * brdf.x + brdf.y);
  return ((vec3f(1.0) - F) * diffuse + specular) * occ * ibl.params.y;
}

fn distributionGgxAnisotropic(nDotH : f32, tDotH : f32, bDotH : f32, at : f32, ab : f32) -> f32 {
  let d = tDotH * tDotH / (at * at) + bDotH * bDotH / (ab * ab) + nDotH * nDotH;
  return 1.0 / max(PI * at * ab * d * d, 1e-7);
}

fn distributionCharlie(nDotH : f32, roughness : f32) -> f32 {
  let r = clamp(roughness, 0.07, 1.0);
  let invR = 1.0 / r;
  let cos2h = nDotH * nDotH;
  let sin2h = max(1.0 - cos2h, 1e-4);
  return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}

fn visibilitySheen(nDotV : f32, nDotL : f32) -> f32 {
  return 1.0 / max(4.0 * (nDotL + nDotV - nDotL * nDotV), 1e-4);
}

fn iridescentFresnel(cosTheta : f32, f0 : vec3f, thicknessNm : f32, filmIor : f32) -> vec3f {
  let opd = 2.0 * filmIor * thicknessNm * cosTheta;
  let bands = vec3f(580.0, 540.0, 460.0);
  let phase = 2.0 * PI * opd / bands;
  let shift = vec3f(0.5) + vec3f(0.5) * cos(phase);
  let base = fresnelSchlick(cosTheta, f0);
  return mix(base, shift, clamp(thicknessNm / 1000.0, 0.0, 1.0));
}

fn rangeWindow(dist2 : f32, invSqrRange : f32) -> f32 {
  let factor = dist2 * invSqrRange;
  let windowed = clamp(1.0 - factor * factor, 0.0, 1.0);
  return windowed * windowed;
}

fn shadePbrPunctual(N : vec3f, V : vec3f, tangentDir : vec3f, bitangentDir : vec3f, L : vec3f,
                    lightColor : vec3f, f0 : vec3f, diffuseColor : vec3f, roughness : f32,
                    metallic : f32, anisoT : vec3f, anisoB : vec3f, at : f32, ab : f32) -> vec3f {
  let nDotV = max(dot(N, V), 1e-4);
  let halfVec = normalize(V + L);
  let nDotL = max(dot(N, L), 0.0);
  let nDotH = max(dot(N, halfVec), 0.0);
  let vDotH = max(dot(V, halfVec), 0.0);

  var d = distributionGgx(nDotH, roughness);
  if (ANISOTROPY) {
    let tDotH = dot(anisoT, halfVec);
    let bDotH = dot(anisoB, halfVec);
    d = distributionGgxAnisotropic(nDotH, tDotH, bDotH, at, ab);
  }
  let vis = visibilitySmith(nDotV, nDotL, roughness);
  let fresnel = fresnelSchlick(vDotH, f0);

  let specular = d * vis * fresnel;
  let kd = (vec3f(1.0) - fresnel) * (1.0 - metallic);
  let brdf = kd * diffuseColor / PI + specular;
  var direct = brdf * lightColor * nDotL;

  if (SUBSURFACE) {
    let wrap = clamp((dot(N, L) + 0.5) / 2.25, 0.0, 1.0);
    let translucency = material.subsurface.x / (1.0 + material.thickness.x);
    direct = direct + translucency * wrap * material.subsurface.yzw * diffuseColor * lightColor;
  }

  if (SHEEN) {
    let sheenD = distributionCharlie(nDotH, material.sheen.w);
    let sheenV = visibilitySheen(nDotV, nDotL);
    direct = direct + material.sheen.rgb * sheenD * sheenV * lightColor * nDotL;
  }

  if (CLEARCOAT) {
    let ccRough = clamp(material.clearcoat.y, 0.04, 1.0);
    let ccD = distributionGgx(nDotH, ccRough);
    let ccVis = visibilitySmith(nDotV, nDotL, ccRough);
    let ccF = fresnelSchlick(vDotH, vec3f(0.04)) * material.clearcoat.x;
    let ccSpec = ccD * ccVis * ccF * lightColor * nDotL;
    direct = direct * (vec3f(1.0) - ccF) + ccSpec;
  }

  return direct;
}

fn flightMeshCoverage(alpha : f32, objectAlpha : f32, fadeAlpha : f32) -> f32 {
  return alpha * objectAlpha * fadeAlpha;
}

fn flightPremultipliedOutput(color : vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor * in.instanceColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, baseColorSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * sampled.rgb, baseColor.a * sampled.a);
  }

  if (HAS_ALPHA_MAP) {
    baseColor.a = baseColor.a * textureSample(alphaTexture, alphaSampler, in.uv).g;
  }

  if (ALPHA_MASK && baseColor.a < material.flags.x) {
    discard;
  }
  if (ALPHA_MASK) {
    baseColor.a = 1.0;
  }

  var geometricNormal = normalize(in.worldNormal);
  if (DOUBLE_SIDED && !isFront) {
    geometricNormal = -geometricNormal;
  }

  let tangent = normalize(in.worldTangent.xyz - geometricNormal * dot(in.worldTangent.xyz, geometricNormal));
  let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    var tangentNormal = textureSample(normalTexture, normalSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    tangentNormal = vec3f(tangentNormal.xy * material.factors.z, tangentNormal.z);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
  let nDotV = max(dot(normal, viewDir), 1e-4);

  var roughness = clamp(material.factors.y, 0.04, 1.0);
  var metallic = clamp(material.factors.x, 0.0, 1.0);
  if (HAS_METALLIC_ROUGHNESS_MAP) {
    let mr = textureSample(metallicRoughnessTexture, metallicRoughnessSampler, in.uv);
    roughness = clamp(roughness * mr.g, 0.04, 1.0);
    metallic = clamp(metallic * mr.b, 0.0, 1.0);
  }

  var occlusion = 1.0;
  if (HAS_OCCLUSION_MAP) {
    let ao = textureSample(occlusionTexture, occlusionSampler, in.uv).r;
    occlusion = mix(1.0, ao, clamp(material.factors.w, 0.0, 1.0));
  }

  let albedo = baseColor.rgb;
  var f0 = mix(vec3f(0.04), albedo, metallic);

  if (SPECULAR_EXT) {
    let dielectricF0 = min(0.04 * material.specular.yzw, vec3f(1.0)) * material.specular.x;
    f0 = mix(dielectricF0, albedo, metallic);
  }

  if (IRIDESCENCE) {
    let irid = iridescentFresnel(nDotV, f0, material.iridescence.z, material.iridescence.y);
    f0 = mix(f0, irid, material.iridescence.x);
  }

  let diffuseColor = albedo * (1.0 - metallic);

  let anisoStrength = clamp(material.anisotropy.x, 0.0, 1.0);
  let cosR = cos(material.anisotropy.y);
  let sinR = sin(material.anisotropy.y);
  let anisoT = normalize(cosR * tangent + sinR * bitangent);
  let anisoB = normalize(cross(normal, anisoT));
  let at = max(roughness * roughness * (1.0 + anisoStrength), 1e-3);
  let ab = max(roughness * roughness * (1.0 - anisoStrength), 1e-3);

  var radiance = vec3f(0.0);

  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let direct = shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                  frame.directionalRadiance.rgb, f0, diffuseColor, roughness,
                                  metallic, anisoT, anisoB, at, ab);
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, geometricNormal);
  }

  let pointCount = u32(frame.punctualCounts.x);
  for (var i = 0u; i < MAX_FORWARD_LIGHTS; i++) {
    if (i >= pointCount) { break; }
    let toLight = frame.pointLights[i * 2u + 0u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.pointLights[i * 2u + 1u].w) / max(dist2, 1e-4);
    radiance = radiance + shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                           frame.pointLights[i * 2u + 1u].xyz * atten, f0,
                                           diffuseColor, roughness, metallic,
                                           anisoT, anisoB, at, ab);
  }

  let spotCount = u32(frame.punctualCounts.y);
  for (var j = 0u; j < MAX_FORWARD_LIGHTS; j++) {
    if (j >= spotCount) { break; }
    let toLight = frame.spotLights[j * 4u + 0u].xyz - in.worldPosition;
    let dist2 = dot(toLight, toLight);
    let lightDir = toLight * inverseSqrt(max(dist2, 1e-8));
    let atten = rangeWindow(dist2, frame.spotLights[j * 4u + 1u].w) / max(dist2, 1e-4);
    let cone = smoothstep(frame.spotLights[j * 4u + 3u].y, frame.spotLights[j * 4u + 3u].x,
                          dot(normalize(frame.spotLights[j * 4u + 2u].xyz), -lightDir));
    radiance = radiance + shadePbrPunctual(normal, viewDir, tangent, bitangent, lightDir,
                                           frame.spotLights[j * 4u + 1u].xyz * atten * cone, f0,
                                           diffuseColor, roughness, metallic,
                                           anisoT, anisoB, at, ab);
  }

  if (ibl.params.x > 0.5) {
    radiance = radiance + sampleIblAmbient(normal, viewDir, roughness, f0, diffuseColor, occlusion);
  } else if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuseColor * frame.ambientRadiance.rgb * occlusion;
  }

  let hemisphereCount = u32(frame.punctualCounts.z);
  for (var k = 0u; k < MAX_FORWARD_LIGHTS; k++) {
    if (k >= hemisphereCount) { break; }
    let hf = 0.5 + 0.5 * dot(normal, frame.hemisphereLights[k * 3u + 2u].xyz);
    radiance = radiance + mix(frame.hemisphereLights[k * 3u + 1u].xyz,
                              frame.hemisphereLights[k * 3u + 0u].xyz, hf)
                          * diffuseColor * occlusion;
  }

  var emissive = material.emissive.rgb;
  if (HAS_EMISSIVE_MAP) {
    emissive = emissive * textureSample(emissiveTexture, emissiveSampler, in.uv).rgb;
  }
  radiance = radiance + emissive;

  var alpha = baseColor.a;
  if (TRANSMISSION) {
    radiance = radiance * mix(vec3f(1.0), material.transmission.yzw, material.transmission.x);
    alpha = alpha * (1.0 - material.transmission.x);
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(alpha, in.objectAlpha, draw.params.y)));
}
"#;
