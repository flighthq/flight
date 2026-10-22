// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The frame bracket: one command encoder per frame, deferred retirement of replaced resources, the
//! submit, and borrowing another state's live frame (TS `wgpuFrame.ts`).

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::Arc;

use crate::types::*;
use crate::wgpu_command_observer::{WgpuCommandRecord, record_wgpu_command, write_wgpu_buffer};
use crate::wgpu_render_state::get_wgpu_render_state_native_device;
use crate::wgpu_screen_render_target::end_wgpu_screen_render_target_frame;

// The fields a frame borrow swaps out of the borrower and restores afterward.
struct BorrowerFrameState {
    borrowed_surface_extent: Option<WgpuRenderPassViewport>,
    command_encoder: Option<wgpu::CommandEncoder>,
    current_color_format: Option<wgpu::TextureFormat>,
    current_render_target: Option<WgpuRenderTarget>,
    frame_screen_target: Option<flight_entity::Ref<WgpuScreenRenderTarget>>,
    pass_stack: Vec<WgpuRenderPassRecord>,
    render_pass: Option<wgpu::RenderPass<'static>>,
    render_target_viewport: Option<WgpuRenderPassViewport>,
}

/// Opens the command encoder a frame records into, without opening a pass (TS `beginWgpuFrame`).
/// A pass opens one itself; call this explicitly when several passes must land in one submit.
pub fn begin_wgpu_frame(state: &mut WgpuRenderState) {
    if state.runtime.command_encoder.is_some() {
        return;
    }
    let native = get_wgpu_render_state_native_device(state);
    let runtime = &mut state.runtime;
    runtime.command_encoder = Some(
        native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default()),
    );
    runtime.command_encoder_serial += 1;
    runtime.uniform_offset = 0;
    // Reclaim the quad-batch writer buffer pool from the start of the frame; last frame's submit has
    // been queued, so its slots are safe to overwrite.
    runtime.quad_batch_writer_buffer_cursor = 0;
    runtime.mesh_instance_buffer_cursor = 0;
    runtime.current_blend_mode = None;
    runtime.frame_screen_target = None;
}

fn capture_borrower_frame_state(runtime: &mut WgpuRenderStateRuntime) -> BorrowerFrameState {
    return BorrowerFrameState {
        borrowed_surface_extent: runtime.borrowed_surface_extent,
        command_encoder: runtime.command_encoder.take(),
        current_color_format: runtime.current_color_format,
        current_render_target: runtime.current_render_target.clone(),
        frame_screen_target: runtime.frame_screen_target.clone(),
        pass_stack: std::mem::take(&mut runtime.pass_stack),
        render_pass: runtime.render_pass.take(),
        render_target_viewport: runtime.render_target_viewport,
    };
}

// A frame submit closes everything the frame recorded. A pass still open here is a caller that never
// ended its bracket: the encoder cannot survive into the next frame, so the stack unwinds to the
// state the outermost begin saved.
fn end_wgpu_frame_passes(state: &mut WgpuRenderState) {
    let runtime = &mut state.runtime;
    runtime.render_pass = None;
    if runtime.pass_stack.is_empty() {
        return;
    }
    for record in &mut runtime.pass_stack {
        record.has_encoder = false;
    }
    let saved = runtime.pass_stack[0].saved.clone();
    runtime.current_render_target = saved.render_target;
    runtime.current_color_format = saved.color_format;
    runtime.render_target_viewport = saved.render_target_viewport;
    runtime.clip_forms = saved.clip_forms;
    runtime.current_mask_depth = saved.current_mask_depth;
    runtime.mask_write_mode = saved.mask_write_mode;
    runtime.current_scissor_rect = saved.current_scissor_rect;
    runtime.scissor_stack = saved.scissor_stack;
    runtime.pass_stack.clear();
}

