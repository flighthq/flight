// flight-lint: allow-file(contract-vocabulary) D16/D17: the shaded family reads the open Modifier family through `&dyn Modifier` and carries native wgpu values
//! The ShadedMaterial composition (TS `wgpuShadedPrelude.ts`): the ordered modifier plan, the
//! composed WGSL over the classic shared-sampler module, the composed pipeline and surface binding,
//! and the eight built-in modifier snippets.

use std::any::Any;
use std::sync::Arc;

use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::{Ref, get_entity_id};
use flight_registry::KindMap;
use flight_render_wgpu::{
    WgpuColorAdjustmentMaterialFeature, WgpuModifierCompileContext, WgpuModifierContribution,
    WgpuModifierSnippet, WgpuRenderState, WgpuSkinningAdapter, create_wgpu_bind_group,
    create_wgpu_bind_group_layout, create_wgpu_buffer, create_wgpu_shader_module,
    get_wgpu_color_adjustment_material_feature, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_texture_format_name, write_wgpu_buffer,
};
use flight_shading::{
    ANIMATED_NORMAL_MODIFIER_KIND, AnimatedNormalModifier, DISSOLVE_MODIFIER_KIND,
    DissolveModifier, EMISSIVE_MODIFIER_KIND, ENV_REFLECT_MODIFIER_KIND, EmissiveModifier,
    EmissiveModifierFacing, EnvReflectModifier, FOG_MODIFIER_KIND, FogModifier, FogModifierMode,
    MODIFIER_SLOT_DIFFUSE, MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL,
    MODIFIER_SLOT_SPECULAR, MODIFIER_SLOT_VERTEX, Modifier, RIM_MODIFIER_KIND, RimModifier,
    ShadedMaterial, TOON_MODIFIER_KIND, ToonModifier, VERTEX_DISPLACE_MODIFIER_KIND,
    VertexDisplaceModifier, VertexDisplaceModifierSource,
};
use flight_shading::contract::{
    get_fog_modifier_mode_string, get_modifier_define_key,
    get_vertex_displace_modifier_source_string, order_modifier_stack,
};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_classic_prelude::get_wgpu_classic_shared_sampler_module_source_for_key;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_pbr_sample_layout, ensure_wgpu_scene3d_pipeline,
    get_wgpu_material_sampler, resolve_wgpu_material_texture_view,
    splice_wgpu_color_adjustment_prelude, stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};
use crate::wgpu_scene3d_time::get_wgpu_scene3d_time;
use crate::wgpu_shaded_mesh_material_renderer::get_wgpu_shaded_base_flags;
use crate::wgpu_shaded_modifier_snippet::register_wgpu_modifier_snippet;

// Each modifier reserves three vec4s of uniform data.
const MODIFIER_FLOATS: usize = 12;

/// The animated-normal snippet: scrolls one or two tangent-space normal maps (TS
/// `animatedNormalWgpuModifierSnippet`).
pub static ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: ANIMATED_NORMAL_MODIFIER_KIND,
    slot: MODIFIER_SLOT_NORMAL,
    get_define_signature: Some(get_animated_normal_define_signature),
    bind: Some(bind_animated_normal_modifier),
    contribution: get_animated_normal_contribution,
    textures: Some(get_animated_normal_textures),
};

/// The dissolve snippet: a procedural or mapped noise threshold with a colored edge (TS
/// `dissolveWgpuModifierSnippet`).
pub static DISSOLVE_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: DISSOLVE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: Some(get_dissolve_define_signature),
    bind: Some(bind_dissolve_modifier),
    contribution: get_dissolve_contribution,
    textures: Some(get_dissolve_textures),
};

/// The emissive snippet: a masked, optionally light-facing emissive term (TS
/// `emissiveWgpuModifierSnippet`).
pub static EMISSIVE_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: EMISSIVE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EMISSIVE,
    get_define_signature: Some(get_emissive_define_signature),
    bind: Some(bind_emissive_modifier),
    contribution: get_emissive_contribution,
    textures: Some(get_emissive_textures),
};

/// The environment-reflection snippet: a fresnel-weighted prefiltered IBL lookup (TS
/// `envReflectWgpuModifierSnippet`).
pub static ENV_REFLECT_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: ENV_REFLECT_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_env_reflect_modifier),
    contribution: get_env_reflect_contribution,
    textures: None,
};

/// The fog snippet: linear, exponential or squared-exponential distance fog (TS
/// `fogWgpuModifierSnippet`).
pub static FOG_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: FOG_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: Some(get_fog_define_signature),
    bind: Some(bind_fog_modifier),
    contribution: get_fog_contribution,
    textures: None,
};

/// The rim-light snippet (TS `rimWgpuModifierSnippet`).
pub static RIM_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: RIM_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_rim_modifier),
    contribution: get_rim_contribution,
    textures: None,
};

/// The toon quantization snippet (TS `toonWgpuModifierSnippet`).
pub static TOON_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: TOON_MODIFIER_KIND,
    slot: MODIFIER_SLOT_EFFECT,
    get_define_signature: None,
    bind: Some(bind_toon_modifier),
    contribution: get_toon_contribution,
    textures: None,
};

/// The vertex-displacement snippet: sine or height-map displacement before the world transform (TS
/// `vertexDisplaceWgpuModifierSnippet`).
pub static VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET: WgpuModifierSnippet = WgpuModifierSnippet {
    kind: VERTEX_DISPLACE_MODIFIER_KIND,
    slot: MODIFIER_SLOT_VERTEX,
    get_define_signature: Some(get_vertex_displace_define_signature),
    bind: Some(bind_vertex_displace_modifier),
    contribution: get_vertex_displace_contribution,
    textures: Some(get_vertex_displace_textures),
};

