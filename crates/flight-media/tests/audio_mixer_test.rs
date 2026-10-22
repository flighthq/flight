use std::sync::{Arc, Mutex};

use flight_audio::AudioChannelState;
use flight_entity::Entity;
use flight_host::AudioDeviceHandle;

use super::*;

fn routed() -> (
    Arc<Mutex<AudioMockState>>,
    HostAudioDeviceCapability,
    Arc<Mutex<MixerMockState>>,
    HostAudioMixerCapability,
    flight_entity::Ref<AudioMixer>,
    flight_entity::Ref<AudioBus>,
    flight_entity::Ref<AudioChannel>,
) {
    let (audio_state, audio_host) = audio_host();
    let (mixer_state, mixer_host) = mixer_host();
    let mixer = create_audio_mixer(&mixer_host, AudioDeviceHandle(1), None);
    let bus = create_audio_bus();
    let channel =
        play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
    route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &channel, &bus);
    return (
        audio_state,
        audio_host,
        mixer_state,
        mixer_host,
        mixer,
        bus,
        channel,
    );
}

mod add_audio_bus_to_mixer {
    use super::*;

    #[test]
    fn creates_one_node_per_bus_identity() {
        let (state, host) = mixer_host();
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        add_audio_bus_to_mixer(&host, &mixer, &bus);
        add_audio_bus_to_mixer(&host, &mixer, &bus);
        assert_eq!(
            state
                .lock()
                .unwrap()
                .events
                .iter()
                .filter(|event| event.starts_with("create-bus"))
                .count(),
            1
        );
    }

    #[test]
    fn keeps_same_handle_values_from_independent_mixers_separate() {
        let (_, first_host) = mixer_host();
        let (second_state, second_host) = mixer_host();
        let first = create_audio_mixer(&first_host, AudioDeviceHandle(1), None);
        let second = create_audio_mixer(&second_host, AudioDeviceHandle(2), None);
        let bus = create_audio_bus();
        add_audio_bus_to_mixer(&first_host, &first, &bus);
        add_audio_bus_to_mixer(&second_host, &second, &bus);
        destroy_audio_mixer(&first_host, &first);
        let guards = create_audio_mixer_guard_state();
        set_audio_bus_gain(&second_host, &guards, &bus, 0.5);
        assert_eq!(
            second_state
                .lock()
                .unwrap()
                .events
                .iter()
                .filter(|event| *event == "bus-gain:1:2:0.5")
                .count(),
            1
        );
    }
}

mod create_audio_bus {
    use super::*;

    #[test]
    fn creates_a_bus_with_default_values() {
        let bus = create_audio_bus();
        let bus = bus.read().unwrap();
        assert_eq!(
            (bus.gain, bus.muted, bus.name.as_str(), bus.pan),
            (1.0, false, "", 0.0)
        );
    }

    #[test]
    fn callers_configure_public_fields_after_construction() {
        let bus = create_audio_bus();
        {
            let mut bus = bus.write().unwrap();
            bus.gain = 0.5;
            bus.muted = true;
            bus.name = "music".to_string();
            bus.pan = -0.25;
        }
        let bus = bus.read().unwrap();
        assert_eq!(
            (bus.gain, bus.muted, bus.name.as_str(), bus.pan),
            (0.5, true, "music", -0.25)
        );
    }
}

mod create_audio_mixer {
    use super::*;

    #[test]
    fn creates_entity_identity_and_applies_muted_master_gain() {
        let (state, host) = mixer_host();
        let options = AudioMixerOptions {
            master_gain: Some(0.4),
            master_muted: Some(true),
        };
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(9), Some(&options));
        assert!(mixer.read().unwrap().entity_runtime().data.is_none());
        assert_eq!(
            (
                mixer.read().unwrap().master_gain,
                mixer.read().unwrap().master_muted
            ),
            (0.4, true)
        );
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"create-graph:9:0".to_string())
        );
    }
}

mod destroy_audio_mixer {
    use super::*;

    #[test]
    fn stops_channels_destroys_nodes_and_graph_once() {
        let (audio_state, _, mixer_state, host, mixer, _, channel) = routed();
        destroy_audio_mixer(&host, &mixer);
        destroy_audio_mixer(&host, &mixer);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Stopped);
        assert!(
            audio_state
                .lock()
                .unwrap()
                .events
                .contains(&"destroy-source:20".to_string())
        );
        let events = mixer_state.lock().unwrap().events.clone();
        assert_eq!(
            events
                .iter()
                .filter(|event| event == &&"destroy-graph:1".to_string())
                .count(),
            1
        );
        assert!(events.contains(&"destroy-bus:1:2".to_string()));
    }
}

