// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_geometry::{Matrix, create_matrix};
use flight_quadbatch::{QuadBatch, QuadTransformType};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data,
};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::{TextureUvTransform, get_texture_height, get_texture_width, has_texture_source};
use flight_textureatlas::{TextureAtlasRegion, TextureAtlasRotation};

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

pub static GL_QUAD_BATCH_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_gl_quad_batch,
};

fn submit_gl_quad_batch(state: &mut GlRenderState, quad_batch: &RenderProxy2D<GlRenderState>) {
    let source = quad_batch.source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<QuadBatch>() else {
        return;
    };
    let data = &source.data;
    let instance_count = data.instance_count;
    let Some(atlas) = &data.atlas else {
        return;
    };
    let atlas = atlas.read().unwrap();
    let Some(texture) = &atlas.texture else {
        return;
    };
    let texture = texture.read().unwrap();
    if !has_texture_source(&*texture) || instance_count == 0 {
        return;
    }

    ensure_gl_quad_batch_shader(state);

    let Some(material_renderer) = resolve_gl_proxy_material_renderer(state, quad_batch) else {
        return;
    };
    let Some(gl_texture) =
        resolve_gl_texture(state, &*texture, Some(true), Some(SCENE2D_WORKING_COLOR_SPACE))
    else {
        return;
    };
    let straight_alpha = current_gl_straight_alpha(state);
    // Per-quad color adjustments, overriding the node-level tint for the quads that carry one.
    let per_quad_color_scale_bias = &data.material_data;
    let node_color_scale_bias = get_gl_render_proxy_color_adjustment(quad_batch);
    let start_instance = prepare_gl_quad_batch_write(
        state,
        gl_texture,
        straight_alpha,
        Some(&texture.texture_fields().sampler),
        quad_batch.blend_mode.as_ref(),
        quad_batch.material.as_ref(),
        material_renderer,
        instance_count,
        None,
    );
    let base = start_instance * QUAD_BATCH_INSTANCE_FLOATS;

    let regions = &atlas.regions;
    let num_regions = regions.len();
    let iw = 1.0 / get_texture_width(&*texture).max(1) as f32;
    let ih = 1.0 / get_texture_height(&*texture).max(1) as f32;
    let is_vector2 = data.transform_type == QuadTransformType::Vector2;
    let pt = &quad_batch.transform_2d;
    let (pa, pb, pc, pd, ptx, pty) = (pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty);
    let alpha = quad_batch.alpha;
    let transforms = &data.transforms;
    let mut quad_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    let mut write_base = base;
    let mut draw_count = 0;
    for index in 0..instance_count {
        let id = data.ids[index] as usize;
        if id >= num_regions {
            continue;
        }
        let region = regions[id].read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }

        if is_vector2 {
            let dx = transforms[index * 2];
            let dy = transforms[index * 2 + 1];
            quad_transform.a = pa;
            quad_transform.b = pb;
            quad_transform.c = pc;
            quad_transform.d = pd;
            quad_transform.tx = pa * dx + pc * dy + ptx;
            quad_transform.ty = pb * dx + pd * dy + pty;
        } else {
            let offset = index * 6;
            let la = transforms[offset];
            let lb = transforms[offset + 1];
            let lc = transforms[offset + 2];
            let ld = transforms[offset + 3];
            let ltx = transforms[offset + 4];
            let lty = transforms[offset + 5];
            quad_transform.a = pa * la + pc * lb;
            quad_transform.b = pb * la + pd * lb;
            quad_transform.c = pa * lc + pc * ld;
            quad_transform.d = pb * lc + pd * ld;
            quad_transform.tx = pa * ltx + pc * lty + ptx;
            quad_transform.ty = pb * ltx + pd * lty + pty;
        }
        write_atlas_region_instance(
            &mut state.gl_runtime.borrow_mut().quad_batch_writer_instance_data,
            write_base,
            &quad_transform,
            &region,
            iw,
            ih,
            alpha,
        );
        pack_gl_proxy_material_instance(
            state,
            quad_batch.material_data.as_ref(),
            start_instance + draw_count,
        );
        // Per-quad tint overrides the node-level tint (None → the node's, itself possibly None).
        let color_scale_bias = per_quad_color_scale_bias
            .as_ref()
            .and_then(|entries| entries.get(index))
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

    state.gl_runtime.borrow_mut().quad_batch_writer_count += draw_count;
}

fn write_atlas_region_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    region: &TextureAtlasRegion,
    iw: f32,
    ih: f32,
    alpha: f32,
) {
    let u0 = region.x * iw;
    let v0 = region.y * ih;
    let u1 = (region.x + region.width) * iw;
    let v1 = (region.y + region.height) * ih;
    let rotated = region.rotation != TextureAtlasRotation::None;
    let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
    write_gl_quad_batch_affine_instance(
        data,
        base,
        transform,
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
}
