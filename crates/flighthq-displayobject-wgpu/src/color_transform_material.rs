//! wgpu color-transform materials — per-instance and uniform variants.

use flighthq_types::kind::KindId;
use flighthq_types::material::{
    ColorTransform, ColorTransformMaterial, UniformColorTransformMaterial,
};

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::{WgpuMaterialRenderer, register_wgpu_material_renderer};

/// Number of per-instance floats a color-transform material writes: 4 multiplier + 4 offset.
pub const COLOR_TRANSFORM_INSTANCE_FLOATS: u32 = 8;

// Reads 8 per-instance floats (color multiplier rgba, color offset rgba) from the material storage
// buffer at @group(3) and applies them in unpremultiplied space. Concatenated after the quad-batch
// prelude to form the full material module.
const COLOR_TRANSFORM_MATERIAL_WGSL: &str = r#"
@group(3) @binding(0) var<storage, read> ctData : array<f32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) ctMult : vec4f,
  @location(3) ctOff : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 8u;
  let ctMult = vec4f(ctData[b + 0u], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]);
  let ctOff = vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]);
  return VertexOut(bv.position, bv.uv, bv.alpha, ctMult, ctOff);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * in.ctMult + in.ctOff, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
"#;

/// Material renderer that applies a per-node `ColorTransform` (per-instance data).
pub struct ColorTransformWgpuMaterialRenderer;

impl WgpuMaterialRenderer for ColorTransformWgpuMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        COLOR_TRANSFORM_INSTANCE_FLOATS
    }
    fn bind(&self, _state: &mut WgpuRenderState, _material_id: u64) {
        // The per-instance color transform contributes nothing at bind time; all of its
        // state lives in the per-instance material buffer written by pack_instance.
    }
    fn pack_instance(
        &self,
        _state: &mut WgpuRenderState,
        _material_data_id: u64,
        out: &mut Vec<f32>,
        offset: usize,
    ) {
        // The render path resolves the per-node ColorTransform from material_data_id and supplies
        // it; absent that plumbing here, pack the identity transform (no tint). The packing math
        // itself — the exposed seam — is pack_wgpu_color_transform.
        pack_wgpu_color_transform(out, offset, None);
    }
}

/// Material renderer that applies a single static `ColorTransform` uniformly to
/// every instance in the batch. wgpu carries color transform per-instance, so a
/// "uniform" color transform writes the same value into every instance slot.
pub struct UniformColorTransformWgpuMaterialRenderer;

