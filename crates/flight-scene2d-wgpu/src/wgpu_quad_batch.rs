// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The atlas-backed QuadBatch renderer (TS `wgpuQuadBatch.ts`): one affine instance per quad, with
//! per-quad tints overriding the node-level one.

use flight_entity::Ref;
use flight_geometry::{Matrix, create_matrix};
use flight_materials::{ColorScaleBias, MaterialData, TintMaterialData};
use flight_quadbatch::{QuadBatch, QuadTransformType};
use flight_render::{
    BatchFormat, NodeRenderer, RenderProxy2D, SCENE2D_WORKING_COLOR_SPACE, noop_renderer_data,
};
use flight_render_wgpu::{
    WgpuColorScaleBiasInput, WgpuRenderState, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, resolve_wgpu_texture,
};
use flight_texture::{
    TextureUvTransform, get_texture_height, get_texture_width, has_texture_source,
};
use flight_textureatlas::{TextureAtlasRegion, TextureAtlasRotation};

use crate::wgpu_quad_batch_writer::{
    QUAD_BATCH_INSTANCE_FLOATS, get_wgpu_render_proxy_color_adjustment,
    pack_wgpu_quad_batch_material_instance, prepare_wgpu_quad_batch_write,
    record_wgpu_quad_batch_color_scale_bias, resolve_wgpu_render_proxy_material_renderer,
    write_wgpu_quad_batch_affine_instance,
};

// Each quad writes the 13 base instance floats; any material packs its own per-instance data into
// the parallel material buffer.
const INSTANCE_STRIDE_FLOATS: usize = QUAD_BATCH_INSTANCE_FLOATS;

/// The QuadBatch renderer (TS `wgpuQuadBatchRenderer`).
pub static WGPU_QUAD_BATCH_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: submit_wgpu_quad_batch,
};

fn submit_wgpu_quad_batch(
    state: &mut WgpuRenderState,
    quad_batch: &RenderProxy2D<WgpuRenderState>,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let source = quad_batch.source.clone();
    let source = source.read().unwrap();
    let Some(source) = source.as_any().downcast_ref::<QuadBatch>() else {
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
    if !has_texture_source(&*texture) || data.instance_count == 0 {
        return;
    }

    let Some(material_renderer) = resolve_wgpu_render_proxy_material_renderer(state, quad_batch)
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
    // Per-quad color adjustments, overriding the node-level tint for the quads that carry one.
    let per_quad_color_scale_bias = data.material_data.as_ref();
    let node_color_adjustment = get_wgpu_render_proxy_color_adjustment(quad_batch);
    let instance_count = data.instance_count;
    let start_instance = prepare_wgpu_quad_batch_write(
        state,
        &texture_entry,
        Some(&texture.texture_fields().sampler),
        quad_batch.blend_mode.as_ref(),
        quad_batch.material.as_ref(),
        &material_renderer,
        instance_count as u32,
        None,
    );
    let base = start_instance as usize * QUAD_BATCH_INSTANCE_FLOATS;

    let regions = &atlas.regions;
    let num_regions = regions.len() as i32;
    let iw = 1.0 / 1.max(get_texture_width(&*texture)) as f32;
    let ih = 1.0 / 1.max(get_texture_height(&*texture)) as f32;
    let is_vector2 = data.transform_type == QuadTransformType::Vector2;
    let pt = &quad_batch.transform_2d;
    let (pa, pb, pc, pd, ptx, pty) = (pt.a, pt.b, pt.c, pt.d, pt.tx, pt.ty);
    let alpha = quad_batch.alpha;
    let transforms = &data.transforms;
    let mut quad_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

    let mut write_base = base;
    let mut draw_count: u32 = 0;
    for i in 0..instance_count {
        let id = data.ids[i] as i32;
        if id < 0 || id >= num_regions {
            continue;
        }
        let region = regions[id as usize].read().unwrap();
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }

        if is_vector2 {
            let dx = transforms[i * 2];
            let dy = transforms[i * 2 + 1];
            quad_transform.a = pa;
            quad_transform.b = pb;
            quad_transform.c = pc;
            quad_transform.d = pd;
            quad_transform.tx = pa * dx + pc * dy + ptx;
            quad_transform.ty = pb * dx + pd * dy + pty;
        } else {
            let offset = i * 6;
            let (la, lb) = (transforms[offset], transforms[offset + 1]);
            let (lc, ld) = (transforms[offset + 2], transforms[offset + 3]);
            let (ltx, lty) = (transforms[offset + 4], transforms[offset + 5]);
            quad_transform.a = pa * la + pc * lb;
            quad_transform.b = pb * la + pd * lb;
            quad_transform.c = pa * lc + pc * ld;
            quad_transform.d = pb * lc + pd * ld;
            quad_transform.tx = pa * ltx + pc * lty + ptx;
            quad_transform.ty = pb * ltx + pd * lty + pty;
        }
        write_wgpu_atlas_region_instance(
            &mut get_wgpu_render_state_runtime_mut(state).quad_batch_writer_instance_data,
            write_base,
            &quad_transform,
            &region,
            iw,
            ih,
            alpha,
        );
        pack_wgpu_quad_batch_material_instance(
            state,
            quad_batch.material_data.as_ref(),
            start_instance + draw_count,
        );
        // Per-quad tint overrides the node-level tint (none → the node's, itself possibly none →
        // untinted).
        let color_scale_bias = per_quad_color_scale_bias
            .and_then(|entries| entries.get(i).cloned().flatten())
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

    get_wgpu_render_state_runtime_mut(state).quad_batch_writer_count += draw_count;
}

// A per-item material data entry as a recordable color adjustment (TS casts the entry to
// `ColorScaleBias | TintMaterialData | number[]`): a `ColorScaleBias` entry takes the scale/bias path,
// a tint record the packed-tint path, and any other material data carries none.
pub(crate) fn to_wgpu_color_adjustment(
    entry: &Ref<dyn MaterialData>,
) -> Option<WgpuColorScaleBiasInput> {
    let guard = entry.read().unwrap();
    let entry = guard.as_any();
    if let Some(color_scale_bias) = entry.downcast_ref::<ColorScaleBias>() {
        return Some(WgpuColorScaleBiasInput::ColorScaleBias(
            color_scale_bias.clone(),
        ));
    }
    return entry
        .downcast_ref::<TintMaterialData>()
        .map(|tint| WgpuColorScaleBiasInput::TintMaterialData(tint.clone()));
}

// Writes one atlas region as an affine instance, rotating its UV axes for a region packed rotated.
pub(crate) fn write_wgpu_atlas_region_instance(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    region: &TextureAtlasRegion,
    iw: f32,
    ih: f32,
    alpha: f32,
) {
    write_wgpu_atlas_region_instance_sized(data, base, transform, region, None, iw, ih, alpha);
}

// The region instance drawn at `size` (a tile's cell) or, when `None`, at the region's own
// (rotation-swapped) size.
pub(crate) fn write_wgpu_atlas_region_instance_sized(
    data: &mut [f32],
    base: usize,
    transform: &Matrix,
    region: &TextureAtlasRegion,
    size: Option<(f32, f32)>,
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
    let (width, height) = size.unwrap_or(if rotated {
        (region.height, region.width)
    } else {
        (region.width, region.height)
    });
    write_wgpu_quad_batch_affine_instance(
        data,
        base,
        transform,
        width,
        height,
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
