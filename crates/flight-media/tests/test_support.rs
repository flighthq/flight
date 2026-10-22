use std::sync::{Arc, Mutex, RwLock, Weak};
use std::task::{Context, Poll, Waker};

use flight_audio::{AudioBuffer, AudioResource, create_audio_resource};
use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_host::{
    AudioBufferHandle, AudioBusNodeHandle, AudioDeviceHandle, AudioMixerGraphHandle,
    AudioSourceHandle, HostImageSource, HostSpawnCapability, ProviderRef,
};
use flight_video::{HostVideoCapability, VideoResource, create_video_resource};

use super::*;

#[derive(Default)]
pub(crate) struct AudioMockState {
    pub events: Vec<String>,
    pub listener: Option<AudioSourceEndedListener>,
    pub listener_source: AudioSourceHandle,
    pub next_source: i32,
    pub time: f64,
}

pub(crate) fn audio_host() -> (Arc<Mutex<AudioMockState>>, HostAudioDeviceCapability) {
    let state = Arc::new(Mutex::new(AudioMockState {
        next_source: 20,
        ..AudioMockState::default()
    }));
    let provider: ProviderRef = Arc::new("audio-provider".to_string());
    let create_buffer_state = state.clone();
    let create_source_state = state.clone();
    let destroy_buffer_state = state.clone();
    let destroy_device_state = state.clone();
    let destroy_source_state = state.clone();
    let fade_state = state.clone();
    let time_state = state.clone();
    let ended_state = state.clone();
    let resume_state = state.clone();
    let gain_state = state.clone();
    let pan_state = state.clone();
    let rate_state = state.clone();
    let start_state = state.clone();
    let stop_state = state.clone();
    let host = HostAudioDeviceCapability {
        provider,
        create_buffer: Arc::new(move |device, channels, length, sample_rate, data| {
            create_buffer_state.lock().unwrap().events.push(format!(
                "create-buffer:{}:{channels}:{length}:{sample_rate}:{}",
                device.0,
                data.len()
            ));
            AudioBufferHandle(10)
        }),
        create_device: Arc::new(|sample_rate| AudioDeviceHandle(sample_rate as i32)),
        create_source: Arc::new(move |device, buffer| {
            let mut state = create_source_state.lock().unwrap();
            let source = AudioSourceHandle(state.next_source);
            state.next_source += 1;
            state.events.push(format!(
                "create-source:{}:{}:{}",
                device.0, buffer.0, source.0
            ));
            source
        }),
        destroy_buffer: Arc::new(move |buffer| {
            destroy_buffer_state
                .lock()
                .unwrap()
                .events
                .push(format!("destroy-buffer:{}", buffer.0));
        }),
        destroy_device: Arc::new(move |device| {
            destroy_device_state
                .lock()
                .unwrap()
                .events
                .push(format!("destroy-device:{}", device.0));
        }),
        destroy_source: Arc::new(move |source| {
            destroy_source_state
                .lock()
                .unwrap()
                .events
                .push(format!("destroy-source:{}", source.0));
        }),
        fade_source_gain: Some(Arc::new(move |source, gain, duration| {
            fade_state
                .lock()
                .unwrap()
                .events
                .push(format!("fade:{}:{gain}:{duration}", source.0));
        })),
        get_device_time: Arc::new(move |_device| time_state.lock().unwrap().time),
        on_source_ended: Arc::new(move |source, callback| {
            let mut state = ended_state.lock().unwrap();
            state.events.push(format!(
                "ended:{}:{}",
                source.0,
                if callback.is_some() { "set" } else { "clear" }
            ));
            state.listener_source = source;
            state.listener = callback;
        }),
        resume_device: Arc::new(move |device| {
            resume_state
                .lock()
                .unwrap()
                .events
                .push(format!("resume:{}", device.0));
        }),
        set_source_gain: Arc::new(move |source, gain| {
            gain_state
                .lock()
                .unwrap()
                .events
                .push(format!("gain:{}:{gain}", source.0));
        }),
        set_source_pan: Arc::new(move |source, pan| {
            pan_state
                .lock()
                .unwrap()
                .events
                .push(format!("pan:{}:{pan}", source.0));
        }),
        set_source_playback_rate: Arc::new(move |source, rate| {
            rate_state
                .lock()
                .unwrap()
                .events
                .push(format!("rate:{}:{rate}", source.0));
        }),
        start_source: Arc::new(move |source, offset, duration| {
            start_state
                .lock()
                .unwrap()
                .events
                .push(format!("start:{}:{offset}:{duration}", source.0));
        }),
        stop_source: Arc::new(move |source| {
            stop_state
                .lock()
                .unwrap()
                .events
                .push(format!("stop:{}", source.0));
        }),
    };
    return (state, host);
}

