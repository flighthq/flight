use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogLevel, LogStateRef, log_once};

use crate::tray::set_tray_animation_guard;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::RwLock;

    use flight_log::create_log_state;

    use super::*;

    fn clock() -> Arc<dyn Fn() -> f64 + Send + Sync> {
        return Arc::new(|| 0.0);
    }

    #[test]
    fn tray_animation_state_disable_guards_matches_disable_tray_guards() {
        let logs: LogStateRef = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (
            TrayAnimationState { guard: None },
            TrayAnimationState { guard: None },
        );
        enable_tray_guards(&mut a, &logs, clock());
        enable_tray_guards(&mut b, &logs, clock());
        a.disable_guards();
        disable_tray_guards(&mut b);
        assert_eq!(a.guard.is_none(), b.guard.is_none());
        assert!(a.guard.is_none());
    }

    #[test]
    fn tray_animation_state_enable_guards_matches_enable_tray_guards() {
        let logs: LogStateRef = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (
            TrayAnimationState { guard: None },
            TrayAnimationState { guard: None },
        );
        a.enable_guards(&logs, clock());
        enable_tray_guards(&mut b, &logs, clock());
        assert_eq!(a.guard.is_some(), b.guard.is_some());
        assert!(a.guard.is_some());
    }
}

/// Uninstalls the guard installed by `enable_tray_guards`.
// flight-lint: allow(conform-params) D5: caller-owned animation state replaces the TS module-level guard slot
pub fn disable_tray_guards(state: &mut TrayAnimationState) {
    set_tray_animation_guard(state, None);
}

/// Installs the caller-facing tray guard (opt-in, dev-only) on `state`. It warns once, through
/// flight-log, when `start_tray_icon_animation` is given a non-positive interval: such an interval
/// does not fail, it rewrites the icon as fast as the host schedules timers. The animation still
/// starts. The log state and clock are captured now; the clock is sampled when a warning is logged.
///
/// In the TypeScript original this calls `logOnce` from `@flighthq/log` against the process log.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned animation state, log state and clock replace hidden process state
pub fn enable_tray_guards(
    state: &mut TrayAnimationState,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: TrayAnimationGuard = Arc::new(
        move |_tray: &Ref<TrayIcon>, _frame_count: i32, interval_ms: f64| {
            if interval_ms > 0.0 {
                return;
            }
            let message = format!(
                "startTrayIconAnimation: intervalMs is {}, so the icon will be rewritten as fast as the host schedules timers rather than on a frame interval. Pass a positive millisecond interval.",
                format_tray_interval(interval_ms)
            );
            log_once(
                &log_state,
                clock(),
                "tray:non-positive-animation-interval",
                LogLevel::Warn,
                message.into(),
                Some("tray".to_string()),
            );
        },
    );
    set_tray_animation_guard(state, Some(guard));
}

// flight-lint: allow(f64) D1: the interval is a millisecond duration
fn format_tray_interval(interval_ms: f64) -> String {
    if interval_ms.is_infinite() {
        return if interval_ms > 0.0 {
            "Infinity"
        } else {
            "-Infinity"
        }
        .to_string();
    }
    if interval_ms == interval_ms.trunc() {
        return format!("{}", interval_ms as i64);
    }
    return format!("{}", interval_ms);
}

impl TrayAnimationState {
    pub fn disable_guards(&mut self) {
        disable_tray_guards(self);
    }

    // flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
    pub fn enable_guards(
        &mut self,
        log_state: &LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        enable_tray_guards(self, log_state, clock);
    }
}
