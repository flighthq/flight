//! wgpu per-frame draw statistics — the `WgpuRenderStats` accumulator subsystem.
//!
//! Ports the TS `wgpuRenderStats` module. The accumulator lives in the
//! `render_stats` runtime slot on `WgpuRenderState`, which starts `None`; the
//! TS port keys it in a `WeakMap` by state. `get_wgpu_render_stats` and
//! `reset_wgpu_render_stats` initialise the slot, so `record_wgpu_batch_flush` /
//! `record_wgpu_texture_upload` called before either are no-ops (nothing to
//! accumulate into yet).
//!
//! The public functions read the runtime slot and delegate to slot-level
//! helpers; the helpers carry the accumulation logic so it is testable without a
//! live GPU device.

use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderStats};

/// Returns a snapshot of the current frame's GPU draw statistics for `state`.
/// Reflects counts accumulated since the last `reset_wgpu_render_stats`, and
/// lazily initialises the accumulator to zero on first access.
pub fn get_wgpu_render_stats(state: &mut WgpuRenderState) -> WgpuRenderStats {
    *ensure_wgpu_render_stats(&mut state.runtime.render_stats)
}

/// Records one batch flush: increments `draw_call_count` by 1, `instance_count`
/// by `instances`, and `batch_flush_count` by 1. A no-op when the accumulator
/// has not been initialised via `get_wgpu_render_stats` / `reset_wgpu_render_stats`.
pub fn record_wgpu_batch_flush(state: &mut WgpuRenderState, instances: u32) {
    record_wgpu_batch_flush_into(&mut state.runtime.render_stats, instances);
}

/// Records one canvas-to-GPU texture upload: increments `texture_upload_count`
/// by 1. A no-op when the accumulator has not been initialised.
pub fn record_wgpu_texture_upload(state: &mut WgpuRenderState) {
    record_wgpu_texture_upload_into(&mut state.runtime.render_stats);
}

/// Resets all GPU draw statistics for `state` to zero. Call at the start of each
/// frame. Also initialises the accumulator if it has not been touched yet.
pub fn reset_wgpu_render_stats(state: &mut WgpuRenderState) {
    *ensure_wgpu_render_stats(&mut state.runtime.render_stats) = WgpuRenderStats::default();
}

// Lazily initialises and returns the per-state stats accumulator, mirroring the
// TS `ensureWgpuRenderStatsMutable` WeakMap upsert.
fn ensure_wgpu_render_stats(slot: &mut Option<WgpuRenderStats>) -> &mut WgpuRenderStats {
    slot.get_or_insert_with(WgpuRenderStats::default)
}

fn record_wgpu_batch_flush_into(slot: &mut Option<WgpuRenderStats>, instances: u32) {
    if let Some(stats) = slot.as_mut() {
        stats.draw_call_count += 1;
        stats.instance_count += instances;
        stats.batch_flush_count += 1;
    }
}

fn record_wgpu_texture_upload_into(slot: &mut Option<WgpuRenderStats>) {
    if let Some(stats) = slot.as_mut() {
        stats.texture_upload_count += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `WgpuRenderState` needs a live GPU device, so these exercise the slot-level
    // helpers directly (the public functions are thin reads over `state.runtime`);
    // the wired-up path is covered by the conformance/capture suites.

    #[test]
    fn ensure_initialises_a_fresh_slot_to_zero() {
        let mut slot: Option<WgpuRenderStats> = None;
        let stats = *ensure_wgpu_render_stats(&mut slot);
        assert_eq!(stats, WgpuRenderStats::default());
        assert!(slot.is_some());
    }

    #[test]
    fn record_batch_flush_before_init_is_a_no_op() {
        let mut slot: Option<WgpuRenderStats> = None;
        record_wgpu_batch_flush_into(&mut slot, 10);
        assert!(slot.is_none());
    }

    #[test]
    fn record_texture_upload_before_init_is_a_no_op() {
        let mut slot: Option<WgpuRenderStats> = None;
        record_wgpu_texture_upload_into(&mut slot);
        assert!(slot.is_none());
    }

    #[test]
    fn record_batch_flush_increments_draw_instance_and_flush_counts() {
        let mut slot = Some(WgpuRenderStats::default());
        record_wgpu_batch_flush_into(&mut slot, 10);
        let stats = slot.unwrap();
        assert_eq!(stats.draw_call_count, 1);
        assert_eq!(stats.instance_count, 10);
        assert_eq!(stats.batch_flush_count, 1);
    }

    #[test]
    fn record_batch_flush_accumulates_across_flushes() {
        let mut slot = Some(WgpuRenderStats::default());
        record_wgpu_batch_flush_into(&mut slot, 5);
        record_wgpu_batch_flush_into(&mut slot, 3);
        let stats = slot.unwrap();
        assert_eq!(stats.draw_call_count, 2);
        assert_eq!(stats.instance_count, 8);
        assert_eq!(stats.batch_flush_count, 2);
    }

    #[test]
    fn record_texture_upload_increments_upload_count() {
        let mut slot = Some(WgpuRenderStats::default());
        record_wgpu_texture_upload_into(&mut slot);
        record_wgpu_texture_upload_into(&mut slot);
        assert_eq!(slot.unwrap().texture_upload_count, 2);
    }

    #[test]
    fn reset_zeroes_all_counts() {
        let mut slot = Some(WgpuRenderStats {
            draw_call_count: 3,
            instance_count: 100,
            batch_flush_count: 2,
            texture_upload_count: 4,
        });
        *ensure_wgpu_render_stats(&mut slot) = WgpuRenderStats::default();
        assert_eq!(slot.unwrap(), WgpuRenderStats::default());
    }
}
