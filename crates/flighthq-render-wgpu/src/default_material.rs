//! wgpu default material — the fallback material renderer for undecorated bitmaps.

use flighthq_types::kind::KindId;
use flighthq_types::material::DefaultMaterialKind;

use crate::material_registry::{WgpuMaterialRenderer, register_wgpu_material_renderer};
use crate::render_state::WgpuRenderState;

// Textured quad with per-instance alpha and no other effect. The batch holds no shader of its own,
// so even the plain path is just a registered material — this module IS the base sprite-batch shader.
const DEFAULT_MATERIAL_WGSL: &str = r#"
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  return VertexOut(bv.position, bv.uv, bv.alpha);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  return color * clamp(in.alpha, 0.0, 1.0);
}
"#;

/// Default wgpu material renderer. Textured quad with per-instance alpha and no
/// per-node color transform.
pub struct DefaultWgpuMaterialRenderer;

impl WgpuMaterialRenderer for DefaultWgpuMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        0
    }
    fn bind(&self, _state: &mut WgpuRenderState, _material_id: u64) {
        // The default material carries no per-batch uniform state beyond the shared viewport
        // matrix the batch already binds, so binding is a no-op.
    }
}

/// Returns the full WGSL module source for the default material (quad-batch
/// prelude + default stages).
pub fn get_wgpu_default_material_wgsl() -> String {
    format!(
        "{}{}",
        crate::sprite_batch::get_wgpu_quad_batch_prelude_wgsl(),
        DEFAULT_MATERIAL_WGSL
    )
}

/// Registers the default wgpu material renderer on `state` under
/// `DefaultMaterialKind`.
pub fn register_default_wgpu_material(state: &mut WgpuRenderState) {
    register_wgpu_material_renderer(
        state,
        KindId::of::<DefaultMaterialKind>(),
        Box::new(DefaultWgpuMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_material_instance_float_count_is_zero() {
        assert_eq!(DefaultWgpuMaterialRenderer.instance_float_count(), 0);
    }

    #[test]
    fn default_material_wgsl_declares_stages_and_prelude() {
        let src = get_wgpu_default_material_wgsl();
        assert!(src.contains("fn vs_main"));
        assert!(src.contains("fn fs_main"));
        assert!(src.contains("quadBaseVertex(vi, ii)"));
        assert!(src.contains("fn quadBaseVertex"));
    }
}
