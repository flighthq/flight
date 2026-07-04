//! Wgpu fullscreen quad — a reusable vertex/index buffer pair for drawing a
//! viewport-covering quad with a custom pipeline.

use crate::render_state::WgpuRenderState;

/// A pair of GPU buffers (vertex + index) for a fullscreen quad covering
/// NDC `[-1, 1]` with UV `[0, 1]`. Four vertices, six indices.
pub struct WgpuFullscreenQuad {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
}

/// Allocates vertex and index buffers for a fullscreen quad in NDC space.
///
/// Vertex layout: `[x, y, u, v]` per vertex (16 bytes/vertex), four vertices
/// covering `(-1, -1)` to `(1, 1)`.
pub fn create_wgpu_fullscreen_quad(state: &WgpuRenderState) -> WgpuFullscreenQuad {
    use wgpu::util::DeviceExt;

    #[rustfmt::skip]
    let vertices: [f32; 16] = [
        -1.0, -1.0,  0.0, 0.0,
         1.0, -1.0,  1.0, 0.0,
         1.0,  1.0,  1.0, 1.0,
        -1.0,  1.0,  0.0, 1.0,
    ];
    let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];

    let vertex_buffer = state
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("fullscreen_quad_vbo"),
            contents: bytemuck_f32(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });

    let index_buffer = state
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("fullscreen_quad_ibo"),
            contents: bytemuck_u16(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });

    WgpuFullscreenQuad {
        vertex_buffer,
        index_buffer,
    }
}

/// Frees the GPU resources owned by `quad`.
pub fn destroy_wgpu_fullscreen_quad(_state: &WgpuRenderState, quad: WgpuFullscreenQuad) {
    quad.vertex_buffer.destroy();
    quad.index_buffer.destroy();
}

/// Draws the fullscreen quad into `render_pass` using whatever pipeline is
/// currently set. Sets the quad's vertex/index buffers and issues a 6-index
/// draw call.
pub fn draw_wgpu_fullscreen_quad<'a>(
    render_pass: &mut wgpu::RenderPass<'a>,
    quad: &'a WgpuFullscreenQuad,
) {
    render_pass.set_vertex_buffer(0, quad.vertex_buffer.slice(..));
    render_pass.set_index_buffer(quad.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
    render_pass.draw_indexed(0..6, 0, 0..1);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn bytemuck_f32(data: &[f32]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

fn bytemuck_u16(data: &[u16]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytemuck_helpers_return_correct_lengths() {
        let f = [1.0f32, 2.0];
        assert_eq!(bytemuck_f32(&f).len(), 8);
        let u = [0u16, 1, 2];
        assert_eq!(bytemuck_u16(&u).len(), 6);
    }
}
