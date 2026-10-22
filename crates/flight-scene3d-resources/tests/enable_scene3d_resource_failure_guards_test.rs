use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_image::contract::{ImageResourceFailure, ImageResourceFailureKind, ImageResourceReference};
use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_resource::ResourceResolutionState;
use flight_scene3d_resources::contract::*;
use flight_signals::emit_signal;

use crate::mock_host::MockHost;
use crate::support::*;

fn failure(kind: ImageResourceFailureKind, message: &str, name: Option<&str>) -> ImageResourceFailure {
    let mut out: ImageResourceFailure = allocate_entity();
    initialize_image_resource_failure(&mut out, kind, message.to_string(), name.map(str::to_string));
    return out;
}

fn failed_reference() -> ImageResourceReference {
    let reference = external_reference("bad.png");
    set_reference_resolution(
        &reference,
        Some(failure(ImageResourceFailureKind::Error, "bad image", Some("CodecError"))),
        ResourceResolutionState::Failed,
    );
    return reference;
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn clock() -> Scene3DResourceFailureClock {
    return Arc::new(|| 0.0);
}

fn string_field(entry: &LogEntry, key: &str) -> Option<String> {
    let LogData::Record(data) = &entry.data else {
        return None;
    };
    return match data.get(key) {
        Some(LogValue::Str(value)) => Some(value.clone()),
        _ => None,
    };
}

mod are_scene3d_resource_failure_guards_enabled {
    use super::*;

    #[test]
    fn tracks_resolver_scoped_enable_and_disable_state() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        assert!(!are_scene3d_resource_failure_guards_enabled(&resolver));
        enable_scene3d_resource_failure_guards(&resolver, &log_state(), clock());
        assert!(are_scene3d_resource_failure_guards_enabled(&resolver));
        disable_scene3d_resource_failure_guards(&resolver);
        assert!(!are_scene3d_resource_failure_guards_enabled(&resolver));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod disable_scene3d_resource_failure_guards {
    use super::*;

    #[test]
    fn is_harmless_when_the_guard_is_absent() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        disable_scene3d_resource_failure_guards(&resolver);
        assert!(!are_scene3d_resource_failure_guards_enabled(&resolver));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod enable_scene3d_resource_failure_guards {
    use super::*;

    #[test]
    fn warns_once_per_failed_attempt_names_recovery_and_does_not_change_resolver_settlement() {
        let host = MockHost::new();
        let sink = create_memory_log_sink(4);
        let logs = log_state();
        add_log_sink(&logs, sink.sink.clone());
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let signals = enable_scene3d_resource_signals(&resolver);
        let (failed, resolved) = {
            let signals = signals.read().unwrap();
            (signals.on_resource_failed.clone(), signals.on_resource_resolved.clone())
        };
        let reference = failed_reference();
        let texture = attach_texture(&reference);
        let dispose = enable_scene3d_resource_failure_guards(&resolver, &logs, clock());
        let event = Scene3DResourceEvent {
            reference: reference.clone(),
            texture,
        };

        emit_signal(&failed, &event);
        emit_signal(&failed, &event);
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel, Some("scene-resources".to_string()));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(string_field(&entries[0], "failureKind"), Some("Error".to_string()));
        assert_eq!(string_field(&entries[0], "failureMessage"), Some("bad image".to_string()));
        assert_eq!(string_field(&entries[0], "failureName"), Some("CodecError".to_string()));
        assert_eq!(
            string_field(&entries[0], "message"),
            Some(
                "Scene3D resource acquisition failed — call retryFailedScene3DResources to request it again"
                    .to_string()
            )
        );
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);

        emit_signal(&resolved, &event);
        set_reference_resolution(
            &reference,
            Some(failure(ImageResourceFailureKind::Unavailable, "still unavailable", None)),
            ResourceResolutionState::Failed,
        );
        emit_signal(&failed, &event);
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 2);
        dispose();
        emit_signal(&resolved, &event);
        emit_signal(&failed, &event);
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 2);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn is_idempotent_for_one_resolver() {
        let host = MockHost::new();
        let sink = create_memory_log_sink(4);
        let logs = log_state();
        add_log_sink(&logs, sink.sink.clone());
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let signals = enable_scene3d_resource_signals(&resolver);
        let reference = failed_reference();
        let texture = attach_texture(&reference);
        let first_dispose = enable_scene3d_resource_failure_guards(&resolver, &logs, clock());
        let second_dispose = enable_scene3d_resource_failure_guards(&resolver, &logs, clock());

        let failed = signals.read().unwrap().on_resource_failed.clone();
        emit_signal(&failed, &Scene3DResourceEvent { reference, texture });
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        second_dispose();
        assert!(!are_scene3d_resource_failure_guards_enabled(&resolver));
        first_dispose();
        dispose_scene3d_resource_resolver(&resolver);
    }
}
