use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuClassicDefineKey, WgpuClassicLightingModel, WgpuMaterialBinding, WgpuMeshPipeline,
    WgpuSkinningAdapter,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, ensure_wgpu_shadow_sample_layout,
    get_wgpu_mesh_prelude_wgsl, stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
    WGPU_DIRECTIONAL_SHADOW_WGSL,
};
use crate::wgpu_scene3d_runtime::{
    get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter,
};

const CLASSIC_UNIFORM_BYTES: u64 = 48;

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn bind_wgpu_classic_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    diffuse: &[f32; 4],
    specular: &[f32; 4],
    shininess: f32,
    alpha_cutoff: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("classic_material_uniform"),
                    size: CLASSIC_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("classic_material_bind_group"),
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

        let data: [f32; 12] = [
            diffuse[0],
            diffuse[1],
            diffuse[2],
            diffuse[3],
            specular[0],
            specular[1],
            specular[2],
            specular[3],
            shininess,
            alpha_cutoff,
            0.0,
            0.0,
        ];
        native
            .queue
            .write_buffer(&binding.buffer, 0, f32_as_bytes(&data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn build_wgpu_classic_define_key(key: &WgpuClassicDefineKey) -> String {
    let model = match key.lighting_model {
        WgpuClassicLightingModel::Phong => 'p',
        WgpuClassicLightingModel::BlinnPhong => 'b',
        WgpuClassicLightingModel::Lambert => 'l',
    };
    return format!(
        "{}{}{}{}{}{}{}",
        model,
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_diffuse_map { 'd' } else { '-' },
        if key.has_specular_map { 's' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
        if key.has_alpha_map { 'a' } else { '-' },
    );
}

pub fn compile_wgpu_classic_pipeline(
    state: &WgpuRenderState,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_classic_module_source_for_key(key, skinned, skinning.as_deref());
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("classic_shader"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("classic_material_layout"),
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
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 6,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
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
                ],
            });
    return create_wgpu_mesh_pipeline(
        state,
        &CreateWgpuMeshPipelineOptions {
            extra_bind_group_layout: None,
            blended,
            double_sided: key.double_sided,
            format,
            material_bind_group_layout: &material_bind_group_layout,
            module: &module,
            shadow_bind_group_layout: Some(ensure_wgpu_shadow_sample_layout(state)),
            pbr_sample_bind_group_layout: None,
            ibl_bind_group_layout: None,
            skinned,
            topology: Some(wgpu::PrimitiveTopology::TriangleList),
        },
    );
}

pub fn ensure_wgpu_classic_pipeline(
    state: &WgpuRenderState,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let full_key = WgpuClassicDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        double_sided: key.double_sided,
        has_alpha_map: key.has_alpha_map,
        has_color_adjustment: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_adjustment_run),
        has_color_matrix: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_matrix_run),
        has_diffuse_map: key.has_diffuse_map,
        has_normal_map: key.has_normal_map,
        has_specular_map: key.has_specular_map,
        lighting_model: key.lighting_model,
    };
    let cache_key = format!(
        "classic:{:?}|{}",
        format,
        build_wgpu_classic_define_key(&full_key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_classic_pipeline(state, &full_key, format, blended, skinned);
    });
}

pub fn get_wgpu_classic_module_source_for_key(
    key: &WgpuClassicDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return assemble_wgpu_classic_module_source(key, skinned, skinning, CLASSIC_WGSL_BODY);
}

pub fn get_wgpu_classic_shared_sampler_module_source_for_key(
    key: &WgpuClassicDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return assemble_wgpu_classic_module_source(
        key,
        skinned,
        skinning,
        CLASSIC_SHARED_SAMPLER_WGSL_BODY,
    );
}

fn assemble_wgpu_classic_module_source(
    key: &WgpuClassicDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
    body: &str,
) -> String {
    let is_phong = key.lighting_model == WgpuClassicLightingModel::Phong;
    let is_blinn = key.lighting_model == WgpuClassicLightingModel::BlinnPhong;
    return format!(
        "const LIGHTING_PHONG : bool = {};\n\
         const LIGHTING_BLINNPHONG : bool = {};\n\
         const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_DIFFUSE_MAP : bool = {};\n\
         const HAS_SPECULAR_MAP : bool = {};\n\
         const HAS_NORMAL_MAP : bool = {};\n\
         const HAS_ALPHA_MAP : bool = {};\n\
         {}{}",
        is_phong,
        is_blinn,
        key.alpha_mask_enabled,
        key.double_sided,
        key.has_diffuse_map,
        key.has_specular_map,
        key.has_normal_map,
        key.has_alpha_map,
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        body,
    );
}

pub const CLASSIC_WGSL_BODY: &str = r#"
struct ClassicMaterial {
  diffuse : vec4f,
  specular : vec4f,
  params : vec4f,
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

@group(3) @binding(0) var<uniform> shadow : ShadowUniforms;
@group(3) @binding(1) var shadowTexture : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

fn rangeWindow(dist2 : f32, invSqrRange : f32) -> f32 {
  if (invSqrRange <= 0.0) {
    return 1.0;
  }
  let factor = clamp(1.0 - dist2 * invSqrRange, 0.0, 1.0);
  return factor * factor;
}

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

  var specularColor = material.specular.rgb;
  if (HAS_SPECULAR_MAP) {
    let sampledSpecular = textureSample(specularTexture, specularSampler, in.uv);
    specularColor = specularColor * sampledSpecular.rgb;
  }

  var radiance = vec3f(0.0);

  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let direct = shadeClassicLight(normal, lightDir, frame.directionalRadiance.rgb, diffuse.rgb,
                                   specularColor, in.worldPosition);
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, geometricNormal);
  }

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

  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

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

pub const CLASSIC_SHARED_SAMPLER_WGSL_BODY: &str = r#"
struct ClassicMaterial {
  diffuse : vec4f,
  specular : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : ClassicMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(3) var specularTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;
@group(2) @binding(5) var alphaTexture : texture_2d<f32>;

@group(3) @binding(0) var<uniform> shadow : ShadowUniforms;
@group(3) @binding(1) var shadowTexture : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

fn rangeWindow(dist2 : f32, invSqrRange : f32) -> f32 {
  if (invSqrRange <= 0.0) {
    return 1.0;
  }
  let factor = clamp(1.0 - dist2 * invSqrRange, 0.0, 1.0);
  return factor * factor;
}

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
    let sampled = textureSample(diffuseTexture, materialSampler, in.uv);
    diffuse = vec4f(diffuse.rgb * sampled.rgb, diffuse.a * sampled.a);
  }

  if (HAS_ALPHA_MAP) {
    diffuse.a = diffuse.a * textureSample(alphaTexture, materialSampler, in.uv).g;
  }

  if (ALPHA_MASK && diffuse.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    diffuse.a = 1.0;
  }

  var geometricNormal = normalize(in.worldNormal);
  if (DOUBLE_SIDED && !isFront) {
    geometricNormal = -geometricNormal;
  }

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  var specularColor = material.specular.rgb;
  if (HAS_SPECULAR_MAP) {
    let sampledSpecular = textureSample(specularTexture, materialSampler, in.uv);
    specularColor = specularColor * sampledSpecular.rgb;
  }

  var radiance = vec3f(0.0);

  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let direct = shadeClassicLight(normal, lightDir, frame.directionalRadiance.rgb, diffuse.rgb,
                                   specularColor, in.worldPosition);
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, geometricNormal);
  }

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

  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + diffuse.rgb * frame.ambientRadiance.rgb;
  }

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
