// flight-lint: allow-file(contract-vocabulary) D17/D16: the renderer reads any material through `&dyn Material` and binds native wgpu groups
//! The CustomShaderMaterial mesh renderer (TS `wgpuCustomShaderMeshMaterialRenderer.ts`). The shader
//! is a complete caller-authored WGSL module; scene3d-wgpu supplies the fixed Frame group(0) and Draw
//! group(1) every built-in family uses, user values in group(2) and sampler/texture pairs in
//! group(3).

use flight_entity::Ref;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::{Kind, get_entity_id};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{
    CUSTOM_SHADER_MATERIAL_KIND, CustomShaderMaterial, Material, Material3D, UniformValue,
};
use flight_meshgeometry::MeshGeometry;
use flight_registry::with_kind_map_entry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuCustomMaterialShaderSource, WgpuMeshMaterialRenderer, WgpuRenderState,
    create_wgpu_bind_group, create_wgpu_bind_group_layout, create_wgpu_buffer,
    create_wgpu_shader_module, get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, register_wgpu_bitmap_texture_resolver,
    register_wgpu_image_texture_resolver, set_wgpu_render_pass_bind_group, write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_custom_material_abi::{
    WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY,
};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, create_wgpu_mesh_pipeline, draw_wgpu_mesh_subset,
    ensure_wgpu_placeholder_texture_view, ensure_wgpu_scene3d_pipeline, get_wgpu_material_sampler,
    is_wgpu_texture_ready, resolve_wgpu_material_texture_view, stash_wgpu_uv_transform,
    write_wgpu_frame_uniform,
};
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// The CustomShaderMaterial mesh-material renderer (TS `wgpuCustomShaderMeshMaterialRenderer`).
pub static WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_wgpu_custom_shader_material,
        draw: draw_wgpu_custom_shader_material,
    };

fn bind_wgpu_custom_shader_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let custom = material.and_then(|material| material.as_any().downcast_ref::<CustomShaderMaterial>());
    let has_pass = get_wgpu_render_state_runtime(state).render_pass.is_some();
    let Some(custom) = custom.filter(|custom| has_pass && !custom.shader_key.is_empty()) else {
        get_wgpu_scene3d_runtime(state).active_mesh_pipeline = None;
        return;
    };

    let Some(source) = get_wgpu_custom_material_shader_source(state, &custom.shader_key) else {
        get_wgpu_scene3d_runtime(state).active_mesh_pipeline = None;
        return;
    };
    if let Some(guard) = get_wgpu_scene3d_runtime(state).custom_shader_guard {
        guard(state, &custom.shader_key, &source, custom);
    }
    let uniform_count = custom.uniforms.as_ref().map_or(0, |uniforms| uniforms.len());
    let texture_count = custom.textures.as_ref().map_or(0, |textures| textures.len());
    if uniform_count > WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY
        || texture_count > WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY
    {
        // Never submit a bind group that cannot satisfy the fixed layout; the opt-in guard explains
        // the overflow, and without it this follows the renderer's silent skip.
        get_wgpu_scene3d_runtime(state).active_mesh_pipeline = None;
        return;
    }

    let layouts = ensure_custom_material_layouts(state);
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let double_sided = custom.material3d_fields().double_sided;
    let side_key = if double_sided { "double" } else { "single" };
    let key = format!("custom:{}:{:?}:{}", custom.shader_key, format, side_key);
    let pipeline = ensure_wgpu_scene3d_pipeline(state, &key, &mut |state, blended, skinned| {
        return compile_custom_material_pipeline(
            state,
            &source,
            format,
            double_sided,
            blended,
            skinned,
            &layouts,
        );
    });
    let binding = ensure_custom_material_binding(state, custom, &layouts.user);
    upload_custom_uniforms(state, &binding.uniform_buffer, custom);
    let texture_bind_group = ensure_custom_texture_bind_group(state, custom, &layouts.texture);

    write_wgpu_frame_uniform(state, camera, lights);
    stash_wgpu_uv_transform(state, None);
    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &binding.uniform_bind_group, &[]);
    set_wgpu_render_pass_bind_group(state, 3, &texture_bind_group, &[]);
}