mod fade_audio_bus_gain {
    use super::*;

    #[test]
    fn schedules_on_member_node_and_stores_target_immediately() {
        let (_, _, state, host, mixer, bus, _) = routed();
        fade_audio_bus_gain(&host, &mixer, &bus, 0.25, 200.0);
        assert_eq!(bus.read().unwrap().gain, 0.25);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"bus-fade:1:2:0.25:200".to_string())
        );
        let orphan = create_audio_bus();
        fade_audio_bus_gain(&host, &mixer, &orphan, 0.7, 10.0);
        assert_eq!(orphan.read().unwrap().gain, 0.7);
    }
}

mod get_audio_mixer_active_channels {
    use super::*;

    #[test]
    fn returns_a_detached_identity_snapshot() {
        let (_, audio_host, _, host, mixer, bus, first) = routed();
        let second =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        route_audio_channel_to_mixer_bus(&host, &mixer, &second, &bus);
        let mut out = Vec::with_capacity(4);
        out.push(second.clone());
        let capacity = out.capacity();

        get_audio_mixer_active_channels(&mut out, &mixer);
        assert_eq!(out.len(), 2);
        assert_eq!(out.capacity(), capacity);
        assert!(Arc::ptr_eq(&out[0], &first));
        assert!(Arc::ptr_eq(&out[1], &second));

        unroute_audio_channel_from_mixer_bus(&host, &mixer, &first);
        assert_eq!(out.len(), 2);
        get_audio_mixer_active_channels(&mut out, &mixer);
        assert_eq!(out.len(), 1);
        assert_eq!(out.capacity(), capacity);
        assert!(Arc::ptr_eq(&out[0], &second));

        unroute_audio_channel_from_mixer_bus(&host, &mixer, &second);
        get_audio_mixer_active_channels(&mut out, &mixer);
        assert!(out.is_empty());
        assert_eq!(out.capacity(), capacity);
    }
}

mod initialize_audio_bus {
    use super::*;

    #[test]
    fn restores_defaults_while_preserving_identity_and_mixer_membership() {
        let (state, host) = mixer_host();
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        add_audio_bus_to_mixer(&host, &mixer, &bus);
        let id = flight_entity::get_entity_id(&*bus.read().unwrap());
        {
            let mut bus = bus.write().unwrap();
            flight_entity::set_entity_uid(&mut *bus, "retained-bus".to_string());
            bus.gain = 2.0;
            bus.muted = true;
            bus.name = "fx".to_string();
            bus.pan = 0.5;
            initialize_audio_bus(&mut bus);
            assert_eq!(flight_entity::get_entity_id(&*bus), id);
            assert_eq!(flight_entity::get_entity_uid(&mut *bus), "retained-bus");
            assert_eq!(
                (bus.gain, bus.muted, bus.name.as_str(), bus.pan),
                (1.0, false, "", 0.0)
            );
        }
        let guards = create_audio_mixer_guard_state();
        set_audio_bus_gain(&host, &guards, &bus, 0.25);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"bus-gain:1:2:0.25".to_string())
        );
    }
}

mod initialize_audio_mixer {
    use super::*;

    #[test]
    fn derives_host_graph_and_source_fields_without_replacing_entity_identity() {
        let (state, host) = mixer_host();
        let options = AudioMixerOptions {
            master_gain: Some(0.25),
            master_muted: Some(true),
        };
        let mut mixer: AudioMixer = flight_entity::allocate_entity();
        flight_entity::set_entity_uid(&mut mixer, "mixer".to_string());
        initialize_audio_mixer(&mut mixer, &host, AudioDeviceHandle(7), Some(&options));
        assert_eq!(flight_entity::get_entity_uid(&mut mixer), "mixer");
        assert_eq!((mixer.master_gain, mixer.master_muted), (0.25, true));
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"create-graph:7:0".to_string())
        );
    }
}

mod pause_all_audio_mixer_channels {
    use super::*;

    #[test]
    fn pauses_only_playing_channels_and_releases_their_sources() {
        let (audio_state, _, _, _, mixer, _, channel) = routed();
        pause_all_audio_mixer_channels(&mixer);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Paused);
        assert!(
            audio_state
                .lock()
                .unwrap()
                .events
                .contains(&"destroy-source:20".to_string())
        );
    }
}

mod resume_all_audio_mixer_channels {
    use super::*;

