use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::texture_atlas_region::{
    get_texture_atlas_region_texture_status_string, set_texture_atlas_region_texture_guard,
};
use crate::types::*;

/// Whether `enable_texture_atlas_guards` is in effect on this state.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module flag
pub fn are_texture_atlas_guards_enabled(state: &TextureAtlasGuardState) -> bool {
    return state.enabled;
}

/// Removes the region-texture guard and clears the enabled flag.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn disable_texture_atlas_guards(state: &mut TextureAtlasGuardState) {
    set_texture_atlas_region_texture_guard(state, None);
    state.enabled = false;
}

/// Installs the dev-only guard: it warns once, through flight-log, when a rotated page cannot mint a
/// region texture. The log state and clock are captured now; the clock is sampled when a warning is
/// logged.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, log state and clock replace hidden process state
pub fn enable_texture_atlas_guards(
    state: &mut TextureAtlasGuardState,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: TextureAtlasRegionTextureGuard = Arc::new(move |atlas, region_id, explanation| {
        if explanation.status != TextureAtlasRegionTextureStatus::RotatedPage {
            return;
        }
        let mut record = HashMap::new();
        record.insert("atlas".to_string(), LogValue::Object(atlas.clone()));
        record.insert(
            "message".to_string(),
            LogValue::Str(
                "getTextureAtlasRegionTexture: a page Texture with nonzero uvRotation cannot compose a region without shear; use an unrotated page window."
                    .to_string(),
            ),
        );
        record.insert("regionId".to_string(), LogValue::Int(i64::from(region_id)));
        record.insert(
            "status".to_string(),
            LogValue::Str(
                get_texture_atlas_region_texture_status_string(explanation.status).to_string(),
            ),
        );
        log_once(
            &log_state,
            clock(),
            "textureatlas:region-texture-rotated-page",
            LogLevel::Warn,
            LogData::Record(record).into(),
            Some("textureatlas".to_string()),
        );
    });
    set_texture_atlas_region_texture_guard(state, Some(guard));
    state.enabled = true;
}
