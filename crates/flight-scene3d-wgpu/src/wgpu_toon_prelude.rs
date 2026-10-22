use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuMaterialBinding, WgpuMeshPipeline, WgpuSkinningAdapter, WgpuToonDefineKey,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, ensure_wgpu_shadow_sample_layout,
    get_wgpu_mesh_prelude_wgsl, stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
    WGPU_DIRECTIONAL_SHADOW_WGSL,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter};

const TOON_UNIFORM_BYTES: u64 = 32;

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn bind_wgpu_toon_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    base_color: &[f32; 4],
    steps: f32,
    alpha_cutoff: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("toon_material_uniform"),
                    size: TOON_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("toon_material_bind_group"),
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

        let data: [f32; 8] = [
            base_color[0],
            base_color[1],
            base_color[2],
            base_color[3],
            steps,
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

pub fn build_wgpu_toon_define_key(key: &WgpuToonDefineKey) -> String {
    return format!(
        "{}{}{}{}",
        if key.has_alpha_mask { 'm' } else { '-' },
        if key.has_diffuse_map { 'b' } else { '-' },
        if key.has_ramp { 'r' } else { '-' },
        if key.has_shadow { 's' } else { '-' },
    );
}

pub fn compile_wgpu_toon_pipeline(
    state: &WgpuRenderState,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_toon_module_source_for_key(key, skinned, skinning.as_deref());
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("toon_shader"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("toon_material_layout"),
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
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
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
        CreateWgpuMeshPipelineOptions {
            blended,
            double_sided: false,
            format,
            material_bind_group_layout,
            module,
            shadow_bind_group_layout: Some(ensure_wgpu_shadow_sample_layout(state)),
            pbr_sample_bind_group_layout: None,
            ibl_bind_group_layout: None,
            skinned,
            topology: wgpu::PrimitiveTopology::TriangleList,
        },
    );
}

pub fn ensure_wgpu_toon_pipeline(
    state: &WgpuRenderState,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let cache_key = format!(
        "toon:{:?}|{}",
        format,
        build_wgpu_toon_define_key(key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_toon_pipeline(state, key, format, blended, skinned);
    });
}

pub fn get_wgpu_toon_module_source_for_key(
    key: &WgpuToonDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_BASE_COLOR_MAP : bool = {};\n\
         const HAS_RAMP : bool = {};\n\
         {}\n{}\n{}\n{}",
        key.has_alpha_mask,
        false,
        key.has_diffuse_map,
        key.has_ramp,
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        WGPU_DIRECTIONAL_SHADOW_WGSL,
        TOON_WGSL_BODY,
    );
}

const TOON_WGSL_BODY: &str = r#"
struct ToonMaterial {
  baseColor : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : ToonMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var rampTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor * in.instanceColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * sampled.rgb, baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    baseColor.a = 1.0;
  }

  var normal = normalize(in.worldNormal);
  if (DOUBLE_SIDED && !isFront) {
    normal = -normal;
  }

  var radiance = vec3f(0.0);

  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
    var direct = vec3f(0.0);
    if (HAS_RAMP) {
      let band = textureSample(rampTexture, materialSampler, vec2f(nDotL, 0.5)).rgb;
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    } else {
      let steps = material.params.x;
      let band = floor(nDotL * steps) / max(steps, 1.0);
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    }
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, normal);
  }

  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + baseColor.rgb * frame.ambientRadiance.rgb;
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(baseColor.a, in.objectAlpha, draw.params.y)));
}
"#;
