use flight_interaction::hit_tests::{HitTestContext, find_graph_hit_target_precise};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_quad_batch_hit_test::register_quad_batch_hit_test;
use flight_node::NodeRef;
use flight_quadbatch::create_quad_batch;
use flight_textureatlas::{
    TextureAtlasRegionOptions, create_texture_atlas, create_texture_atlas_region,
    set_texture_atlas_region,
};

fn quad_batch_with_one_instance(x: f32, y: f32, region_w: f32, region_h: f32) -> NodeRef {
    let region_options = TextureAtlasRegionOptions {
        width: Some(region_w),
        height: Some(region_h),
        id: None,
        name: None,
        original_height: None,
        original_width: None,
        page_name: None,
        pivot_x: None,
        pivot_y: None,
        rotation: None,
        source_x: None,
        source_y: None,
        trimmed: None,
        x: None,
        y: None,
    };
    let region = create_texture_atlas_region();
    set_texture_atlas_region(&mut region.write().unwrap(), &region_options);
    let atlas = create_texture_atlas();
    atlas.write().unwrap().regions.push(region);
    let batch = create_quad_batch();
    {
        let mut guard = batch.write().unwrap();
        guard.data.atlas = Some(atlas);
        guard.data.ids = vec![0];
        guard.data.instance_count = 1;
        guard.data.transforms = vec![x, y];
    }
    let qb: NodeRef = batch;
    enable_node_interaction_state(&qb);
    set_node_hit_test_enabled(&qb, true);
    return qb;
}

mod register_quad_batch_hit_test {
    use super::*;

    #[test]
    fn hit_inside_instance_region() {
        let mut ctx = HitTestContext::new();
        register_quad_batch_hit_test(&mut ctx);
        let qb = quad_batch_with_one_instance(10.0, 10.0, 50.0, 50.0);
        let result = find_graph_hit_target_precise(&ctx, &qb, 35.0, 35.0);
        assert!(result.is_some());
    }

    #[test]
    fn miss_outside_instance_region() {
        let mut ctx = HitTestContext::new();
        register_quad_batch_hit_test(&mut ctx);
        let qb = quad_batch_with_one_instance(10.0, 10.0, 20.0, 20.0);
        let result = find_graph_hit_target_precise(&ctx, &qb, 200.0, 200.0);
        assert!(result.is_none());
    }

    #[test]
    fn no_instances_misses() {
        let mut ctx = HitTestContext::new();
        register_quad_batch_hit_test(&mut ctx);
        let qb: NodeRef = create_quad_batch();
        enable_node_interaction_state(&qb);
        set_node_hit_test_enabled(&qb, true);
        let result = find_graph_hit_target_precise(&ctx, &qb, 0.0, 0.0);
        assert!(result.is_none());
    }
}
