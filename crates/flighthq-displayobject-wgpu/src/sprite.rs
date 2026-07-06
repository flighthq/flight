//! wgpu sprite node helper — submits one atlas-backed sprite quad.

use crate::sprite_batch::submit_wgpu_sprite_instance;
use flighthq_render_wgpu::{WgpuRenderState, bind_wgpu_texture, resolve_wgpu_material_renderer};
use flighthq_types::TextureAtlasRegion;

/// Resolved texture and atlas-region data for one `Sprite` node.
pub struct WgpuSpriteSource {
    pub image_id: u64,
    pub version: u64,
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub region: TextureAtlasRegion,
}

/// Submits a single `Sprite` atlas-quad instance into the active sprite batch.
pub fn render_wgpu_sprite(state: &mut WgpuRenderState, source: &WgpuSpriteSource) {
    if state.runtime.render_pass.is_none()
        || source.region.width <= 0.0
        || source.region.height <= 0.0
    {
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
    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let blend = state.render_state.render_blend_mode;
    let iw = 1.0 / source.width.max(1) as f32;
    let ih = 1.0 / source.height.max(1) as f32;
    let pivot_x = source.region.pivot_x.unwrap_or(0.0);
    let pivot_y = source.region.pivot_y.unwrap_or(0.0);
    let tx = transform.tx - transform.a * pivot_x - transform.c * pivot_y;
    let ty = transform.ty - transform.b * pivot_x - transform.d * pivot_y;

    submit_wgpu_sprite_instance(
        state,
        source.image_id,
        blend,
        0,
        material_renderer_id,
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        tx,
        ty,
        source.region.width,
        source.region.height,
        source.region.x * iw,
        source.region.y * ih,
        (source.region.x + source.region.width) * iw,
        (source.region.y + source.region.height) * ih,
        alpha,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wgpu_sprite_source_holds_region() {
        let source = WgpuSpriteSource {
            image_id: 1,
            version: 0,
            pixels: vec![255; 4],
            width: 1,
            height: 1,
            region: TextureAtlasRegion {
                width: 1.0,
                height: 1.0,
                ..Default::default()
            },
        };
        assert_eq!(source.region.width, 1.0);
    }
}
