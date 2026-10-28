use std::sync::Arc;

use flight_geometry::{
    create_matrix, create_vector2, inverse_matrix_transform_point_xy, set_matrix_from_float32_array,
};
use flight_node::{NodeRef, get_node_world_matrix};
use flight_quadbatch::contract::QUAD_BATCH_KIND;
use flight_quadbatch::{QuadBatch, QuadTransformType};
use flight_textureatlas::TextureAtlasRotation;

use crate::hit_tests::{HitTestContext, register_hit_test_precise};

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_quad_batch_hit_test(ctx: &mut HitTestContext) {
    register_hit_test_precise(
        ctx,
        QUAD_BATCH_KIND.to_string(),
        Arc::new(resolve_quad_batch_instance_index),
    );
}

fn resolve_quad_batch_instance_index(source: &NodeRef, x: f32, y: f32) -> i32 {
    let node = source.read().unwrap();
    let Some(qb) = node.as_any().downcast_ref::<QuadBatch>() else {
        return -1;
    };
    let data = &qb.data;
    let atlas_ref = match &data.atlas {
        Some(a) => a.clone(),
        None => return -1,
    };
    if data.instance_count == 0 {
        return -1;
    }
    let ids = data.ids.clone();
    let transforms = data.transforms.clone();
    let transform_type = data.transform_type;
    let instance_count = data.instance_count;
    drop(node);
    let matrix = get_node_world_matrix(source);
    let mut local_point = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut local_point, &matrix, x, y);
    let lx = local_point.x;
    let ly = local_point.y;

    let atlas = atlas_ref.read().unwrap();
    let regions = &atlas.regions;
    let stride: usize = match transform_type {
        QuadTransformType::Vector2 => 2,
        QuadTransformType::Matrix3x2 => 6,
    };

    let mut inst_matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let mut quad_point = create_vector2(0.0, 0.0);

    for index in (0..instance_count).rev() {
        let region_idx = ids[index] as usize;
        if region_idx >= regions.len() {
            continue;
        }
        let region_ref = &regions[region_idx];
        let region = region_ref.read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }
        let rotated = region.rotation != TextureAtlasRotation::None;
        let width = if rotated { region.height } else { region.width };
        let height = if rotated { region.width } else { region.height };

        let offset = index * stride;
        if transform_type == QuadTransformType::Vector2 {
            let qx = lx - transforms[offset];
            let qy = ly - transforms[offset + 1];
            if qx >= 0.0 && qy >= 0.0 && qx < width && qy < height {
                return index as i32;
            }
            continue;
        }

        set_matrix_from_float32_array(&mut inst_matrix, offset, &transforms);
        inverse_matrix_transform_point_xy(&mut quad_point, &inst_matrix, lx, ly);
        let qx = quad_point.x;
        let qy = quad_point.y;
        if qx >= 0.0 && qy >= 0.0 && qx < width && qy < height {
            return index as i32;
        }
    }
    return -1;
}
