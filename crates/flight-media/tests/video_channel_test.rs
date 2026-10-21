use std::sync::Arc;

use flight_video::{
    VideoChannelState, VideoPlayOptions, create_video_resource, destroy_video_resource,
};

use super::*;

fn channel() -> (
    Arc<std::sync::Mutex<VideoMockState>>,
    flight_video::HostVideoCapability,
    flight_hostcapability::HostSpawnCapability,
    flight_entity::Ref<flight_video::VideoResource>,
    flight_entity::Ref<VideoChannel>,
) {
    let (state, host) = video_host();
    let spawn = immediate_spawn();
    let resource = video_resource();
    let runtime_state = create_video_channel_runtime_state();
    let channel = play_video_resource(&host, &spawn, &runtime_state, &resource, None).unwrap();
    return (state, host, spawn, resource, channel);
}

fn listener_count(
    state: &Arc<std::sync::Mutex<VideoMockState>>,
    element: &Arc<flight_bitmap::HostImageSource>,
) -> usize {
    let element = Arc::downgrade(element);
    return state
        .lock()
        .unwrap()
        .listeners
        .iter()
        .filter(|(source, _)| source.ptr_eq(&element))
        .count();
}

fn listener_for(
    state: &Arc<std::sync::Mutex<VideoMockState>>,
    element: &Arc<flight_bitmap::HostImageSource>,
) -> flight_video::VideoEndedListener {
    let element = Arc::downgrade(element);
    return state
        .lock()
        .unwrap()
        .listeners
        .iter()
        .find(|(source, _)| source.ptr_eq(&element))
        .map(|(_, listener)| listener.clone())
        .unwrap();
}

mod destroy_video_channel {
    use super::*;

    #[test]
    fn composes_with_resource_and_texture_teardown_channel_first() {
        let (_, host, _, resource, channel) = channel();
        let mut texture =
            flight_video::create_video_texture(&host, &resource.read().unwrap(), None);
        assert_eq!(
            flight_video::get_video_texture_width(&host, &texture),
            640.0
        );
        destroy_video_channel(&host, &channel);
        flight_video::destroy_video_texture(&mut texture);
        destroy_video_resource(&host, &mut resource.write().unwrap());
        assert!(channel.read().unwrap().source.is_none());
        assert!(resource.read().unwrap().element.is_none());
        assert!(flight_texture::get_texture_source(&texture).is_none());
        assert_eq!(flight_video::get_video_texture_width(&host, &texture), -1.0);
    }

    #[test]
    fn composes_with_resource_and_texture_teardown_resource_first() {
        let (_, host, _, resource, channel) = channel();
        let mut texture =
            flight_video::create_video_texture(&host, &resource.read().unwrap(), None);
        destroy_video_resource(&host, &mut resource.write().unwrap());
        flight_video::destroy_video_texture(&mut texture);
        destroy_video_channel(&host, &channel);
        assert!(channel.read().unwrap().source.is_none());
        assert!(resource.read().unwrap().element.is_none());
        assert!(flight_texture::get_texture_source(&texture).is_none());
        assert_eq!(flight_video::get_video_texture_width(&host, &texture), -1.0);
    }

    #[test]
    fn detaches_pauses_and_resets_without_destroying_the_borrowed_resource() {
        let (state, host, _, resource, channel) = channel();
        destroy_video_channel(&host, &channel);
        destroy_video_channel(&host, &channel);
        let channel = channel.read().unwrap();
        assert!(channel.source.is_none());
        assert_eq!(channel.state, VideoChannelState::Stopped);
        assert_eq!(channel.current_time, 0.0);
        drop(channel);
        assert!(resource.read().unwrap().element.is_some());
        let events = state.lock().unwrap().events.clone();
        assert_eq!(
            events
                .iter()
                .filter(|event| *event == "remove-ended")
                .count(),
            1
        );
        assert_eq!(events.iter().filter(|event| *event == "pause").count(), 1);
    }

