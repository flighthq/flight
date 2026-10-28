use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::scene2d_resource_diagnostics::set_scene2d_resource_failure_guard;
use crate::types::*;

// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module-level enabled flag
pub fn are_scene2d_resource_failure_guards_enabled(
    guard_state: &Scene2DResourceFailureGuardStateRef,
) -> bool {
    return guard_state.read().unwrap().enabled;
}

// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module-level hook and enabled flag
pub fn disable_scene2d_resource_failure_guards(guard_state: &Scene2DResourceFailureGuardStateRef) {
    set_scene2d_resource_failure_guard(guard_state, None);
    guard_state.write().unwrap().enabled = false;
}

/// Installs opt-in warnings while preserving every null/unresolved sentinel.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5 caller-owned guard and log state plus a live clock replace module state and ambient time
pub fn enable_scene2d_resource_failure_guards(
    guard_state: &Scene2DResourceFailureGuardStateRef,
    log_state: &LogStateRef,
    clock: Scene2DResourceFailureClock,
) {
    let log_state = log_state.clone();
    let guard: Scene2DResourceFailureGuard = Arc::new(move |notice| {
        warn_on_scene2d_resource_failure(&log_state, clock(), notice);
    });
    set_scene2d_resource_failure_guard(guard_state, Some(guard));
    guard_state.write().unwrap().enabled = true;
}

fn operation_string(operation: Scene2DResourceFailureOperation) -> &'static str {
    return match operation {
        Scene2DResourceFailureOperation::CreateScene2DDocumentFromBytes => {
            "createScene2DDocumentFromBytes"
        }
        Scene2DResourceFailureOperation::LoadScene2DAudioResources => "loadScene2DAudioResources",
        Scene2DResourceFailureOperation::LoadScene2DDocumentFromUrl => "loadScene2DDocumentFromUrl",
        Scene2DResourceFailureOperation::LoadScene2DImageResources => "loadScene2DImageResources",
        Scene2DResourceFailureOperation::ResolveScene2DResources => "resolveScene2DResources",
    };
}

fn reason_string(reason: Scene2DResourceFailureReason) -> &'static str {
    return match reason {
        Scene2DResourceFailureReason::AudioResourcesUnresolved => "audio-resources-unresolved",
        Scene2DResourceFailureReason::DocumentFetchFailed => "document-fetch-failed",
        Scene2DResourceFailureReason::DocumentImportFailed => "document-import-failed",
        Scene2DResourceFailureReason::DocumentImporterMissing => "document-importer-missing",
        Scene2DResourceFailureReason::ImageResourcesUnresolved => "image-resources-unresolved",
        Scene2DResourceFailureReason::RequiredSlotsUnresolved => "required-slots-unresolved",
    };
}

// flight-lint: allow(f64) D1: operation time is a millisecond log timestamp
fn warn_on_scene2d_resource_failure(
    log_state: &LogStateRef,
    now_ms: f64,
    notice: &Scene2DResourceFailureNotice,
) {
    let message = match notice.reason {
        Scene2DResourceFailureReason::AudioResourcesUnresolved => {
            "Scene2D audio resource loading left selected references unresolved — inspect result.unresolved and call explainAudioResourceReferenceResolution for each failure"
        }
        Scene2DResourceFailureReason::DocumentFetchFailed => {
            "Scene2D document acquisition returned null — verify the URL and the caller-supplied fetch seam"
        }
        Scene2DResourceFailureReason::DocumentImportFailed => {
            "A matching Scene2D document importer rejected the acquired bytes — verify the payload and MIME hint"
        }
        Scene2DResourceFailureReason::DocumentImporterMissing => {
            "No registered Scene2D document importer matched the bytes — register the required format importer"
        }
        Scene2DResourceFailureReason::ImageResourcesUnresolved => {
            "Scene2D image resource loading left selected references unresolved — inspect result.unresolved and call explainImageResourceReferenceResolution for each failure"
        }
        Scene2DResourceFailureReason::RequiredSlotsUnresolved => {
            "Scene2D slot resolution left required slots unresolved — inspect result.unresolved and supply content for each required reference"
        }
    };
    let mut data = HashMap::new();
    data.insert("message".to_string(), LogValue::Str(message.to_string()));
    data.insert(
        "operation".to_string(),
        LogValue::Str(operation_string(notice.operation).to_string()),
    );
    data.insert(
        "reason".to_string(),
        LogValue::Str(reason_string(notice.reason).to_string()),
    );
    data.insert(
        "total".to_string(),
        LogValue::Number((notice.total as i64) as f64),
    );
    data.insert(
        "unresolved".to_string(),
        LogValue::Number((notice.unresolved as i64) as f64),
    );
    data.insert(
        "url".to_string(),
        notice
            .url
            .as_ref()
            .map(|url| LogValue::Str(url.clone()))
            .unwrap_or(LogValue::Null),
    );
    let key = format!("scene2d-resources:{}", reason_string(notice.reason));
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("scene2d-resources".to_string()),
    );
}
