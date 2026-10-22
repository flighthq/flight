use std::sync::{Arc, Mutex};

use flight_audio::{AudioChannelState, AudioPlayOptions, create_audio_resource};
use flight_host::{AudioDeviceHandle, AudioSourceHandle};
use flight_signals::{SignalConnectOptions, connect_signal};

use super::*;

fn channel() -> (
    Arc<Mutex<AudioMockState>>,
    HostAudioDeviceCapability,
    flight_entity::Ref<AudioChannel>,
) {
    let (state, host) = audio_host();
    let channel =
        play_audio_resource(&host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
    return (state, host, channel);
}

mod clear_audio_channel_loop_region {
    use super::*;

    #[test]
    fn clears_only_the_region() {
        let (_, _, channel) = channel();
        assert!(set_audio_channel_loop_region(&channel, 100.0, 500.0));
        channel.write().unwrap().loops = 3;
        clear_audio_channel_loop_region(&channel);
        let channel = channel.read().unwrap();
        assert_eq!(
            (channel.loop_start, channel.loop_end, channel.loops),
            (0.0, 0.0, 3)
        );
    }
}

mod destroy_audio_channel {
    use super::*;

    #[test]
    fn destroys_the_source_then_buffer_once() {
        let (state, _, channel) = channel();
        destroy_audio_channel(&channel);
        destroy_audio_channel(&channel);
        let events = state.lock().unwrap().events.clone();
        let destroy_source = events
            .iter()
            .position(|event| event == "destroy-source:20")
            .unwrap();
        let destroy_buffer = events
            .iter()
            .position(|event| event == "destroy-buffer:10")
            .unwrap();
        assert!(destroy_source < destroy_buffer);
        assert_eq!(
            events
                .iter()
                .filter(|event| *event == "destroy-buffer:10")
                .count(),
            1
        );
    }

    #[test]
    fn neither_stop_nor_natural_completion_frees_the_buffer() {
        let (stopped_state, _, stopped) = channel();
        stop_audio_channel(&stopped);
        assert!(
            !stopped_state
                .lock()
                .unwrap()
                .events
                .iter()
                .any(|event| event.starts_with("destroy-buffer"))
        );
        let (completed_state, _, completed) = channel();
        trigger_audio_end(&completed_state);
        assert_eq!(completed.read().unwrap().state, AudioChannelState::Complete);
        assert!(
            !completed_state
                .lock()
                .unwrap()
                .events
                .iter()
                .any(|event| event.starts_with("destroy-buffer"))
        );
    }
}

mod fade_audio_channel_gain {
    use super::*;

    #[test]
    fn delegates_milliseconds_to_the_selected_host() {
        let (state, host, channel) = channel();
        fade_audio_channel_gain(&host, &channel, 0.25, 125.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"fade:20:0.25:125".to_string())
        );
        assert_eq!(channel.read().unwrap().gain, 0.25);
    }

    #[test]
    fn falls_back_to_the_plain_gain_setter_without_fade_support() {
        let (state, mut host, channel) = channel();
        host.fade_source_gain = None;
        fade_audio_channel_gain(&host, &channel, 0.6, 500.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"gain:20:0.6".to_string())
        );
    }
}

mod get_audio_channel_current_time {
    use super::*;

    #[test]
    fn reads_the_live_device_clock_only_while_playing() {
        let (state, _, channel) = channel();
        state.lock().unwrap().time = 0.25;
        assert_eq!(get_audio_channel_current_time(&channel), 250.0);
        pause_audio_channel(&channel);
        state.lock().unwrap().time = 0.75;
        assert_eq!(get_audio_channel_current_time(&channel), 250.0);
    }
}

mod get_audio_channel_duration {
    use super::*;

    #[test]
    fn returns_buffer_duration_in_milliseconds() {
        let (_, _, channel) = channel();
        assert_eq!(get_audio_channel_duration(&channel), 1000.0);
    }
}

mod get_audio_channel_source_handle {
    use super::*;

    #[test]
    fn returns_live_handle_then_invalid_sentinel() {
        let (_, _, channel) = channel();
        assert_eq!(
            get_audio_channel_source_handle(&channel),
            AudioSourceHandle(20)
        );
        stop_audio_channel(&channel);
        assert_eq!(
            get_audio_channel_source_handle(&channel),
            AudioSourceHandle(0)
        );
    }
}

mod has_audio_channel_fade {
    use super::*;

    #[test]
    fn reflects_the_optional_host_operation() {
        let (_, mut host) = audio_host();
        assert!(has_audio_channel_fade(&host));
        host.fade_source_gain = None;
        assert!(!has_audio_channel_fade(&host));
    }
}

mod is_audio_channel_muted {
    use super::*;

