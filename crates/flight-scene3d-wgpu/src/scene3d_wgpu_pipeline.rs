// flight-lint: allow-file(contract-vocabulary) D17 render presets hold backend-typed renderer tables over render-wgpu state
//! The standard 3D WebGPU render preset (TS `scene3DWgpuPipeline.ts`): the complete 2D preset plus
//! every supported mesh-material renderer, the built-in modifier snippets, the standard texture
//! resolvers and GPU skinning. Node3D and ParticleEmitter3D draw through explicit
//! `render_wgpu_scene3d` passes rather than node renderers, and WebGPU has no ExtendedPbrMaterial
//! renderer or PBR-extension registry.

use std::sync::{Arc, LazyLock};

use flight_materials::{
    BLINN_PHONG_MATERIAL_KIND, CUSTOM_SHADER_MATERIAL_KIND, DEPTH_MATERIAL_KIND,
    EMISSIVE_MATERIAL_KIND, LAMBERT_MATERIAL_KIND, MATCAP_MATERIAL_KIND, NORMAL_MATERIAL_KIND,
    PHONG_MATERIAL_KIND, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND,
    TOON_MATERIAL_KIND, UNLIT_MATERIAL_KIND, VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND,
};
use flight_registry::{KindMap, concat_kind_map, with_kind_map_entry};
use flight_render_wgpu::{
    STANDARD_WGPU_TEXTURE_RESOLVERS, WgpuMaterialRenderer, WgpuMeshMaterialRenderer,
    WgpuModifierSnippet, WgpuTextureResolver,
};
use flight_scene2d_wgpu::{WGPU_SCENE2D_RENDER_PRESET, WgpuScene2DRenderPreset};
use flight_shading::SHADED_MATERIAL_KIND;

use crate::wgpu_blinn_phong_mesh_material_renderer::WGPU_BLINN_PHONG_MESH_MATERIAL_RENDERER;
use crate::wgpu_custom_shader_mesh_material_renderer::WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER;
use crate::wgpu_depth_mesh_material_renderer::WGPU_DEPTH_MESH_MATERIAL_RENDERER;
use crate::wgpu_emissive_mesh_material_renderer::WGPU_EMISSIVE_MESH_MATERIAL_RENDERER;
use crate::wgpu_lambert_mesh_material_renderer::WGPU_LAMBERT_MESH_MATERIAL_RENDERER;
use crate::wgpu_matcap_mesh_material_renderer::WGPU_MATCAP_MESH_MATERIAL_RENDERER;
use crate::wgpu_normal_mesh_material_renderer::WGPU_NORMAL_MESH_MATERIAL_RENDERER;
use crate::wgpu_phong_mesh_material_renderer::WGPU_PHONG_MESH_MATERIAL_RENDERER;
use crate::wgpu_shaded_mesh_material_renderer::WGPU_SHADED_MESH_MATERIAL_RENDERER;
use crate::wgpu_shaded_prelude::{
    ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET, DISSOLVE_WGPU_MODIFIER_SNIPPET,
    EMISSIVE_WGPU_MODIFIER_SNIPPET, ENV_REFLECT_WGPU_MODIFIER_SNIPPET, FOG_WGPU_MODIFIER_SNIPPET,
    RIM_WGPU_MODIFIER_SNIPPET, TOON_WGPU_MODIFIER_SNIPPET, VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET,
};
use crate::wgpu_skin_palette::WGPU_SKINNING_ADAPTER;
use crate::wgpu_specular_glossiness_pbr_mesh_material_renderer::WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER;
use crate::wgpu_standard_pbr_mesh_material_renderer::WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER;
use crate::wgpu_toon_mesh_material_renderer::WGPU_TOON_MESH_MATERIAL_RENDERER;
use crate::wgpu_unlit_mesh_material_renderer::WGPU_UNLIT_MESH_MATERIAL_RENDERER;
use crate::wgpu_vertex_color_mesh_material_renderer::WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER;
use crate::wgpu_wireframe_mesh_material_renderer::WGPU_WIREFRAME_MESH_MATERIAL_RENDERER;