    #[test]
    fn retains_element_long_enough_to_detach_after_resource_teardown() {
        let (state, host, _, resource, channel) = channel();
        destroy_video_resource(&host, &mut resource.write().unwrap());
        destroy_video_channel(&host, &channel);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"remove-ended".to_string())
        );
    }

    #[test]
    fn removes_the_current_original_element_runtime_after_resource_loss_only() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let runtime_state = create_video_channel_runtime_state();
        let original = video_element();
        let other = video_element();
        let resource = video_resource_with_element(original.clone());
        let other_resource = video_resource_with_element(other.clone());
        let channel = play_video_resource(&host, &spawn, &runtime_state, &resource, None).unwrap();
        let _other_channel =
            play_video_resource(&host, &spawn, &runtime_state, &other_resource, None).unwrap();
        destroy_video_resource(&host, &mut resource.write().unwrap());
        destroy_video_channel(&host, &channel);
        assert_eq!(listener_count(&state, &original), 0);
        assert_eq!(listener_count(&state, &other), 1);
        assert!(
            state
                .lock()
                .unwrap()
                .listener_events
                .last()
                .unwrap()
                .ends_with(":true")
        );
    }
}

mod get_video_channel_current_time {
    use super::*;

    #[test]
    fn reads_seconds_from_host_as_milliseconds_only_while_playing() {
        let (state, host, _, _, channel) = channel();
        state.lock().unwrap().current_time = 0.75;
        assert_eq!(get_video_channel_current_time(&host, &channel), 750.0);
        pause_video_channel(&host, &channel);
        state.lock().unwrap().current_time = 2.0;
        assert_eq!(get_video_channel_current_time(&host, &channel), 750.0);
    }
}

mod get_video_channel_duration {
    use super::*;

    #[test]
    fn returns_host_duration_in_milliseconds() {
        let (_, _, _, _, channel) = channel();
        assert_eq!(get_video_channel_duration(&channel), 4_000.0);
    }
}

mod get_video_channel_height {
    use super::*;

    #[test]
    fn returns_host_height_or_zero_without_an_element() {
        let (_, host, _, _, channel) = channel();
        assert_eq!(get_video_channel_height(&host, &channel), 360.0);
        destroy_video_channel(&host, &channel);
        assert_eq!(get_video_channel_height(&host, &channel), 0.0);
    }
}

mod get_video_channel_width {
    use super::*;

    #[test]
    fn returns_host_width_or_zero_without_an_element() {
        let (_, host, _, _, channel) = channel();
        assert_eq!(get_video_channel_width(&host, &channel), 640.0);
        destroy_video_channel(&host, &channel);
        assert_eq!(get_video_channel_width(&host, &channel), 0.0);
    }
}

mod is_video_channel_muted {
    use super::*;

    #[test]
    fn reports_mute_independently_of_gain() {
        let (_, host, _, _, channel) = channel();
        set_video_channel_gain(&host, &channel, 0.2);
        set_video_channel_muted(&host, &channel, true);
        assert!(is_video_channel_muted(&channel));
        assert_eq!(channel.read().unwrap().gain, 0.2);
    }
}

mod is_video_channel_playing {
    use super::*;

    #[test]
    fn follows_transport_state() {
        let (_, host, _, _, channel) = channel();
        assert!(is_video_channel_playing(&channel));
        stop_video_channel(&host, &channel);
        assert!(!is_video_channel_playing(&channel));
    }
}

mod pause_video_channel {
    use super::*;

    #[test]
    fn stores_position_marks_paused_and_calls_host() {
        let (state, host, _, _, channel) = channel();
        state.lock().unwrap().current_time = 1.25;
        pause_video_channel(&host, &channel);
        assert_eq!(channel.read().unwrap().current_time, 1_250.0);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Paused);
        assert!(state.lock().unwrap().events.contains(&"pause".to_string()));
    }
}

