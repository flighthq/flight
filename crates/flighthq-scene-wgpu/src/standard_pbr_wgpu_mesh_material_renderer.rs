//! The built-in StandardPbr forward-lit mesh-material renderer
//! (`WgpuMeshMaterialRenderer` for `StandardPbrMaterialKind`) — the WGSL mirror of
//! `standard_pbr_gl_mesh_material_renderer`.
//!
//! `bind` selects the pipeline variant for the material's maps/alpha mode + the
//! current color-attachment format, writes the shared Frame uniform (camera
//! view-projection + position, the packed light block) and binds it, then writes +
//! binds the material's uniform/texture bind group. `draw` uploads the geometry's
//! GPU buffers lazily (cached by `geometry.version`), writes the per-draw model +
//! normal matrices into the render-state's uniform ring buffer, and issues the
//! indexed draw over the proxy's subset. Depth-test LESS + depth-write on and
//! back-face culling (unless double-sided) are baked on the pipeline.
//!
//! Uniform packing constants (`FRAME_UNIFORM_BYTES`, `DRAW_UNIFORM_BYTES`,
//! `MATERIAL_UNIFORM_BYTES`) are ported faithfully and unit-tested below.
//!
//! TODO(align): the renderer body is blocked on the cross-package 3D header that
//! the upstream Rust port has not landed yet: the `WgpuMeshMaterialRenderer` trait
//! shape (`bind(state, material, lights, camera)` / `draw(state, proxy, geometry)`),
//! `StandardPbrMaterial`, `SceneLightBlock`, `Camera` light packing, and
//! `SceneRenderProxy`, plus the scene-wgpu per-state runtime (frame/material/draw
//! bindings, placeholder texture, pipeline cache) and the uniform ring buffer
//! offset bookkeeping. Compiling stub preserving the seam until then.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_material_registry::WgpuMeshMaterialRenderer;

/// The built-in StandardPbr forward-lit mesh-material renderer.
///
/// TODO(align): once the 3D `WgpuMeshMaterialRenderer` header lands, implement its
/// `bind`/`draw` for this type and port the full GPU body (pipeline select, frame
/// uniform write, material bind group, lazy mesh upload, ring-buffer draw uniform,
/// indexed draw).
pub struct StandardPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for StandardPbrWgpuMeshMaterialRenderer {}

/// Returns the singleton StandardPbr forward-lit renderer instance.
pub fn standard_pbr_wgpu_mesh_material_renderer() -> StandardPbrWgpuMeshMaterialRenderer {
    StandardPbrWgpuMeshMaterialRenderer
}

/// Writes the per-draw model + normal matrices into the render-state's uniform
/// ring buffer and issues the indexed draw.
///
/// TODO(align): port `draw` once the 3D `SceneRenderProxy`/`MeshGeometry` upload
/// seam exists. Left as an explicit named seam so the body can be filled in place.
pub fn draw_standard_pbr_wgpu_mesh(_state: &mut WgpuRenderState) {
    todo!(
        "TODO(align): port standardPbrWgpuMeshMaterialRenderer.draw — blocked on \
         SceneRenderProxy + scene-wgpu runtime + mesh upload seam"
    )
}

/// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraPosition (16) + vec4f
/// lightDirection (16) + vec4f directionalRadiance (16) + vec4f ambientRadiance
/// (16) = 128 bytes / 32 floats.
pub const FRAME_UNIFORM_BYTES: u64 = 128;

/// Draw uniform: mat4x4f world (64) + mat3x3f normalMatrix as 3 padded vec4 (48)
/// = 112; the ring buffer rounds the per-slot stride up to the device's
/// `minUniformBufferOffsetAlignment`.
pub const DRAW_UNIFORM_BYTES: u64 = 112;

/// Material uniform: baseColor vec4f (16) + emissive vec4f (16) + factors vec4f
/// (16) + flags vec4f (16) = 64 bytes / 16 floats.
pub const MATERIAL_UNIFORM_BYTES: u64 = 64;

/// Opaque-white 1x1 RGBA pixel for the placeholder map texture (untextured path).
pub const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

#[cfg(test)]
mod tests {
    use super::*;

    mod uniform_layout_constants {
        use super::*;

        #[test]
        fn match_the_wgsl_std140_block_sizes() {
            // Frame = viewProjection(64) + cameraPosition(16) + 3 light vec4 (48).
            assert_eq!(FRAME_UNIFORM_BYTES, 64 + 16 + 16 * 3);
            assert_eq!(FRAME_UNIFORM_BYTES / 4, 32);
            // Draw = world mat4 (64) + normal mat3 as 3 padded vec4 (48).
            assert_eq!(DRAW_UNIFORM_BYTES, 64 + 48);
            // Material = 4 vec4 (baseColor, emissive, factors, flags).
            assert_eq!(MATERIAL_UNIFORM_BYTES, 16 * 4);
            assert_eq!(MATERIAL_UNIFORM_BYTES / 4, 16);
        }

        #[test]
        fn white_pixel_is_opaque_white() {
            assert_eq!(WHITE_PIXEL, [255, 255, 255, 255]);
        }
    }
}
