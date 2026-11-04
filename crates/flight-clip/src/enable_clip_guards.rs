use std::sync::Arc;

use crate::clip_log::log_clip_warning;
use crate::clip_region::{
    set_clip_region_contours_guard, set_clip_region_release_guard, set_clip_region_use_guard,
};
use crate::clip_region_strings::get_clip_region_contours_reason_string;
use crate::types::LogState;

const DOUBLE_RELEASE_MESSAGE: &str = "releaseClipRegion: this region is already in the pool, so it is being released twice. Two later acquireClipRegion calls will hand back the same object and the clips will alias each other. Every acquireClipRegion pairs with exactly one releaseClipRegion, and the region must not be used after release.";
const USE_AFTER_RELEASE_MESSAGE: &str = "A released ClipRegion was used while it was still in the pool. Do not retain or access a region after releaseClipRegion; acquire a new region before use.";

pub fn disable_clip_guards() {
    set_clip_region_contours_guard(None);
    set_clip_region_release_guard(None);
    set_clip_region_use_guard(None);
}

/// Installs the opt-in lifecycle diagnostics. The clock capability is captured now but sampled only
/// if an invalid contour, double release, or use-after-release is actually observed.
// flight-lint: allow(f64) the injected clock returns a millisecond operation timestamp
pub fn enable_clip_guards(log_state: &LogState, clock: Arc<dyn Fn() -> f64 + Send + Sync>) {
    let contour_log = log_state.clone();
    let contour_clock = clock.clone();
    set_clip_region_contours_guard(Some(Arc::new(move |explanation, _| {
        let reason = get_clip_region_contours_reason_string(explanation.reason);
        let key = format!("clip:invalid-contour:{reason}");
        let message = format!(
            "createClipRegionFromContours: contour {} has {} coordinates ({}). Contours require at least three complete x/y pairs.",
            explanation.contour_index, explanation.coordinate_count, reason
        );
        log_clip_warning(&contour_log, contour_clock(), &key, &message);
    })));

    let release_log = log_state.clone();
    let release_clock = clock.clone();
    set_clip_region_release_guard(Some(Arc::new(move |_| {
        log_clip_warning(
            &release_log,
            release_clock(),
            "clip:double-release",
            DOUBLE_RELEASE_MESSAGE,
        );
    })));

    let use_log = log_state.clone();
    set_clip_region_use_guard(Some(Arc::new(move |_| {
        log_clip_warning(
            &use_log,
            clock(),
            "clip:use-after-release",
            USE_AFTER_RELEASE_MESSAGE,
        );
    })));
}
