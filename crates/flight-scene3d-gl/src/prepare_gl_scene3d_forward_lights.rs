use flight_render_gl::GlRenderState;

use crate::types::{GlScene3DForwardLightList, Scene3DLightBlock, Scene3DLightsLike};

fn pack_scene3d_light_block(lights: &Scene3DLightsLike) -> Scene3DLightBlock {
    let mut block = Scene3DLightBlock {
        ambient_color: [0.0; 3],
        directional_color: [0.0; 3],
        directional_direction: [0.0; 3],
        point_light_count: 0,
        point_light_colors: Vec::new(),
        point_light_positions: Vec::new(),
        point_light_ranges: Vec::new(),
        spot_light_count: 0,
        spot_light_colors: Vec::new(),
        spot_light_positions: Vec::new(),
        spot_light_directions: Vec::new(),
        spot_light_ranges: Vec::new(),
        spot_light_angles: Vec::new(),
    };

    for ambient in &lights.ambient {
        block.ambient_color[0] += ambient.color[0] * ambient.intensity;
        block.ambient_color[1] += ambient.color[1] * ambient.intensity;
        block.ambient_color[2] += ambient.color[2] * ambient.intensity;
    }

    if let Some(dir) = lights.directional.first() {
        block.directional_color = [
            dir.color[0] * dir.intensity,
            dir.color[1] * dir.intensity,
            dir.color[2] * dir.intensity,
        ];
        block.directional_direction = dir.direction;
    }

    block.point_light_count = lights.point.len() as u32;
    for pt in &lights.point {
        block.point_light_colors.extend_from_slice(&[
            pt.color[0] * pt.intensity,
            pt.color[1] * pt.intensity,
            pt.color[2] * pt.intensity,
        ]);
        block.point_light_positions.extend_from_slice(&pt.position);
        block.point_light_ranges.push(pt.range);
    }

    block.spot_light_count = lights.spot.len() as u32;
    for sp in &lights.spot {
        block.spot_light_colors.extend_from_slice(&[
            sp.color[0] * sp.intensity,
            sp.color[1] * sp.intensity,
            sp.color[2] * sp.intensity,
        ]);
        block.spot_light_positions.extend_from_slice(&sp.position);
        block.spot_light_directions.extend_from_slice(&sp.direction);
        block.spot_light_ranges.push(sp.range);
        block.spot_light_angles.extend_from_slice(&[sp.inner_cone_angle, sp.outer_cone_angle]);
    }

    return block;
}

pub fn prepare_gl_scene3d_forward_lights(
    _state: &GlRenderState,
    mesh_count: usize,
    lights: &Scene3DLightsLike,
) -> GlScene3DForwardLightList {
    let mut mesh_light_blocks = Vec::with_capacity(mesh_count);
    let block = pack_scene3d_light_block(lights);
    for _ in 0..mesh_count {
        mesh_light_blocks.push(block.clone());
    }
    return GlScene3DForwardLightList {
        mesh_count,
        mesh_light_blocks,
    };
}