fn restore_borrower_frame_state(runtime: &mut WgpuRenderStateRuntime, saved: BorrowerFrameState) {
    runtime.borrowed_surface_extent = saved.borrowed_surface_extent;
    runtime.command_encoder = saved.command_encoder;
    runtime.current_color_format = saved.current_color_format;
    runtime.current_render_target = saved.current_render_target;
    runtime.frame_screen_target = saved.frame_screen_target;
    runtime.pass_stack = saved.pass_stack;
    runtime.render_pass = saved.render_pass;
    runtime.render_target_viewport = saved.render_target_viewport;
}

/// Hands a buffer to the post-submit retirement list instead of destroying it now (TS
/// `retireWgpuBuffer`): a buffer replaced mid-recording may still be referenced by a recorded draw.
pub fn retire_wgpu_buffer(state: &mut WgpuRenderState, buffer: wgpu::Buffer) {
    state
        .runtime
        .retired_buffers
        .get_or_insert_with(Vec::new)
        .push(buffer);
}

/// Hands a texture to the post-submit retirement list instead of destroying it now (TS
/// `retireWgpuTexture`). The deferral is the point: a frame records into one encoder and submits
/// once, so destroying a texture an already recorded bind group references fails the whole
/// submit. `submit_wgpu_frame` frees it once the frame is on the queue.
pub fn retire_wgpu_texture(state: &mut WgpuRenderState, texture: wgpu::Texture) {
    state
        .runtime
        .retired_textures
        .get_or_insert_with(Vec::new)
        .push(texture);
}

/// Finishes the frame (TS `submitWgpuFrame`): closes any pass left open, uploads the used part of
/// the uniform ring, resolves a supersampled screen target and encodes its capture copy, submits,
/// then frees the resources retired mid-frame and releases the frame's presentation view.
pub fn submit_wgpu_frame(state: &mut WgpuRenderState) {
    end_wgpu_frame_passes(state);
    let native = get_wgpu_render_state_native_device(state);
    let screen = state.runtime.frame_screen_target.clone();
    if let Some(mut encoder) = state.runtime.command_encoder.take() {
        // Upload used portion of the uniform ring buffer before submission. write_buffer is a queue
        // operation that completes before the subsequent submit.
        let uniform_offset = state.runtime.uniform_offset as usize;
        if uniform_offset > 0 {
            write_wgpu_buffer(
                &native,
                &state.runtime.uniform_buffer,
                0,
                wgpu_f32_bytes(&state.runtime.uniform_data[..uniform_offset / 4]),
            );
        }
        // A frame that only drew into texture targets has no screen to resolve or capture, and must
        // not overwrite the capture buffer with the previous visible frame's retained texture.
        if let Some(screen) = &screen {
            let encode_resolve = screen.read().unwrap().encode_antialias_resolve;
            if let Some(encode_resolve) = encode_resolve {
                encode_resolve(state, &screen.read().unwrap(), &mut encoder);
            }
            let mut target = screen.write().unwrap();
            if let Some(encode_capture) = target.encode_capture {
                encode_capture(&mut target, &mut encoder);
            }
        }
        record_wgpu_command(&native, || WgpuCommandRecord::Submit(1));
        native.queue.submit([encoder.finish()]);

        // Now that the frame is submitted, free the resources retired mid-frame; they were kept alive
        // because the submitted command buffer referenced them.
        if let Some(retired) = &mut state.runtime.retired_buffers {
            for buffer in retired.drain(..) {
                buffer.destroy();
            }
        }
        if let Some(retired) = &mut state.runtime.retired_textures {
            for texture in retired.drain(..) {
                texture.destroy();
            }
        }
    }
    if let Some(screen) = &screen {
        end_wgpu_screen_render_target_frame(&mut screen.write().unwrap());
    }
    state.runtime.frame_screen_target = None;
}

fn transfer_retired_wgpu_resources(
    borrower: &mut WgpuRenderStateRuntime,
    owner: &mut WgpuRenderStateRuntime,
) {
    if let Some(retired) = &mut borrower.retired_buffers
        && !retired.is_empty()
    {
        owner
            .retired_buffers
            .get_or_insert_with(Vec::new)
            .append(retired);
    }
    if let Some(retired) = &mut borrower.retired_textures
        && !retired.is_empty()
    {
        owner
            .retired_textures
            .get_or_insert_with(Vec::new)
            .append(retired);
    }
}

