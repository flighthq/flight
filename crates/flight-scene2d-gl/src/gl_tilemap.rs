// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_geometry::create_matrix;
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data,
};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::{TextureUvTransform, get_texture_height, get_texture_width, has_texture_source};
use flight_textureatlas::TextureAtlasRotation;
use flight_tilemap::Tilemap;

use crate::gl_color_adjustment_material_feature::{
    get_gl_material_data_color_adjustment, get_gl_render_proxy_color_adjustment,
};
use crate::gl_quad_batch_common::{
    current_gl_straight_alpha, pack_gl_proxy_material_instance, resolve_gl_proxy_material_renderer,
};
use crate::gl_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write,
    record_gl_quad_batch_color_scale_bias, write_gl_quad_batch_affine_instance,
};

pub static GL_TILEMAP_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_gl_tilemap,
};

fn submit_gl_tilemap(state: &mut GlRenderState, tilemap_node: &RenderProxy2D<GlRenderState>) {
    let source = tilemap_node.source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<Tilemap>() else {
        return;
    };
    let data = &source.data;
    let (columns, rows, tile_height, tile_width) =
        (data.columns, data.rows, data.tile_height, data.tile_width);

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
    if columns == 0 || rows == 0 {
        return;
    }

    ensure_gl_quad_batch_shader(state);

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, tilemap_node) else {
        return;
    };
    let Some(gl_texture) =
        resolve_gl_texture(state, &*texture, Some(true), Some(SCENE2D_WORKING_COLOR_SPACE))
    else {
        return;
    };
    let straight_alpha = current_gl_straight_alpha(state);
    // Per-tile color adjustments, overriding the node-level tint for the tiles that carry one.
    let per_tile_color_scale_bias = &data.material_data;
    let node_color_scale_bias = get_gl_render_proxy_color_adjustment(tilemap_node);
    let start_instance = prepare_gl_quad_batch_write(
        state,
        gl_texture,
        straight_alpha,
        Some(&texture.texture_fields().sampler),
        tilemap_node.blend_mode.as_ref(),
        tilemap_node.material.as_ref(),
        material_renderer,
        (columns * rows).max(0) as usize,
        None,
    );
    let base = start_instance * QUAD_BATCH_INSTANCE_FLOATS;

    let regions = &atlas.regions;
    let num_regions = regions.len() as i32;
    let iw = 1.0 / get_texture_width(&*texture).max(1) as f32;
    let ih = 1.0 / get_texture_height(&*texture).max(1) as f32;
    let pt = &tilemap_node.transform_2d;
    let (pa, pb, pc, pd, ptx, pty) = (pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty);
    let alpha = tilemap_node.alpha;
    let mut tile_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    let mut write_base = base;
    let mut draw_count = 0;
    for row in 0..rows {
        for col in 0..columns {
            let tile_index = (row * columns + col) as usize;
            let id = data.tiles.get(tile_index).copied().map_or(-1, i32::from);
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
            let u0 = region.x * iw;
            let v0 = region.y * ih;
            let u1 = (region.x + region.width) * iw;
            let v1 = (region.y + region.height) * ih;
            let rotated = region.rotation != TextureAtlasRotation::None;
            let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
            write_gl_quad_batch_affine_instance(
                &mut state.gl_runtime.borrow_mut().quad_batch_writer_instance_data,
                write_base,
                &tile_transform,
                tile_width,
                tile_height,
                if rotated {
                    if counterclockwise { u0 } else { u1 }
                } else {
                    u0
                },
                if rotated && counterclockwise { v1 } else { v0 },
                if rotated { 0.0 } else { u1 - u0 },
                if rotated {
                    if counterclockwise { v0 - v1 } else { v1 - v0 }
                } else {
                    0.0
                },
                if rotated {
                    if counterclockwise { u1 - u0 } else { u0 - u1 }
                } else {
                    0.0
                },
                if rotated { 0.0 } else { v1 - v0 },
                alpha,
            );
            pack_gl_proxy_material_instance(
                state,
                tilemap_node.material_data.as_ref(),
                start_instance + draw_count,
            );
            // Per-tile tint overrides the node-level tint (None → the node's, itself possibly None).
            let color_scale_bias = per_tile_color_scale_bias
                .as_ref()
                .and_then(|entries| entries.get(tile_index))
                .and_then(|entry| entry.as_ref())
                .and_then(|entry| get_gl_material_data_color_adjustment(&*entry.read().unwrap()))
                .or(node_color_scale_bias);
            record_gl_quad_batch_color_scale_bias(
                state,
                color_scale_bias.as_ref(),
                start_instance + draw_count,
            );
            write_base += QUAD_BATCH_INSTANCE_FLOATS;
            draw_count += 1;
        }
    }

    state.gl_runtime.borrow_mut().quad_batch_writer_count += draw_count;
}
