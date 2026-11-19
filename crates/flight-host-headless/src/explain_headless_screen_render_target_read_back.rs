// flight-lint: allow-file(contract-vocabulary) native host: the explainer reads the SDK screen target's native capture slots
//! Why `create_bitmap_from_headless_screen_render_target` returns `None`: a separately importable
//! explainer over the SDK's own read-back conditions.

use flight_entity::Ref;
use flight_render_wgpu::{WgpuScreenRenderTarget, create_bitmap_from_wgpu_screen_render_target};

use crate::types::*;

/// Reports why reading `target` back would fail, as plain data. The SDK refuses a target with no
/// retained capture buffer, which is either capture never enabled or capture enabled with no
/// submitted frame since; those are told apart from the target's own capture flag. With a buffer
/// in place it re-runs the SDK read-back with `timeout_ms` and reports `Ready` or the map failure
/// in the SDK's words, so it agrees with the read-back by construction. The re-run maps and unmaps
/// the retained buffer once and keeps nothing.
pub fn explain_headless_screen_render_target_read_back(
    target: &Ref<WgpuScreenRenderTarget>,
    timeout_ms: Option<u32>,
) -> HeadlessReadBackExplanation {
    let (has_buffer, capture_enabled) = {
        let current = target.read().unwrap();
        (current.capture_buffer.is_some(), current.capture_enabled)
    };
    if !has_buffer {
        return HeadlessReadBackExplanation {
            message: String::new(),
            reason: if capture_enabled {
                HeadlessReadBackExplanationReason::NoCapturedFrame
            } else {
                HeadlessReadBackExplanationReason::CaptureNotEnabled
            },
        };
    }
    return match pollster::block_on(create_bitmap_from_wgpu_screen_render_target(
        target, timeout_ms,
    )) {
        Ok(_) => HeadlessReadBackExplanation {
            message: String::new(),
            reason: HeadlessReadBackExplanationReason::Ready,
        },
        Err(error) => HeadlessReadBackExplanation {
            message: error.message,
            reason: HeadlessReadBackExplanationReason::MapFailed,
        },
    };
}
