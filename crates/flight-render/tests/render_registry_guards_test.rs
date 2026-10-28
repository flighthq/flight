use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_render::*;
use flight_signals::emit_signal;

use crate::support::{NOOP_RENDERER, node_with_kind};

mod are_render_registries_guards_enabled {
    use super::*;

    #[test]
    fn registry_guards_report_state_local_enablement() {
        let mut state = create_render_state();
        assert!(!are_render_registries_guards_enabled(&state));
        enable_render_registries_guards(&mut state, None);
        assert!(are_render_registries_guards_enabled(&state));
    }
}

mod enable_render_registries_guards {
    use super::*;

    #[test]
    fn enable_render_registries_guards_is_idempotent() {
        let mut state = create_render_state();
        enable_render_registries_guards(&mut state, None);
        let signals = state.runtime.registry_signals.as_ref().unwrap().clone();
        enable_render_registries_guards(&mut state, None);
        assert!(Arc::ptr_eq(
            &signals.on_registry_miss.data,
            &state
                .runtime
                .registry_signals
                .as_ref()
                .unwrap()
                .on_registry_miss
                .data
        ));
    }

    #[test]
    fn registry_guards_are_silent_for_registered_renderer() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(1);
        add_log_sink(&log_state, sink.sink.clone());
        let mut state = create_render_state();
        enable_render_registries_guards(&mut state, Some(log_state));
        register_node_renderer(&mut state, "acme.Registered".to_string(), &NOOP_RENDERER);
        create_render_proxy(&mut state, &node_with_kind("acme.Registered"));
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());
    }

    fn emit_miss(state: &mut BaseRenderState, kind: &str) {
        let signals = enable_render_registry_signals(state);
        emit_signal(
            &signals.on_registry_miss,
            &(RenderRegistryTable::TextureResolver, kind.to_string()),
        );
    }

    fn entry_count(sink: &flight_log::MemoryLogSink) -> usize {
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, sink);
        return entries.len();
    }

    // Every enable overwrites the destination: re-enabling with None silences later misses while
    // the installed listener and the recorded miss history stay.
    #[test]
    fn re_enabling_with_none_silences_future_warnings_and_keeps_miss_history() {
        let mut state = create_render_state();
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        enable_render_registries_guards(&mut state, Some(log_state));
        emit_miss(&mut state, "acme.First");
        assert_eq!(entry_count(&sink), 1);
        enable_render_registries_guards(&mut state, None);
        emit_miss(&mut state, "acme.Second");
        assert_eq!(entry_count(&sink), 1);
        assert!(are_render_registries_guards_enabled(&state));
        assert_eq!(explain_render_registries_misses(&state).misses.len(), 2);
    }

    // The installed listener reads the current destination when a miss arrives, so a later enable
    // with a different log state redirects warnings without reinstalling.
    #[test]
    fn re_enabling_with_another_log_state_redirects_future_warnings() {
        let mut state = create_render_state();
        let first = Arc::new(RwLock::new(create_log_state()));
        let first_sink = create_memory_log_sink(8);
        add_log_sink(&first, first_sink.sink.clone());
        let second = Arc::new(RwLock::new(create_log_state()));
        let second_sink = create_memory_log_sink(8);
        add_log_sink(&second, second_sink.sink.clone());
        enable_render_registries_guards(&mut state, None);
        enable_render_registries_guards(&mut state, Some(first));
        emit_miss(&mut state, "acme.First");
        enable_render_registries_guards(&mut state, Some(second));
        emit_miss(&mut state, "acme.Second");
        assert_eq!(entry_count(&first_sink), 1);
        assert_eq!(entry_count(&second_sink), 1);
    }
}

mod explain_render_registries_misses {
    use super::*;

    #[test]
    fn explain_registry_misses_deduplicates_in_event_order() {
        let mut state = create_render_state();
        enable_render_registries_guards(&mut state, None);
        let signals = enable_render_registry_signals(&mut state);
        emit_signal(
            &signals.on_registry_miss,
            &(
                RenderRegistryTable::TextureResolver,
                "acme.Texture".to_string(),
            ),
        );
        emit_signal(
            &signals.on_registry_miss,
            &(
                RenderRegistryTable::TextureResolver,
                "acme.Texture".to_string(),
            ),
        );
        emit_signal(
            &signals.on_registry_miss,
            &(
                RenderRegistryTable::ShapeCommandHandler,
                "acme.ShapeCommand".to_string(),
            ),
        );
        assert_eq!(
            explain_render_registries_misses(&state),
            RenderRegistriesMissExplanation {
                misses: vec![
                    RenderRegistriesMiss {
                        kind: "acme.Texture".to_string(),
                        registry: RenderRegistryTable::TextureResolver,
                    },
                    RenderRegistriesMiss {
                        kind: "acme.ShapeCommand".to_string(),
                        registry: RenderRegistryTable::ShapeCommandHandler,
                    },
                ],
                status: RenderRegistriesMissStatus::MissesRecorded,
            }
        );
    }

    #[test]
    fn explain_registry_misses_is_complete_before_miss() {
        let state = create_render_state();
        assert_eq!(
            explain_render_registries_misses(&state),
            RenderRegistriesMissExplanation {
                misses: Vec::new(),
                status: RenderRegistriesMissStatus::Complete,
            }
        );
    }
}

mod record_render_registries_miss {
    use super::*;

    #[test]
    fn registry_guards_warn_once_per_state_registry_and_kind() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(4);
        add_log_sink(&log_state, sink.sink.clone());
        let mut first = create_render_state();
        let mut second = create_render_state();
        enable_render_registries_guards(&mut first, Some(log_state.clone()));
        enable_render_registries_guards(&mut second, Some(log_state));
        let missing = node_with_kind("acme.Missing");
        create_render_proxy(&mut first, &missing);
        create_render_proxy(&mut first, &missing);
        record_render_registries_miss(
            &mut first,
            RenderRegistryTable::NodeRenderer,
            "acme.Missing".to_string(),
        );
        create_render_proxy(&mut second, &missing);
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 2);
        let LogData::Record(data) = &entries[0].data else {
            panic!("expected registry miss record");
        };
        assert!(matches!(data.get("kind"), Some(LogValue::Str(value)) if value == "acme.Missing"));
        assert!(matches!(
            data.get("message"),
            Some(LogValue::Str(value))
                if value == "createRenderProxy: node kind has no registered renderer — call registerNodeRenderer(state, kind, renderer)"
        ));
    }

    // The source picks backend-specific wording by probing the state's members; a state with no
    // `gl`, `device` or `element` member gets the Canvas wording.
    #[test]
    fn names_the_canvas_entry_point_for_a_backend_neutral_state() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(4);
        add_log_sink(&log_state, sink.sink.clone());
        let mut state = create_render_state();
        assert_eq!(state.render_backend(), RenderStateBackend::Canvas);
        enable_render_registries_guards(&mut state, Some(log_state));
        record_render_registries_miss(
            &mut state,
            RenderRegistryTable::TextureResolver,
            "acme.Missing".to_string(),
        );
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        let LogData::Record(data) = &entries[0].data else {
            panic!("expected registry miss record");
        };
        assert!(matches!(
            data.get("message"),
            Some(LogValue::Str(value))
                if value == "resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(resolvers, sourceKind, resolver) on the set the caller resolves through"
        ));
    }
}
