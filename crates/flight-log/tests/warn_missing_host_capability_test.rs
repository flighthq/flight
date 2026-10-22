use std::sync::{Arc, RwLock};

use flight_host::{HostCapabilityBackend, HostCapabilityExplanation};
use flight_log::*;

fn capture_log(run: impl FnOnce(&LogStateRef)) -> Vec<LogEntry> {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(32);
    add_log_sink(&state, sink.sink.clone());
    run(&state);
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    return entries;
}

fn explanation(is_present: bool) -> HostCapabilityExplanation {
    return HostCapabilityExplanation {
        backends: vec![HostCapabilityBackend {
            entry_point: "webHost".to_string(),
            package_name: "@flighthq/host-web".to_string(),
            platform: "Web".to_string(),
        }],
        capability: "HostVideoCapability".to_string(),
        group: "video".to_string(),
        is_present,
        message: "getHostVideo: host.video.playback is absent".to_string(),
        slot: "playback".to_string(),
    };
}

fn field<'a>(entry: &'a LogEntry, key: &str) -> &'a LogValue {
    let LogData::Record(record) = &entry.data else {
        panic!("a structured record");
    };
    return record.get(key).expect("a field");
}

fn text(value: &LogValue) -> String {
    let LogValue::Str(text) = value else {
        panic!("a string field");
    };
    return text.clone();
}

mod warn_missing_host_capability {
    use super::*;

    #[test]
    fn warns_on_the_host_channel_with_the_explanation_as_structured_data() {
        let entries =
            capture_log(|state| warn_missing_host_capability(state, 0.0, &explanation(false)));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("host"));
        let entry = &entries[0];
        assert_eq!(text(field(entry, "group")), "video");
        assert_eq!(text(field(entry, "slot")), "playback");
        assert_eq!(text(field(entry, "capability")), "HostVideoCapability");
        assert_eq!(
            text(field(entry, "message")),
            "getHostVideo: host.video.playback is absent"
        );
        let LogValue::Array(backends) = field(entry, "backends") else {
            panic!("a backends array");
        };
        let backends: Vec<String> = backends.iter().map(text).collect();
        assert_eq!(backends, vec!["webHost (@flighthq/host-web)".to_string()]);
    }

    #[test]
    fn says_nothing_for_a_present_capability() {
        let entries =
            capture_log(|state| warn_missing_host_capability(state, 0.0, &explanation(true)));
        assert!(entries.is_empty());
    }

    #[test]
    fn warns_once_per_slot_however_often_it_is_called() {
        let entries = capture_log(|state| {
            warn_missing_host_capability(state, 0.0, &explanation(false));
            warn_missing_host_capability(state, 5.0, &explanation(false));
        });
        assert_eq!(entries.len(), 1);
    }
}