pub(crate) fn audio_resource() -> Ref<AudioResource> {
    let channels = vec![
        Arc::new(RwLock::new(vec![0.0_f32; 48_000].into_boxed_slice())),
        Arc::new(RwLock::new(vec![0.0_f32; 48_000].into_boxed_slice())),
    ]
    .into_boxed_slice();
    let buffer = Arc::new(RwLock::new(AudioBuffer {
        sample_rate: 48_000.0,
        length: 48_000,
        channels,
    }));
    return create_audio_resource(Some(buffer));
}

pub(crate) fn trigger_audio_end(state: &Arc<Mutex<AudioMockState>>) {
    let listener = state.lock().unwrap().listener.clone();
    if let Some(listener) = listener {
        listener();
    }
}

#[derive(Default)]
pub(crate) struct MixerMockState {
    pub events: Vec<String>,
    pub next_node: i32,
}

pub(crate) fn mixer_host() -> (Arc<Mutex<MixerMockState>>, HostAudioMixerCapability) {
    let state = Arc::new(Mutex::new(MixerMockState {
        next_node: 2,
        events: Vec::new(),
    }));
    let create_graph_state = state.clone();
    let destroy_graph_state = state.clone();
    let create_bus_state = state.clone();
    let destroy_bus_state = state.clone();
    let bus_gain_state = state.clone();
    let bus_pan_state = state.clone();
    let fade_state = state.clone();
    let master_state = state.clone();
    let route_state = state.clone();
    let unroute_state = state.clone();
    let default_state = state.clone();
    let host = HostAudioMixerCapability {
        provider: Arc::new("mixer-provider".to_string()),
        create_mixer_graph: Arc::new(move |device, gain| {
            create_graph_state
                .lock()
                .unwrap()
                .events
                .push(format!("create-graph:{}:{gain}", device.0));
            AudioMixerGraphHandle(1)
        }),
        destroy_mixer_graph: Arc::new(move |graph| {
            destroy_graph_state
                .lock()
                .unwrap()
                .events
                .push(format!("destroy-graph:{}", graph.0));
        }),
        create_bus_node: Arc::new(move |graph, gain, pan| {
            let mut state = create_bus_state.lock().unwrap();
            let node = AudioBusNodeHandle(state.next_node);
            state.next_node += 1;
            state
                .events
                .push(format!("create-bus:{}:{}:{gain}:{pan}", graph.0, node.0));
            node
        }),
        destroy_bus_node: Arc::new(move |graph, node| {
            destroy_bus_state
                .lock()
                .unwrap()
                .events
                .push(format!("destroy-bus:{}:{}", graph.0, node.0));
        }),
        set_bus_node_gain: Arc::new(move |graph, node, gain| {
            bus_gain_state
                .lock()
                .unwrap()
                .events
                .push(format!("bus-gain:{}:{}:{gain}", graph.0, node.0));
        }),
        set_bus_node_pan: Arc::new(move |graph, node, pan| {
            bus_pan_state
                .lock()
                .unwrap()
                .events
                .push(format!("bus-pan:{}:{}:{pan}", graph.0, node.0));
        }),
        fade_bus_node_gain: Arc::new(move |graph, node, gain, duration| {
            fade_state
                .lock()
                .unwrap()
                .events
                .push(format!("bus-fade:{}:{}:{gain}:{duration}", graph.0, node.0));
        }),
        set_master_gain: Arc::new(move |graph, gain| {
            master_state
                .lock()
                .unwrap()
                .events
                .push(format!("master:{}:{gain}", graph.0));
        }),
        route_source_to_bus: Arc::new(move |graph, source, node| {
            route_state
                .lock()
                .unwrap()
                .events
                .push(format!("route:{}:{}:{}", graph.0, source.0, node.0));
        }),
        unroute_source: Arc::new(move |graph, source| {
            unroute_state
                .lock()
                .unwrap()
                .events
                .push(format!("unroute:{}:{}", graph.0, source.0));
        }),
        route_source_to_default: Arc::new(move |graph, source| {
            default_state
                .lock()
                .unwrap()
                .events
                .push(format!("default:{}:{}", graph.0, source.0));
        }),
    };
    return (state, host);
}

#[derive(Default)]
pub(crate) struct VideoMockState {
    pub current_time: f64,
    pub events: Vec<String>,
    pub listener: Option<flight_video::VideoEndedListener>,
    pub listener_events: Vec<String>,
    pub listeners: Vec<(Weak<HostImageSource>, flight_video::VideoEndedListener)>,
    pub play_rejects: bool,
}

pub(crate) fn video_element() -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new("video-provider".to_string()),
        handle: Arc::new(7_i32),
    });
}

pub(crate) fn video_resource() -> Ref<VideoResource> {
    return video_resource_with_element(video_element());
}

pub(crate) fn video_resource_with_element(element: Arc<HostImageSource>) -> Ref<VideoResource> {
    let mut resource = create_video_resource();
    resource.element = Some(element);
    return Arc::new(RwLock::new(resource));
}