fn create_shaded_binding(
    state: &mut WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    float_length: usize,
    texture_count: usize,
    sampler: &wgpu::Sampler,
) -> WgpuShadedMaterialBinding {
    let native = get_wgpu_render_state_native_device(state);
    let buffer = create_wgpu_buffer(
        &native,
        (float_length * 4) as u64,
        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    );
    let placeholder = resolve_wgpu_material_texture_view(state, None);
    let views = vec![placeholder; texture_count];
    let bind_group = build_shaded_bind_group(state, layout, &buffer, sampler, &views);
    return WgpuShadedMaterialBinding {
        bind_group,
        buffer,
        data: vec![0.0; float_length],
        layout: layout.clone(),
        sampler: sampler.clone(),
        textures: vec![None; texture_count],
        views,
    };
}

fn assemble_wgpu_shaded_module_source(
    material: &ShadedMaterial,
    plan: &WgpuShadedModifierPlan,
    skinned: bool,
    skinning: Option<&WgpuSkinningAdapter>,
    color_adjustment_feature: Option<&WgpuColorAdjustmentMaterialFeature>,
    color_matrix: bool,
) -> String {
    let flags = get_wgpu_shaded_base_flags(material);
    let define_key = WgpuClassicDefineKey {
        alpha_mask_enabled: flags.alpha_mask_enabled,
        double_sided: flags.double_sided,
        has_color_adjustment: None,
        has_color_matrix: None,
        has_alpha_map: Some(false),
        has_diffuse_map: flags.has_diffuse_map,
        has_normal_map: flags.has_normal_map,
        has_specular_map: flags.has_specular_map,
        lighting_model: WgpuClassicLightingModel::BlinnPhong,
    };
    let mut source =
        get_wgpu_classic_shared_sampler_module_source_for_key(&define_key, Some(skinned), skinning);

    source = source.replacen(
        "  let world = draw.world * localPosition;",
        &format!(
            "  let vertexUv = uv;\n{}\n  let world = draw.world * localPosition;",
            indent(&plan.vertex, 2)
        ),
        1,
    );
    let modifier_field = if plan.uniform_float_count == 0 {
        String::new()
    } else {
        format!(
            "\n  modifierData : array<vec4f, {}>,",
            plan.uniform_float_count / 4
        )
    };
    source = source.replacen(
        "params : vec4f,    // x = shininess, y = alphaCutoff",
        &format!(
            "params : vec4f,    // x = shininess, y = alphaCutoff, z = time, w = normalScale{}",
            modifier_field
        ),
        1,
    );

    let mut texture_declarations = String::new();
    for index in 0..plan.texture_count {
        let binding = index + 6;
        texture_declarations.push_str(&format!(
            "@group(2) @binding({binding}) var modifierTexture{binding} : texture_2d<f32>;\n"
        ));
    }
    source = source.replacen(
        "@group(2) @binding(4) var normalTexture : texture_2d<f32>;",
        &format!(
            "@group(2) @binding(4) var normalTexture : texture_2d<f32>;\n{}\n{}",
            texture_declarations, plan.fragment_declarations
        ),
        1,
    );

    source = source.replacen(
        "  var normal = geometricNormal;\n  if (HAS_NORMAL_MAP) {\n    let tangent = normalize(in.worldTangent.xyz);\n    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;\n    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);\n    let tbn = mat3x3f(tangent, bitangent, geometricNormal);\n    normal = normalize(tbn * tangentNormal);\n  }",
        &format!(
            "  let tangent = normalize(in.worldTangent.xyz);\n  let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;\n  let tbn = mat3x3f(tangent, bitangent, geometricNormal);\n  var normal = geometricNormal;\n  if (HAS_NORMAL_MAP) {{\n    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);\n    tangentNormal.x = tangentNormal.x * material.params.w;\n    tangentNormal.y = tangentNormal.y * material.params.w;\n    normal = normalize(tbn * tangentNormal);\n  }}\n{}",
            indent(&plan.normal, 2)
        ),
        1,
    );
    source = source.replacen(
        "  if (ALPHA_MASK && diffuse.a < material.params.y) {",
        &format!(
            "{}\n  if (ALPHA_MASK && diffuse.a < material.params.y) {{",
            indent(&plan.diffuse, 2)
        ),
        1,
    );
    source = source.replacen(
        "  var radiance = vec3f(0.0);",
        &format!("{}\n  var radiance = vec3f(0.0);", indent(&plan.specular, 2)),
        1,
    );
    source = source.replacen(
        "  var radiance = vec3f(0.0);",
        &format!(
            "  let shadedViewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);\n  var emissive = vec3f(0.0);\n{}\n  var radiance = vec3f(0.0);",
            indent(&plan.emissive, 2)
        ),
        1,
    );
    source = source.replacen(
        "      let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);",
        "      let viewDir = shadedViewDir;",
        1,
    );
    let output = "  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));";
    source = source.replacen(
        output,
        &format!(
            "  radiance = radiance + emissive;\n{}\n{}",
            indent(&plan.effect, 2),
            output
        ),
        1,
    );
    source = source.replacen(
        "@group(3) @binding(2) var shadowSampler : sampler_comparison;",
        "@group(3) @binding(2) var shadowSampler : sampler_comparison;\n\nstruct Ibl {\n  params : vec4f, // x = enabled, y = intensity, z = maxMip\n};\n@group(3) @binding(3) var<uniform> ibl : Ibl;\n@group(3) @binding(4) var iblIrradiance : texture_cube<f32>;\n@group(3) @binding(5) var iblPrefiltered : texture_cube<f32>;\n@group(3) @binding(6) var iblBrdf : texture_2d<f32>;\n@group(3) @binding(7) var iblSampler : sampler;",
        1,
    );
    if let Some(feature) = color_adjustment_feature {
        let apply = if color_matrix {
            "applyFlightColorMatrix(flightColor, draw.flightColorMatrix0, draw.flightColorMatrix1, draw.flightColorMatrix2, draw.flightColorMatrix3, draw.flightColorMatrixOffset)"
        } else {
            "applyFlightColorAdjustment(flightColor, draw.flightColorScale, draw.flightColorBias)"
        };
        source = splice_wgpu_color_adjustment_prelude(&source, feature, Some(color_matrix)).replacen(
            output,
            &format!(
                "  var flightColor = vec4f(radiance, diffuse.a);\n  flightColor = {};\n  flightColor.a = flightMeshCoverage(flightColor.a, in.objectAlpha, draw.params.y);\n  return flightPremultipliedOutput(flightColor);",
                apply
            ),
            1,
        );
    }
    return source;
}

