use std::sync::{Arc, RwLock};

use flight_host::contract::*;
use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};

use crate::fixtures::fill_slot;

// Group-qualified, because slot names are scoped by their group and repeat across the flat structure.
const GUARDED_SLOTS: [&str; 7] = [
    "audio.device",
    "audio.mixer",
    "image.loader",
    "input.ingress",
    "textSegment.segmenter",
    "textShaper.shaper",
    "video.playback",
];

// A fresh caller-owned log state per test is the source's `clearLogOnceKeys()` before each case.
fn capture_log(run: impl FnOnce(&LogStateRef)) -> Vec<LogEntry> {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(32);
    add_log_sink(&state, sink.sink.clone());
    run(&state);
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    return entries;
}

fn field<'a>(entry: &'a LogEntry, key: &str) -> &'a LogValue {
    let LogData::Record(record) = &entry.data else {
        panic!("a structured guard record");
    };
    return record.get(key).expect("a guard field");
}

fn text(value: &LogValue) -> String {
    let LogValue::Str(text) = value else {
        panic!("a string field");
    };
    return text.clone();
}

fn slot_of(entry: &LogEntry) -> String {
    return format!(
        "{}.{}",
        text(field(entry, "group")),
        text(field(entry, "slot"))
    );
}

fn host_with(slots: &[(&str, &str)]) -> Host {
    let mut host = create_host();
    for (group, slot) in slots {
        fill_slot(&mut host, group, slot);
    }
    return host;
}

mod enable_host_guards {
    use super::*;

    #[test]
    fn warns_once_per_commonly_needed_capability_a_host_is_missing() {
        let entries = capture_log(|state| enable_host_guards(state, 0.0, &create_host()));
        assert_eq!(entries.len(), GUARDED_SLOTS.len());
        assert!(entries.iter().all(|entry| entry.level == LogLevel::Warn));
        let mut slots: Vec<String> = entries.iter().map(slot_of).collect();
        slots.sort();
        let mut expected: Vec<String> = GUARDED_SLOTS.iter().map(|slot| slot.to_string()).collect();
        expected.sort();
        assert_eq!(slots, expected);
    }

    #[test]
    fn stays_silent_about_a_capability_the_host_actually_carries() {
        let host = host_with(&[("video", "playback")]);
        let entries = capture_log(|state| enable_host_guards(state, 0.0, &host));
        assert!(
            !entries
                .iter()
                .any(|entry| slot_of(entry) == "video.playback")
        );
        assert_eq!(entries.len(), GUARDED_SLOTS.len() - 1);
    }

    #[test]
    fn says_nothing_at_all_when_every_guarded_capability_is_present() {
        let host = host_with(&[
            ("audio", "device"),
            ("audio", "mixer"),
            ("image", "loader"),
            ("input", "ingress"),
            ("textSegment", "segmenter"),
            ("textShaper", "shaper"),
            ("video", "playback"),
        ]);
        let entries = capture_log(|state| enable_host_guards(state, 0.0, &host));
        assert!(entries.is_empty());
    }

    #[test]
    fn warns_once_across_hosts_because_the_log_once_key_is_the_slot_rather_than_the_host() {
        let entries = capture_log(|state| {
            enable_host_guards(state, 0.0, &create_host());
            enable_host_guards(state, 0.0, &create_host());
        });
        assert_eq!(entries.len(), GUARDED_SLOTS.len());
    }

    #[test]
    fn carries_the_remedy_and_its_backends_as_structured_data_not_only_as_prose() {
        let entries = capture_log(|state| enable_host_guards(state, 0.0, &create_host()));
        let video = entries
            .iter()
            .find(|entry| slot_of(entry) == "video.playback")
            .unwrap();
        assert_eq!(text(field(video, "group")), "video");
        assert_eq!(text(field(video, "capability")), "HostVideoCapability");
        let LogValue::Array(backends) = field(video, "backends") else {
            panic!("a backends array");
        };
        let backends: Vec<String> = backends.iter().map(text).collect();
        assert_eq!(backends, vec!["webHost (@flighthq/host-web)".to_string()]);
        assert!(text(field(video, "message")).contains("getHostVideo"));
        assert_eq!(video.channel.as_deref(), Some("host"));
    }
}