pub(crate) fn video_host() -> (Arc<Mutex<VideoMockState>>, HostVideoCapability) {
    let state = Arc::new(Mutex::new(VideoMockState::default()));
    let add_state = state.clone();
    let current_state = state.clone();
    let pause_state = state.clone();
    let play_state = state.clone();
    let remove_state = state.clone();
    let set_current_state = state.clone();
    let loop_state = state.clone();
    let muted_state = state.clone();
    let rate_state = state.clone();
    let volume_state = state.clone();
    let host = HostVideoCapability {
        provider: Arc::new("video-provider".to_string()),
        add_ended_listener: Some(Arc::new(move |element, listener| {
            let mut state = add_state.lock().unwrap();
            state.events.push("add-ended".to_string());
            state
                .listener_events
                .push(format!("add:{:p}", Arc::as_ptr(element)));
            state
                .listeners
                .push((Arc::downgrade(element), listener.clone()));
            state.listener = Some(listener);
        })),
        attach_stream: None,
        can_play_type: Arc::new(|_mime| true),
        create_object_url: None,
        create_video_element: None,
        get_current_time: Some(Arc::new(move |_element| {
            current_state.lock().unwrap().current_time
        })),
        get_duration: Some(Arc::new(|_element| 4.0)),
        get_height: Some(Arc::new(|_element| 360.0)),
        get_loop: Some(Arc::new(|_element| false)),
        get_muted: Some(Arc::new(|_element| false)),
        get_playback_rate: Some(Arc::new(|_element| 1.0)),
        get_volume: Some(Arc::new(|_element| 1.0)),
        get_width: Some(Arc::new(|_element| 640.0)),
        is_ready: Some(Arc::new(|_element| true)),
        load_url: None,
        pause: Some(Arc::new(move |_element| {
            pause_state.lock().unwrap().events.push("pause".to_string());
        })),
        play: Some(Arc::new(move |_element| {
            let rejects = play_state.lock().unwrap().play_rejects;
            play_state.lock().unwrap().events.push("play".to_string());
            Box::pin(async move {
                if rejects {
                    Err(FlightError {
                        kind: FlightErrorKind::Error,
                        message: "play rejected".to_string(),
                    })
                } else {
                    Ok(())
                }
            })
        })),
        release_element: None,
        remove_ended_listener: Some(Arc::new(move |element, listener| {
            let mut state = remove_state.lock().unwrap();
            state.events.push("remove-ended".to_string());
            let element_weak = Arc::downgrade(element);
            let index = state.listeners.iter().position(|(source, candidate)| {
                source.ptr_eq(&element_weak) && Arc::ptr_eq(candidate, listener)
            });
            state.listener_events.push(format!(
                "remove:{:p}:{}",
                Arc::as_ptr(element),
                index.is_some()
            ));
            if let Some(index) = index {
                state.listeners.remove(index);
            }
            state.listener = state.listeners.last().map(|(_, listener)| listener.clone());
        })),
        revoke_object_url: None,
        set_current_time: Some(Arc::new(move |_element, value| {
            let mut state = set_current_state.lock().unwrap();
            state.current_time = value;
            state.events.push(format!("time:{value}"));
        })),
        set_loop: Some(Arc::new(move |_element, value| {
            loop_state
                .lock()
                .unwrap()
                .events
                .push(format!("loop:{value}"));
        })),
        set_muted: Some(Arc::new(move |_element, value| {
            muted_state
                .lock()
                .unwrap()
                .events
                .push(format!("muted:{value}"));
        })),
        set_playback_rate: Some(Arc::new(move |_element, value| {
            rate_state
                .lock()
                .unwrap()
                .events
                .push(format!("rate:{value}"));
        })),
        set_volume: Some(Arc::new(move |_element, value| {
            volume_state
                .lock()
                .unwrap()
                .events
                .push(format!("volume:{value}"));
        })),
    };
    return (state, host);
}

pub(crate) fn immediate_spawn() -> HostSpawnCapability {
    return HostSpawnCapability {
        provider: Arc::new("spawn-provider".to_string()),
        spawn: Arc::new(|mut future| {
            let mut context = Context::from_waker(Waker::noop());
            assert!(matches!(
                future.as_mut().poll(&mut context),
                Poll::Ready(())
            ));
        }),
    };
}

pub(crate) fn trigger_video_end(state: &Arc<Mutex<VideoMockState>>) {
    let listener = state.lock().unwrap().listener.clone();
    if let Some(listener) = listener {
        listener();
    }
}

pub(crate) fn trigger_video_end_for(
    state: &Arc<Mutex<VideoMockState>>,
    element: &Arc<HostImageSource>,
) {
    let element = Arc::downgrade(element);
    let listener = state
        .lock()
        .unwrap()
        .listeners
        .iter()
        .find(|(source, _)| source.ptr_eq(&element))
        .map(|(_, listener)| listener.clone());
    if let Some(listener) = listener {
        listener();
    }
}
