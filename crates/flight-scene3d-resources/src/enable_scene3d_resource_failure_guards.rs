use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_image::contract::{
    explain_image_resource_reference_resolution, get_image_resource_failure_kind_string,
    get_image_resource_reference_kind_string,
};
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_signals::{connect_signal, disconnect_signal};

use crate::get_scene3d_resource_textures::get_image_resource_reference_identity;
use crate::resolve_scene3d_resources::get_image_resource_reference_failure;
use crate::scene_resource_signals::enable_scene3d_resource_signals;
use crate::types::*;

/// Whether the failure guard is installed on `resolver`.
pub fn are_scene3d_resource_failure_guards_enabled(
    resolver: &Ref<Scene3DResourceResolver>,
) -> bool {
    let state = resolver.read().unwrap().state.clone();
    return state.read().unwrap().failure_guard.is_some();
}

/// Removes the resolver-scoped guard. Repeated calls are harmless.
pub fn disable_scene3d_resource_failure_guards(resolver: &Ref<Scene3DResourceResolver>) {
    let state = resolver.read().unwrap().state.clone();
    let Some(guard) = state.read().unwrap().failure_guard else {
        return;
    };
    let signals = enable_scene3d_resource_signals(resolver);
    {
        let signals = signals.read().unwrap();
        disconnect_signal(&signals.on_resource_failed, guard.failed);
        disconnect_signal(&signals.on_resource_resolved, guard.resolved);
    }
    state.write().unwrap().failure_guard = None;
}

/// Installs an opt-in warning guard over the resolver's failure signal. The resolver still settles
/// normally and never panics for an expected unavailable image. One shared reference warns once per
/// failed attempt, even when several texture subscribers receive the event. Idempotent.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5 caller-owned log state plus a live clock replace the source's module log and ambient time
pub fn enable_scene3d_resource_failure_guards(
    resolver: &Ref<Scene3DResourceResolver>,
    log_state: &LogStateRef,
    clock: Scene3DResourceFailureClock,
) -> Arc<dyn Fn() + Send + Sync> {
    let state = resolver.read().unwrap().state.clone();
    let dispose_resolver = resolver.clone();
    let dispose: Arc<dyn Fn() + Send + Sync> =
        Arc::new(move || disable_scene3d_resource_failure_guards(&dispose_resolver));
    if state.read().unwrap().failure_guard.is_some() {
        return dispose;
    }
    let warned: Ref<HashMap<usize, Scene3DResourceFailureIdentity>> =
        Arc::new(RwLock::new(HashMap::new()));
    let signals = enable_scene3d_resource_signals(resolver);
    let failed_warned = warned.clone();
    let failed_state = state.clone();
    let log_state = log_state.clone();
    let failed = Arc::new(move |event: &Scene3DResourceEvent| {
        let key = get_image_resource_reference_identity(&event.reference);
        let failure = get_image_resource_reference_failure(&event.reference);
        {
            let mut warned = failed_warned.write().unwrap();
            if let Some(previous) = warned.get(&key)
                && is_same_failure_identity(previous, &failure)
            {
                return;
            }
            warned.insert(key, failure);
        }
        let explanation = explain_image_resource_reference_resolution(&event.reference);
        // The attempt counter keys each warning uniquely; the source keeps it beside its module-level
        // guard table, here it lives with the resolver-scoped guard.
        let attempt = {
            let mut runtime = failed_state.write().unwrap();
            runtime.failure_attempt += 1;
            runtime.failure_attempt
        };
        let explained = explanation
            .failure
            .as_ref()
            .map(|failure| failure.read().unwrap().clone());
        let mut data = HashMap::new();
        data.insert(
            "failureKind".to_string(),
            explained
                .as_ref()
                .map(|failure| {
                    LogValue::Str(get_image_resource_failure_kind_string(failure.kind).to_string())
                })
                .unwrap_or(LogValue::Null),
        );
        data.insert(
            "failureMessage".to_string(),
            explained
                .as_ref()
                .map(|failure| LogValue::Str(failure.message.clone()))
                .unwrap_or(LogValue::Null),
        );
        data.insert(
            "failureName".to_string(),
            explained
                .as_ref()
                .and_then(|failure| failure.name.clone())
                .map(LogValue::Str)
                .unwrap_or(LogValue::Null),
        );
        data.insert(
            "message".to_string(),
            LogValue::Str(
                "Scene3D resource acquisition failed — call retryFailedScene3DResources to request it again"
                    .to_string(),
            ),
        );
        data.insert(
            "resourceKind".to_string(),
            LogValue::Str(get_image_resource_reference_kind_string(explanation.kind).to_string()),
        );
        let _ = log_once(
            &log_state,
            clock(),
            &format!("scene-resources:image-resource-resolution-failed:{attempt}"),
            LogLevel::Warn,
            LogData::Record(data).into(),
            Some("scene-resources".to_string()),
        );
    });
    let resolved_warned = warned.clone();
    let resolved = Arc::new(move |event: &Scene3DResourceEvent| {
        let key = get_image_resource_reference_identity(&event.reference);
        resolved_warned.write().unwrap().remove(&key);
    });
    let slots = {
        let signals = signals.read().unwrap();
        Scene3DResourceFailureGuardSlots {
            failed: connect_signal(&signals.on_resource_failed, failed, None),
            resolved: connect_signal(&signals.on_resource_resolved, resolved, None),
        }
    };
    state.write().unwrap().failure_guard = Some(slots);
    return dispose;
}

fn is_same_failure_identity(
    a: &Scene3DResourceFailureIdentity,
    b: &Scene3DResourceFailureIdentity,
) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
}
