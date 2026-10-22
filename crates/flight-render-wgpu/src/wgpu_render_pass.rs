// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The render-pass bracket (TS `wgpuRenderPass.ts`). A pass handle borrows its state, so a nested
//! pass reborrows the enclosing one and brackets close innermost first by construction; the pass
//! data lives on the state's pass stack.

use flight_entity::EntityRuntimeSlot;

use crate::types::*;
use crate::wgpu_command_observer::{
    WgpuClearColorRecord, WgpuColorLoadRecord, WgpuCommandRecord, WgpuRenderPassBeginRecord,
    record_wgpu_command,
};
use crate::wgpu_frame::{begin_wgpu_frame, submit_wgpu_frame};
use crate::wgpu_render_state::get_wgpu_render_state_native_device;
use crate::wgpu_render_target::{
    get_wgpu_render_target_depth_stencil_view, get_wgpu_render_target_extent,
    get_wgpu_render_target_format, get_wgpu_render_target_supersample_scale,
};
use crate::wgpu_screen_render_target::bind_wgpu_screen_render_target;

/// Opens a render pass into `target` and returns the handle to draw through (TS
/// `beginWgpuRenderPass`). Aspects named in `clear` are overwritten; omitted aspects load. Passes
/// nest across targets: an offscreen pass opened inside a screen pass suspends it, and ending the
/// inner one resumes the outer with load. The pass opens the frame when none is open.
pub fn begin_wgpu_render_pass<'a>(
    state: &'a mut WgpuRenderState,
    target: &WgpuRenderTarget,
    clear: Option<&RenderTargetClear>,
) -> WgpuRenderPass<'a> {
    // A WebGPU pass encoder cannot be suspended, only ended; the enclosing pass is re-recorded from
    // its saved attachments when this one ends.
    state.runtime.render_pass = None;
    if let Some(enclosing) = state.runtime.pass_stack.last_mut() {
        enclosing.has_encoder = false;
    }

    let owns_frame = state.runtime.command_encoder.is_none();
    begin_wgpu_frame(state);

    let runtime = &mut state.runtime;
    let saved = WgpuSavedPassState {
        clip_forms: std::mem::take(&mut runtime.clip_forms),
        color_format: runtime.current_color_format,
        current_mask_depth: runtime.current_mask_depth,
        current_scissor_rect: runtime.current_scissor_rect,
        mask_write_mode: runtime.mask_write_mode,
        render_target: runtime.current_render_target.clone(),
        render_target_viewport: runtime.render_target_viewport,
        scissor_stack: std::mem::take(&mut runtime.scissor_stack),
    };

    let color_view = bind_wgpu_render_pass_target(state, target);
    let scale = get_wgpu_render_target_supersample_scale(target) as f32;
    let (width, height) = get_wgpu_render_target_extent(target);
    let viewport = WgpuRenderPassViewport {
        height: height as f32 / scale,
        width: width as f32 / scale,
    };
    let record = WgpuRenderPassRecord {
        runtime: EntityRuntimeSlot::default(),
        color_view: color_view.clone(),
        has_encoder: false,
        owns_frame,
        saved,
        target: target.clone(),
        viewport,
    };

    let runtime = &mut state.runtime;
    runtime.pass_stack.push(record);
    runtime.current_render_target = Some(target.clone());
    runtime.current_color_format = Some(get_wgpu_render_target_format(target));
    runtime.render_target_viewport = Some(viewport);
    // A pass owns its logical clip unwind state. Inheriting the enclosing entries would let a nested
    // pass pop clips it never pushed.
    runtime.clip_forms = Vec::new();
    runtime.current_mask_depth = 0;
    runtime.mask_write_mode = false;
    runtime.current_scissor_rect = None;
    runtime.scissor_stack = Vec::new();

    let encoder = record_wgpu_render_pass_encoder(state, target, &color_view, clear);
    let index = state.runtime.pass_stack.len() - 1;
    state.runtime.pass_stack[index].has_encoder = true;
    state.runtime.render_pass = Some(encoder);
    return WgpuRenderPass { state, index };
}

// The color view to attach: the swap-chain (or supersample) view for a screen target, the target's
// own view for a texture target. Screen storage is sized to its surface here.
fn bind_wgpu_render_pass_target(
    state: &mut WgpuRenderState,
    target: &WgpuRenderTarget,
) -> wgpu::TextureView {
    return match target {
        WgpuRenderTarget::Screen(screen) => {
            let view = bind_wgpu_screen_render_target(state, &mut screen.write().unwrap());
            state.runtime.frame_screen_target = Some(screen.clone());
            view
        }
        WgpuRenderTarget::Texture(texture) => texture.read().unwrap().view.clone(),
    };
}

/// Ends the pass (TS `endWgpuRenderPass`): closes its encoder, restores the enclosing pass state,
/// resumes the enclosing pass with load, and submits the frame when this pass opened it. The
/// handle is consumed, so ending twice or out of order cannot be written; a stack the borrow did not
/// keep in order is a programmer error and panics.
pub fn end_wgpu_render_pass(pass: WgpuRenderPass<'_>) {
    let state = pass.state;
    if state.runtime.pass_stack.len() != pass.index + 1 {
        panic!("endWgpuRenderPass: this pass is not the innermost open pass");
    }
    let record = state.runtime.pass_stack.pop().unwrap();
    state.runtime.render_pass = None;

    let saved = record.saved;
    let runtime = &mut state.runtime;
    runtime.current_render_target = saved.render_target;
    runtime.current_color_format = saved.color_format;
    runtime.render_target_viewport = saved.render_target_viewport;
    runtime.clip_forms = saved.clip_forms;
    runtime.current_mask_depth = saved.current_mask_depth;
    runtime.mask_write_mode = saved.mask_write_mode;
    runtime.current_scissor_rect = saved.current_scissor_rect;
    runtime.scissor_stack = saved.scissor_stack;

    if !state.runtime.pass_stack.is_empty() {
        let enclosing = state.runtime.pass_stack.len() - 1;
        resume_wgpu_render_pass_at(state, enclosing);
    }
    if record.owns_frame {
        submit_wgpu_frame(state);
    }
}

