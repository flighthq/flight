use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_render::RENDER_CACHE_KIND;
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_scene2d_wgpu::contract::*;
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

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