/// The complete standard 3D WebGPU configuration (TS `wgpuScene3DRenderPreset`): the 2D preset's
/// node renderers and registries, plus the mesh-material renderers, the built-in modifier snippets,
/// the standard texture resolvers and GPU skinning. A static is one immutable shared value, the
/// counterpart of the source's frozen object.
pub static WGPU_SCENE3D_RENDER_PRESET: LazyLock<WgpuScene2DRenderPreset> = LazyLock::new(|| {
    let base = &*WGPU_SCENE2D_RENDER_PRESET;
    let mut registries = base.registries.clone();
    registries.gpu_skinning = Some(&WGPU_SKINNING_ADAPTER);
    registries.material_renderers = Arc::new(build_scene3d_wgpu_mesh_material_renderers(
        &base.registries.material_renderers,
    ));
    registries.modifier_snippets = Arc::new(build_scene3d_wgpu_modifier_snippets(
        &base.registries.modifier_snippets,
    ));
    registries.texture_resolvers = Arc::new(build_scene3d_wgpu_texture_resolvers(
        &base.registries.texture_resolvers,
    ));
    return WgpuScene2DRenderPreset {
        node_renderers: base.node_renderers.clone(),
        registries,
    };
});

fn build_scene3d_wgpu_mesh_material_renderers(
    base: &KindMap<WgpuMaterialRenderer>,
) -> KindMap<WgpuMaterialRenderer> {
    let entries: [(&str, &'static WgpuMeshMaterialRenderer); 15] = [
        (
            BLINN_PHONG_MATERIAL_KIND,
            &WGPU_BLINN_PHONG_MESH_MATERIAL_RENDERER,
        ),
        (
            CUSTOM_SHADER_MATERIAL_KIND,
            &WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER,
        ),
        (DEPTH_MATERIAL_KIND, &WGPU_DEPTH_MESH_MATERIAL_RENDERER),
        (
            EMISSIVE_MATERIAL_KIND,
            &WGPU_EMISSIVE_MESH_MATERIAL_RENDERER,
        ),
        (LAMBERT_MATERIAL_KIND, &WGPU_LAMBERT_MESH_MATERIAL_RENDERER),
        (MATCAP_MATERIAL_KIND, &WGPU_MATCAP_MESH_MATERIAL_RENDERER),
        (NORMAL_MATERIAL_KIND, &WGPU_NORMAL_MESH_MATERIAL_RENDERER),
        (PHONG_MATERIAL_KIND, &WGPU_PHONG_MESH_MATERIAL_RENDERER),
        (SHADED_MATERIAL_KIND, &WGPU_SHADED_MESH_MATERIAL_RENDERER),
        (
            SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
            &WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER,
        ),
        (
            STANDARD_PBR_MATERIAL_KIND,
            &WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER,
        ),
        (TOON_MATERIAL_KIND, &WGPU_TOON_MESH_MATERIAL_RENDERER),
        (UNLIT_MATERIAL_KIND, &WGPU_UNLIT_MESH_MATERIAL_RENDERER),
        (
            VERTEX_COLOR_MATERIAL_KIND,
            &WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER,
        ),
        (
            WIREFRAME_MATERIAL_KIND,
            &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER,
        ),
    ];
    let mut table = base.clone();
    for (kind, renderer) in entries {
        table = with_kind_map_entry(
            &table,
            kind.to_string(),
            WgpuMaterialRenderer::Mesh(renderer),
        );
    }
    return table;
}

fn build_scene3d_wgpu_modifier_snippets(
    base: &KindMap<&'static WgpuModifierSnippet>,
) -> KindMap<&'static WgpuModifierSnippet> {
    let snippets: [&'static WgpuModifierSnippet; 8] = [
        &ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET,
        &DISSOLVE_WGPU_MODIFIER_SNIPPET,
        &EMISSIVE_WGPU_MODIFIER_SNIPPET,
        &ENV_REFLECT_WGPU_MODIFIER_SNIPPET,
        &FOG_WGPU_MODIFIER_SNIPPET,
        &RIM_WGPU_MODIFIER_SNIPPET,
        &TOON_WGPU_MODIFIER_SNIPPET,
        &VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET,
    ];
    let mut table = base.clone();
    for snippet in snippets {
        table = with_kind_map_entry(&table, snippet.kind.to_string(), snippet);
    }
    return table;
}

fn build_scene3d_wgpu_texture_resolvers(
    base: &KindMap<WgpuTextureResolver>,
) -> KindMap<WgpuTextureResolver> {
    return concat_kind_map(base, &STANDARD_WGPU_TEXTURE_RESOLVERS);
}
