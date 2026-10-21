use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_audio::{AudioBuffer, create_audio_resource};
use flight_bitmap::HostImageSource;
use flight_hostcapability::ProviderRef;
use flight_log::create_log_state;
use flight_video::{VideoChannelState, create_video_resource};

use super::*;

#[test]
fn audio_bus_methods_delegate_to_every_bus_free_function() {
    let host = mixer_host();
    let guards = create_audio_mixer_guard_state();
    let mixer = AudioMixer::new(&host, AudioDeviceHandle(1), None);
    let bus = AudioBus::new(None);
    bus.add_to_mixer(&host, &mixer);
    bus.fade_gain(&host, &mixer, 0.5, 10.0);
    assert_eq!(bus.set_gain(&host, &guards, 0.25), 0.25);
    assert!(bus.set_muted(&host, &guards, true));
    assert_eq!(bus.set_pan(&host, &guards, 2.0), 1.0);
}

#[test]
fn audio_channel_methods_delegate_to_every_channel_free_function() {
    let host = audio_host();
    let channel =
        play_audio_resource(&host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
    assert_eq!(
        channel.current_time(),
        get_audio_channel_current_time(&channel)
    );
    assert_eq!(channel.duration(), get_audio_channel_duration(&channel));
    assert!(Arc::ptr_eq(
        &channel.enable_signals(),
        &channel.signals().unwrap()
    ));
    channel.fade_gain(&host, 0.5, 10.0);
    assert!(!channel.is_muted());
    assert!(channel.is_playing());
    assert_eq!(channel.set_current_time(20.0), 20.0);
    assert_eq!(channel.set_gain(0.4), 0.4);
    assert!(channel.set_loop_region(10.0, 100.0));
    assert!(channel.set_muted(true));
    assert_eq!(channel.set_pan(0.2), 0.2);
    assert_eq!(channel.set_playback_rate(2.0), 2.0);
    assert_ne!(channel.source_handle(), AudioSourceHandle(0));
    channel.pause();
    channel.resume();
    channel.clear_loop_region();
    channel.stop();
    channel.destroy();
}

fn audio_host() -> HostAudioDeviceCapability {
    return HostAudioDeviceCapability {
        provider: Arc::new(()),
        create_buffer: Arc::new(|_, _, _, _, _| AudioBufferHandle(1)),
        create_device: Arc::new(|_| AudioDeviceHandle(1)),
        create_source: Arc::new(|_, _| AudioSourceHandle(2)),
        destroy_buffer: Arc::new(|_| {}),
        destroy_device: Arc::new(|_| {}),
        destroy_source: Arc::new(|_| {}),
        fade_source_gain: Some(Arc::new(|_, _, _| {})),
        get_device_time: Arc::new(|_| 0.0),
        on_source_ended: Arc::new(|_, _| {}),
        resume_device: Arc::new(|_| {}),
        set_source_gain: Arc::new(|_, _| {}),
        set_source_pan: Arc::new(|_, _| {}),
        set_source_playback_rate: Arc::new(|_, _| {}),
        start_source: Arc::new(|_, _, _| {}),
        stop_source: Arc::new(|_| {}),
    };
}

#[test]
fn audio_mixer_guard_state_methods_delegate_to_guard_free_functions() {
    let guards = create_audio_mixer_guard_state();
    guards.set_guard(Some(Arc::new(|_, _| {})));
    assert!(guards.read().unwrap().guard.is_some());
    guards.disable();
    assert!(guards.read().unwrap().guard.is_none());
    let logs = Arc::new(RwLock::new(create_log_state()));
    guards.enable(&logs, Arc::new(|| 0.0));
    assert!(guards.read().unwrap().guard.is_some());
}

#[test]
fn audio_mixer_methods_delegate_to_every_mixer_free_function() {
    let audio_host = audio_host();
    let mixer_host = mixer_host();
    let mixer = AudioMixer::new(&mixer_host, AudioDeviceHandle(1), None);
    let bus = AudioBus::new(None);
    let channel =
        play_audio_resource(&audio_host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
    mixer.add_bus(&mixer_host, &bus);
    mixer.route_channel_to_bus(&mixer_host, &channel, &bus);
    assert_eq!(mixer.active_channels().len(), 1);
    mixer.fade_bus_gain(&mixer_host, &bus, 0.5, 10.0);
    assert_eq!(mixer.set_master_gain(&mixer_host, 0.5), 0.5);
    assert!(mixer.set_master_muted(&mixer_host, true));
    mixer.pause_all_channels();
    mixer.resume_all_channels();
    mixer.unroute_channel_from_bus(&mixer_host, &channel);
    mixer.route_channel_to_bus(&mixer_host, &channel, &bus);
    mixer.stop_all_channels();
    mixer.destroy(&mixer_host);
}

fn audio_resource() -> Ref<flight_audio::AudioResource> {
    let channel = Arc::new(RwLock::new(vec![0.0_f32; 10].into_boxed_slice()));
    let buffer = Arc::new(RwLock::new(AudioBuffer {
        sample_rate: 10.0,
        length: 10,
        channels: vec![channel].into_boxed_slice(),
    }));
    return create_audio_resource(Some(buffer));
}

#[test]
fn constructors_delegate_to_the_entity_factories() {
    let host = mixer_host();
    let bus = AudioBus::new(None);
    let mixer = AudioMixer::new(&host, AudioDeviceHandle(1), None);
    assert_eq!(
        bus.read().unwrap().gain,
        create_audio_bus(None).read().unwrap().gain
    );
    assert_eq!(
        mixer.read().unwrap().master_gain,
        create_audio_mixer(&host, AudioDeviceHandle(1), None)
            .read()
            .unwrap()
            .master_gain
    );
}

fn mixer_host() -> HostAudioMixerCapability {
    return HostAudioMixerCapability {
        provider: Arc::new(()),
        create_mixer_graph: Arc::new(|_, _| AudioMixerGraphHandle(1)),
        destroy_mixer_graph: Arc::new(|_| {}),
        create_bus_node: Arc::new(|_, _, _| AudioBusNodeHandle(1)),
        destroy_bus_node: Arc::new(|_, _| {}),
        set_bus_node_gain: Arc::new(|_, _, _| {}),
        set_bus_node_pan: Arc::new(|_, _, _| {}),
        fade_bus_node_gain: Arc::new(|_, _, _, _| {}),
        set_master_gain: Arc::new(|_, _| {}),
        route_source_to_bus: Arc::new(|_, _, _| {}),
        unroute_source: Arc::new(|_, _| {}),
        route_source_to_default: Arc::new(|_, _| {}),
    };
}

fn spawn_host() -> HostSpawnCapability {
    return HostSpawnCapability {
        provider: Arc::new(()),
        spawn: Arc::new(|mut future| {
            let mut context = Context::from_waker(Waker::noop());
            assert!(matches!(
                future.as_mut().poll(&mut context),
                Poll::Ready(())
            ));
        }),
    };
}

#[test]
fn video_channel_methods_delegate_to_every_channel_free_function() {
    let host = video_host();
    let spawn = spawn_host();
    let runtime_state = VideoChannelRuntimeState::new();
    assert!(!Arc::ptr_eq(
        &runtime_state,
        &VideoChannelRuntimeState::new()
    ));
    let channel =
        play_video_resource(&host, &spawn, &runtime_state, &video_resource(), None).unwrap();
    assert_eq!(
        channel.current_time(&host),
        get_video_channel_current_time(&host, &channel)
    );
    assert_eq!(channel.duration(), get_video_channel_duration(&channel));
    assert!(Arc::ptr_eq(
        &channel.enable_signals(),
        &channel.signals().unwrap()
    ));
    assert_eq!(channel.height(&host), 10.0);
    assert!(!channel.is_muted());
    assert!(channel.is_playing());
    assert_eq!(channel.set_current_time(&host, 20.0), 20.0);
    assert_eq!(channel.set_gain(&host, 0.5), 0.5);
    assert!(channel.set_muted(&host, true));
    assert_eq!(channel.set_playback_rate(&host, 2.0), 2.0);
    assert_eq!(channel.width(&host), 20.0);
    channel.pause(&host);
    channel.resume(&host, &spawn);
    channel.stop(&host);
    channel.destroy(&host);
    assert_eq!(channel.read().unwrap().state, VideoChannelState::Stopped);
}

fn video_host() -> HostVideoCapability {
    return HostVideoCapability {
        provider: Arc::new(()),
        add_ended_listener: Some(Arc::new(|_, _| {})),
        attach_stream: None,
        can_play_type: Arc::new(|_| true),
        create_object_url: None,
        create_video_element: None,
        get_current_time: Some(Arc::new(|_| 0.0)),
        get_duration: Some(Arc::new(|_| 1.0)),
        get_height: Some(Arc::new(|_| 10.0)),
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: Some(Arc::new(|_| 20.0)),
        is_ready: None,
        load_url: None,
        pause: Some(Arc::new(|_| {})),
        play: Some(Arc::new(|_| Box::pin(async { Ok(()) }))),
        release_element: None,
        remove_ended_listener: Some(Arc::new(|_, _| {})),
        revoke_object_url: None,
        set_current_time: Some(Arc::new(|_, _| {})),
        set_loop: Some(Arc::new(|_, _| {})),
        set_muted: Some(Arc::new(|_, _| {})),
        set_playback_rate: Some(Arc::new(|_, _| {})),
        set_volume: Some(Arc::new(|_, _| {})),
    };
}

fn video_resource() -> Ref<flight_video::VideoResource> {
    let provider: ProviderRef = Arc::new(());
    let element = Arc::new(HostImageSource {
        provider,
        handle: Arc::new(1_i32),
    });
    return Arc::new(RwLock::new(create_video_resource(
        Some(element),
        None,
        Some(false),
    )));
}