fn bind_animated_normal_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<AnimatedNormalModifier>(modifier) else {
        return;
    };
    out[base] = value.scroll.x;
    out[base + 1] = value.scroll.y;
    out[base + 2] = value.strength;
    out[base + 4] = value.secondary_scroll.as_ref().map_or(0.0, |scroll| scroll.x);
    out[base + 5] = value.secondary_scroll.as_ref().map_or(0.0, |scroll| scroll.y);
}

fn bind_dissolve_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<DissolveModifier>(modifier) else {
        return;
    };
    out[base] = value.threshold;
    out[base + 1] = value.edge_width;
    out[base + 2] = value.scale;
    copy_color_rgb(out, base + 4, value.edge_color);
}

fn bind_emissive_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<EmissiveModifier>(modifier) else {
        return;
    };
    copy_color_rgb(out, base, value.color);
    out[base + 3] = value.strength;
    out[base + 4] = if value.facing == EmissiveModifierFacing::AwayFromLight {
        -1.0
    } else {
        1.0
    };
    out[base + 5] = value.facing_softness;
}

fn bind_env_reflect_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<EnvReflectModifier>(modifier) else {
        return;
    };
    copy_color_rgb(out, base, value.tint);
    out[base + 3] = value.intensity;
    out[base + 4] = value.fresnel_bias;
    out[base + 5] = value.roughness;
}

fn bind_fog_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<FogModifier>(modifier) else {
        return;
    };
    copy_color_rgb(out, base, value.color);
    out[base + 4] = value.density;
    out[base + 5] = value.near;
    out[base + 6] = value.far;
}

fn bind_rim_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<RimModifier>(modifier) else {
        return;
    };
    copy_color_rgb(out, base, value.color);
    out[base + 3] = value.power;
    out[base + 4] = value.intensity;
    out[base + 5] = value.bias;
}

fn bind_toon_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<ToonModifier>(modifier) else {
        return;
    };
    out[base] = value.steps.max(2.0);
    out[base + 1] = value.smoothness;
}

fn bind_vertex_displace_modifier(modifier: &dyn Modifier, out: &mut [f32], base: usize) {
    let Some(value) = narrow::<VertexDisplaceModifier>(modifier) else {
        return;
    };
    out[base] = value.amplitude;
    out[base + 1] = value.frequency;
    out[base + 2] = value.speed;
    out[base + 4] = value.axis.as_ref().map_or(0.0, |axis| axis.x);
    out[base + 5] = value.axis.as_ref().map_or(0.0, |axis| axis.y);
    out[base + 6] = value.axis.as_ref().map_or(0.0, |axis| axis.z);
    out[base + 8] = value.direction.x;
    out[base + 9] = value.direction.y;
    out[base + 10] = value.direction.z;
}

/// Writes the base surface plus every ordered modifier into one uniform allocation and binds the
/// base maps plus modifier maps into the composed group(2) (TS `bindWgpuShadedSurface`). The binding
/// is cached per material and rebuilt only when its compiled layout changes; the bind group is
/// rebuilt only when the sampler or a resolved view changes.
pub fn bind_wgpu_shaded_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material: &ShadedMaterial,
    diffuse: &LinearColor,
    specular: &LinearColor,
) -> wgpu::BindGroup {
    let registry = get_modifier_snippet_table(state);
    let plan = get_cached_modifier_plan(state, material, &registry, None);
    let float_length = 12 + plan.uniform_float_count as usize;
    let slot_count = plan.texture_count as usize + 3;
    let key = get_entity_id(material);
    let sampler = {
        let diffuse_map = read_texture_slot(&material.diffuse_map);
        get_wgpu_material_sampler(state, diffuse_map.as_deref())
    };
    let cached = get_wgpu_scene3d_runtime(state)
        .shaded_material_binding_cache
        .remove(&key);
    let mut binding = match cached {
        Some(binding)
            if binding.layout == pipeline.material_bind_group_layout
                && binding.data.len() == float_length
                && binding.textures.len() == slot_count =>
        {
            binding
        }
        stale => {
            if let Some(stale) = stale {
                stale.buffer.destroy();
            }
            create_shaded_binding(
                state,
                &pipeline.material_bind_group_layout,
                float_length,
                slot_count,
                &sampler,
            )
        }
    };

    binding.textures[0] = material.diffuse_map.clone();
    binding.textures[1] = material.specular_map.clone();
    binding.textures[2] = material.normal_map.clone();
    let mut texture_offset = 3;
    for (index, modifier) in plan.ordered_modifiers.iter().enumerate() {
        if let Some(textures) = plan.snippets[index].and_then(|snippet| snippet.textures) {
            texture_offset =
                textures(&*modifier.read().unwrap(), &mut binding.textures, texture_offset);
        }
    }

    let mut resources_changed = binding.sampler != sampler;
    binding.sampler = sampler;
    for index in 0..binding.textures.len() {
        // Resolving every current view is the invalidation seam: render-wgpu changes the view when
        // the image identity or version changes, including ready-to-ready swaps.
        let view = {
            let texture = read_texture_slot(&binding.textures[index]);
            resolve_wgpu_material_texture_view(state, texture.as_deref())
        };
        if binding.views[index] != view {
            binding.views[index] = view;
            resources_changed = true;
        }
    }
    if resources_changed {
        binding.bind_group = build_shaded_bind_group(
            state,
            &binding.layout,
            &binding.buffer,
            &binding.sampler,
            &binding.views,
        );
    }

    let data = &mut binding.data;
    data.fill(0.0);
    data[..4].copy_from_slice(&[diffuse.r, diffuse.g, diffuse.b, diffuse.a]);
    data[4..8].copy_from_slice(&[specular.r, specular.g, specular.b, specular.a]);
    data[8] = material.shininess;
    data[9] = material.alpha_cutoff;
    data[10] = get_wgpu_scene3d_time(state);
    data[11] = material.normal_scale;
    write_modifier_uniforms(data, 12, &plan);
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(data));
    {
        let diffuse_map = read_texture_slot(&material.diffuse_map);
        stash_wgpu_uv_transform(state, diffuse_map.as_deref());
    }
    let bind_group = binding.bind_group.clone();
    get_wgpu_scene3d_runtime(state)
        .shaded_material_binding_cache
        .insert(key, binding);
    return bind_group;
}

