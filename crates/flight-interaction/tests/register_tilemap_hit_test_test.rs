use flight_interaction::hit_tests::{HitTestContext, find_graph_hit_target_precise};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_tilemap_hit_test::register_tilemap_hit_test;
use flight_node::NodeRef;
use flight_textureatlas::create_texture_atlas;
use flight_tilemap::create_tilemap;

fn tilemap_node(columns: i32, rows: i32, tw: f32, th: f32, tiles: Vec<i16>) -> NodeRef {
    let atlas = create_texture_atlas();
    let tm = create_tilemap();
    {
        let mut g = tm.write().unwrap();
        g.data.atlas = Some(atlas);
        g.data.columns = columns;
        g.data.rows = rows;
        g.data.tile_width = tw;
        g.data.tile_height = th;
        g.data.tiles = tiles;
    }
    let tm: NodeRef = tm;
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