mod play_video_resource {
    use super::*;

    #[test]
    fn applies_options_retains_source_identity_and_completes_after_counted_loops() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let source = video_resource();
        let options = VideoPlayOptions {
            current_time: Some(500.0),
            gain: Some(0.4),
            loops: Some(1),
            playback_rate: Some(1.5),
        };
        let runtime_state = create_video_channel_runtime_state();
        let channel =
            play_video_resource(&host, &spawn, &runtime_state, &source, Some(&options)).unwrap();
        assert!(Arc::ptr_eq(
            channel.read().unwrap().source.as_ref().unwrap(),
            &source
        ));
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Playing);
        trigger_video_end(&state);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Playing);
        trigger_video_end(&state);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Complete);
        assert_eq!(channel.read().unwrap().current_time, 4_000.0);
    }

    #[test]
    fn returns_none_without_element_and_stops_on_play_rejection() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let empty = Arc::new(std::sync::RwLock::new(create_video_resource(
            None, None, None,
        )));
        let runtime_state = create_video_channel_runtime_state();
        assert!(play_video_resource(&host, &spawn, &runtime_state, &empty, None).is_none());
        state.lock().unwrap().play_rejects = true;
        let channel =
            play_video_resource(&host, &spawn, &runtime_state, &video_resource(), None).unwrap();
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Stopped);
    }

    #[test]
    fn completes_instead_of_looping_when_resource_was_destroyed_first() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let resource = video_resource();
        let options = VideoPlayOptions {
            current_time: None,
            gain: None,
            loops: Some(1),
            playback_rate: None,
        };
        let runtime_state = create_video_channel_runtime_state();
        let channel =
            play_video_resource(&host, &spawn, &runtime_state, &resource, Some(&options)).unwrap();
        destroy_video_resource(&host, &mut resource.write().unwrap());
        trigger_video_end(&state);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Complete);
    }

    #[test]
    fn replaces_the_exact_same_source_listener_before_installing_the_new_runtime() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let runtime_state = create_video_channel_runtime_state();
        let shared = video_element();
        let other = video_element();
        let first_resource = video_resource_with_element(shared.clone());
        let second_resource = video_resource_with_element(shared.clone());
        let other_resource = video_resource_with_element(other.clone());
        let _first =
            play_video_resource(&host, &spawn, &runtime_state, &first_resource, None).unwrap();
        let first_listener = listener_for(&state, &shared);
        let _other =
            play_video_resource(&host, &spawn, &runtime_state, &other_resource, None).unwrap();
        state.lock().unwrap().events.clear();
        let second =
            play_video_resource(&host, &spawn, &runtime_state, &second_resource, None).unwrap();
        let second_listener = listener_for(&state, &shared);
        assert!(!Arc::ptr_eq(&first_listener, &second_listener));
        assert_eq!(listener_count(&state, &shared), 1);
        assert_eq!(listener_count(&state, &other), 1);
        assert_eq!(
            state.lock().unwrap().events,
            vec![
                "remove-ended",
                "time:0",
                "volume:1",
                "rate:1",
                "loop:false",
                "add-ended",
                "time:0",
                "play",
            ]
        );
        trigger_video_end_for(&state, &shared);
        assert_eq!(second.read().unwrap().state, VideoChannelState::Complete);
    }
}

mod resume_video_channel {
    use super::*;

    #[test]
    fn resumes_from_the_stored_position() {
        let (state, host, spawn, _, channel) = channel();
        state.lock().unwrap().current_time = 0.8;
        pause_video_channel(&host, &channel);
        resume_video_channel(&host, &spawn, &channel);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Playing);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"time:0.8".to_string())
        );
    }
}

mod set_video_channel_current_time {
    use super::*;