fn build_modifier_plan(
    modifiers: &[Ref<dyn Modifier>],
    registry: Option<WgpuModifierSnippetSource<'_>>,
) -> WgpuShadedModifierPlan {
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, modifiers);
    let mut snippets = Vec::with_capacity(ordered.len());
    let mut declarations: Vec<String> = Vec::new();
    let mut diffuse = String::new();
    let mut normal = String::new();
    let mut specular = String::new();
    let mut emissive = String::new();
    let mut effect = String::new();
    let mut vertex = String::new();
    let mut texture_count = 0_u32;
    for (index, modifier) in ordered.iter().enumerate() {
        let modifier = modifier.read().unwrap();
        let snippet =
            resolve_wgpu_modifier_snippet_source(registry, &modifier.modifier_fields().kind);
        snippets.push(snippet);
        let Some(snippet) = snippet else {
            continue;
        };
        let base = (index * MODIFIER_FLOATS) as u32;
        let mut acquire = |_texture: Option<&Ref<Texture>>| {
            let slot = 6 + texture_count;
            texture_count += 1;
            return slot;
        };
        let mut context = WgpuModifierCompileContext {
            acquire_texture: &mut acquire,
            uniform_base: base,
        };
        let contribution = (snippet.contribution)(&*modifier, index, &mut context);
        if let Some(declaration) = &contribution.declarations {
            let declaration = declaration.trim().to_string();
            if !declarations.contains(&declaration) {
                declarations.push(declaration);
            }
        }
        let source = delimit_contribution(&contribution.source);
        match snippet.slot {
            MODIFIER_SLOT_NORMAL => normal.push_str(&source),
            MODIFIER_SLOT_DIFFUSE => diffuse.push_str(&source),
            MODIFIER_SLOT_SPECULAR => specular.push_str(&source),
            MODIFIER_SLOT_EMISSIVE => emissive.push_str(&source),
            MODIFIER_SLOT_EFFECT => effect.push_str(&source),
            MODIFIER_SLOT_VERTEX => vertex.push_str(&source),
            _ => {}
        }
    }
    let uniform_float_count = (ordered.len() * MODIFIER_FLOATS) as u32;
    return WgpuShadedModifierPlan {
        diffuse,
        effect,
        emissive,
        fragment_declarations: if declarations.is_empty() {
            String::new()
        } else {
            format!("{}\n", declarations.join("\n"))
        },
        normal,
        ordered_modifiers: ordered,
        snippets,
        specular,
        texture_count,
        uniform_float_count,
        vertex,
    };
}

// Builds the bind group over the binding's buffer, sampler and views: binding 0 the uniform, 1 the
// sampler, 2..4 the base maps, 5 the classic alpha slot (placeholder), and 6+ the modifier maps.
fn build_shaded_bind_group(
    state: &mut WgpuRenderState,
    layout: &wgpu::BindGroupLayout,
    buffer: &wgpu::Buffer,
    sampler: &wgpu::Sampler,
    views: &[wgpu::TextureView],
) -> wgpu::BindGroup {
    let placeholder = resolve_wgpu_material_texture_view(state, None);
    let native = get_wgpu_render_state_native_device(state);
    let mut entries = vec![
        wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        },
        wgpu::BindGroupEntry {
            binding: 1,
            resource: wgpu::BindingResource::Sampler(sampler),
        },
    ];
    for (index, view) in views.iter().enumerate() {
        if index == 3 {
            entries.push(wgpu::BindGroupEntry {
                binding: 5,
                resource: wgpu::BindingResource::TextureView(&placeholder),
            });
        }
        entries.push(wgpu::BindGroupEntry {
            binding: texture_entry_index(index) as u32,
            resource: wgpu::BindingResource::TextureView(view),
        });
    }
    if views.len() <= 3 {
        entries.push(wgpu::BindGroupEntry {
            binding: 5,
            resource: wgpu::BindingResource::TextureView(&placeholder),
        });
    }
    return create_wgpu_bind_group(&native, layout, &entries);
}

/// A stable identity for one ShadedMaterial pipeline family (TS `buildWgpuShadedCacheKey`): the base
/// map/cull/mask flags, then the canonical ordered modifier signature. Format and blend are added by
/// the shared pipeline cache. `None` resolves against an empty modifier registry.
pub fn build_wgpu_shaded_cache_key(
    material: &ShadedMaterial,
    registry: Option<WgpuModifierSnippetSource<'_>>,
) -> String {
    let flags = get_wgpu_shaded_base_flags(material);
    let base = format!(
        "{}{}{}{}{}",
        flag(flags.alpha_mask_enabled, 'm'),
        flag(flags.double_sided, 'd'),
        flag(flags.has_diffuse_map, 'd'),
        flag(flags.has_specular_map, 's'),
        flag(flags.has_normal_map, 'n'),
    );
    return format!(
        "shaded:{}|{}",
        base,
        get_wgpu_modifier_define_key(&material.modifiers, registry)
    );
}

