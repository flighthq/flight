//! Per-frame GPU draw statistics (TS `wgpuRenderStats.ts`). The source's module WeakMap keyed by
//! state is the state's own package record (D5).

use flight_render_wgpu::WgpuRenderState;

use crate::scene2d_wgpu_runtime::{ensure_scene2d_wgpu_runtime, get_scene2d_wgpu_runtime_mut};
use crate::types::*;

fn ensure_wgpu_render_stats_mutable(state: &mut WgpuRenderState) -> &mut WgpuRenderStats {
    return ensure_scene2d_wgpu_runtime(state)
        .stats
        .get_or_insert_with(WgpuRenderStats::default);
}

/// Returns a snapshot of the current frame's GPU draw statistics for `state` (TS
/// `getWgpuRenderStats`): the counts accumulated since the last `reset_wgpu_render_stats`, zeroed
/// when no counting has been done on this state.
pub fn get_wgpu_render_stats(state: &mut WgpuRenderState) -> WgpuRenderStats {
    return *ensure_wgpu_render_stats_mutable(state);
}

/// Records one batch flush (TS `recordWgpuBatchFlush`): one draw call, `instances` instances and one
/// batch flush. Counts only once stats exist on this state.
pub fn record_wgpu_batch_flush(state: &mut WgpuRenderState, instances: u32) {
    let Some(entry) =
        get_scene2d_wgpu_runtime_mut(state).and_then(|runtime| runtime.stats.as_mut())
    else {
        return;
    };
    entry.draw_call_count += 1;
    entry.instance_count += instances;
    entry.batch_flush_count += 1;
}

/// Records one canvas-to-GPU texture upload (TS `recordWgpuTextureUpload`).
pub fn record_wgpu_texture_upload(state: &mut WgpuRenderState) {
    let Some(entry) =
        get_scene2d_wgpu_runtime_mut(state).and_then(|runtime| runtime.stats.as_mut())
    else {
        return;
    };
    entry.texture_upload_count += 1;
}

/// Resets all GPU draw statistics for `state` to zero (TS `resetWgpuRenderStats`). Call at the start
/// of each frame.
pub fn reset_wgpu_render_stats(state: &mut WgpuRenderState) {
    let entry = ensure_wgpu_render_stats_mutable(state);
    entry.batch_flush_count = 0;
    entry.draw_call_count = 0;
    entry.instance_count = 0;
    entry.texture_upload_count = 0;
}