    #[test]
    fn reports_stored_mute_state() {
        let (_, _, channel) = channel();
        assert!(!is_audio_channel_muted(&channel));
        assert!(set_audio_channel_muted(&channel, true));
        assert!(is_audio_channel_muted(&channel));
    }

    #[test]
    fn retains_a_mute_set_without_a_live_source() {
        let (_, _, channel) = channel();
        stop_audio_channel(&channel);
        set_audio_channel_muted(&channel, true);
        assert!(is_audio_channel_muted(&channel));
    }
}

mod is_audio_channel_playing {
    use super::*;

    #[test]
    fn tracks_play_and_pause_states() {
        let (_, _, channel) = channel();
        assert!(is_audio_channel_playing(&channel));
        pause_audio_channel(&channel);
        assert!(!is_audio_channel_playing(&channel));
    }
}

mod pause_audio_channel {
    use super::*;

    #[test]
    fn preserves_position_and_releases_the_active_source() {
        let (state, _, channel) = channel();
        state.lock().unwrap().time = 0.4;
        pause_audio_channel(&channel);
        let channel_value = channel.read().unwrap();
        assert_eq!(channel_value.current_time, 400.0);
        assert_eq!(channel_value.state, AudioChannelState::Paused);
        drop(channel_value);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"destroy-source:20".to_string())
        );
    }
}

mod play_audio_resource {
    use super::*;

    #[test]
    fn creates_the_buffer_starts_with_options_and_retains_source_identity() {
        let (state, host) = audio_host();
        let source = audio_resource();
        let options = AudioPlayOptions {
            current_time: Some(250.0),
            gain: Some(0.5),
            loops: Some(2),
            playback_rate: Some(1.5),
        };
        let channel =
            play_audio_resource(&host, AudioDeviceHandle(3), &source, Some(&options)).unwrap();
        let value = channel.read().unwrap();
        assert!(Arc::ptr_eq(&value.source, &source));
        assert_eq!(value.state, AudioChannelState::Playing);
        drop(value);
        let events = state.lock().unwrap().events.clone();
        assert!(
            events
                .iter()
                .any(|event| event == "create-buffer:3:2:48000:48000:2")
        );
        assert!(events.iter().any(|event| event == "start:20:0.25:0"));
        assert!(events.iter().any(|event| event == "resume:3"));
        let empty = create_audio_resource(None);
        assert!(play_audio_resource(&host, AudioDeviceHandle(3), &empty, None).is_none());
    }
}

mod resume_audio_channel {
    use super::*;

    #[test]
    fn creates_a_new_source_from_the_paused_position() {
        let (state, _, channel) = channel();
        state.lock().unwrap().time = 0.3;
        pause_audio_channel(&channel);
        resume_audio_channel(&channel);
        assert_eq!(
            get_audio_channel_source_handle(&channel),
            AudioSourceHandle(21)
        );
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Playing);
    }
}

mod set_audio_channel_current_time {
    use super::*;

    #[test]
    fn clamps_and_replaces_a_playing_source() {
        let (_, _, channel) = channel();
        assert_eq!(set_audio_channel_current_time(&channel, 2_000.0), 1_000.0);
        assert_eq!(
            get_audio_channel_source_handle(&channel),
            AudioSourceHandle(21)
        );
    }
}

mod set_audio_channel_gain {
    use super::*;

    #[test]
    fn updates_live_gain_but_defers_it_while_muted() {
        let (state, _, channel) = channel();
        set_audio_channel_gain(&channel, 0.4);
        set_audio_channel_muted(&channel, true);
        set_audio_channel_gain(&channel, 0.8);
        set_audio_channel_muted(&channel, false);
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"gain:20:0.4".to_string()));
        assert!(events.contains(&"gain:20:0".to_string()));
        assert!(events.contains(&"gain:20:0.8".to_string()));
    }
}

mod set_audio_channel_loop_region {
    use super::*;

    #[test]
    fn clamps_valid_regions_and_rejects_inverted_regions_without_change() {
        let (_, _, channel) = channel();
        assert!(set_audio_channel_loop_region(&channel, -100.0, 2_000.0));
        assert_eq!(
            (
                channel.read().unwrap().loop_start,
                channel.read().unwrap().loop_end
            ),
            (0.0, 1_000.0)
        );
        assert!(!set_audio_channel_loop_region(&channel, 800.0, 200.0));
        assert_eq!(
            (
                channel.read().unwrap().loop_start,
                channel.read().unwrap().loop_end
            ),
            (0.0, 1_000.0)
        );
    }