fn copy_color_rgb(out: &mut [f32], offset: usize, color: u32) {
    let mut linear = allocate_linear_color();
    unpack_color_to_linear(&mut linear, color);
    out[offset] = linear.r;
    out[offset + 1] = linear.g;
    out[offset + 2] = linear.b;
}

fn delimit_contribution(source: &str) -> String {
    if source.is_empty() {
        return String::new();
    }
    return if source.ends_with('\n') {
        source.to_string()
    } else {
        format!("{}\n", source)
    };
}

fn empty_contribution() -> WgpuModifierContribution {
    return WgpuModifierContribution {
        declarations: None,
        source: String::new(),
    };
}

/// Resolves the immutable shader/layout/pipeline permutation for a material (TS
/// `ensureWgpuShadedPipeline`): keyed by the composed define key, the state's snippet revision, the
/// color format and the color-adjustment variant; the shared cache appends opaque/blend.
pub fn ensure_wgpu_shaded_pipeline(
    state: &mut WgpuRenderState,
    material: &ShadedMaterial,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let registry = get_modifier_snippet_table(state);
    let define_key =
        build_wgpu_shaded_cache_key(material, Some(WgpuModifierSnippetSource::Snippets(&registry)));
    let plan = get_cached_modifier_plan(state, material, &registry, Some(&define_key));
    let color_adjusted = get_wgpu_scene3d_runtime(state).active_color_adjustment_run;
    let color_matrix = get_wgpu_scene3d_runtime(state).active_color_matrix_run;
    let revision = get_wgpu_render_state_runtime(state).modifier_snippet_revision;
    let key = format!(
        "{}|registry:{}|{}|{}",
        define_key,
        revision,
        get_wgpu_texture_format_name(format),
        if color_matrix {
            "color-matrix"
        } else if color_adjusted {
            "color-adjusted"
        } else {
            "base"
        }
    );
    return ensure_wgpu_scene3d_pipeline(state, &key, &mut |state, blended, skinned| {
        let native = get_wgpu_render_state_native_device(state);
        let both = wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT;
        let mut entries = vec![
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: both,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: both,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            },
        ];
        for binding in 2..=5 {
            entries.push(texture_layout_entry(binding, wgpu::ShaderStages::FRAGMENT));
        }
        for index in 0..plan.texture_count {
            entries.push(texture_layout_entry(index + 6, both));
        }
        let material_bind_group_layout = create_wgpu_bind_group_layout(&native, &entries);
        let feature = if color_adjusted || color_matrix {
            get_wgpu_color_adjustment_material_feature(state)
        } else {
            None
        };
        let skinning = get_wgpu_skinning_adapter(state);
        let module = create_wgpu_shader_module(
            &native,
            &assemble_wgpu_shaded_module_source(
                material,
                &plan,
                skinned,
                skinning,
                feature,
                color_matrix,
            ),
        );
        let pbr_sample_bind_group_layout = ensure_wgpu_pbr_sample_layout(state);
        return create_wgpu_mesh_pipeline(
            state,
            &WgpuMeshPipelineOptions {
                blended: Some(blended),
                double_sided: get_wgpu_shaded_base_flags(material).double_sided,
                extra_bind_group_layout: None,
                format,
                ibl_bind_group_layout: None,
                material_bind_group_layout,
                module,
                pbr_sample_bind_group_layout: Some(pbr_sample_bind_group_layout),
                shadow_bind_group_layout: None,
                skinned: Some(skinned),
                topology: None,
            },
        );
    });
}

fn flag(value: bool, letter: char) -> char {
    return if value { letter } else { '-' };
}

fn get_animated_normal_contribution(
    modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let Some(value) = narrow::<AnimatedNormalModifier>(modifier) else {
        return empty_contribution();
    };
    let Some(map) = &value.map else {
        return empty_contribution();
    };
    let base = context.uniform_base / 4;
    let primary = (context.acquire_texture)(Some(map));
    let secondary = match &value.secondary_map {
        None => String::new(),
        Some(secondary) => format!(
            " + textureSample(modifierTexture{}, materialSampler, in.uv + material.modifierData[{}].xy * material.params.z).xyz * 2.0 - vec3f(1.0)",
            (context.acquire_texture)(Some(secondary)),
            base + 1
        ),
    };
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "{{\n  var animatedNormal = textureSample(modifierTexture{primary}, materialSampler, in.uv + material.modifierData[{base}].xy * material.params.z).xyz * 2.0 - vec3f(1.0){secondary};\n  animatedNormal.x = animatedNormal.x * material.modifierData[{base}].z;\n  animatedNormal.y = animatedNormal.y * material.modifierData[{base}].z;\n  normal = normalize(tbn * animatedNormal);\n}}\n"
        ),
    };
}

fn get_animated_normal_define_signature(modifier: &dyn Modifier) -> String {
    let Some(value) = narrow::<AnimatedNormalModifier>(modifier) else {
        return String::new();
    };
    return if value.map.is_none() {
        "0".to_string()
    } else if value.secondary_map.is_none() {
        "1".to_string()
    } else {
        "2".to_string()
    };
}

