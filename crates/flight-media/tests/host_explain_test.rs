use std::sync::{Arc, RwLock};

use flight_audio::HostAudioCodecCapability;
use flight_host::{
    HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation,
};
use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_media::contract::*;

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

fn empty_audio() -> HostAudioCapabilities {
    return HostAudioCapabilities {
        codec: None,
        device: None,
        mixer: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_audio_codec_capability() -> HostAudioCodecCapability {
    return HostAudioCodecCapability {
        can_play_type: Arc::new(|_| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

fn fixture_host_audio_device_capability() -> HostAudioDeviceCapability {
    return HostAudioDeviceCapability {
        provider: Arc::new(()),
        create_buffer: Arc::new(|_, _, _, _, _| unreachable!("fixture")),
        create_device: Arc::new(|_| unreachable!("fixture")),
        create_source: Arc::new(|_, _| unreachable!("fixture")),
        destroy_buffer: Arc::new(|_| unreachable!("fixture")),
        destroy_device: Arc::new(|_| unreachable!("fixture")),
        destroy_source: Arc::new(|_| unreachable!("fixture")),
        fade_source_gain: None,
        get_device_time: Arc::new(|_| unreachable!("fixture")),
        on_source_ended: Arc::new(|_, _| unreachable!("fixture")),
        resume_device: Arc::new(|_| unreachable!("fixture")),
        set_source_gain: Arc::new(|_, _| unreachable!("fixture")),
        set_source_pan: Arc::new(|_, _| unreachable!("fixture")),
        set_source_playback_rate: Arc::new(|_, _| unreachable!("fixture")),
        start_source: Arc::new(|_, _, _| unreachable!("fixture")),
        stop_source: Arc::new(|_| unreachable!("fixture")),
    };
}

fn fixture_host_audio_mixer_capability() -> HostAudioMixerCapability {
    return HostAudioMixerCapability {
        provider: Arc::new(()),
        create_mixer_graph: Arc::new(|_, _| unreachable!("fixture")),
        destroy_mixer_graph: Arc::new(|_| unreachable!("fixture")),
        create_bus_node: Arc::new(|_, _, _| unreachable!("fixture")),
        destroy_bus_node: Arc::new(|_, _| unreachable!("fixture")),
        set_bus_node_gain: Arc::new(|_, _, _| unreachable!("fixture")),
        set_bus_node_pan: Arc::new(|_, _, _| unreachable!("fixture")),
        fade_bus_node_gain: Arc::new(|_, _, _, _| unreachable!("fixture")),
        set_master_gain: Arc::new(|_, _| unreachable!("fixture")),
        route_source_to_bus: Arc::new(|_, _, _| unreachable!("fixture")),
        unroute_source: Arc::new(|_, _| unreachable!("fixture")),
        route_source_to_default: Arc::new(|_, _| unreachable!("fixture")),
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

mod enable_host_audio_guards {
    use super::*;

    #[test]
    fn warns_once_per_guarded_capability_the_group_is_missing() {
        let entries = capture_log(|state| enable_host_audio_guards(state, 0.0, &empty_audio()));
        assert!(entries.iter().all(|entry| entry.level == LogLevel::Warn));
        let slots: Vec<String> = entries.iter().map(slot_of).collect();
        assert_eq!(
            slots,
            vec!["audio.device".to_string(), "audio.mixer".to_string()]
        );
    }

    #[test]
    fn says_nothing_at_all_when_every_guarded_capability_is_present() {
        let mut audio = empty_audio();
        audio.device = Some(fixture_host_audio_device_capability());
        audio.mixer = Some(fixture_host_audio_mixer_capability());
        let entries = capture_log(|state| enable_host_audio_guards(state, 0.0, &audio));
        assert!(entries.is_empty());
    }

    #[test]
    fn warns_once_across_groups_because_the_log_once_key_is_the_slot_rather_than_the_group() {
        let entries = capture_log(|state| {
            enable_host_audio_guards(state, 0.0, &empty_audio());
            enable_host_audio_guards(state, 0.0, &empty_audio());
        });
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn carries_the_remedy_and_its_backends_as_structured_data_not_only_as_prose() {
        let entries = capture_log(|state| enable_host_audio_guards(state, 0.0, &empty_audio()));
        let entry = entries
            .iter()
            .find(|entry| slot_of(entry) == "audio.device")
            .unwrap();
        assert_eq!(text(field(entry, "group")), "audio");
        assert_eq!(
            text(field(entry, "capability")),
            "HostAudioDeviceCapability"
        );
        let LogValue::Array(backends) = field(entry, "backends") else {
            panic!("a backends array");
        };
        let backends: Vec<String> = backends.iter().map(text).collect();
        assert_eq!(backends, vec!["webHost (@flighthq/host-web)".to_string()]);
        assert!(text(field(entry, "message")).contains("getHostAudioDevice"));
        assert_eq!(entry.channel.as_deref(), Some("host"));
    }

    #[test]
    fn stays_silent_about_a_capability_the_group_actually_carries() {
        let mut audio = empty_audio();
        audio.device = Some(fixture_host_audio_device_capability());
        let entries = capture_log(|state| enable_host_audio_guards(state, 0.0, &audio));
        let slots: Vec<String> = entries.iter().map(slot_of).collect();
        assert_eq!(slots, vec!["audio.mixer".to_string()]);
    }
}

mod explain_host_audio_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_audio_capabilities(&mut out, &empty_audio());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "audio".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostAudioDeviceCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: false,
                    slot: "device".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostAudioMixerCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: false,
                    slot: "mixer".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_device_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut audio = empty_audio();
        audio.device = Some(fixture_host_audio_device_capability());
        let mut out = composed_so_far();
        explain_host_audio_capabilities(&mut out, &audio);
        assert_eq!(out.groups[1].slots, vec!["device".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostAudioDeviceCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: true,
                    slot: "device".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostAudioMixerCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: false,
                    slot: "mixer".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_mixer_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut audio = empty_audio();
        audio.mixer = Some(fixture_host_audio_mixer_capability());
        let mut out = composed_so_far();
        explain_host_audio_capabilities(&mut out, &audio);
        assert_eq!(out.groups[1].slots, vec!["mixer".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostAudioDeviceCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: false,
                    slot: "device".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostAudioMixerCapability".to_string(),
                    group: "audio".to_string(),
                    is_present: true,
                    slot: "mixer".to_string(),
                },
            ]
        );
    }

    #[test]
    fn lists_the_slot_keys_a_populated_group_actually_holds_in_source_order() {
        let mut audio = empty_audio();
        audio.codec = Some(fixture_host_audio_codec_capability());
        audio.device = Some(fixture_host_audio_device_capability());
        audio.mixer = Some(fixture_host_audio_mixer_capability());
        let mut out = composed_so_far();
        explain_host_audio_capabilities(&mut out, &audio);
        assert_eq!(
            out.groups[1].slots,
            vec![
                "codec".to_string(),
                "device".to_string(),
                "mixer".to_string()
            ]
        );
    }
}

mod explain_host_audio_device {
    use super::*;

    #[test]
    fn names_the_accessor_the_slot_and_where_to_get_the_capability_when_it_is_absent() {
        let explanation = explain_host_audio_device(&empty_audio());
        assert!(!explanation.is_present);
        assert_eq!(explanation.capability, "HostAudioDeviceCapability");
        assert_eq!(explanation.group, "audio");
        assert_eq!(explanation.slot, "device");
        assert_eq!(
            explanation.message,
            "getHostAudioDevice: host.audio.device is absent, so no audio can be decoded or played \u{2014} build the host from webHost in @flighthq/host-web"
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
        let mut audio = empty_audio();
        audio.device = Some(fixture_host_audio_device_capability());
        let explanation = explain_host_audio_device(&audio);
        assert!(explanation.is_present);
        assert_eq!(
            explanation.message,
            "getHostAudioDevice: host.audio.device is present"
        );
    }
}

mod explain_host_audio_mixer {
    use super::*;

    #[test]
    fn names_the_accessor_the_slot_and_where_to_get_the_capability_when_it_is_absent() {
        let explanation = explain_host_audio_mixer(&empty_audio());
        assert!(!explanation.is_present);
        assert_eq!(explanation.capability, "HostAudioMixerCapability");
        assert_eq!(explanation.group, "audio");
        assert_eq!(explanation.slot, "mixer");
        assert_eq!(
            explanation.message,
            "getHostAudioMixer: host.audio.mixer is absent, so sound transforms and mixer routing are inert \u{2014} build the host from webHost in @flighthq/host-web"
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
        let mut audio = empty_audio();
        audio.mixer = Some(fixture_host_audio_mixer_capability());
        let explanation = explain_host_audio_mixer(&audio);
        assert!(explanation.is_present);
        assert_eq!(
            explanation.message,
            "getHostAudioMixer: host.audio.mixer is present"
        );
    }
}