    #[test]
    fn bounds_every_counted_pass_and_restarts_at_the_region_floor() {
        let (state, host) = audio_host();
        let options = AudioPlayOptions {
            current_time: None,
            gain: None,
            loops: Some(1),
            playback_rate: None,
        };
        let channel = play_audio_resource(
            &host,
            AudioDeviceHandle(1),
            &audio_resource(),
            Some(&options),
        )
        .unwrap();
        assert!(set_audio_channel_loop_region(&channel, 200.0, 500.0));
        set_audio_channel_current_time(&channel, 0.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"start:21:0.2:0.3".to_string())
        );
        trigger_audio_end(&state);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"start:22:0.2:0.3".to_string())
        );
        trigger_audio_end(&state);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Complete);
    }
}

mod set_audio_channel_muted {
    use super::*;

    #[test]
    fn silences_without_pausing_or_losing_gain() {
        let (_, _, channel) = channel();
        set_audio_channel_gain(&channel, 0.3);
        set_audio_channel_muted(&channel, true);
        let channel = channel.read().unwrap();
        assert_eq!(channel.gain, 0.3);
        assert_eq!(channel.state, AudioChannelState::Playing);
    }

    #[test]
    fn carries_mute_to_replacement_sources() {
        let (state, _, channel) = channel();
        set_audio_channel_muted(&channel, true);
        set_audio_channel_current_time(&channel, 100.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"gain:21:0".to_string())
        );
    }
}

mod set_audio_channel_pan {
    use super::*;

    #[test]
    fn clamps_and_pushes_stereo_pan() {
        let (state, _, channel) = channel();
        assert_eq!(set_audio_channel_pan(&channel, 4.0), 1.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"pan:20:1".to_string())
        );
    }

    #[test]
    fn retains_stopped_pan_for_the_next_source() {
        let (state, _, channel) = channel();
        stop_audio_channel(&channel);
        set_audio_channel_pan(&channel, -0.75);
        resume_audio_channel(&channel);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"pan:21:-0.75".to_string())
        );
    }
}

mod set_audio_channel_playback_rate {
    use super::*;

    #[test]
    fn pushes_the_live_rate() {
        let (state, _, channel) = channel();
        assert_eq!(set_audio_channel_playback_rate(&channel, 2.0), 2.0);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"rate:20:2".to_string())
        );
    }
}

mod set_audio_channel_source_route {
    use super::*;

    #[test]
    fn applies_now_and_to_seek_loop_and_resume_replacements() {
        let (state, _, channel) = channel();
        let routed = Arc::new(Mutex::new(Vec::new()));
        let captured = routed.clone();
        set_audio_channel_source_route(
            &channel,
            Some(Arc::new(move |source| {
                captured.lock().unwrap().push(source)
            })),
        );
        set_audio_channel_current_time(&channel, 10.0);
        pause_audio_channel(&channel);
        resume_audio_channel(&channel);
        assert_eq!(
            *routed.lock().unwrap(),
            vec![
                AudioSourceHandle(20),
                AudioSourceHandle(21),
                AudioSourceHandle(22)
            ]
        );
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .iter()
                .any(|event| event == "start:22:0.01:0")
        );
    }

    #[test]
    fn retains_an_inactive_route_until_resume_and_allows_clearing_it() {
        let (_, _, channel) = channel();
        stop_audio_channel(&channel);
        let routed = Arc::new(Mutex::new(Vec::new()));
        let captured = routed.clone();
        set_audio_channel_source_route(
            &channel,
            Some(Arc::new(move |source| {
                captured.lock().unwrap().push(source)
            })),
        );
        assert!(routed.lock().unwrap().is_empty());
        resume_audio_channel(&channel);
        assert_eq!(*routed.lock().unwrap(), vec![AudioSourceHandle(21)]);
        stop_audio_channel(&channel);
        set_audio_channel_source_route(&channel, None);
        resume_audio_channel(&channel);
        assert_eq!(*routed.lock().unwrap(), vec![AudioSourceHandle(21)]);
    }
}

mod stop_audio_channel {
    use super::*;

    #[test]
    fn releases_source_resets_time_and_emits_completion_only_from_natural_end() {
        let (state, _, channel) = channel();
        let completions = Arc::new(Mutex::new(0));
        let captured = completions.clone();
        connect_signal(
            &channel.read().unwrap().on_complete,
            Arc::new(move |_| *captured.lock().unwrap() += 1),
            Some(&SignalConnectOptions {
                priority: None,
                once: None,
            }),
        );
        stop_audio_channel(&channel);
        assert_eq!(channel.read().unwrap().current_time, 0.0);
        assert_eq!(channel.read().unwrap().state, AudioChannelState::Stopped);
        trigger_audio_end(&state);
        assert_eq!(*completions.lock().unwrap(), 0);
    }
}
