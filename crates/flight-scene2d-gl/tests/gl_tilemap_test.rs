use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render_gl::{GlRenderState, register_gl_image_texture_resolver};
use flight_scene2d_gl::*;
use flight_textureatlas::{TextureAtlas, create_texture_atlas};
use flight_tilemap::create_tilemap;

use crate::gl_test_helper::{calls_with, count_calls, create_gl_state, make_atlas, make_scene2d_proxy};

fn create_atlas_gl_state() -> GlRenderState {
    let mut state = create_gl_state();
    register_gl_image_texture_resolver(&mut state);
    register_gl_standard_material(&mut state);
    return state;
}

fn make_tilemap_node(
    atlas: Option<Ref<TextureAtlas>>,
    columns: i32,
    rows: i32,
    tiles: Vec<i16>,
) -> NodeRef {
    let tilemap = create_tilemap();
    {
        let mut tilemap = tilemap.write().unwrap();
        tilemap.data.atlas = atlas;
        tilemap.data.columns = columns;
        tilemap.data.rows = rows;
        tilemap.data.tile_height = 16.0;
        tilemap.data.tile_width = 16.0;
        tilemap.data.tiles = tiles;
    }
    return tilemap;
}

fn default_atlas() -> Option<Ref<TextureAtlas>> {
    return Some(make_atlas(16.0, 16.0));
}

fn submit(state: &mut GlRenderState, node: NodeRef) {
    let proxy = make_scene2d_proxy(state, node);
    (GL_TILEMAP_RENDERER.submit)(state, &proxy);
    flush_gl_quad_batch_writer(state);
}

mod gl_tilemap_renderer {
    use super::*;

    #[test]
    fn has_a_create_data_function() {
        let mut state = create_gl_state();
        let node = make_tilemap_node(default_atlas(), 2, 2, vec![0; 4]);
        assert!((GL_TILEMAP_RENDERER.create_data)(&mut state, &node).is_none());
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_is_null() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(None, 2, 2, vec![0; 4]));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_null() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(Some(create_texture_atlas()), 2, 2, vec![0; 4]));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_unbound() {
        let mut state = create_atlas_gl_state();
        let atlas = create_texture_atlas();
        atlas.write().unwrap().texture =
            Some(Arc::new(RwLock::new(flight_texture::create_texture_2d())));
        submit(&mut state, make_tilemap_node(Some(atlas), 2, 2, vec![0; 4]));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_columns_is_0() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(default_atlas(), 0, 2, vec![0; 4]));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_rows_is_0() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(default_atlas(), 2, 0, vec![0; 4]));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn draws_all_valid_tiles_in_a_single_instanced_call() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(default_atlas(), 2, 2, vec![0; 4]));
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 4);
    }

    #[test]
    fn excludes_out_of_range_tile_ids_from_the_instanced_draw_count() {
        let mut state = create_atlas_gl_state();
        submit(&mut state, make_tilemap_node(default_atlas(), 2, 2, vec![0, 99, 99, 0]));
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 2);
    }
}