fn get_animated_normal_textures(
    modifier: &dyn Modifier,
    out: &mut Vec<Option<Ref<Texture>>>,
    offset: usize,
) -> usize {
    let Some(value) = narrow::<AnimatedNormalModifier>(modifier) else {
        return offset;
    };
    let Some(map) = &value.map else {
        return offset;
    };
    let mut offset = offset;
    out[offset] = Some(map.clone());
    offset += 1;
    if let Some(secondary) = &value.secondary_map {
        out[offset] = Some(secondary.clone());
        offset += 1;
    }
    return offset;
}

// The cached plan for a material, rebuilt when its modifier stack, snippet source, define key or
// any resolved snippet changes (TS `getCachedModifierPlan`). Every caller resolves against the
// state's snippet table, so the source is that table's shared handle: the cache entry holds it, so
// the identity it compares cannot be reused by another table while the entry exists.
fn get_cached_modifier_plan(
    state: &mut WgpuRenderState,
    material: &ShadedMaterial,
    snippets: &Arc<KindMap<&'static WgpuModifierSnippet>>,
    define_key: Option<&str>,
) -> WgpuShadedModifierPlan {
    let key = get_entity_id(material);
    let registry = WgpuModifierSnippetSource::Snippets(snippets);
    if let Some(cached) = get_wgpu_scene3d_runtime(state)
        .shaded_material_plan_cache
        .get(&key)
        && is_same_modifier_stack(&cached.modifiers, &material.modifiers)
        && Arc::ptr_eq(&cached.registry, snippets)
        && define_key.is_none_or(|define_key| cached.define_key == define_key)
        && has_current_snippets(&cached.plan, registry)
    {
        return cached.plan.clone();
    }
    let plan = build_modifier_plan(&material.modifiers, Some(registry));
    let record = WgpuShadedMaterialPlan {
        define_key: match define_key {
            Some(define_key) => define_key.to_string(),
            None => build_wgpu_shaded_cache_key(material, Some(registry)),
        },
        modifiers: material.modifiers.clone(),
        plan: plan.clone(),
        registry: snippets.clone(),
    };
    get_wgpu_scene3d_runtime(state)
        .shaded_material_plan_cache
        .insert(key, record);
    return plan;
}

fn get_dissolve_contribution(
    modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let Some(value) = narrow::<DissolveModifier>(modifier) else {
        return empty_contribution();
    };
    let base = context.uniform_base / 4;
    let procedural = value.map.is_none();
    let noise = match &value.map {
        None => format!("shadedValueNoise(in.uv * material.modifierData[{base}].z)"),
        Some(map) => format!(
            "textureSample(modifierTexture{}, materialSampler, in.uv).r",
            (context.acquire_texture)(Some(map))
        ),
    };
    let edge = base + 1;
    return WgpuModifierContribution {
        declarations: if procedural {
            Some(VALUE_NOISE_WGSL.to_string())
        } else {
            None
        },
        source: format!(
            "{{\n  let dissolveNoise = {noise};\n  if (dissolveNoise < material.modifierData[{base}].x) {{ discard; }}\n  let dissolveEdge = 1.0 - smoothstep(material.modifierData[{base}].x, material.modifierData[{base}].x + max(material.modifierData[{base}].y, 0.0001), dissolveNoise);\n  radiance = mix(radiance, material.modifierData[{edge}].rgb, dissolveEdge);\n}}\n"
        ),
    };
}

fn get_dissolve_define_signature(modifier: &dyn Modifier) -> String {
    let Some(value) = narrow::<DissolveModifier>(modifier) else {
        return String::new();
    };
    return if value.map.is_none() { "p" } else { "m" }.to_string();
}

fn get_dissolve_textures(
    modifier: &dyn Modifier,
    out: &mut Vec<Option<Ref<Texture>>>,
    offset: usize,
) -> usize {
    let Some(value) = narrow::<DissolveModifier>(modifier) else {
        return offset;
    };
    let mut offset = offset;
    if let Some(map) = &value.map {
        out[offset] = Some(map.clone());
        offset += 1;
    }
    return offset;
}

fn get_emissive_contribution(
    modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let Some(value) = narrow::<EmissiveModifier>(modifier) else {
        return empty_contribution();
    };
    let base = context.uniform_base / 4;
    let mask = match &value.mask {
        None => String::new(),
        Some(mask) => format!(
            " * textureSample(modifierTexture{}, materialSampler, in.uv).rgb",
            (context.acquire_texture)(Some(mask))
        ),
    };
    let facing = base + 1;
    let gated = if value.facing == EmissiveModifierFacing::Ignore {
        String::new()
    } else {
        format!(
            "\n  let emissiveLightDir = select(vec3f(0.0, 0.0, 1.0), normalize(-frame.lightDirection.xyz), frame.lightDirection.w > 0.5);\n  let emissiveFacing = dot(normal, emissiveLightDir) * material.modifierData[{facing}].x;\n  let emissiveSoft = max(material.modifierData[{facing}].y, 0.0001);\n  emissiveTerm = emissiveTerm * smoothstep(-emissiveSoft, emissiveSoft, emissiveFacing);"
        )
    };
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "{{\n  var emissiveTerm = material.modifierData[{base}].rgb * material.modifierData[{base}].w{mask};{gated}\n  emissive = emissive + emissiveTerm;\n}}\n"
        ),
    };
}

fn get_emissive_define_signature(modifier: &dyn Modifier) -> String {
    let Some(value) = narrow::<EmissiveModifier>(modifier) else {
        return String::new();
    };
    return format!(
        "{}{}",
        if value.mask.is_none() { "" } else { "m" },
        if value.facing == EmissiveModifierFacing::Ignore {
            ""
        } else {
            "g"
        }
    );
}

fn get_emissive_textures(
    modifier: &dyn Modifier,
    out: &mut Vec<Option<Ref<Texture>>>,
    offset: usize,
) -> usize {
    let Some(value) = narrow::<EmissiveModifier>(modifier) else {
        return offset;
    };
    let mut offset = offset;
    if let Some(mask) = &value.mask {
        out[offset] = Some(mask.clone());
        offset += 1;
    }
    return offset;
}

