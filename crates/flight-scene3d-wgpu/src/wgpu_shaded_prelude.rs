use std::collections::HashMap;

use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuClassicDefineKey, WgpuClassicLightingModel, WgpuMaterialBinding, WgpuMeshPipeline,
    WgpuShadedDefineKey, WgpuSkinningAdapter,
};
use crate::wgpu_classic_prelude::get_wgpu_classic_shared_sampler_module_source_for_key;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, ensure_wgpu_shadow_sample_layout,
    stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
};
use crate::wgpu_scene3d_runtime::{
    get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter,
};

const SHADED_BASE_UNIFORM_BYTES: u64 = 48;
const MODIFIER_FLOATS: usize = 8;

pub struct ShadedModifierPlan {
    pub diffuse: String,
    pub effect: String,
    pub emissive: String,
    pub fragment_declarations: String,
    pub normal: String,
    pub specular: String,
    pub texture_count: usize,
    pub uniform_float_count: usize,
    pub vertex: String,
}

pub fn assemble_wgpu_shaded_module_source(
    key: &WgpuShadedDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
    plan: &ShadedModifierPlan,
) -> String {
    let classic_key = WgpuClassicDefineKey {
        alpha_mask_enabled: key.alpha_mask_enabled,
        double_sided: key.double_sided,
        has_alpha_map: false,
        has_color_adjustment: key.has_color_adjustment,
        has_color_matrix: key.has_color_matrix,
        has_diffuse_map: key.has_diffuse_map,
        has_normal_map: key.has_normal_map,
        has_specular_map: key.has_specular_map,
        lighting_model: WgpuClassicLightingModel::BlinnPhong,
    };
    let mut source =
        get_wgpu_classic_shared_sampler_module_source_for_key(&classic_key, skinned, skinning);

    let modifier_field = if plan.uniform_float_count == 0 {
        String::new()
    } else {
        format!(
            "\n  modifierData : array<vec4f, {}>,",
            plan.uniform_float_count / 4
        )
    };
    source = source.replace(
        "params : vec4f,",
        &format!("params : vec4f,{}", modifier_field),
    );

    let mut texture_declarations = String::new();
    for i in 0..plan.texture_count {
        let binding = i + 6;
        texture_declarations.push_str(&format!(
            "@group(2) @binding({}) var modifierTexture{} : texture_2d<f32>;\n",
            binding, binding
        ));
    }
    if !texture_declarations.is_empty() || !plan.fragment_declarations.is_empty() {
        source = source.replace(
            "@group(2) @binding(4) var normalTexture : texture_2d<f32>;",
            &format!(
                "@group(2) @binding(4) var normalTexture : texture_2d<f32>;\n{}\n{}",
                texture_declarations, plan.fragment_declarations
            ),
        );
    }

    if !plan.vertex.is_empty() {
        source = source.replace(
            "  let world = draw.world * localPosition;",
            &format!(
                "  let vertexUv = uv;\n{}\n  let world = draw.world * localPosition;",
                plan.vertex
            ),
        );
    }

    source = source.replace(
        "  var normal = geometricNormal;\n  if (HAS_NORMAL_MAP) {\n    let tangent = normalize(in.worldTangent.xyz);\n    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;\n    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);\n    let tbn = mat3x3f(tangent, bitangent, geometricNormal);\n    normal = normalize(tbn * tangentNormal);\n  }",
        &format!(
            "  let tangent = normalize(in.worldTangent.xyz);\n  let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;\n  let tbn = mat3x3f(tangent, bitangent, geometricNormal);\n  var normal = geometricNormal;\n  if (HAS_NORMAL_MAP) {{\n    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);\n    tangentNormal.x = tangentNormal.x * material.params.w;\n    tangentNormal.y = tangentNormal.y * material.params.w;\n    normal = normalize(tbn * tangentNormal);\n  }}\n{}",
            plan.normal
        ),
    );

    if !plan.diffuse.is_empty() {
        source = source.replace(
            "  if (ALPHA_MASK && diffuse.a < material.params.y) {",
            &format!(
                "{}\n  if (ALPHA_MASK && diffuse.a < material.params.y) {{",
                plan.diffuse
            ),
        );
    }

    if !plan.specular.is_empty() {
        source = source.replace(
            "  var radiance = vec3f(0.0);",
            &format!("{}\n  var radiance = vec3f(0.0);", plan.specular),
        );
    }

    source = source.replace(
        "  var radiance = vec3f(0.0);",
        &format!(
            "  let shadedViewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);\n  var emissive = vec3f(0.0);\n{}\n  var radiance = vec3f(0.0);",
            plan.emissive
        ),
    );

    source = source.replace(
        "      let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);",
        "      let viewDir = shadedViewDir;",
    );

    source = source.replace(
        "  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));",
        &format!(
            "  radiance = radiance + emissive;\n{}\n  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));",
            plan.effect
        ),
    );

    source = source.replace(
        "@group(3) @binding(2) var shadowSampler : sampler_comparison;",
        "@group(3) @binding(2) var shadowSampler : sampler_comparison;\n\nstruct Ibl {\n  params : vec4f,\n};\n@group(3) @binding(3) var<uniform> ibl : Ibl;\n@group(3) @binding(4) var iblIrradiance : texture_cube<f32>;\n@group(3) @binding(5) var iblPrefiltered : texture_cube<f32>;\n@group(3) @binding(6) var iblBrdf : texture_2d<f32>;\n@group(3) @binding(7) var iblSampler : sampler;",
    );

    return source;
}