    #[test]
    fn clamps_milliseconds_and_writes_host_seconds() {
        let (state, host, _, _, channel) = channel();
        assert_eq!(
            set_video_channel_current_time(&host, &channel, 6_000.0),
            4_000.0
        );
        assert!(state.lock().unwrap().events.contains(&"time:4".to_string()));
    }
}

mod set_video_channel_gain {
    use super::*;

    #[test]
    fn updates_stored_gain_and_element_volume() {
        let (state, host, _, _, channel) = channel();
        assert_eq!(set_video_channel_gain(&host, &channel, 0.3), 0.3);
        assert!(
            state
                .lock()
                .unwrap()
                .events
                .contains(&"volume:0.3".to_string())
        );
    }
}

mod set_video_channel_muted {
    use super::*;

    #[test]
    fn toggles_element_mute_without_disturbing_gain() {
        let (state, host, _, _, channel) = channel();
        set_video_channel_gain(&host, &channel, 0.25);
        assert!(set_video_channel_muted(&host, &channel, true));
        assert!(!set_video_channel_muted(&host, &channel, false));
        assert_eq!(channel.read().unwrap().gain, 0.25);
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"muted:true".to_string()));
        assert!(events.contains(&"muted:false".to_string()));
    }
}

mod set_video_channel_playback_rate {
    use super::*;

    #[test]
    fn updates_stored_and_host_rate() {
        let (state, host, _, _, channel) = channel();
        assert_eq!(set_video_channel_playback_rate(&host, &channel, 2.0), 2.0);
        assert!(state.lock().unwrap().events.contains(&"rate:2".to_string()));
    }
}

mod stop_video_channel {
    use super::*;

    #[test]
    fn detaches_pauses_seeks_to_zero_and_resets_state() {
        let (state, host, _, _, channel) = channel();
        stop_video_channel(&host, &channel);
        assert_eq!(channel.read().unwrap().state, VideoChannelState::Stopped);
        assert_eq!(channel.read().unwrap().current_time, 0.0);
        let events = state.lock().unwrap().events.clone();
        assert!(events.contains(&"remove-ended".to_string()));
        assert!(events.contains(&"pause".to_string()));
        assert!(events.contains(&"time:0".to_string()));
    }

    #[test]
    fn removes_the_source_registry_current_listener_even_from_an_older_channel() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let runtime_state = create_video_channel_runtime_state();
        let shared = video_element();
        let first_resource = video_resource_with_element(shared.clone());
        let second_resource = video_resource_with_element(shared.clone());
        let first =
            play_video_resource(&host, &spawn, &runtime_state, &first_resource, None).unwrap();
        let second =
            play_video_resource(&host, &spawn, &runtime_state, &second_resource, None).unwrap();
        state.lock().unwrap().events.clear();
        stop_video_channel(&host, &first);
        assert_eq!(listener_count(&state, &shared), 0);
        assert_eq!(second.read().unwrap().state, VideoChannelState::Playing);
        assert_eq!(
            state.lock().unwrap().events,
            vec!["remove-ended", "pause", "time:0"]
        );
    }

    #[test]
    fn retained_registry_entries_do_not_keep_sources_or_channels_alive() {
        let (state, host) = video_host();
        let spawn = immediate_spawn();
        let runtime_state = create_video_channel_runtime_state();
        let element = video_element();
        let weak_element = Arc::downgrade(&element);
        let resource = video_resource_with_element(element.clone());
        let channel = play_video_resource(&host, &spawn, &runtime_state, &resource, None).unwrap();
        let weak_channel = Arc::downgrade(&channel);
        stop_video_channel(&host, &channel);
        destroy_video_resource(&host, &mut resource.write().unwrap());
        drop(channel);
        drop(resource);
        drop(element);
        assert!(weak_channel.upgrade().is_none());
        assert!(weak_element.upgrade().is_none());
        assert!(Arc::strong_count(&runtime_state) >= 1);
        assert!(state.lock().unwrap().listeners.is_empty());
    }
}
