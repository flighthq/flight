//! flight-compiler: target-native

use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_registry::with_kind_map_entry;
use flight_render::RENDER_CACHE_KIND;
use flight_render::register_node_renderer;
use flight_render_wgpu::*;
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_scene2d_wgpu::contract::*;
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

use crate::support::*;

mod register_wgpu_render_preset {
    use super::*;

    #[test]
    fn overlays_each_table_and_keeps_registrations_the_preset_does_not_name() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_node_renderer(&mut state, "Custom".to_string(), &WGPU_SPRITE_RENDERER);
        register_wgpu_shape_renderer(&mut state);
        register_wgpu_standard_material(&mut state);
        let mut registries = build_wgpu_render_registries(&test_default());
        registries.material_renderers = std::sync::Arc::new(with_kind_map_entry(
            &registries.material_renderers,
            "PresetMaterial".to_string(),
            WgpuMaterialRenderer::Quad(STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone()),
        ));
        let preset = WgpuScene2DRenderPreset {
            node_renderers: with_kind_map_entry(
                &flight_registry::KindMap {
                    entries: std::collections::HashMap::new(),
                    key_order: Vec::new(),
                },
                SHAPE_KIND.to_string(),
                &WGPU_MESH_SHAPE_RENDERER,
            ),
            registries,
        };
        register_wgpu_render_preset(&mut state, &preset);
        assert!(std::ptr::eq(
            get_registered_node_renderer(&state, SHAPE_KIND).unwrap(),
            &WGPU_MESH_SHAPE_RENDERER
        ));
        assert!(std::ptr::eq(
            get_registered_node_renderer(&state, "Custom").unwrap(),
            &WGPU_SPRITE_RENDERER
        ));
        assert!(get_wgpu_quad_material_renderer(&state, &"PresetMaterial".to_string()).is_some());
        assert!(
            get_wgpu_quad_material_renderer(&state, &STANDARD_MATERIAL_KIND.to_string()).is_some()
        );
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .gpu_skinning
                .is_none()
        );
    }
}

mod register_wgpu_scene2d_render_preset {
    use super::*;

    #[test]
    fn registers_every_preset_node_renderer_and_the_standard_material() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_scene2d_render_preset(&mut state);
        let preset = &WGPU_SCENE2D_RENDER_PRESET.node_renderers;
        assert_eq!(preset.key_order.len(), 13);
        for kind in &preset.key_order {
            assert!(
                std::ptr::eq(
                    get_registered_node_renderer(&state, kind).unwrap(),
                    *preset.entries.get(kind).unwrap()
                ),
                "{kind}"
            );
        }
        assert!(
            get_wgpu_quad_material_renderer(&state, &STANDARD_MATERIAL_KIND.to_string()).is_some()
        );
    }
}

mod wgpu_render_infrastructure {
    use super::*;

    #[test]
    fn carries_the_standard_quad_material_renderer_and_no_node_renderers() {
        assert_eq!(
            WGPU_RENDER_INFRASTRUCTURE.material_renderers.entries.len(),
            1
        );
        assert!(
            WGPU_RENDER_INFRASTRUCTURE
                .material_renderers
                .entries
                .contains_key(STANDARD_MATERIAL_KIND)
        );
    }
}

mod wgpu_scene2d_render_preset {
    use super::*;

    #[test]
    fn carries_every_standard_2d_wgpu_renderer_bound() {
        let expected_kinds = [
            BITMAP_TEXT_KIND,
            DISPLAY_OBJECT_KIND,
            MORPH_SHAPE_KIND,
            PARTICLE_EMITTER_2D_KIND,
            QUAD_BATCH_KIND,
            RENDER_CACHE_KIND,
            RICH_TEXT_KIND,
            SCALE9_SHAPE_KIND,
            SCALE9_SPRITE_KIND,
            SHAPE_KIND,
            SPRITE_KIND,
            TEXT_LABEL_KIND,
            TILEMAP_KIND,
        ];
        for kind in expected_kinds {
            assert!(
                WGPU_SCENE2D_RENDER_PRESET
                    .node_renderers
                    .entries
                    .contains_key(kind),
                "{kind}"
            );
        }
        assert!(std::ptr::eq(
            *WGPU_SCENE2D_RENDER_PRESET
                .node_renderers
                .entries
                .get(SCALE9_SPRITE_KIND)
                .unwrap(),
            &WGPU_SCALE9_SPRITE_RENDERER
        ));
    }

    #[test]
    fn carries_the_standard_quad_material_renderer() {
        let materials = &WGPU_SCENE2D_RENDER_PRESET.registries.material_renderers;
        assert_eq!(materials.entries.len(), 1);
        assert!(materials.entries.contains_key(STANDARD_MATERIAL_KIND));
    }

    // TS checks const identity and Object.freeze: a Rust static is one immutable value.
    #[test]
    fn is_one_shared_immutable_value() {
        assert!(std::ptr::eq(
            &*WGPU_SCENE2D_RENDER_PRESET,
            &*WGPU_SCENE2D_RENDER_PRESET
        ));
    }
}
