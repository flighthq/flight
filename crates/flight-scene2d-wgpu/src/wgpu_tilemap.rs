// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The Tilemap renderer (TS `wgpuTilemap.ts`): one affine instance per non-empty cell, with
//! per-tile tints overriding the node-level one.

use flight_geometry::create_matrix;
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data,
};
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
    resolve_wgpu_texture,
};
use flight_texture::{
    TextureUvTransform, get_texture_height, get_texture_width, has_texture_source,
};
use flight_tilemap::Tilemap;

use crate::wgpu_quad_batch::{to_wgpu_color_adjustment, write_wgpu_atlas_region_instance_sized};
use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, get_wgpu_render_proxy_color_adjustment,
    pack_wgpu_quad_batch_material_instance, prepare_wgpu_quad_batch_write,
    record_wgpu_quad_batch_color_scale_bias, resolve_wgpu_render_proxy_material_renderer,
};

// Each tile writes the 13 base instance floats; any material packs its own per-instance data.
const INSTANCE_STRIDE_FLOATS: usize = QUAD_BATCH_INSTANCE_FLOATS;

/// The Tilemap renderer (TS `wgpuTilemapRenderer`).
pub static WGPU_TILEMAP_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_wgpu_tilemap,
};

fn submit_wgpu_tilemap(state: &mut WgpuRenderState, tilemap_node: &RenderProxy2D<WgpuRenderState>) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let source = tilemap_node.source.clone();
    let source = source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<Tilemap>() else {
        return;
    };
    let data = &source.data;
    let Some(atlas) = &data.atlas else {
        return;
    };
    let atlas = atlas.read().unwrap();
    let Some(texture) = &atlas.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    if !has_texture_source(&*texture) {
        return;
    }
    let (columns, rows) = (data.columns, data.rows);
    if columns == 0 || rows == 0 {
        return;
    }

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, tilemap_node)
    else {
        return;
    };
    let Some(texture_entry) = resolve_wgpu_texture(
        state,
        &*texture,
        Some(true),
        Some(SCENE2D_WORKING_COLOR_SPACE),
    ) else {
        return;
    };
    // Per-tile color adjustments, overriding the node-level tint for the tiles that carry one.
    let per_tile_color_scale_bias = data.material_data.as_ref();
    let node_color_adjustment = get_wgpu_render_proxy_color_adjustment(tilemap_node);
    let start_instance = prepare_wgpu_quad_batch_write(
        state,
        &texture_entry,
        Some(&texture.texture_fields().sampler),
        tilemap_node.blend_mode.as_ref(),
        tilemap_node.material.as_ref(),
        &material_renderer,
        (columns * rows) as u32,
        None,
    );
    let base = start_instance as usize * QUAD_BATCH_INSTANCE_FLOATS;

    let regions = &atlas.regions;
    let num_regions = regions.len() as i32;
    let iw = 1.0 / 1.max(get_texture_width(&*texture)) as f32;
    let ih = 1.0 / 1.max(get_texture_height(&*texture)) as f32;
    let pt = &tilemap_node.transform_2d;
    let (pa, pb, pc, pd, ptx, pty) = (pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty);
    let alpha = tilemap_node.alpha;
    let (tile_width, tile_height) = (data.tile_width, data.tile_height);
    let mut tile_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    let mut write_base = base;
    let mut draw_count: u32 = 0;
    for row in 0..rows {
        for col in 0..columns {
            let cell = (row * columns + col) as usize;
            let id = data.tiles.get(cell).copied().unwrap_or(-1) as i32;
            if id < 0 || id >= num_regions {
                continue;
            }
            let region = regions[id as usize].read().unwrap();
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }

            let dx = col as f32 * tile_width;
            let dy = row as f32 * tile_height;
            tile_transform.a = pa;
            tile_transform.b = pb;
            tile_transform.c = pc;
            tile_transform.d = pd;
            tile_transform.tx = pa * dx + pc * dy + ptx;
            tile_transform.ty = pb * dx + pd * dy + pty;
            write_wgpu_atlas_region_instance_sized(
                &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
                write_base,
                &tile_transform,
                &region,
                Some((tile_width, tile_height)),
                iw,
                ih,
                alpha,
            );
            pack_wgpu_quad_batch_material_instance(
                state,
                tilemap_node.material_data.as_ref(),
                start_instance + draw_count,
            );
            // Per-tile tint overrides the node-level tint (none → the node's, itself possibly none
            // → untinted).
            let color_scale_bias = per_tile_color_scale_bias
                .and_then(|entries| entries.get(cell).cloned().flatten())
                .and_then(|entry| to_wgpu_color_adjustment(&entry))
                .or_else(|| node_color_adjustment.clone());
            record_wgpu_quad_batch_color_scale_bias(
                state,
                color_scale_bias.as_ref(),
                start_instance + draw_count,
            );
            write_base += INSTANCE_STRIDE_FLOATS;
            draw_count += 1;
        }
    }

    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += draw_count;
}
