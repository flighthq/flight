use flight_node::NodeRef;
use flight_render::{BatchFormat, get_or_create_render_proxy_2d};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_textureatlas::TextureAtlasRotation;

use crate::support::*;

mod wgpu_tilemap_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        assert_eq!(WGPU_TILEMAP_RENDERER.format, Some(BatchFormat::Quad));
        assert!(WGPU_TILEMAP_RENDERER.is_dirty.is_none());
    }

    #[test]
    fn submit_does_not_panic_when_atlas_is_none() {
        let mut state = create_test_state_in_pass();
        let tilemap: NodeRef = flight_tilemap::create_tilemap();
        let mut proxies = prepare_test_scene(&mut state, &tilemap);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &tilemap);
        (WGPU_TILEMAP_RENDERER.submit)(&mut state, proxy);
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn submit_does_not_panic_when_render_pass_is_none() {
        let mut state = create_wgpu_render_state_for_test(None);
        let tilemap: NodeRef = flight_tilemap::create_tilemap();
        let mut proxies = prepare_test_scene(&mut state, &tilemap);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &tilemap);
        (WGPU_TILEMAP_RENDERER.submit)(&mut state, proxy);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
    }

    #[test]
    fn submit_writes_one_instance_per_non_empty_cell_at_its_grid_position() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        register_wgpu_standard_material(&mut state);
        let tilemap = flight_tilemap::create_tilemap();
        {
            let mut tilemap = tilemap.write().unwrap();
            tilemap.data.atlas = Some(create_test_atlas(
                32,
                32,
                &[(0.0, 0.0, 16.0, 16.0, TextureAtlasRotation::None)],
            ));
            tilemap.data.columns = 2;
            tilemap.data.rows = 2;
            tilemap.data.tile_width = 16.0;
            tilemap.data.tile_height = 16.0;
            tilemap.data.tiles = vec![0, -1, -1, 0];
        }
        let node: NodeRef = tilemap;
        let mut proxies = prepare_test_scene(&mut state, &node);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);

        (WGPU_TILEMAP_RENDERER.submit)(&mut state, proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_count, 2);
        let data = &runtime.quad_batch_writer_instance_data;
        assert_eq!((data[4], data[5]), (0.0, 0.0));
        let second = QUAD_BATCH_INSTANCE_FLOATS;
        assert_eq!((data[second + 4], data[second + 5]), (16.0, 16.0));
        submit_wgpu_frame(&mut state);
    }
}