// The uniform ring's bytes in host order, the bytes the source's Float32Array views upload.
pub(crate) fn wgpu_f32_bytes(data: &[f32]) -> &[u8] {
    // SAFETY: f32 has no padding or invalid bit patterns, and u8 has alignment 1.
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

/// Records an offscreen state's work into another state's live frame (TS `withWgpuFrameBorrow`).
/// The borrower keeps its own uniform ring, batch buffers and resources; only the encoder and the
/// open pass stack are borrowed, and they return to the owner even when the callback panics. The
/// callback receives the borrower.
pub fn with_wgpu_frame_borrow<T>(
    owner_state: &mut WgpuRenderState,
    borrower_state: &mut WgpuRenderState,
    callback: impl FnOnce(&mut WgpuRenderState) -> T,
) -> T {
    // Device identity is the host handle's (D26): wgpu's own device equality compares only a
    // per-instance id, so devices from different instances can compare equal.
    if !Arc::ptr_eq(&borrower_state.device.handle, &owner_state.device.handle) {
        panic!("Wgpu frame owner and borrower must use the same GPU device");
    }
    if borrower_state.runtime.command_encoder.is_some() {
        panic!("Wgpu frame borrower already has an active frame");
    }

    let owns_frame = owner_state.runtime.command_encoder.is_none();
    if owns_frame {
        begin_wgpu_frame(owner_state);
    }
    let saved = capture_borrower_frame_state(&mut borrower_state.runtime);
    {
        let owner = &mut owner_state.runtime;
        let borrower = &mut borrower_state.runtime;
        borrower.command_encoder = owner.command_encoder.take();
        // The borrowed encoder is a new frame for the borrower's per-frame state.
        borrower.command_encoder_serial += 1;
        borrower.render_pass = owner.render_pass.take();
        borrower.frame_screen_target = owner.frame_screen_target.clone();
        borrower.pass_stack = std::mem::take(&mut owner.pass_stack);
        borrower.current_color_format = owner.current_color_format;
        borrower.current_render_target = owner.current_render_target.clone();
        borrower.render_target_viewport = owner.render_target_viewport;
        borrower.borrowed_surface_extent = owner.render_target_viewport;
        borrower.uniform_offset = 0;
        borrower.quad_batch_writer_buffer_cursor = 0;
        borrower.mesh_instance_buffer_cursor = 0;
    }

    let result = catch_unwind(AssertUnwindSafe(|| callback(borrower_state)));

    let native = get_wgpu_render_state_native_device(borrower_state);
    let uniform_offset = borrower_state.runtime.uniform_offset as usize;
    if uniform_offset > 0 {
        write_wgpu_buffer(
            &native,
            &borrower_state.runtime.uniform_buffer,
            0,
            wgpu_f32_bytes(&borrower_state.runtime.uniform_data[..uniform_offset / 4]),
        );
    }
    {
        let owner = &mut owner_state.runtime;
        let borrower = &mut borrower_state.runtime;
        owner.command_encoder = borrower.command_encoder.take();
        owner.render_pass = borrower.render_pass.take();
        owner.frame_screen_target = borrower.frame_screen_target.clone();
        owner.pass_stack = std::mem::take(&mut borrower.pass_stack);
        owner.current_color_format = borrower.current_color_format;
        owner.current_render_target = borrower.current_render_target.clone();
        owner.render_target_viewport = borrower.render_target_viewport;
        transfer_retired_wgpu_resources(borrower, owner);
        restore_borrower_frame_state(borrower, saved);
    }
    if owns_frame {
        submit_wgpu_frame(owner_state);
    }
    return match result {
        Ok(value) => value,
        Err(error) => resume_unwind(error),
    };
}