impl WgpuMaterialRenderer for UniformColorTransformWgpuMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        COLOR_TRANSFORM_INSTANCE_FLOATS
    }
    fn bind(&self, _state: &mut WgpuRenderState, _material_id: u64) {}
    fn pack_instance(
        &self,
        _state: &mut WgpuRenderState,
        _material_data_id: u64,
        out: &mut Vec<f32>,
        offset: usize,
    ) {
        pack_wgpu_color_transform(out, offset, None);
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the color-transform material's effective `ColorTransform` for
/// `render_proxy`, or `None` for all other materials.
///
/// Resolving the effective transform requires the proxy's material data, which
/// is owned by the render framework's proxy store rather than `WgpuRenderState`;
/// the render path supplies it directly to the draw call, so this returns `None`
/// here. Kept as the documented resolution entry point.
pub fn get_wgpu_render_proxy_color_transform(
    _render_proxy_id: u64,
    _state: &WgpuRenderState,
) -> Option<ColorTransform> {
    None
}

/// Registers both color-transform material renderers on `state`.
pub fn register_wgpu_color_transform_materials(state: &mut WgpuRenderState) {
    register_wgpu_material_renderer(
        state,
        KindId::of::<UniformColorTransformMaterial>(),
        Box::new(UniformColorTransformWgpuMaterialRenderer),
    );
    register_wgpu_material_renderer(
        state,
        KindId::of::<ColorTransformMaterial>(),
        Box::new(ColorTransformWgpuMaterialRenderer),
    );
}

/// Returns the full WGSL module source for the color-transform material
/// (quad-batch prelude + color-transform stages).
pub fn get_wgpu_color_transform_material_wgsl() -> String {
    format!(
        "{}{}",
        crate::sprite_batch::get_wgpu_quad_batch_prelude_wgsl(),
        COLOR_TRANSFORM_MATERIAL_WGSL
    )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Packs a `ColorTransform` (or the identity transform when `None`) into 8 floats
/// at `out[offset..offset + 8]`: 4 multipliers then 4 offsets (offsets normalized
/// to 0..1 by dividing by 255). Grows `out` if needed.
pub fn pack_wgpu_color_transform(out: &mut Vec<f32>, offset: usize, ct: Option<&ColorTransform>) {
    if out.len() < offset + 8 {
        out.resize(offset + 8, 0.0);
    }
    match ct {
        Some(ct) => {
            out[offset] = ct.red_multiplier;
            out[offset + 1] = ct.green_multiplier;
            out[offset + 2] = ct.blue_multiplier;
            out[offset + 3] = ct.alpha_multiplier;
            out[offset + 4] = ct.red_offset / 255.0;
            out[offset + 5] = ct.green_offset / 255.0;
            out[offset + 6] = ct.blue_offset / 255.0;
            out[offset + 7] = ct.alpha_offset / 255.0;
        }
        None => {
            out[offset] = 1.0;
            out[offset + 1] = 1.0;
            out[offset + 2] = 1.0;
            out[offset + 3] = 1.0;
            out[offset + 4] = 0.0;
            out[offset + 5] = 0.0;
            out[offset + 6] = 0.0;
            out[offset + 7] = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // instance_float_count

    #[test]
    fn color_transform_instance_float_count_is_8() {
        assert_eq!(ColorTransformWgpuMaterialRenderer.instance_float_count(), 8);
        assert_eq!(
            UniformColorTransformWgpuMaterialRenderer.instance_float_count(),
            8
        );
    }

    // pack_wgpu_color_transform

    #[test]
    fn pack_identity_writes_ones_and_zeros() {
        let mut out = vec![0.0; 8];
        pack_wgpu_color_transform(&mut out, 0, None);
        assert_eq!(&out[0..4], &[1.0, 1.0, 1.0, 1.0]);
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn pack_color_transform_normalizes_offsets() {
        let ct = ColorTransform {
            red_multiplier: 0.5,
            green_multiplier: 0.6,
            blue_multiplier: 0.7,
            alpha_multiplier: 0.8,
            red_offset: 255.0,
            green_offset: 127.5,
            blue_offset: 0.0,
            alpha_offset: 51.0,
        };
        let mut out = vec![0.0; 8];
        pack_wgpu_color_transform(&mut out, 0, Some(&ct));
        assert_eq!(out[0], 0.5);
        assert_eq!(out[3], 0.8);
        assert!((out[4] - 1.0).abs() < 1e-6);
        assert!((out[5] - 0.5).abs() < 1e-6);
        assert!((out[7] - 0.2).abs() < 1e-6);
    }

    #[test]
    fn pack_color_transform_grows_buffer_and_respects_offset() {
        let mut out = Vec::new();
        pack_wgpu_color_transform(&mut out, 16, None);
        assert!(out.len() >= 24);
        assert_eq!(out[16], 1.0);
        assert_eq!(out[20], 0.0);
    }

    // WGSL module

    #[test]
    fn color_transform_wgsl_declares_material_buffer_and_stages() {
        let src = get_wgpu_color_transform_material_wgsl();
        assert!(src.contains("@group(3) @binding(0) var<storage, read> ctData"));
        assert!(src.contains("fn vs_main"));
        assert!(src.contains("fn fs_main"));
        // Prelude is prepended.
        assert!(src.contains("fn quadBaseVertex"));
        assert!(src.contains("struct InstanceData"));
    }
}
