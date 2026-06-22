//! wgpu render target — creation, composition, and lifecycle.

use flighthq_types::blend::BlendMode;
use flighthq_types::geometry::Matrix;

use crate::draw::{
    WgpuTextureInfo, build_wgpu_render_target_bind_group, draw_wgpu_quad_with_transform,
};
use crate::render_state::{
    WgpuRenderState, WgpuRenderTarget, WgpuRenderTargetStackEntry, WgpuViewport,
};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Redirects subsequent wgpu rendering into `target`'s texture.
///
/// Ends the current render pass (if any), saves the current canvas view and
/// render transform, and begins a new pass into `target`. Supports nesting.
///
/// Pass `clear_color` to clear the target; pass `None` to load existing pixels.
pub fn begin_wgpu_render_target(
    state: &mut WgpuRenderState,
    target: &WgpuRenderTarget,
    render_transform: &Matrix,
    clear_color: Option<wgpu::Color>,
) {
    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }

    let saved = WgpuRenderTargetStackEntry {
        canvas_texture_view: state.runtime.canvas_texture_view.take(),
        canvas_view_cleared: state.runtime.canvas_view_cleared,
        // The depth-stencil view is not moved out (the enclosing pass owns it via the runtime);
        // the saved slot carries None and end restores from the runtime's own depth view.
        depth_stencil_view: None,
        render_target_viewport: state.runtime.render_target_viewport,
        render_transform_2d: state.render_state.render_transform_2d,
        color_format: state.runtime.current_color_format,
    };
    state.runtime.render_target_stack.push(saved);

    state.runtime.render_target_viewport = Some(WgpuViewport {
        width: target.width,
        height: target.height,
    });
    // Scene pipelines drawn into this target must match its color format (HDR uses rgba16float).
    state.runtime.current_color_format = Some(target.format);
    state.render_state.render_transform_2d = Some(*render_transform);

    // Reset mask / clip state for the new pass.
    state.runtime.current_mask_depth = 0;
    state.runtime.mask_write_mode = false;
    state.runtime.current_scissor_rect = None;
    state.runtime.scissor_stack.clear();

    let load_op = match clear_color {
        Some(color) => wgpu::LoadOp::Clear(color),
        None => wgpu::LoadOp::Load,
    };
    begin_wgpu_render_pass(
        state,
        &target.view,
        &target.depth_stencil_view,
        target.width,
        target.height,
        load_op,
    );
}

/// Allocates a render target with the given dimensions and texture format.
///
/// `format` defaults to the swapchain format; pass `wgpu::TextureFormat::Rgba16Float`
/// for an HDR effect target.
pub fn create_wgpu_render_target(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
    format: Option<wgpu::TextureFormat>,
) -> WgpuRenderTarget {
    let format = format.unwrap_or(state.format);
    let w = width.max(1);
    let h = height.max(1);

    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-render-target"),
        size: wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = build_wgpu_render_target_bind_group(state, &view);

    let depth_stencil_texture = create_wgpu_depth_stencil_texture(state, w, h);
    let depth_stencil_view =
        depth_stencil_texture.create_view(&wgpu::TextureViewDescriptor::default());

    WgpuRenderTarget {
        texture,
        view,
        bind_group,
        depth_stencil_texture,
        depth_stencil_view,
        format,
        width: w,
        height: h,
    }
}

/// Frees the `wgpu::Texture` objects owned by `target`.
pub fn destroy_wgpu_render_target(_state: &WgpuRenderState, target: WgpuRenderTarget) {
    target.texture.destroy();
    target.depth_stencil_texture.destroy();
}

/// Composites `target`'s texture onto the current render pass as a positioned
/// quad, using `transform_2d` (the render node's world transform) composed with
/// `offset_transform` (the cache offset).
///
/// Y coordinates are flipped (`v0=1, v1=0`) to account for the stored
/// orientation of render-target textures.
pub fn draw_wgpu_render_target_result(
    state: &mut WgpuRenderState,
    alpha: f32,
    blend_mode: Option<BlendMode>,
    transform_2d: &Matrix,
    target: &WgpuRenderTarget,
    offset_transform: &Matrix,
) {
    if target.width == 0 || target.height == 0 {
        return;
    }
    if state.runtime.render_pass.is_none() {
        return;
    }

    // Compose the node transform with the cache offset transform.
    let composed = compose_wgpu_matrix(transform_2d, offset_transform);
    let texture_info = WgpuTextureInfo {
        texture: &target.texture,
        view: &target.view,
        bind_group: &target.bind_group,
    };
    draw_wgpu_quad_with_transform(
        state,
        alpha,
        blend_mode,
        &composed,
        &texture_info,
        0.0,
        0.0,
        target.width as f32,
        target.height as f32,
        0.0,
        1.0,
        1.0,
        0.0,
    );
}

