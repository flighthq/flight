// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The BitmapText renderer (TS `wgpuBitmapText.ts`): one batched sprite pass per glyph-atlas page.
//! The node's resolved color adjustment folds in as a whole-node tint on every glyph — the same
//! path a tinted QuadBatch uses.

use flight_bitmaptext::{BitmapText, get_bitmap_text_pages};
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

use crate::wgpu_quad_batch::write_wgpu_atlas_region_instance;
use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, get_wgpu_render_proxy_color_adjustment,
    pack_wgpu_quad_batch_material_instance, prepare_wgpu_quad_batch_write,
    record_wgpu_quad_batch_color_scale_bias, resolve_wgpu_render_proxy_material_renderer,
};

const INSTANCE_STRIDE_FLOATS: usize = QUAD_BATCH_INSTANCE_FLOATS;

/// The BitmapText renderer (TS `wgpuBitmapTextRenderer`).
pub static WGPU_BITMAP_TEXT_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_wgpu_bitmap_text,
};

// Mirrors the QuadBatch vector2 inner loop, sourced from each page's own `ids`/`transforms`.
fn submit_wgpu_bitmap_text(state: &mut WgpuRenderState, node: &RenderProxy2D<WgpuRenderState>) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let source = node.source.clone();
    let source = source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<BitmapText>() else {
        return;
    };
    let pages = get_bitmap_text_pages(source);

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, node) else {
        return;
    };
    let node_color_scale_bias = get_wgpu_render_proxy_color_adjustment(node);
    let pt = &node.transform_2d;
    let (pa, pb, pc, pd, ptx, pty) = (pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty);
    let alpha = node.alpha;
    let mut glyph_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    for page in pages {
        let atlas = page.atlas.read().unwrap();
        let Some(texture) = &atlas.texture else {
            continue;
        };
        let texture = texture.read().unwrap();
        if !has_texture_source(&*texture) || page.instance_count == 0 {
            continue;
        }
        let Some(texture_entry) = resolve_wgpu_texture(
            state,
            &*texture,
            Some(true),
            Some(SCENE2D_WORKING_COLOR_SPACE),
        ) else {
            continue;
        };

        // Preparing may flush the prior page's batch (each page binds a different image), so read
        // the running instance count AFTER it so material/color-adjustment indices align with
        // `base`.
        let start_instance = prepare_wgpu_quad_batch_write(
            state,
            &texture_entry,
            Some(&texture.texture_fields().sampler),
            node.blend_mode.as_ref(),
            node.material.as_ref(),
            &material_renderer,
            page.instance_count as u32,
            None,
        );
        let base = start_instance as usize * QUAD_BATCH_INSTANCE_FLOATS;

        let regions = &atlas.regions;
        let num_regions = regions.len() as i32;
        let iw = 1.0 / 1.max(get_texture_width(&*texture)) as f32;
        let ih = 1.0 / 1.max(get_texture_height(&*texture)) as f32;
        let ids = &page.ids;
        let transforms = &page.transforms;

        let mut write_base = base;
        let mut draw_count: u32 = 0;
        for i in 0..page.instance_count {
            let id = ids[i] as i32;
            if id < 0 || id >= num_regions {
                continue;
            }
            let region = regions[id as usize].read().unwrap();
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }

            let dx = transforms[i * 2];
            let dy = transforms[i * 2 + 1];
            glyph_transform.a = pa;
            glyph_transform.b = pb;
            glyph_transform.c = pc;
            glyph_transform.d = pd;
            glyph_transform.tx = pa * dx + pc * dy + ptx;
            glyph_transform.ty = pb * dx + pd * dy + pty;
            write_wgpu_atlas_region_instance(
                &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
                write_base,
                &glyph_transform,
                &region,
                iw,
                ih,
                alpha,
            );
            pack_wgpu_quad_batch_material_instance(
                state,
                node.material_data.as_ref(),
                start_instance + draw_count,
            );
            record_wgpu_quad_batch_color_scale_bias(
                state,
                node_color_scale_bias.as_ref(),
                start_instance + draw_count,
            );
            write_base += INSTANCE_STRIDE_FLOATS;
            draw_count += 1;
        }

        get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += draw_count;
    }
}
