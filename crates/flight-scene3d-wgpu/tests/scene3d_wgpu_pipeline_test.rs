use flight_entity::Kind;
use flight_materials::{
    BLINN_PHONG_MATERIAL_KIND, CUSTOM_SHADER_MATERIAL_KIND, DEPTH_MATERIAL_KIND,
    EMISSIVE_MATERIAL_KIND, EXTENDED_PBR_MATERIAL_KIND, LAMBERT_MATERIAL_KIND,
    MATCAP_MATERIAL_KIND, NORMAL_MATERIAL_KIND, PHONG_MATERIAL_KIND,
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND,
    TOON_MATERIAL_KIND, UNLIT_MATERIAL_KIND, VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND,
};
use flight_registry::{KindMap, get_kind_map_keys};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::WGPU_SCENE2D_RENDER_PRESET;
use flight_scene3d_wgpu::contract::*;
use flight_shading::SHADED_MATERIAL_KIND;
use flight_shading::contract::{
    ANIMATED_NORMAL_MODIFIER_KIND, DISSOLVE_MODIFIER_KIND, EMISSIVE_MODIFIER_KIND,
    ENV_REFLECT_MODIFIER_KIND, FOG_MODIFIER_KIND, RIM_MODIFIER_KIND, TOON_MODIFIER_KIND,
    VERTEX_DISPLACE_MODIFIER_KIND,
};

use crate::support::*;

fn registry_keys<T>(table: &KindMap<T>) -> Vec<Kind> {
    let mut keys = Vec::new();
    get_kind_map_keys(&mut keys, table);
    return keys;
}

fn kinds(values: &[&str]) -> Vec<Kind> {
    return values.iter().map(|value| value.to_string()).collect();
}

mod wgpu_scene3d_render_preset {
    use super::*;

    #[test]
    fn retains_the_complete_standard_scene2d_registry_surface() {
        let preset = &*WGPU_SCENE3D_RENDER_PRESET;
        assert_eq!(
            registry_keys(&preset.node_renderers),
            registry_keys(&WGPU_SCENE2D_RENDER_PRESET.node_renderers)
        );
        assert_eq!(
            registry_keys(&preset.node_renderers),
            kinds(&[
                "BitmapText",
                "DisplayObject",
                "MorphShape",
                "ParticleEmitter2D",
                "QuadBatch",
                "RenderCache",
                "RichText",
                "Scale9Shape",
                "Scale9Sprite",
                "Shape",
                "Sprite",
                "TextLabel",
                "Tilemap",
            ])
        );
    }

    #[test]
    fn carries_the_standard_quad_material_and_every_supported_mesh_material_renderer() {
        assert_eq!(
            registry_keys(&WGPU_SCENE3D_RENDER_PRESET.registries.material_renderers),
            kinds(&[
                BLINN_PHONG_MATERIAL_KIND,
                CUSTOM_SHADER_MATERIAL_KIND,
                DEPTH_MATERIAL_KIND,
                EMISSIVE_MATERIAL_KIND,
                LAMBERT_MATERIAL_KIND,
                MATCAP_MATERIAL_KIND,
                NORMAL_MATERIAL_KIND,
                PHONG_MATERIAL_KIND,
                SHADED_MATERIAL_KIND,
                SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
                STANDARD_MATERIAL_KIND,
                STANDARD_PBR_MATERIAL_KIND,
                TOON_MATERIAL_KIND,
                UNLIT_MATERIAL_KIND,
                VERTEX_COLOR_MATERIAL_KIND,
                WIREFRAME_MATERIAL_KIND,
            ])
        );
    }

    #[test]
    fn carries_exactly_every_supported_standard_modifier_snippet() {
        assert_eq!(
            registry_keys(&WGPU_SCENE3D_RENDER_PRESET.registries.modifier_snippets),
            kinds(&[
                ANIMATED_NORMAL_MODIFIER_KIND,
                DISSOLVE_MODIFIER_KIND,
                EMISSIVE_MODIFIER_KIND,
                ENV_REFLECT_MODIFIER_KIND,
                FOG_MODIFIER_KIND,
                RIM_MODIFIER_KIND,
                TOON_MODIFIER_KIND,
                VERTEX_DISPLACE_MODIFIER_KIND,
            ])
        );
    }

    #[test]
    fn carries_exactly_the_standard_wgpu_texture_resolvers() {
        assert_eq!(
            registry_keys(&WGPU_SCENE3D_RENDER_PRESET.registries.texture_resolvers),
            kinds(&["bitmap", "image", "renderTarget"])
        );
    }

    #[test]
    fn carries_gpu_skinning_through_the_pipeline_and_into_state_runtime() {
        let registries = &WGPU_SCENE3D_RENDER_PRESET.registries;
        assert!(
            registries
                .gpu_skinning
                .is_some_and(|adapter| std::ptr::eq(adapter, &WGPU_SKINNING_ADAPTER))
        );

        let mut test = make_wgpu_scene3d_state(Some(WgpuRenderStateOptions {
            gpu_skinning: registries.gpu_skinning,
            material_renderers: Some((*registries.material_renderers).clone()),
            modifier_snippets: Some((*registries.modifier_snippets).clone()),
            texture_resolvers: Some((*registries.texture_resolvers).clone()),
            ..test_default()
        }));
        assert!(
            get_wgpu_skinning_adapter(&mut test.state)
                .is_some_and(|adapter| std::ptr::eq(adapter, &WGPU_SKINNING_ADAPTER))
        );
    }

    // TS checks Object.isFrozen: a Rust static is one immutable shared value.
    #[test]
    fn is_one_shared_immutable_value_so_late_register_calls_cannot_mutate_it() {
        assert!(std::ptr::eq(
            &*WGPU_SCENE3D_RENDER_PRESET,
            &*WGPU_SCENE3D_RENDER_PRESET
        ));
        let mut test = make_wgpu_scene3d_state(Some(WgpuRenderStateOptions {
            material_renderers: Some(
                (*WGPU_SCENE3D_RENDER_PRESET.registries.material_renderers).clone(),
            ),
            ..test_default()
        }));
        register_wgpu_mesh_material_renderer(
            &mut test.state,
            "acme.LateMaterial".to_string(),
            &WGPU_UNLIT_MESH_MATERIAL_RENDERER,
        );
        assert!(
            !WGPU_SCENE3D_RENDER_PRESET
                .registries
                .material_renderers
                .entries
                .contains_key("acme.LateMaterial")
        );
    }

    #[test]
    fn does_not_claim_gl_only_extended_pbr_support() {
        assert!(
            !WGPU_SCENE3D_RENDER_PRESET
                .registries
                .material_renderers
                .entries
                .contains_key(EXTENDED_PBR_MATERIAL_KIND)
        );
    }
}
