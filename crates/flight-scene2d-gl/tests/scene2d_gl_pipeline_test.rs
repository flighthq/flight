use flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND;
use flight_bitmaptext::BITMAP_TEXT_KIND;
use flight_image::IMAGE_TEXTURE_SOURCE_KIND;
use flight_materials::{
    BLEND_MODE_ADD, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL, BLEND_MODE_SCREEN,
    STANDARD_MATERIAL_KIND,
};
use flight_particleemitter::PARTICLE_EMITTER_2D_KIND;
use flight_quadbatch::QUAD_BATCH_KIND;
use flight_registry::with_kind_map_entry;
use flight_render::{RENDER_CACHE_KIND, RENDER_TARGET_TEXTURE_SOURCE_KIND};
use flight_render_gl::{
    GlRenderStateOptions, build_gl_render_registries, standard_gl_blend_realizations,
    standard_gl_texture_resolvers,
};
use flight_scene2d::{DISPLAY_OBJECT_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_scene2d_gl::*;
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::TILEMAP_KIND;

fn sorted_keys<T>(map: &flight_registry::KindMap<T>) -> Vec<String> {
    let mut keys = map.key_order.clone();
    keys.sort();
    return keys;
}

mod gl_render_infrastructure {
    use super::*;

    #[test]
    fn carries_everything_but_the_node_renderers() {
        let options = gl_render_infrastructure();
        assert!(options.render_registries.node_renderers.is_none());
        assert!(matches!(
            options.render_registries.stroke_tessellator,
            Some(Some(_))
        ));
        assert_eq!(options.gl_registries.material_renderers.entries.len(), 1);
    }
}

mod gl_scene2d_render_preset {
    use super::*;

    #[test]
    fn carries_every_standard_2d_gl_renderer_bound() {
        let preset = gl_scene2d_render_preset();
        let renderers = preset.render_registries.node_renderers.unwrap();
        for kind in [
            BITMAP_TEXT_KIND,
            DISPLAY_OBJECT_KIND,
            MORPH_SHAPE_KIND,
            PARTICLE_EMITTER_2D_KIND,
            QUAD_BATCH_KIND,
            RENDER_CACHE_KIND,
            RICH_TEXT_KIND,
            SCALE9_SPRITE_KIND,
            SCALE9_SHAPE_KIND,
            SHAPE_KIND,
            SPRITE_KIND,
            TEXT_LABEL_KIND,
            TILEMAP_KIND,
        ] {
            assert!(renderers.entries.contains_key(kind), "{kind}");
        }
    }

    #[test]
    fn carries_the_standard_texture_resolvers() {
        let preset = gl_scene2d_render_preset();
        let resolvers = &preset.gl_registries.texture_resolvers;
        assert_eq!(
            sorted_keys(resolvers),
            sorted_keys(&standard_gl_texture_resolvers())
        );
        assert!(resolvers.entries.contains_key(BITMAP_TEXTURE_SOURCE_KIND));
        assert!(resolvers.entries.contains_key(IMAGE_TEXTURE_SOURCE_KIND));
        assert!(
            resolvers
                .entries
                .contains_key(RENDER_TARGET_TEXTURE_SOURCE_KIND)
        );
    }

    #[test]
    fn carries_the_standard_fixed_function_blend_realizations() {
        let preset = gl_scene2d_render_preset();
        let blends = &preset.gl_registries.blend_realizations;
        assert_eq!(
            sorted_keys(blends),
            sorted_keys(&standard_gl_blend_realizations())
        );
        for mode in [
            BLEND_MODE_NORMAL,
            BLEND_MODE_ADD,
            BLEND_MODE_MULTIPLY,
            BLEND_MODE_SCREEN,
        ] {
            assert!(blends.entries.contains_key(mode), "{mode}");
        }
    }

    #[test]
    fn carries_the_stroke_tessellator_in_the_slot_table() {
        let preset = gl_scene2d_render_preset();
        assert!(matches!(
            preset.render_registries.stroke_tessellator,
            Some(Some(_))
        ));
    }

    #[test]
    fn carries_the_standard_material_renderer_for_standard_material_kind() {
        let preset = gl_scene2d_render_preset();
        let materials = &preset.gl_registries.material_renderers;
        assert_eq!(materials.entries.len(), 1);
        assert!(materials.entries.contains_key(STANDARD_MATERIAL_KIND));
    }

    #[test]
    fn starts_with_empty_gl_specific_tables_that_no_family_populates() {
        let preset = gl_scene2d_render_preset();
        assert!(
            preset
                .gl_registries
                .custom_effect_shaders
                .entries
                .is_empty()
        );
        assert!(
            preset
                .gl_registries
                .custom_material_shaders
                .entries
                .is_empty()
        );
    }

    #[test]
    fn manual_single_capability_pipeline_carries_only_the_explicitly_registered_sprite_renderer() {
        let options = crate::gl_test_helper::test_default::<GlRenderStateOptions>();
        let registries = build_gl_render_registries(&options);
        let renderers = with_kind_map_entry(
            &flight_registry::KindMap {
                entries: std::collections::HashMap::new(),
                key_order: Vec::new(),
            },
            SPRITE_KIND.to_string(),
            &GL_SPRITE_RENDERER,
        );
        assert_eq!(renderers.entries.len(), 1);
        assert!(renderers.entries.contains_key(SPRITE_KIND));
        assert!(registries.blend_realizations.entries.is_empty());
        assert!(registries.texture_resolvers.entries.is_empty());
    }
}
