use crate::asset_library::set_asset_acquire_guard;
use crate::enums::{AssetLoadStatus, get_asset_load_status_string};
use crate::types::{AssetAcquireGuard, AssetLibrary, AssetLoadExplanation};
use flight_entity::Ref;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use std::collections::HashMap;
use std::sync::Arc;

pub fn are_asset_guards_enabled(library: &Ref<AssetLibrary>) -> bool {
    let runtime = library.read().unwrap().library_runtime.clone();
    let runtime = runtime.read().unwrap();
    return match (&runtime.acquire_guard, &runtime.warning_guard) {
        (Some(current), Some(expected)) => Arc::ptr_eq(current, expected),
        _ => false,
    };
}

pub fn disable_asset_guards(library: &Ref<AssetLibrary>) {
    set_asset_acquire_guard(library, None);
}

// flight-lint: allow(conform-params) D5 caller-owned canonical LogState replaces the ambient logger; the library retains its original canonical host clock
pub fn enable_asset_guards(library: &Ref<AssetLibrary>, log_state: &LogStateRef) {
    let log_state = log_state.clone();
    let runtime = library.read().unwrap().library_runtime.clone();
    let context = runtime.read().unwrap().context.clone().unwrap();
    let guard: AssetAcquireGuard = Arc::new(move |_, explanation| {
        let explanation = explanation.read().unwrap().clone();
        warn_on_asset_acquire_failure(&explanation, &log_state, &context);
    });
    let runtime = library.read().unwrap().library_runtime.clone();
    runtime.write().unwrap().warning_guard = Some(guard.clone());
    set_asset_acquire_guard(library, Some(guard));
}

fn warn_on_asset_acquire_failure(
    explanation: &AssetLoadExplanation,
    log_state: &LogStateRef,
    context: &flight_loader::ResourceLoaderContext,
) {
    if explanation.status != AssetLoadStatus::MissingDescriptor
        && explanation.status != AssetLoadStatus::MissingLoader
    {
        return;
    }
    let message = if explanation.status == AssetLoadStatus::MissingDescriptor {
        format!(
            "acquireAsset: no descriptor is registered for id \"{}\"; call registerAssetDescriptor or registerAssetManifest before acquiring it.",
            explanation.id
        )
    } else {
        format!(
            "acquireAsset: no loader is registered for type \"{}\"; call registerAssetLoader before acquiring \"{}\".",
            explanation.r#type.as_deref().unwrap_or(""),
            explanation.id
        )
    };
    let status = get_asset_load_status_string(explanation.status);
    let key = format!(
        "assets:acquire:{status}:{}:{}",
        explanation.r#type.as_deref().unwrap_or(""),
        explanation.id
    );
    let mut data = HashMap::new();
    data.insert("id".to_string(), LogValue::Str(explanation.id.clone()));
    data.insert(
        "refCount".to_string(),
        LogValue::Number((explanation.ref_count as i64) as f64),
    );
    data.insert("status".to_string(), LogValue::Str(status.to_string()));
    data.insert(
        "type".to_string(),
        explanation
            .r#type
            .as_ref()
            .map(|value| LogValue::Str(value.clone()))
            .unwrap_or(LogValue::Null),
    );
    data.insert("message".to_string(), LogValue::Str(message));
    log_once(
        log_state,
        (context.timers.now_ms)(),
        &key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("assets".to_string()),
    );
}