    #[test]
    fn resumes_exactly_channels_the_mixer_paused_once() {
        let (_, _, _, _, mixer, _, channel) = routed();
        pause_all_audio_mixer_channels(&mixer);
        resume_all_audio_mixer_channels(&mixer);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Playing);
        pause_audio_channel(&channel);
        resume_all_audio_mixer_channels(&mixer);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Paused);
    }

    #[test]
    fn leaves_a_caller_paused_channel_paused() {
        let (_, audio_host) = audio_host();
        let (_, mixer_host) = mixer_host();
        let mixer = create_audio_mixer(&mixer_host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        let mixer_paused =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        let caller_paused =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &mixer_paused, &bus);
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &caller_paused, &bus);
        pause_audio_channel(&caller_paused);
        pause_all_audio_mixer_channels(&mixer);
        resume_all_audio_mixer_channels(&mixer);
        assert_eq!(
            mixer_paused.read().unwrap().state,
            AudioChannelState::Playing
        );
        assert_eq!(
            caller_paused.read().unwrap().state,
            AudioChannelState::Paused
        );
    }

    #[test]
    fn does_not_resume_a_channel_unrouted_or_stopped_while_paused() {
        let (_, audio_host) = audio_host();
        let (_, mixer_host) = mixer_host();
        let mixer = create_audio_mixer(&mixer_host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        let unrouted =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &unrouted, &bus);
        pause_all_audio_mixer_channels(&mixer);
        unroute_audio_channel_from_mixer_bus(&mixer_host, &mixer, &unrouted);
        resume_all_audio_mixer_channels(&mixer);
        assert_eq!(unrouted.read().unwrap().state, AudioChannelState::Paused);

        let stopped =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &stopped, &bus);
        pause_all_audio_mixer_channels(&mixer);
        stop_all_audio_mixer_channels(&mixer);
        resume_all_audio_mixer_channels(&mixer);
        assert_eq!(stopped.read().unwrap().state, AudioChannelState::Stopped);
    }
}

mod route_audio_channel_to_mixer_bus {
    use super::*;

    #[test]
    fn records_activity_and_reapplies_route_to_replacement_sources() {
        let (_, _, state, _, mixer, _, channel) = routed();
        pause_audio_channel(&channel);
        resume_audio_channel(&channel);
        let mut channels = Vec::new();
        get_audio_mixer_active_channels(&mut channels, &mixer);
        assert_eq!(channels.len(), 1);
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"route:1:20:2".to_string()));
        assert!(events.contains(&"route:1:21:2".to_string()));
    }

    #[test]
    fn uses_the_provider_passed_to_each_operation_not_the_constructor_provider() {
        let (_, construction_host) = mixer_host();
        let (operation_state, operation_host) = mixer_host();
        let (_, audio_host) = audio_host();
        let mixer = create_audio_mixer(&construction_host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        let channel =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        let guards = create_audio_mixer_guard_state();
        add_audio_bus_to_mixer(&operation_host, &mixer, &bus);
        set_audio_bus_gain(&operation_host, &guards, &bus, 0.5);
        set_audio_bus_muted(&operation_host, &guards, &bus, true);
        set_audio_bus_pan(&operation_host, &guards, &bus, 0.25);
        fade_audio_bus_gain(&operation_host, &mixer, &bus, 0.75, 100.0);
        set_audio_mixer_master_gain(&operation_host, &mixer, 0.4);
        set_audio_mixer_master_muted(&operation_host, &mixer, true);
        route_audio_channel_to_mixer_bus(&operation_host, &mixer, &channel, &bus);
        unroute_audio_channel_from_mixer_bus(&operation_host, &mixer, &channel);
        destroy_audio_mixer(&operation_host, &mixer);
        let events = operation_state.lock().unwrap().events.clone();
        for prefix in [
            "create-bus",
            "bus-gain",
            "bus-pan",
            "bus-fade",
            "master",
            "route",
            "unroute",
            "default",
            "destroy-bus",
            "destroy-graph",
        ] {
            assert!(
                events.iter().any(|event| event.starts_with(prefix)),
                "missing {prefix}"
            );
        }
    }
}

mod set_audio_bus_gain {
    use super::*;

    #[test]
    fn updates_every_membership_through_the_provider_passed_to_the_write() {
        let (_, first_host) = mixer_host();
        let first_mixer = create_audio_mixer(&first_host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        add_audio_bus_to_mixer(&first_host, &first_mixer, &bus);
        let (second_state, second_host) = mixer_host();
        let guards = create_audio_mixer_guard_state();
        assert_eq!(set_audio_bus_gain(&second_host, &guards, &bus, 0.4), 0.4);
        assert!(
            second_state
                .lock()
                .unwrap()
                .events
                .contains(&"bus-gain:1:2:0.4".to_string())
        );
    }
}

mod set_audio_bus_mixer_guard {
    use super::*;