/// Restores the render pass, canvas view, and render transform saved by the
/// matching `begin_wgpu_render_target` call.
pub fn end_wgpu_render_target(state: &mut WgpuRenderState) {
    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }

    let Some(saved) = state.runtime.render_target_stack.pop() else {
        return;
    };

    state.runtime.canvas_view_cleared = saved.canvas_view_cleared;
    state.runtime.render_target_viewport = saved.render_target_viewport;
    state.runtime.current_color_format = saved.color_format;
    state.render_state.render_transform_2d = saved.render_transform_2d;

    // Reset mask / clip state when returning to the enclosing pass.
    state.runtime.current_mask_depth = 0;
    state.runtime.mask_write_mode = false;
    state.runtime.current_scissor_rect = None;
    state.runtime.scissor_stack.clear();

    // Restore the canvas view and reopen its render pass with a load op (preserving
    // what was already drawn there before the nested target). The color and depth
    // views are taken out of their slots, borrowed for the begin call, then restored.
    let canvas_view = saved.canvas_texture_view;
    let depth_view = state.runtime.depth_stencil_view.take();
    match (canvas_view, depth_view) {
        (Some(canvas_view), Some(depth_view)) => {
            let (vw, vh) = match state.runtime.render_target_viewport {
                Some(vp) => (vp.width, vp.height),
                None => (state.surface_width, state.surface_height),
            };
            begin_wgpu_render_pass(state, &canvas_view, &depth_view, vw, vh, wgpu::LoadOp::Load);
            state.runtime.canvas_texture_view = Some(canvas_view);
            state.runtime.depth_stencil_view = Some(depth_view);
        }
        (canvas_view, depth_view) => {
            state.runtime.canvas_texture_view = canvas_view;
            state.runtime.depth_stencil_view = depth_view;
        }
    }
}

/// Reallocates the storage backing `target` to the new pixel dimensions,
/// preserving the format.
pub fn resize_wgpu_render_target(
    state: &WgpuRenderState,
    target: &mut WgpuRenderTarget,
    width: u32,
    height: u32,
) {
    let format = target.format;
    let w = width.max(1);
    let h = height.max(1);
    target.width = w;
    target.height = h;

    target.texture.destroy();
    target.depth_stencil_texture.destroy();

    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-render-target"),
        size: wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    target.view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    target.bind_group = build_wgpu_render_target_bind_group(state, &target.view);
    target.texture = texture;

    let depth = create_wgpu_depth_stencil_texture(state, w, h);
    target.depth_stencil_view = depth.create_view(&wgpu::TextureViewDescriptor::default());
    target.depth_stencil_texture = depth;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Begins a render pass into the given color/depth views and stores it on the runtime
// with a forgotten lifetime (the render path keeps the command encoder alive for the
// duration of the frame, so this is sound for the frame's scope).
fn begin_wgpu_render_pass(
    state: &mut WgpuRenderState,
    color_view: &wgpu::TextureView,
    depth_stencil_view: &wgpu::TextureView,
    width: u32,
    height: u32,
    load_op: wgpu::LoadOp<wgpu::Color>,
) {
    let Some(encoder) = state.runtime.command_encoder.as_mut() else {
        return;
    };
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("flight-wgpu-render-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: color_view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: load_op,
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
            view: depth_stencil_view,
            depth_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(1.0),
                store: wgpu::StoreOp::Discard,
            }),
            stencil_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(0),
                store: wgpu::StoreOp::Discard,
            }),
        }),
        timestamp_writes: None,
        occlusion_query_set: None,
    });
    pass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
    state.runtime.render_pass = Some(pass.forget_lifetime());
}

fn compose_wgpu_matrix(node: &Matrix, offset: &Matrix) -> Matrix {
    let (a, b, c, d, tx, ty) = (node.a, node.b, node.c, node.d, node.tx, node.ty);
    let (ta, tb, tc, td, ttx, tty) = (offset.a, offset.b, offset.c, offset.d, offset.tx, offset.ty);
    Matrix {
        a: a * ta + c * tb,
        b: b * ta + d * tb,
        c: a * tc + c * td,
        d: b * tc + d * td,
        tx: a * ttx + c * tty + tx,
        ty: b * ttx + d * tty + ty,
    }
}

fn create_wgpu_depth_stencil_texture(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
) -> wgpu::Texture {
    state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-render-target-depth-stencil"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth24PlusStencil8,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // compose_wgpu_matrix

    #[test]
    fn compose_wgpu_matrix_with_identity_offset_is_node() {
        let node = Matrix {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 3.0,
            tx: 10.0,
            ty: 20.0,
        };
        let identity = Matrix::default();
        let out = compose_wgpu_matrix(&node, &identity);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.d, 3.0);
        assert_eq!(out.tx, 10.0);
        assert_eq!(out.ty, 20.0);
    }

    #[test]
    fn compose_wgpu_matrix_applies_offset_translation() {
        let node = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 5.0,
            ty: 7.0,
        };
        let offset = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 3.0,
            ty: 4.0,
        };
        let out = compose_wgpu_matrix(&node, &offset);
        // node is identity scale, so composed translation = node.tx + offset.tx, etc.
        assert_eq!(out.tx, 8.0);
        assert_eq!(out.ty, 11.0);
    }
}