fn get_env_reflect_contribution(
    _modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let base = context.uniform_base / 4;
    let next = base + 1;
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "{{\n  let envDirection = reflect(-shadedViewDir, normal);\n  let envMip = clamp(material.modifierData[{next}].y, 0.0, 1.0) * max(ibl.params.z, 0.0);\n  let envSample = select(material.modifierData[{base}].rgb, textureSampleLevel(iblPrefiltered, iblSampler, envDirection, envMip).rgb, ibl.params.x > 0.5);\n  let envFresnel = material.modifierData[{next}].x + (1.0 - material.modifierData[{next}].x) * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), 5.0);\n  radiance = radiance + envSample * material.modifierData[{base}].rgb * (material.modifierData[{base}].w * envFresnel);\n}}\n"
        ),
    };
}

fn get_fog_contribution(
    modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let Some(value) = narrow::<FogModifier>(modifier) else {
        return empty_contribution();
    };
    let base = context.uniform_base / 4;
    let next = base + 1;
    let distance = "length(frame.cameraPosition.xyz - in.worldPosition)";
    let factor = match value.mode {
        FogModifierMode::Exponential => {
            format!("1.0 - exp(-material.modifierData[{next}].x * {distance})")
        }
        FogModifierMode::Exponential2 => {
            format!("1.0 - exp(-pow(material.modifierData[{next}].x * {distance}, 2.0))")
        }
        FogModifierMode::Linear => format!(
            "clamp(({distance} - material.modifierData[{next}].y) / max(material.modifierData[{next}].z - material.modifierData[{next}].y, 0.0001), 0.0, 1.0)"
        ),
    };
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "radiance = mix(radiance, material.modifierData[{base}].rgb, clamp({factor}, 0.0, 1.0));\n"
        ),
    };
}

fn get_fog_define_signature(modifier: &dyn Modifier) -> String {
    let Some(value) = narrow::<FogModifier>(modifier) else {
        return String::new();
    };
    return get_fog_modifier_mode_string(value.mode).to_string();
}

// The snippet table a state's composed pipelines resolve against (TS `getModifierSnippetTable`).
fn get_modifier_snippet_table(
    state: &WgpuRenderState,
) -> Arc<KindMap<&'static WgpuModifierSnippet>> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .modifier_snippets
        .clone();
}

fn get_rim_contribution(
    _modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let base = context.uniform_base / 4;
    let next = base + 1;
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "{{\n  let rimFactor = clamp(material.modifierData[{next}].y + material.modifierData[{next}].x * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), max(material.modifierData[{base}].w, 0.0001)), 0.0, 1.0);\n  radiance = radiance + material.modifierData[{base}].rgb * rimFactor;\n}}\n"
        ),
    };
}

fn get_toon_contribution(
    _modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let base = context.uniform_base / 4;
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "{{\n  let toonLum = dot(radiance, vec3f(0.2126, 0.7152, 0.0722));\n  let toonSteps = max(material.modifierData[{base}].x, 2.0);\n  let toonScaled = toonLum * toonSteps;\n  let toonBand = floor(toonScaled);\n  let toonSoft = max(material.modifierData[{base}].y, 0.0001);\n  let toonQuant = (toonBand + smoothstep(0.5 - toonSoft, 0.5 + toonSoft, toonScaled - toonBand)) / toonSteps;\n  radiance = radiance * select(1.0, toonQuant / toonLum, toonLum > 0.0001);\n}}\n"
        ),
    };
}

fn get_vertex_displace_contribution(
    modifier: &dyn Modifier,
    _index: usize,
    context: &mut WgpuModifierCompileContext<'_>,
) -> WgpuModifierContribution {
    let Some(value) = narrow::<VertexDisplaceModifier>(modifier) else {
        return empty_contribution();
    };
    let base = context.uniform_base / 4;
    let axis = match &value.axis {
        None => "normalize(localNormal)".to_string(),
        Some(_) => format!("normalize(material.modifierData[{}].xyz)", base + 1),
    };
    let amount = match (&value.source, &value.map) {
        (VertexDisplaceModifierSource::HeightMap, Some(map)) => format!(
            "textureSampleLevel(modifierTexture{}, materialSampler, vertexUv, 0.0).r * material.modifierData[{base}].x",
            (context.acquire_texture)(Some(map))
        ),
        _ => format!(
            "sin(dot(localPosition.xyz, normalize(material.modifierData[{}].xyz)) * material.modifierData[{base}].y + material.params.z * material.modifierData[{base}].z) * material.modifierData[{base}].x",
            base + 2
        ),
    };
    return WgpuModifierContribution {
        declarations: None,
        source: format!(
            "localPosition = vec4f(localPosition.xyz + {axis} * ({amount}), 1.0);\n"
        ),
    };
}

fn get_vertex_displace_define_signature(modifier: &dyn Modifier) -> String {
    let Some(value) = narrow::<VertexDisplaceModifier>(modifier) else {
        return String::new();
    };
    return format!(
        "{}{}{}",
        get_vertex_displace_modifier_source_string(value.source),
        if value.axis.is_none() { "" } else { "a" },
        if value.map.is_none() { "" } else { "m" }
    );
}

fn get_vertex_displace_textures(
    modifier: &dyn Modifier,
    out: &mut Vec<Option<Ref<Texture>>>,
    offset: usize,
) -> usize {
    let Some(value) = narrow::<VertexDisplaceModifier>(modifier) else {
        return offset;
    };
    let mut offset = offset;
    if value.source == VertexDisplaceModifierSource::HeightMap
        && let Some(map) = &value.map
    {
        out[offset] = Some(map.clone());
        offset += 1;
    }
    return offset;
}

