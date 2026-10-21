use std::sync::Arc;

use flight_log::{LogLevel, LogStateRef, log_once};

use crate::geometry_pool_guards::{
    GeometryPoolReleaseFunction, GeometryPoolReleaseGuard, get_geometry_pool_release_guard,
    set_geometry_pool_release_guard,
};

#[cfg(test)]
mod tests {
    use std::sync::RwLock;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use flight_log::{
        LogData, add_log_sink, clear_log_once_keys, create_log_state, create_memory_log_sink,
        get_memory_log_sink_entries, remove_log_sink,
    };

    use super::*;

    #[test]
    fn installed_callback_preserves_source_warning_keys_messages_and_log_once_behavior() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        clear_log_once_keys(&log_state);
        let handle = create_memory_log_sink(16);
        add_log_sink(&log_state, handle.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        let clock_calls_for_callback = clock_calls.clone();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(move || {
            return 1000.0 + clock_calls_for_callback.fetch_add(1, Ordering::SeqCst) as f64;
        });
        enable_geometry_pool_guards(&log_state, clock);
        let guard = get_geometry_pool_release_guard().expect("guard should be installed");
        let cases = [
            (
                GeometryPoolReleaseFunction::ReleaseMatrix,
                "releaseMatrix",
                "acquireMatrix or acquireIdentityMatrix",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseMatrix3,
                "releaseMatrix3",
                "acquireMatrix3 or acquireIdentityMatrix3",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseMatrix4,
                "releaseMatrix4",
                "acquireMatrix4 or acquireIdentityMatrix4",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseQuaternion,
                "releaseQuaternion",
                "acquireQuaternion or acquireIdentityQuaternion",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseRectangle,
                "releaseRectangle",
                "acquireRectangle or acquireEmptyRectangle",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseVector2,
                "releaseVector2",
                "acquireVector2 or acquireEmptyVector2",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseVector3,
                "releaseVector3",
                "acquireVector3 or acquireEmptyVector3",
            ),
            (
                GeometryPoolReleaseFunction::ReleaseVector4,
                "releaseVector4",
                "acquireVector4 or acquireEmptyVector4",
            ),
        ];

        for (release, _, _) in cases {
            guard(release);
            guard(release);
        }
        disable_geometry_pool_guards();
        remove_log_sink(&log_state, &handle.sink);

        let entries = get_memory_log_sink_entries(&handle);
        assert_eq!(clock_calls.load(Ordering::SeqCst), 16);
        assert_eq!(entries.len(), cases.len());
        for (index, entry) in entries.iter().enumerate() {
            let (_, release, acquire) = cases[index];
            assert_eq!(entry.level, LogLevel::Warn);
            assert_eq!(entry.channel, Some("geometry".to_string()));
            assert_eq!(entry.timestamp_ms, 1000.0 + (index * 2) as f64);
            match &entry.data {
                LogData::Message(message) => assert_eq!(
                    message,
                    &format!(
                        "{release}: this value is already in its pool, so it is being released twice. Two later matching acquire calls will hand back the same object and unrelated owners will alias each other. Every {acquire} call pairs with exactly one {release} call, and the value must not be used after release."
                    )
                ),
                _ => panic!("expected a message log entry"),
            }
        }
    }
}

pub fn are_geometry_pool_guards_enabled() -> bool {
    return get_geometry_pool_release_guard().is_some();
}

pub fn disable_geometry_pool_guards() {
    set_geometry_pool_release_guard(None);
}

/// Installs opt-in diagnostics for unbalanced geometry-pool brackets.
///
/// Safe Rust ownership makes the TypeScript source's double-release path
/// unreachable through the typed release functions. The installed callback
/// nevertheless preserves the source diagnostic contract for lowerings that
/// can establish that condition.
// flight-lint: allow(f64) D1: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned log state and clock replace hidden process state
pub fn enable_geometry_pool_guards(
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: GeometryPoolReleaseGuard = Arc::new(move |release_function| {
        warn_on_double_release(&log_state, clock(), release_function);
    });
    set_geometry_pool_release_guard(Some(guard));
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_double_release(
    log_state: &LogStateRef,
    now_ms: f64,
    release_function: GeometryPoolReleaseFunction,
) {
    let (release_function, acquire_functions) = match release_function {
        GeometryPoolReleaseFunction::ReleaseMatrix => {
            ("releaseMatrix", "acquireMatrix or acquireIdentityMatrix")
        }
        GeometryPoolReleaseFunction::ReleaseMatrix3 => {
            ("releaseMatrix3", "acquireMatrix3 or acquireIdentityMatrix3")
        }
        GeometryPoolReleaseFunction::ReleaseMatrix4 => {
            ("releaseMatrix4", "acquireMatrix4 or acquireIdentityMatrix4")
        }
        GeometryPoolReleaseFunction::ReleaseQuaternion => (
            "releaseQuaternion",
            "acquireQuaternion or acquireIdentityQuaternion",
        ),
        GeometryPoolReleaseFunction::ReleaseRectangle => (
            "releaseRectangle",
            "acquireRectangle or acquireEmptyRectangle",
        ),
        GeometryPoolReleaseFunction::ReleaseVector2 => {
            ("releaseVector2", "acquireVector2 or acquireEmptyVector2")
        }
        GeometryPoolReleaseFunction::ReleaseVector3 => {
            ("releaseVector3", "acquireVector3 or acquireEmptyVector3")
        }
        GeometryPoolReleaseFunction::ReleaseVector4 => {
            ("releaseVector4", "acquireVector4 or acquireEmptyVector4")
        }
    };
    let key = format!("geometry:double-release:{release_function}");
    let message = format!(
        "{release_function}: this value is already in its pool, so it is being released twice. Two later matching acquire calls will hand back the same object and unrelated owners will alias each other. Every {acquire_functions} call pairs with exactly one {release_function} call, and the value must not be used after release."
    );
    log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        message.into(),
        Some("geometry".to_string()),
    );
}
