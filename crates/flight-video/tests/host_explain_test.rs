use std::sync::{Arc, RwLock};

use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation,
};
use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_video::contract::*;

// An entry another group's explainer already appended: each explainer appends after it.
fn composed_so_far() -> HostExplanation {
    return HostExplanation {
        capabilities: Vec::new(),
        groups: vec![HostCapabilityGroupExplanation {
            group: "earlier".to_string(),
            slots: Vec::new(),
        }],
    };
}

fn empty_video() -> HostVideoCapabilities {
    return HostVideoCapabilities { playback: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_video_capability() -> HostVideoCapability {
    return HostVideoCapability {
        provider: Arc::new(()),
        add_ended_listener: None,
        attach_stream: None,
        can_play_type: Arc::new(|_| unreachable!("fixture")),
        create_object_url: None,
        create_video_element: None,
        get_current_time: None,
        get_duration: None,
        get_height: None,
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: None,
        is_ready: None,
        load_url: None,
        pause: None,
        play: None,
        release_element: None,
        remove_ended_listener: None,
        revoke_object_url: None,
        set_current_time: None,
        set_loop: None,
        set_muted: None,
        set_playback_rate: None,
        set_volume: None,
    };
}

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

mod enable_host_video_guards {
    use super::*;

    #[test]
    fn warns_once_per_guarded_capability_the_group_is_missing() {
        let entries = capture_log(|state| enable_host_video_guards(state, 0.0, &empty_video()));
        assert!(entries.iter().all(|entry| entry.level == LogLevel::Warn));
        let slots: Vec<String> = entries.iter().map(slot_of).collect();
        assert_eq!(slots, vec!["video.playback".to_string()]);
    }

    #[test]
    fn says_nothing_at_all_when_every_guarded_capability_is_present() {
        let mut video = empty_video();
        video.playback = Some(fixture_host_video_capability());
        let entries = capture_log(|state| enable_host_video_guards(state, 0.0, &video));
        assert!(entries.is_empty());
    }

    #[test]
    fn warns_once_across_groups_because_the_log_once_key_is_the_slot_rather_than_the_group() {
        let entries = capture_log(|state| {
            enable_host_video_guards(state, 0.0, &empty_video());
            enable_host_video_guards(state, 0.0, &empty_video());
        });
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn carries_the_remedy_and_its_backends_as_structured_data_not_only_as_prose() {
        let entries = capture_log(|state| enable_host_video_guards(state, 0.0, &empty_video()));
        let entry = entries
            .iter()
            .find(|entry| slot_of(entry) == "video.playback")
            .unwrap();
        assert_eq!(text(field(entry, "group")), "video");
        assert_eq!(text(field(entry, "capability")), "HostVideoCapability");
        let LogValue::Array(backends) = field(entry, "backends") else {
            panic!("a backends array");
        };
        let backends: Vec<String> = backends.iter().map(text).collect();
        assert_eq!(backends, vec!["webHost (@flighthq/host-web)".to_string()]);
        assert!(text(field(entry, "message")).contains("getHostVideo"));
        assert_eq!(entry.channel.as_deref(), Some("host"));
    }
}

mod explain_host_video {
    use super::*;

    #[test]
    fn names_the_accessor_the_slot_and_where_to_get_the_capability_when_it_is_absent() {
        let explanation = explain_host_video(&empty_video());
        assert!(!explanation.is_present);
        assert_eq!(explanation.capability, "HostVideoCapability");
        assert_eq!(explanation.group, "video");
        assert_eq!(explanation.slot, "playback");
        assert_eq!(
            explanation.message,
            "getHostVideo: host.video.playback is absent, so nothing can decode or present video \u{2014} build the host from webHost in @flighthq/host-web"
        );
        assert_eq!(
            explanation.backends,
            vec![HostCapabilityBackend {
                entry_point: "webHost".to_string(),
                package_name: "@flighthq/host-web".to_string(),
                platform: "Web".to_string(),
            }]
        );
        for backend in &explanation.backends {
            assert!(explanation.message.contains(&backend.entry_point));
            assert!(explanation.message.contains(&backend.package_name));
        }
    }

    #[test]
    fn reports_presence_without_a_remedy_when_the_slot_is_filled() {
        let mut video = empty_video();
        video.playback = Some(fixture_host_video_capability());
        let explanation = explain_host_video(&video);
        assert!(explanation.is_present);
        assert_eq!(
            explanation.message,
            "getHostVideo: host.video.playback is present"
        );
    }
}

mod explain_host_video_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_video_capabilities(&mut out, &empty_video());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "video".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostVideoCapability".to_string(),
                group: "video".to_string(),
                is_present: false,
                slot: "playback".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_playback_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut video = empty_video();
        video.playback = Some(fixture_host_video_capability());
        let mut out = composed_so_far();
        explain_host_video_capabilities(&mut out, &video);
        assert_eq!(out.groups[1].slots, vec!["playback".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostVideoCapability".to_string(),
                group: "video".to_string(),
                is_present: true,
                slot: "playback".to_string(),
            },]
        );
    }
}
