// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_bitmaptext::{BitmapText, get_bitmap_text_pages};
use flight_geometry::create_matrix;
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data,
};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::{TextureUvTransform, get_texture_height, get_texture_width, has_texture_source};
use flight_textureatlas::TextureAtlasRotation;

use crate::gl_color_adjustment_material_feature::get_gl_render_proxy_color_adjustment;
use crate::gl_quad_batch_common::{
    current_gl_straight_alpha, pack_gl_proxy_material_instance, resolve_gl_proxy_material_renderer,
};
use crate::gl_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, ensure_gl_quad_batch_shader, prepare_gl_quad_batch_write,
    record_gl_quad_batch_color_scale_bias, write_gl_quad_batch_affine_instance,
};

// Per-instance stride, matching the QuadBatch/Tilemap sprite path (13 floats: world transform +
// region + uv + alpha). Draws a BitmapText leaf: one batched sprite pass per glyph-atlas page (each
// page binds its own atlas image, so a multi-page source issues one draw per page). The node's
// resolved color adjustment folds in as a whole-node tint on every glyph — the same
// record_gl_quad_batch_color_scale_bias path a tinted QuadBatch uses.
pub static GL_BITMAP_TEXT_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_gl_bitmap_text,
};

fn submit_gl_bitmap_text(state: &mut GlRenderState, node: &RenderProxy2D<GlRenderState>) {
    let source = node.source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<BitmapText>() else {
        return;
    };
    let pages = get_bitmap_text_pages(source);

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, node) else {
        return;
    };
    let node_color_scale_bias = get_gl_render_proxy_color_adjustment(node);
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

        let Some(gl_texture) =
            resolve_gl_texture(state, &*texture, Some(true), Some(SCENE2D_WORKING_COLOR_SPACE))
        else {
            continue;
        };
        let straight_alpha = current_gl_straight_alpha(state);
        ensure_gl_quad_batch_shader(state);
        // prepare_gl_quad_batch_write may flush the prior page's batch (each page binds a different
        // image), so read the running instance count AFTER it so indices align with `base`.
        let start_instance = prepare_gl_quad_batch_write(
            state,
            gl_texture,
            straight_alpha,
            Some(&texture.texture_fields().sampler),
            node.blend_mode.as_ref(),
            node.material.as_ref(),
            material_renderer,
            page.instance_count,
            None,
        );
        let base = start_instance * QUAD_BATCH_INSTANCE_FLOATS;

        let regions = &atlas.regions;
        let num_regions = regions.len();
        let iw = 1.0 / get_texture_width(&*texture).max(1) as f32;
        let ih = 1.0 / get_texture_height(&*texture).max(1) as f32;
        let ids = &page.ids;
        let transforms = &page.transforms;

        let mut write_base = base;
        let mut draw_count = 0;
        for index in 0..page.instance_count {
            let id = ids[index] as usize;
            if id >= num_regions {
                continue;
            }
            let region = regions[id].read().unwrap();
            if region.width <= 0.0 || region.height <= 0.0 {
                continue;
            }

            let dx = transforms[index * 2];
            let dy = transforms[index * 2 + 1];
            glyph_transform.a = pa;
            glyph_transform.b = pb;
            glyph_transform.c = pc;
            glyph_transform.d = pd;
            glyph_transform.tx = pa * dx + pc * dy + ptx;
            glyph_transform.ty = pb * dx + pd * dy + pty;
            let u0 = region.x * iw;
            let v0 = region.y * ih;
            let u1 = (region.x + region.width) * iw;
            let v1 = (region.y + region.height) * ih;
            let rotated = region.rotation != TextureAtlasRotation::None;
            let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
            write_gl_quad_batch_affine_instance(
                &mut state.gl_runtime.borrow_mut().quad_batch_writer_instance_data,
                write_base,
                &glyph_transform,
                if rotated { region.height } else { region.width },
                if rotated { region.width } else { region.height },
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
                node.material_data.as_ref(),
                start_instance + draw_count,
            );
            record_gl_quad_batch_color_scale_bias(
                state,
                node_color_scale_bias.as_ref(),
                start_instance + draw_count,
            );
            write_base += QUAD_BATCH_INSTANCE_FLOATS;
            draw_count += 1;
        }

        state.gl_runtime.borrow_mut().quad_batch_writer_count += draw_count;
    }
}