pub fn bind_wgpu_shaded_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    diffuse: &[f32; 4],
    specular: &[f32; 4],
    shininess: f32,
    alpha_cutoff: f32,
    time: f32,
    normal_scale: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("shaded_material_uniform"),
                    size: SHADED_BASE_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("shaded_material_bind_group"),
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
            time,
            normal_scale,
        ];
        native
            .queue
            .write_buffer(&binding.buffer, 0, f32_as_bytes(&data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn build_wgpu_shaded_define_key(key: &WgpuShadedDefineKey) -> String {
    return format!(
        "{}{}{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_diffuse_map { 'd' } else { '-' },
        if key.has_specular_map { 's' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
    );
}

pub fn compile_wgpu_shaded_pipeline(
    state: &WgpuRenderState,
    key: &WgpuShadedDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    skinned: bool,
    plan: &ShadedModifierPlan,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = assemble_wgpu_shaded_module_source(key, skinned, skinning.as_deref(), plan);
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("shaded_shader"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });

    let mut entries = vec![
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        },
        wgpu::BindGroupLayoutEntry {
            binding: 1,
            visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
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
        wgpu::BindGroupLayoutEntry {
            binding: 4,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
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
    ];
    for i in 0..plan.texture_count {
        entries.push(wgpu::BindGroupLayoutEntry {
            binding: (i + 6) as u32,
            visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        });
    }
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("shaded_material_layout"),
                entries: &entries,
            });
    let shadow_layout = ensure_wgpu_shadow_sample_layout(state);
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
            ibl_bind_group_layout: None,
            skinned,
            topology: Some(wgpu::PrimitiveTopology::TriangleList),
        },
    );
}

pub fn ensure_wgpu_shaded_pipeline(
    state: &WgpuRenderState,
    key: &WgpuShadedDefineKey,
    format: wgpu::TextureFormat,
    modifier_key: &str,
) -> WgpuMeshPipeline {
    let full_key = WgpuShadedDefineKey {
        base_flags: key.base_flags,
        alpha_mask_enabled: key.alpha_mask_enabled,
        double_sided: key.double_sided,
        has_color_adjustment: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_adjustment_run),
        has_color_matrix: get_wgpu_scene3d_runtime(state, |rt| rt.active_color_matrix_run),
        has_diffuse_map: key.has_diffuse_map,
        has_normal_map: key.has_normal_map,
        has_specular_map: key.has_specular_map,
        modifier_define_key: key.modifier_define_key.clone(),
    };
    let cache_key = format!(
        "shaded:{}|{}|{:?}",
        build_wgpu_shaded_define_key(&full_key),
        modifier_key,
        format,
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_shaded_pipeline(
            state,
            &full_key,
            format,
            blended,
            skinned,
            &ShadedModifierPlan::default(),
        );
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_shaded_module_source(
    key: &WgpuShadedDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return assemble_wgpu_shaded_module_source(key, skinned, skinning, &ShadedModifierPlan::default());
}

impl Default for ShadedModifierPlan {
    fn default() -> Self {
        return ShadedModifierPlan {
            diffuse: String::new(),
            effect: String::new(),
            emissive: String::new(),
            fragment_declarations: String::new(),
            normal: String::new(),
            specular: String::new(),
            texture_count: 0,
            uniform_float_count: 0,
            vertex: String::new(),
        };
    }
}
