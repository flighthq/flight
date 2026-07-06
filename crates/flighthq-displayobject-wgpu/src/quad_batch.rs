//! wgpu quad batch renderer — for `QuadBatch` / manual instanced quad submissions.

use crate::sprite_batch::{
    pack_wgpu_sprite_batch_material_instance, pack_wgpu_sprite_instance,
    prepare_wgpu_sprite_batch_write,
};
use flighthq_render_wgpu::{WgpuRenderState, bind_wgpu_texture, resolve_wgpu_material_renderer};
use flighthq_types::{QuadTransformType, TextureAtlas};

/// Default wgpu renderer for `QuadBatch` nodes. Submits all quads into the
/// instanced sprite batch.
pub struct DefaultWgpuQuadBatchRenderer;

/// Resolved texture and instance data for one `QuadBatch` node.
pub struct WgpuQuadBatchSource {
    pub image_id: u64,
    pub version: u64,
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub atlas: TextureAtlas,
    pub ids: Vec<u16>,
    pub instance_count: u32,
    pub transforms: Vec<f32>,
    pub transform_type: QuadTransformType,
}

/// Draws a `QuadBatch` render proxy by submitting all live quads into the
/// instanced sprite batch.
pub fn draw_wgpu_quad_batch(state: &mut WgpuRenderState, source: &WgpuQuadBatchSource) {
    if state.runtime.render_pass.is_none() || source.instance_count == 0 {
        return;
    }
    if source.atlas.image.is_none() || source.atlas.regions.is_empty() {
        return;
    }

    bind_wgpu_texture(
        state,
        source.image_id,
        &source.pixels,
        source.width,
        source.height,
        source.version,
    );

    let Some(material_renderer) = resolve_wgpu_material_renderer(state, None) else {
        return;
    };
    let material_renderer_id = material_renderer.instance_float_count() as u64;
    let blend = state.render_state.render_blend_mode;
    let start_count = state.runtime.sprite_batch.count;
    let base = prepare_wgpu_sprite_batch_write(
        state,
        source.image_id,
        blend,
        0,
        material_renderer_id,
        source.instance_count,
    );

    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let iw = 1.0 / source.width.max(1) as f32;
    let ih = 1.0 / source.height.max(1) as f32;
    let mut write_base = base;
    let mut draw_count = 0;
    for index in 0..source.instance_count as usize {
        let Some(&id) = source.ids.get(index) else {
            continue;
        };
        let Some(region) = source.atlas.regions.get(id as usize) else {
            continue;
        };
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }

        let Some((a, b, c, d, tx, ty)) = compose_instance_transform(source, index, &transform)
        else {
            continue;
        };
        write_base = pack_wgpu_sprite_instance(
            &mut state.runtime.sprite_batch.instance_data,
            write_base,
            a,
            b,
            c,
            d,
            tx,
            ty,
            region.width,
            region.height,
            region.x * iw,
            region.y * ih,
            (region.x + region.width) * iw,
            (region.y + region.height) * ih,
            alpha,
        );
        pack_wgpu_sprite_batch_material_instance(state, 0, start_count + draw_count);
        draw_count += 1;
    }
    state.runtime.sprite_batch.count += draw_count;
}

fn compose_instance_transform(
    source: &WgpuQuadBatchSource,
    index: usize,
    parent: &flighthq_types::Matrix,
) -> Option<(f32, f32, f32, f32, f32, f32)> {
    match source.transform_type {
        QuadTransformType::Vector2 => {
            let offset = index * 2;
            let dx = *source.transforms.get(offset)?;
            let dy = *source.transforms.get(offset + 1)?;
            Some((
                parent.a,
                parent.b,
                parent.c,
                parent.d,
                parent.a * dx + parent.c * dy + parent.tx,
                parent.b * dx + parent.d * dy + parent.ty,
            ))
        }
        QuadTransformType::Matrix3x2 => {
            let offset = index * 6;
            let la = *source.transforms.get(offset)?;
            let lb = *source.transforms.get(offset + 1)?;
            let lc = *source.transforms.get(offset + 2)?;
            let ld = *source.transforms.get(offset + 3)?;
            let ltx = *source.transforms.get(offset + 4)?;
            let lty = *source.transforms.get(offset + 5)?;
            Some((
                parent.a * la + parent.c * lb,
                parent.b * la + parent.d * lb,
                parent.a * lc + parent.c * ld,
                parent.b * lc + parent.d * ld,
                parent.a * ltx + parent.c * lty + parent.tx,
                parent.b * ltx + parent.d * lty + parent.ty,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{Matrix, TextureAtlasRegion};

    fn source(transform_type: QuadTransformType, transforms: Vec<f32>) -> WgpuQuadBatchSource {
        WgpuQuadBatchSource {
            image_id: 1,
            version: 0,
            pixels: vec![255; 4],
            width: 1,
            height: 1,
            atlas: TextureAtlas {
                image: None,
                regions: vec![TextureAtlasRegion {
                    width: 1.0,
                    height: 1.0,
                    ..Default::default()
                }],
            },
            ids: vec![0],
            instance_count: 1,
            transforms,
            transform_type,
        }
    }

    #[test]
    fn compose_vector2_instance_transform_applies_parent() {
        let source = source(QuadTransformType::Vector2, vec![5.0, 7.0]);
        let parent = Matrix {
            a: 2.0,
            d: 3.0,
            tx: 11.0,
            ty: 13.0,
            ..Default::default()
        };
        assert_eq!(
            compose_instance_transform(&source, 0, &parent),
            Some((2.0, 0.0, 0.0, 3.0, 21.0, 34.0))
        );
    }

    #[test]
    fn compose_matrix_instance_transform_concatenates_parent() {
        let source = source(
            QuadTransformType::Matrix3x2,
            vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        );
        let parent = Matrix {
            a: 2.0,
            d: 3.0,
            tx: 11.0,
            ty: 13.0,
            ..Default::default()
        };
        assert_eq!(
            compose_instance_transform(&source, 0, &parent),
            Some((2.0, 6.0, 6.0, 12.0, 21.0, 31.0))
        );
    }
}