    #[test]
    fn reports_each_unmixed_operation_and_is_silent_after_uninstall() {
        let (_, host) = mixer_host();
        let guards = create_audio_mixer_guard_state();
        let bus = create_audio_bus();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        set_audio_bus_mixer_guard(
            &guards,
            Some(Arc::new(move |operation, _bus| {
                captured.lock().unwrap().push(operation)
            })),
        );
        set_audio_bus_gain(&host, &guards, &bus, 0.5);
        set_audio_bus_muted(&host, &guards, &bus, true);
        set_audio_bus_pan(&host, &guards, &bus, 0.2);
        set_audio_bus_mixer_guard(&guards, None);
        set_audio_bus_gain(&host, &guards, &bus, 0.6);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                AudioBusMixerOperation::Gain,
                AudioBusMixerOperation::Mute,
                AudioBusMixerOperation::Pan
            ]
        );
    }
}

mod set_audio_bus_muted {
    use super::*;

    #[test]
    fn pushes_zero_then_restores_stored_gain() {
        let (_, _, state, host, _, bus, _) = routed();
        let guards = create_audio_mixer_guard_state();
        set_audio_bus_gain(&host, &guards, &bus, 0.3);
        set_audio_bus_muted(&host, &guards, &bus, true);
        set_audio_bus_muted(&host, &guards, &bus, false);
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"bus-gain:1:2:0".to_string()));
        assert_eq!(
            events
                .iter()
                .filter(|event| *event == "bus-gain:1:2:0.3")
                .count(),
            2
        );
    }
}

mod set_audio_bus_pan {
    use super::*;

    #[test]
    fn clamps_and_pushes_pan_to_each_node() {
        let (_, _, state, host, _, bus, _) = routed();
        let guards = create_audio_mixer_guard_state();
        assert_eq!(set_audio_bus_pan(&host, &guards, &bus, 4.0), 1.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"bus-pan:1:2:1".to_string())
        );
    }
}

mod set_audio_mixer_master_gain {
    use super::*;

    #[test]
    fn updates_graph_and_preserves_zero_while_muted() {
        let (_, host) = mixer_host();
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(1), None);
        assert_eq!(set_audio_mixer_master_gain(&host, &mixer, 0.2), 0.2);
        set_audio_mixer_master_muted(&host, &mixer, true);
        assert_eq!(set_audio_mixer_master_gain(&host, &mixer, 0.8), 0.8);
    }
}

mod set_audio_mixer_master_muted {
    use super::*;

    #[test]
    fn mutes_to_zero_and_unmutes_to_stored_gain() {
        let (state, host) = mixer_host();
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(1), None);
        set_audio_mixer_master_gain(&host, &mixer, 0.6);
        assert!(set_audio_mixer_master_muted(&host, &mixer, true));
        assert!(!set_audio_mixer_master_muted(&host, &mixer, false));
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"master:1:0".to_string()));
        assert!(events.contains(&"master:1:0.6".to_string()));
    }
}

mod stop_all_audio_mixer_channels {
    use super::*;

    #[test]
    fn stops_underlying_sources_and_clears_active_snapshot() {
        let (audio_state, _, _, _, mixer, _, channel) = routed();
        stop_all_audio_mixer_channels(&mixer);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Stopped);
        let mut channels = Vec::new();
        get_audio_mixer_active_channels(&mut channels, &mixer);
        assert!(channels.is_empty());
        assert!(
            audio_state
                .lock()
                .unwrap()
                .events
                .contains(&"destroy-source:20".to_string())
        );
    }

    #[test]
    fn stops_every_routed_channel() {
        let (_, audio_host) = audio_host();
        let (_, mixer_host) = mixer_host();
        let mixer = create_audio_mixer(&mixer_host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        let first = play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
            .unwrap();
        let second =
            play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None)
                .unwrap();
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &first, &bus);
        route_audio_channel_to_mixer_bus(&mixer_host, &mixer, &second, &bus);
        stop_all_audio_mixer_channels(&mixer);
        assert_eq!(first.read().unwrap().state, AudioChannelState::Stopped);
        assert_eq!(second.read().unwrap().state, AudioChannelState::Stopped);
    }
}

mod unroute_audio_channel_from_mixer_bus {
    use super::*;

    #[test]
    fn removes_activity_and_routes_the_live_source_to_default() {
        let (_, _, state, host, mixer, _, channel) = routed();
        unroute_audio_channel_from_mixer_bus(&host, &mixer, &channel);
        let mut channels = Vec::new();
        get_audio_mixer_active_channels(&mut channels, &mixer);
        assert!(channels.is_empty());
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"unroute:1:20".to_string()));
        assert!(events.contains(&"default:1:20".to_string()));
    }
}