// The canonical ordered define key over a snippet table (each kind with its snippet's signature),
// or the substrate-neutral modifier define key over a registry (TS `getWgpuModifierDefineKey`).
fn get_wgpu_modifier_define_key(
    stack: &[Ref<dyn Modifier>],
    registry: Option<WgpuModifierSnippetSource<'_>>,
) -> String {
    let table = match registry {
        Some(WgpuModifierSnippetSource::Snippets(table)) => table,
        Some(WgpuModifierSnippetSource::Registry(registry)) => {
            return get_modifier_define_key(stack, Some(registry));
        }
        None => return get_modifier_define_key(stack, None),
    };
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, stack);
    let mut key = String::new();
    for modifier in ordered {
        let modifier = modifier.read().unwrap();
        let kind = &modifier.modifier_fields().kind;
        let signature = table
            .entries
            .get(kind.as_str())
            .and_then(|snippet| snippet.get_define_signature)
            .map(|signature| signature(&*modifier))
            .unwrap_or_default();
        let token = if signature.is_empty() {
            kind.clone()
        } else {
            format!("{}:{}", kind, signature)
        };
        if !key.is_empty() {
            key.push('+');
        }
        key.push_str(&token);
    }
    return key;
}

/// The WGSL module for a ShadedMaterial variant (TS `getWgpuShadedModuleSource`): the classic
/// Blinn-Phong shared-sampler assembly with modifier declarations and slot contributions spliced at
/// stable semantic hooks. `None` resolves against an empty modifier registry.
pub fn get_wgpu_shaded_module_source(
    material: &ShadedMaterial,
    registry: Option<WgpuModifierSnippetSource<'_>>,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
    color_adjustment_feature: Option<&WgpuColorAdjustmentMaterialFeature>,
    color_matrix: Option<bool>,
) -> String {
    let plan = build_modifier_plan(&material.modifiers, registry);
    return assemble_wgpu_shaded_module_source(
        material,
        &plan,
        skinned.unwrap_or(false),
        skinning,
        color_adjustment_feature,
        color_matrix.unwrap_or(false),
    );
}

fn has_current_snippets(plan: &WgpuShadedModifierPlan, registry: WgpuModifierSnippetSource<'_>) -> bool {
    for (index, modifier) in plan.ordered_modifiers.iter().enumerate() {
        let kind = modifier.read().unwrap().modifier_fields().kind.clone();
        let current = resolve_wgpu_modifier_snippet_source(Some(registry), &kind);
        let same = match (current, plan.snippets[index]) {
            (None, None) => true,
            (Some(a), Some(b)) => std::ptr::eq(a, b),
            _ => false,
        };
        if !same {
            return false;
        }
    }
    return true;
}

fn indent(source: &str, spaces: usize) -> String {
    if source.is_empty() {
        return String::new();
    }
    let prefix = " ".repeat(spaces);
    return source
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                line.to_string()
            } else {
                format!("{}{}", prefix, line)
            }
        })
        .collect::<Vec<String>>()
        .join("\n");
}

// The same modifier stack (TS: the same modifiers array): equal length and the same handles.
fn is_same_modifier_stack(a: &[Ref<dyn Modifier>], b: &[Ref<dyn Modifier>]) -> bool {
    return a.len() == b.len() && a.iter().zip(b.iter()).all(|(a, b)| Arc::ptr_eq(a, b));
}

fn narrow<T: 'static>(modifier: &dyn Modifier) -> Option<&T> {
    let any: &dyn Any = modifier;
    return any.downcast_ref::<T>();
}

fn read_texture_slot(slot: &Option<Ref<Texture>>) -> Option<std::sync::RwLockReadGuard<'_, Texture>> {
    return slot.as_ref().map(|texture| texture.read().unwrap());
}

/// Installs the eight built-in modifier compilers on this state (TS
/// `registerBuiltInWgpuModifierSnippets`).
pub fn register_built_in_wgpu_modifier_snippets(state: &mut WgpuRenderState) {
    register_wgpu_modifier_snippet(state, &ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &DISSOLVE_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &EMISSIVE_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &ENV_REFLECT_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &FOG_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &RIM_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &TOON_WGPU_MODIFIER_SNIPPET);
    register_wgpu_modifier_snippet(state, &VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET);
}

// Resolves a modifier compiler from a snippet table; the substrate-neutral registry carries
// definitions only, so it resolves no WGSL compiler.
fn resolve_wgpu_modifier_snippet_source(
    registry: Option<WgpuModifierSnippetSource<'_>>,
    kind: &str,
) -> Option<&'static WgpuModifierSnippet> {
    return match registry {
        Some(WgpuModifierSnippetSource::Snippets(table)) => table.entries.get(kind).copied(),
        _ => None,
    };
}

fn texture_entry_index(texture_index: usize) -> usize {
    return if texture_index < 3 {
        texture_index + 2
    } else {
        texture_index + 3
    };
}

fn texture_layout_entry(binding: u32, visibility: wgpu::ShaderStages) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    };
}

fn write_modifier_uniforms(out: &mut [f32], offset: usize, plan: &WgpuShadedModifierPlan) {
    for (index, modifier) in plan.ordered_modifiers.iter().enumerate() {
        if let Some(bind) = plan.snippets[index].and_then(|snippet| snippet.bind) {
            bind(&*modifier.read().unwrap(), out, offset + index * MODIFIER_FLOATS);
        }
    }
}

const VALUE_NOISE_WGSL: &str = r#"
fn shadedHashNoise(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn shadedValueNoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(mix(shadedHashNoise(i), shadedHashNoise(i + vec2f(1.0, 0.0)), u.x),
    mix(shadedHashNoise(i + vec2f(0.0, 1.0)), shadedHashNoise(i + vec2f(1.0, 1.0)), u.x), u.y);
}
"#;
