use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::text_shaper_pool::set_shaped_run_release_guard;
use crate::types::*;

/// Uninstalls the guard installed by `enable_text_shaper_guards`.
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module guard slot
pub fn disable_text_shaper_guards(pool: &mut ShapedRunPool) {
    set_shaped_run_release_guard(pool, None);
}

/// Installs the dev-only pool guard: it warns once, through flight-log, when a pooled run is released
/// a second time (the pool already ignores the repeat). The log state and clock are captured now; the
/// clock is sampled when a warning is logged.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned pool, log state and clock replace hidden process state
pub fn enable_text_shaper_guards(
    pool: &mut ShapedRunPool,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: ShapedRunReleaseGuard = Arc::new(move |_run| {
        let mut record = HashMap::new();
        record.insert(
            "message".to_string(),
            LogValue::Str(
                "releaseShapedRun: this run is already in the pool, so it is being released twice. The repeated release was ignored to preserve the pool, but it indicates an unbalanced bracket. Every acquireShapedRun call must pair with exactly one releaseShapedRun call, and the run must not be used after release."
                    .to_string(),
            ),
        );
        log_once(
            &log_state,
            clock(),
            "textshaper:double-release",
            LogLevel::Warn,
            LogData::Record(record).into(),
            Some("textshaper".to_string()),
        );
    });
    set_shaped_run_release_guard(pool, Some(guard));
}
