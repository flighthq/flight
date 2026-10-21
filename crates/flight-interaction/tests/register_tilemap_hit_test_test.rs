use flight_interaction::hit_tests::{find_graph_hit_target_precise, HitTestContext};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_tilemap_hit_test::register_tilemap_hit_test;
use flight_node::NodeRef;
use flight_textureatlas::create_texture_atlas;
use flight_scene2d::contract::PartialNode2D;
use flight_tilemap::{PartialTilemap, TilemapDataOptions, create_tilemap};

fn tilemap_node(columns: i32, rows: i32, tw: f32, th: f32, tiles: Vec<i16>) -> NodeRef {
    let atlas = create_texture_atlas(None);
    let tm: NodeRef = create_tilemap(Some(&PartialTilemap {
        data: Some(TilemapDataOptions {
            atlas: Some(atlas),
            columns: Some(columns),
            rows: Some(rows),
            tile_width: Some(tw),
            tile_height: Some(th),
            tiles: Some(tiles),
            material_data: None,
        }),
        node: PartialNode2D {
            alpha: None,
            blend_mode: None,
            clip: None,
            enabled: None,
            material: None,
            material_data: None,
            name: None,
            pivot_x: None,
            pivot_y: None,
            rotation: None,
            scale_x: None,
            scale_y: None,
            skew_x: None,
            skew_y: None,
            visible: None,
            x: None,
            y: None,
        },
    }));
    enable_node_interaction_state(&tm);
    set_node_hit_test_enabled(&tm, true);
    return tm;
}

mod register_tilemap_hit_test {
    use super::*;

    #[test]
    fn hit_on_occupied_tile() {
        let mut ctx = HitTestContext::new();
        register_tilemap_hit_test(&mut ctx);
        let tm = tilemap_node(2, 2, 32.0, 32.0, vec![0, 1, 2, 3]);
        let result = find_graph_hit_target_precise(&ctx, &tm, 16.0, 16.0);
        assert!(result.is_some());
    }

    #[test]
    fn miss_on_empty_tile() {
        let mut ctx = HitTestContext::new();
        register_tilemap_hit_test(&mut ctx);
        let tm = tilemap_node(2, 2, 32.0, 32.0, vec![-1, 0, 0, 0]);
        let result = find_graph_hit_target_precise(&ctx, &tm, 16.0, 16.0);
        assert!(result.is_none());
    }

    #[test]
    fn miss_outside_grid() {
        let mut ctx = HitTestContext::new();
        register_tilemap_hit_test(&mut ctx);
        let tm = tilemap_node(2, 2, 32.0, 32.0, vec![0, 0, 0, 0]);
        let result = find_graph_hit_target_precise(&ctx, &tm, 200.0, 200.0);
        assert!(result.is_none());
    }

    #[test]
    fn hit_returns_cell_index() {
        let mut ctx = HitTestContext::new();
        register_tilemap_hit_test(&mut ctx);
        let tm = tilemap_node(3, 2, 10.0, 10.0, vec![0, 0, 0, 0, 0, 0]);
        let result = find_graph_hit_target_precise(&ctx, &tm, 15.0, 5.0);
        assert!(result.is_some());
    }
}
