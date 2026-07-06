//! wgpu tilemap renderer — renders `Tilemap` nodes via the sprite batch.

use crate::sprite_batch::{
    pack_wgpu_sprite_batch_material_instance, pack_wgpu_sprite_instance,
    prepare_wgpu_sprite_batch_write,
};
use flighthq_render_wgpu::{WgpuRenderState, bind_wgpu_texture, resolve_wgpu_material_renderer};
use flighthq_types::TextureAtlas;

/// Default wgpu renderer for `Tilemap` nodes.
pub struct DefaultWgpuTilemapRenderer;

/// Resolved texture atlas and tile-grid data for one `Tilemap` node.
pub struct WgpuTilemapSource {
    pub image_id: u64,
    pub version: u64,
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub atlas: TextureAtlas,
    pub columns: u32,
    pub rows: u32,
    pub tile_width: f32,
    pub tile_height: f32,
    pub tiles: Vec<i16>,
}

/// Draws a `Tilemap` render proxy: decomposes tiles into instanced quads and
/// submits them to the active sprite batch.
pub fn draw_wgpu_tilemap(state: &mut WgpuRenderState, source: &WgpuTilemapSource) {
    if state.runtime.render_pass.is_none()
        || source.columns == 0
        || source.rows == 0
        || source.tile_width <= 0.0
        || source.tile_height <= 0.0
    {
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
    let live_tiles = source.tiles.iter().filter(|&&tile| tile >= 0).count() as u32;
    if live_tiles == 0 {
        return;
    }

    let blend = state.render_state.render_blend_mode;
    let start_count = state.runtime.sprite_batch.count;
    let base = prepare_wgpu_sprite_batch_write(
        state,
        source.image_id,
        blend,
        0,
        material_renderer_id,
        live_tiles,
    );

    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let iw = 1.0 / source.width.max(1) as f32;
    let ih = 1.0 / source.height.max(1) as f32;
    let mut write_base = base;
    let mut draw_count = 0;

    for row in 0..source.rows {
        for column in 0..source.columns {
            let tile_index = (row * source.columns + column) as usize;
            let tile = *source.tiles.get(tile_index).unwrap_or(&-1);
            if tile < 0 {
                continue;
            }
            let Some(region) = source.atlas.regions.get(tile as usize) else {
                continue;
            };
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }

            let dx = column as f32 * source.tile_width;
            let dy = row as f32 * source.tile_height;
            let tx = transform.a * dx + transform.c * dy + transform.tx;
            let ty = transform.b * dx + transform.d * dy + transform.ty;
            write_base = pack_wgpu_sprite_instance(
                &mut state.runtime.sprite_batch.instance_data,
                write_base,
                transform.a,
                transform.b,
                transform.c,
                transform.d,
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
    }
    state.runtime.sprite_batch.count += draw_count;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wgpu_tilemap_source_tracks_grid_size() {
        let source = WgpuTilemapSource {
            image_id: 1,
            version: 0,
            pixels: vec![255; 4],
            width: 1,
            height: 1,
            atlas: TextureAtlas::default(),
            columns: 2,
            rows: 3,
            tile_width: 16.0,
            tile_height: 16.0,
            tiles: vec![-1; 6],
        };
        assert_eq!(source.tiles.len(), 6);
    }
}
