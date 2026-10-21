//! Caller-facing guard installation: warns when a compressed tile layer cannot be decoded
//! (TS `enableTilemapFormatsGuards.ts`).

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};

use crate::tiled_layer_data::{TiledGuardState, set_tiled_layer_data_guard};
use crate::types::{TiledCompression, TiledLayerDataFailure};

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces TS module-level uninstall
pub fn disable_tilemap_formats_guards(guard_state: &TiledGuardState) {
    set_tiled_layer_data_guard(guard_state, None);
}

// flight-lint: allow(conform-params) D5: caller-owned LogState and clock replace module state
// flight-lint: allow(f64) the injected clock returns a millisecond operation timestamp
pub fn enable_tilemap_formats_guards(
    guard_state: &TiledGuardState,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let state = log_state.clone();
    let guard = Arc::new(move |reason, compression| {
        warn_tiled_layer_data_failure(&state, now_ms, reason, compression);
    });
    set_tiled_layer_data_guard(guard_state, Some(guard));
}

// flight-lint: allow(f64) millisecond timestamps are passed through to the log contract
fn warn_tiled_layer_data_failure(
    state: &LogStateRef,
    now_ms: f64,
    reason: TiledLayerDataFailure,
    compression: TiledCompression,
) {
    if reason == TiledLayerDataFailure::CompressedWithoutInflate {
        let mut record = HashMap::new();
        record.insert(
            "message".to_string(),
            LogValue::Str(format!(
                "A tile layer is {}-compressed but no inflate seam was supplied, so it was preserved as an all-zero grid. Pass options.inflate to parseTiledTmx/parseTiledTmj to decode it.",
                compression.as_str(),
            )),
        );
        log_once(
            state,
            now_ms,
            "tilemap-formats:layer-compressed-without-inflate",
            LogLevel::Warn,
            LogDataOrProvider::Data(LogData::Record(record)),
            Some("tilemap-formats".to_string()),
        );
        return;
    }
    let mut record = HashMap::new();
    record.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "The supplied inflate seam returned null for a {}-compressed tile layer, so it was preserved as an all-zero grid. The payload or the seam's {} support is the fault, not the parse.",
            compression.as_str(),
            compression.as_str(),
        )),
    );
    log_once(
        state,
        now_ms,
        "tilemap-formats:layer-inflate-failed",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(record)),
        Some("tilemap-formats".to_string()),
    );
}