fn compile_custom_material_pipeline(
    state: &mut WgpuRenderState,
    source: &str,
    format: wgpu::TextureFormat,
    double_sided: bool,
    blended: bool,
    skinned: bool,
    layouts: &WgpuCustomMaterialLayouts,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let module = create_wgpu_shader_module(&native, source);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: Some(blended),
            double_sided,
            extra_bind_group_layout: Some(layouts.texture.clone()),
            format,
            ibl_bind_group_layout: None,
            material_bind_group_layout: layouts.user.clone(),
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: None,
            skinned: Some(skinned),
            topology: None,
        },
    );
}

// Whether the texture group must rebuild: a missing group, a changed key list, or any changed
// sampler or view.
fn custom_texture_binding_needs_rebuild(
    binding: &WgpuCustomMaterialBinding,
    keys: &[String],
    samplers: &[wgpu::Sampler],
    views: &[wgpu::TextureView],
) -> bool {
    if binding.texture_bind_group.is_none() || binding.texture_keys.as_slice() != keys {
        return true;
    }
    return binding.texture_samplers.as_slice() != samplers
        || binding.texture_views.as_slice() != views;
}

fn draw_wgpu_custom_shader_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

fn ensure_custom_material_binding(
    state: &mut WgpuRenderState,
    material: &CustomShaderMaterial,
    layout: &wgpu::BindGroupLayout,
) -> WgpuCustomMaterialBinding {
    let key = get_entity_id(material);
    if let Some(binding) = get_wgpu_scene3d_runtime(state)
        .custom_material_bindings
        .get(&key)
    {
        return binding.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let uniform_buffer = create_wgpu_buffer(
        &native,
        (WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY * 16) as u64,
        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    );
    let uniform_bind_group = create_wgpu_bind_group(
        &native,
        layout,
        &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    );
    let binding = WgpuCustomMaterialBinding {
        texture_bind_group: None,
        texture_keys: Vec::new(),
        texture_samplers: Vec::new(),
        texture_views: Vec::new(),
        uniform_bind_group,
        uniform_buffer,
    };
    get_wgpu_scene3d_runtime(state)
        .custom_material_bindings
        .insert(key, binding.clone());
    return binding;
}

fn ensure_custom_material_layouts(state: &mut WgpuRenderState) -> WgpuCustomMaterialLayouts {
    if let Some(layouts) = &get_wgpu_scene3d_runtime(state).custom_material_layouts {
        return layouts.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let visibility = wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT;
    let mut entries = Vec::with_capacity(WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY * 2);
    for slot in 0..WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY as u32 {
        entries.push(wgpu::BindGroupLayoutEntry {
            binding: slot * 2,
            visibility,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        });
        entries.push(wgpu::BindGroupLayoutEntry {
            binding: slot * 2 + 1,
            visibility,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        });
    }
    let layouts = WgpuCustomMaterialLayouts {
        texture: create_wgpu_bind_group_layout(&native, &entries),
        user: create_wgpu_bind_group_layout(
            &native,
            &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        ),
    };
    get_wgpu_scene3d_runtime(state).custom_material_layouts = Some(layouts.clone());
    return layouts;
}

// Resolves the bag's samplers and views (placeholders past the bag) and rebuilds the group(3) bind
// group only when a key, sampler or view changed. The bag's slot order is its insertion order.
fn ensure_custom_texture_bind_group(
    state: &mut WgpuRenderState,
    material: &CustomShaderMaterial,
    layout: &wgpu::BindGroupLayout,
) -> wgpu::BindGroup {
    let placeholder = ensure_wgpu_placeholder_texture_view(state);
    let keys = get_custom_texture_keys(material);
    let mut samplers = Vec::with_capacity(WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY);
    let mut views = Vec::with_capacity(WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY);
    if let Some(textures) = &material.textures {
        for (_, texture) in textures {
            let texture = texture.read().unwrap();
            samplers.push(get_wgpu_material_sampler(state, Some(&texture)));
            views.push(if is_wgpu_texture_ready(Some(&texture)) {
                resolve_wgpu_material_texture_view(state, Some(&texture))
            } else {
                placeholder.clone()
            });
        }
    }
    while samplers.len() < WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY {
        samplers.push(get_wgpu_material_sampler(state, None));
        views.push(placeholder.clone());
    }

    let material_key = get_entity_id(material);
    let mut binding = get_wgpu_scene3d_runtime(state)
        .custom_material_bindings
        .get(&material_key)
        .cloned()
        .expect("the custom material binding is created before its texture group");
    if !custom_texture_binding_needs_rebuild(&binding, &keys, &samplers, &views) {
        return binding.texture_bind_group.unwrap();
    }

    let mut entries = Vec::with_capacity(WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY * 2);
    for slot in 0..WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY {
        entries.push(wgpu::BindGroupEntry {
            binding: slot as u32 * 2,
            resource: wgpu::BindingResource::Sampler(&samplers[slot]),
        });
        entries.push(wgpu::BindGroupEntry {
            binding: slot as u32 * 2 + 1,
            resource: wgpu::BindingResource::TextureView(&views[slot]),
        });
    }
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = create_wgpu_bind_group(&native, layout, &entries);
    binding.texture_bind_group = Some(bind_group.clone());
    binding.texture_keys = keys;
    binding.texture_samplers = samplers;
    binding.texture_views = views;
    get_wgpu_scene3d_runtime(state)
        .custom_material_bindings
        .insert(material_key, binding);
    return bind_group;
}

// The texture bag's keys in slot order (the bag's insertion order).
fn get_custom_texture_keys(material: &CustomShaderMaterial) -> Vec<String> {
    let keys: Vec<String> = match &material.textures {
        Some(textures) => textures.iter().map(|(name, _)| name.clone()).collect(),
        None => Vec::new(),
    };
    return keys;
}

/// The WGSL module registered under `shader_key`, or `None` when the material should skip drawing
/// (TS `getWgpuCustomMaterialShaderSource`).
pub fn get_wgpu_custom_material_shader_source(
    state: &WgpuRenderState,
    shader_key: &str,
) -> Option<WgpuCustomMaterialShaderSource> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .custom_material_shaders
        .entries
        .get(shader_key)
        .cloned();
}

/// Registers a complete WGSL module for a CustomShaderMaterial `shader_key` (TS
/// `registerWgpuCustomMaterialShader`), copying the shared table so a derived state's snapshot is
/// untouched. Fixed ABI: group(0)/binding(0) Frame and group(1)/binding(0) Draw from the mesh
/// prelude; group(2)/binding(0) `var<uniform> user : UserBlock` with one vec4f per material uniform
/// in alphabetical order; group(3) the texture bag, slot N's sampler at binding 2N and its
/// texture_2d<f32> at 2N+1. Entry points are `vs_main`/`fs_main`; outputs are linear, premultiplied
/// color. The last source write wins before compilation; an already-compiled key stays cached.
pub fn register_wgpu_custom_material_shader(
    state: &mut WgpuRenderState,
    shader_key: &str,
    wgsl_source: &str,
) {
    let registries = &mut get_wgpu_render_state_runtime_mut(state).registries;
    registries.custom_material_shaders = Arc::new(with_kind_map_entry(
        &registries.custom_material_shaders,
        shader_key.to_string(),
        wgsl_source.to_string(),
    ));
}

/// Installs CustomShaderMaterial in this state's mesh-material registry, with the bitmap and image
/// texture resolvers its maps resolve through (TS `registerWgpuCustomShaderMaterial`).
pub fn register_wgpu_custom_shader_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    let kind: Kind = CUSTOM_SHADER_MATERIAL_KIND.to_string();
    register_wgpu_mesh_material_renderer(state, kind, &WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER);
}

// Packs the uniforms into alphabetically sorted vec4 slots: scalars in .x, vectors in .xy/.xyz/.xyzw.
// flight-lint: allow(hashmap-iteration) the names are collected and sorted before packing
fn upload_custom_uniforms(
    state: &WgpuRenderState,
    buffer: &wgpu::Buffer,
    material: &CustomShaderMaterial,
) {
    let mut packed = [0.0_f32; WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY * 4];
    if let Some(uniforms) = &material.uniforms {
        let mut names: Vec<&String> = uniforms.keys().collect();
        names.sort();
        let count = names.len().min(WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY);
        for (slot, name) in names.iter().take(count).enumerate() {
            let offset = slot * 4;
            match &uniforms[*name] {
                UniformValue::Scalar(value) => packed[offset] = *value,
                UniformValue::Array(values) => {
                    for (component, value) in values.iter().take(4).enumerate() {
                        packed[offset + component] = *value;
                    }
                }
            }
        }
    }
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(&native, buffer, 0, bytemuck::cast_slice(&packed));
}
