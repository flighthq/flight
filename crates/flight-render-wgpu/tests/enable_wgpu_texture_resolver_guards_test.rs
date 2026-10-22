use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_render_wgpu::*;
use flight_texture::{TextureColorSpace, TextureVariant};

use crate::support::*;

fn resolve_nothing(
    _state: &mut WgpuRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    return None;
}

fn logger() -> (LogStateRef, MemoryLogSink) {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(4);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn entries(sink: &MemoryLogSink) -> Vec<LogEntry> {
    let mut out = Vec::new();
    get_memory_log_sink_entries(&mut out, sink);
    return out;
}

fn record_str(entry: &LogEntry, key: &str) -> Option<String> {
    let LogData::Record(record) = &entry.data else {
        return None;
    };
    let Some(LogValue::Str(value)) = record.get(key) else {
        return None;
    };
    return Some(value.clone());
}

mod are_wgpu_texture_resolver_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_diagnostics_were_installed_for_the_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(!are_wgpu_texture_resolver_guards_enabled(&state));

        enable_wgpu_texture_resolver_guards(&mut state, None);
        assert!(are_wgpu_texture_resolver_guards_enabled(&state));
    }
}

mod enable_wgpu_texture_resolver_guards {
    use super::*;

    #[test]
    fn is_idempotent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = logger();
        enable_wgpu_texture_resolver_guards(&mut state, Some(log_state.clone()));
        enable_wgpu_texture_resolver_guards(&mut state, Some(log_state));
        assert!(are_wgpu_texture_resolver_guards_enabled(&state));
        // A second enable connects no second listener: one miss records and logs once.
        let missing = create_test_texture_with_kind("acme.idempotent.wgpu", 4, 4);
        resolve_wgpu_texture(&mut state, &missing, None, None);
        assert_eq!(entries(&sink).len(), 1);
    }

    #[test]
    fn warns_once_for_a_missing_resolver_and_stays_silent_for_a_registered_resolver_returning_null()
    {
        let mut state = create_wgpu_render_state_for_test(None);
        let missing = create_test_texture_with_kind("acme.missing.wgpu", 4, 4);
        let registered = create_test_texture_with_kind("acme.registered.wgpu", 4, 4);
        let (log_state, sink) = logger();
        enable_wgpu_texture_resolver_guards(&mut state, Some(log_state));
        register_wgpu_texture_resolver(
            &mut state,
            "acme.registered.wgpu".to_string(),
            Some(resolve_nothing),
        );

        assert!(resolve_wgpu_texture(&mut state, &missing, None, None).is_none());
        assert!(resolve_wgpu_texture(&mut state, &missing, None, None).is_none());
        assert!(resolve_wgpu_texture(&mut state, &registered, None, None).is_none());

        let entries = entries(&sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(
            record_str(&entries[0], "kind").as_deref(),
            Some("acme.missing.wgpu")
        );
        assert_eq!(
            record_str(&entries[0], "message").as_deref(),
            Some(
                "resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)"
            )
        );
    }

    #[test]
    fn installs_the_mipmap_degraded_guard_on_the_runtime() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .mipmap_degraded_guard
                .is_none()
        );
        enable_wgpu_texture_resolver_guards(&mut state, None);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .mipmap_degraded_guard
                .is_some()
        );
    }

    #[test]
    fn logs_a_warning_when_mipmaps_are_requested_without_a_registered_generator() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (log_state, sink) = logger();
        enable_wgpu_texture_resolver_guards(&mut state, Some(log_state));
        let (canvas, _fake) = create_test_image(8, 8, true);
        assert!(bind_wgpu_texture(&mut state, &canvas, Some(true)).is_some());

        let entries = entries(&sink);
        assert_eq!(entries.len(), 1);
        assert!(
            record_str(&entries[0], "message")
                .expect("a message")
                .contains("no WGPU mipmap generator registered")
        );
    }
}