/// The innermost open pass, when a caller holds the state rather than the handle (TS
/// `getWgpuActiveRenderPass`); `None` outside any pass.
pub fn get_wgpu_active_render_pass(state: &WgpuRenderState) -> Option<&WgpuRenderPassRecord> {
    return state.runtime.pass_stack.last();
}

/// The logical extent of the innermost open pass (TS `getWgpuRenderPassViewport`). Panics outside
/// a pass: a draw with no target bound is API misuse.
pub fn get_wgpu_render_pass_viewport(state: &WgpuRenderState) -> WgpuRenderPassViewport {
    let Some(viewport) = state.runtime.render_target_viewport else {
        panic!("No Wgpu render pass is open — call beginWgpuRenderPass first");
    };
    return viewport;
}

fn record_wgpu_render_pass_encoder(
    state: &mut WgpuRenderState,
    target: &WgpuRenderTarget,
    color_view: &wgpu::TextureView,
    clear: Option<&RenderTargetClear>,
) -> wgpu::RenderPass<'static> {
    let has_color = clear.is_some_and(|clear| clear.color.is_some() || clear.colors.is_some());
    let depth_stencil_view = get_wgpu_render_target_depth_stencil_view(target);
    let (width, height) = get_wgpu_render_target_extent(target);
    let color_load = if has_color {
        wgpu::LoadOp::Clear(resolve_wgpu_clear_color(clear))
    } else {
        wgpu::LoadOp::Load
    };
    let depth_clear = clear.and_then(|clear| clear.depth);
    let stencil_clear = clear.and_then(|clear| clear.stencil).unwrap_or(0);
    let native = get_wgpu_render_state_native_device(state);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::BeginRenderPass(WgpuRenderPassBeginRecord {
            color: match color_load {
                wgpu::LoadOp::Clear(color) => WgpuColorLoadRecord::Clear(WgpuClearColorRecord {
                    a: color.a,
                    b: color.b,
                    g: color.g,
                    r: color.r,
                }),
                _ => WgpuColorLoadRecord::Load,
            },
            color_view: color_view.clone(),
            depth_clear,
            stencil_clear,
        });
    });
    let encoder = state
        .runtime
        .command_encoder
        .as_mut()
        .expect("a pass records into the frame's command encoder");
    let mut pass = encoder
        .begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: color_view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: color_load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &depth_stencil_view,
                depth_ops: Some(wgpu::Operations {
                    load: match depth_clear {
                        Some(depth) => wgpu::LoadOp::Clear(depth),
                        None => wgpu::LoadOp::Load,
                    },
                    store: wgpu::StoreOp::Discard,
                }),
                stencil_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(stencil_clear),
                    store: wgpu::StoreOp::Discard,
                }),
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        })
        .forget_lifetime();
    pass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
    return pass;
}

// One color broadcasts to every attachment; `colors` selects per attachment. Only attachment 0 is
// expressible through the load operation, so both resolve to the same value here.
fn resolve_wgpu_clear_color(clear: Option<&RenderTargetClear>) -> wgpu::Color {
    let rgba = clear.and_then(|clear| {
        clear
            .colors
            .as_ref()
            .and_then(|colors| colors.first().copied())
            .or(clear.color)
    });
    let Some(rgba) = rgba else {
        return wgpu::Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        };
    };
    return wgpu::Color {
        r: rgba[0],
        g: rgba[1],
        b: rgba[2],
        a: rgba[3],
    };
}

/// Re-records the pass's encoder over the same attachments with load, after a suspend or an inner
/// pass (TS `resumeWgpuRenderPass`).
pub fn resume_wgpu_render_pass(pass: &mut WgpuRenderPass<'_>) {
    let index = pass.index;
    resume_wgpu_render_pass_at(pass.state, index);
}

fn resume_wgpu_render_pass_at(state: &mut WgpuRenderState, index: usize) {
    let target = state.runtime.pass_stack[index].target.clone();
    let color_view = bind_wgpu_render_pass_target(state, &target);
    state.runtime.pass_stack[index].color_view = color_view.clone();
    let encoder = record_wgpu_render_pass_encoder(state, &target, &color_view, None);
    state.runtime.pass_stack[index].has_encoder = true;
    state.runtime.render_pass = Some(encoder);
}

/// Ends the pass's encoder while leaving the pass open, so a caller can record its own passes into
/// the same frame (TS `suspendWgpuRenderPass`). Pair with `resume_wgpu_render_pass`.
pub fn suspend_wgpu_render_pass(pass: &mut WgpuRenderPass<'_>) {
    let record = &mut pass.state.runtime.pass_stack[pass.index];
    if !record.has_encoder {
        return;
    }
    record.has_encoder = false;
    pass.state.runtime.render_pass = None;
}
