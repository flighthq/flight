use std::sync::{Arc, Weak};

use flight_audio::{AudioChannelState, AudioResource};
use flight_bitmap::HostImageSource;
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_hostcapability::{HostSpawnCapability, ProviderRef};
use flight_signals::Signal;
use flight_video::{HostVideoCapability, VideoChannelState, VideoResource};

/// Opaque host buffer identity (TS branded `AudioBufferHandle`). Zero is the invalid sentinel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioBufferHandle(pub i32);

/// Opaque host device identity (TS branded `AudioDeviceHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioDeviceHandle(pub i32);

/// Opaque host source identity (TS branded `AudioSourceHandle`). Zero is the invalid sentinel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioSourceHandle(pub i32);

/// Opaque host mixer-bus node identity (TS branded `AudioBusNodeHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioBusNodeHandle(pub i32);

/// Opaque host mixer graph identity (TS branded `AudioMixerGraphHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioMixerGraphHandle(pub i32);

/// One host source-ended callback.
pub type AudioSourceEndedListener = Arc<dyn Fn() + Send + Sync>;

/// Opaque routing callback installed by the mixer and re-applied to every replacement source.
pub type AudioSourceRoute = Arc<dyn Fn(AudioSourceHandle) + Send + Sync>;

/// Platform audio-device operations. The provider token preserves the identity shared by every
/// facet from one host.
// flight-lint: allow(f64) host media time and playback offsets are JS-number seconds
#[derive(Clone)]
pub struct HostAudioDeviceCapability {
    pub provider: ProviderRef,
    pub create_buffer: Arc<
        dyn Fn(AudioDeviceHandle, usize, usize, f32, &[Ref<Box<[f32]>>]) -> AudioBufferHandle
            + Send
            + Sync,
    >,
    pub create_device: Arc<dyn Fn(f32) -> AudioDeviceHandle + Send + Sync>,
    pub create_source:
        Arc<dyn Fn(AudioDeviceHandle, AudioBufferHandle) -> AudioSourceHandle + Send + Sync>,
    pub destroy_buffer: Arc<dyn Fn(AudioBufferHandle) + Send + Sync>,
    pub destroy_device: Arc<dyn Fn(AudioDeviceHandle) + Send + Sync>,
    pub destroy_source: Arc<dyn Fn(AudioSourceHandle) + Send + Sync>,
    pub fade_source_gain: Option<Arc<dyn Fn(AudioSourceHandle, f32, f32) + Send + Sync>>,
    pub get_device_time: Arc<dyn Fn(AudioDeviceHandle) -> f64 + Send + Sync>,
    pub on_source_ended:
        Arc<dyn Fn(AudioSourceHandle, Option<AudioSourceEndedListener>) + Send + Sync>,
    pub resume_device: Arc<dyn Fn(AudioDeviceHandle) + Send + Sync>,
    pub set_source_gain: Arc<dyn Fn(AudioSourceHandle, f32) + Send + Sync>,
    pub set_source_pan: Arc<dyn Fn(AudioSourceHandle, f32) + Send + Sync>,
    pub set_source_playback_rate: Arc<dyn Fn(AudioSourceHandle, f32) + Send + Sync>,
    pub start_source: Arc<dyn Fn(AudioSourceHandle, f64, f64) + Send + Sync>,
    pub stop_source: Arc<dyn Fn(AudioSourceHandle) + Send + Sync>,
}

/// A platform mixer graph. All operations are provider-first: callers may select a different
/// compatible provider for each write exactly as the source contract permits.
#[derive(Clone)]
pub struct HostAudioMixerCapability {
    pub provider: ProviderRef,
    pub create_mixer_graph:
        Arc<dyn Fn(AudioDeviceHandle, f32) -> AudioMixerGraphHandle + Send + Sync>,
    pub destroy_mixer_graph: Arc<dyn Fn(AudioMixerGraphHandle) + Send + Sync>,
    pub create_bus_node:
        Arc<dyn Fn(AudioMixerGraphHandle, f32, f32) -> AudioBusNodeHandle + Send + Sync>,
    pub destroy_bus_node: Arc<dyn Fn(AudioMixerGraphHandle, AudioBusNodeHandle) + Send + Sync>,
    pub set_bus_node_gain:
        Arc<dyn Fn(AudioMixerGraphHandle, AudioBusNodeHandle, f32) + Send + Sync>,
    pub set_bus_node_pan: Arc<dyn Fn(AudioMixerGraphHandle, AudioBusNodeHandle, f32) + Send + Sync>,
    pub fade_bus_node_gain:
        Arc<dyn Fn(AudioMixerGraphHandle, AudioBusNodeHandle, f32, f32) + Send + Sync>,
    pub set_master_gain: Arc<dyn Fn(AudioMixerGraphHandle, f32) + Send + Sync>,
    pub route_source_to_bus:
        Arc<dyn Fn(AudioMixerGraphHandle, AudioSourceHandle, AudioBusNodeHandle) + Send + Sync>,
    pub unroute_source: Arc<dyn Fn(AudioMixerGraphHandle, AudioSourceHandle) + Send + Sync>,
    pub route_source_to_default:
        Arc<dyn Fn(AudioMixerGraphHandle, AudioSourceHandle) + Send + Sync>,
}

/// Which audio-device operation a caller is checking (TS `AudioDeviceOperation`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioDeviceOperation {
    CreateBuffer,
    CreateDevice,
    CreateSource,
    DestroyBuffer,
    DestroyDevice,
    DestroySource,
    FadeSourceGain,
    GetDeviceTime,
    OnSourceEnded,
    ResumeDevice,
    SetSourceGain,
    SetSourcePan,
    SetSourcePlaybackRate,
    StartSource,
    StopSource,
}

/// Which bus property a write targeted when no mixer node received it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioBusMixerOperation {
    Gain,
    Mute,
    Pan,
}

/// Opt-in readiness vocabulary shared by audio and video channels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaReadyState {
    Buffering,
    Error,
    Idle,
    Ready,
}

/// All opt-in events for one media channel. The lifecycle signals are emitted by this crate; the
/// transport signals remain available for a backend to report when it owns that information.
pub struct MediaChannelSignals {
    pub on_buffering: Signal<()>,
    pub on_complete: Signal<()>,
    pub on_error: Signal<String>,
    pub on_loop: Signal<()>,
    pub on_pause: Signal<()>,
    pub on_play: Signal<()>,
    pub on_ready: Signal<()>,
    pub on_seeked: Signal<()>,
    pub on_stop: Signal<()>,
}

/// One audio playback channel. The private runtime is the source WeakMap entry, and the optional
/// signal group is the source signal registry entry; neither allocates until playback/opt-in.
pub struct AudioChannel {
    pub current_time: f32,
    pub gain: f32,
    pub length: f32,
    pub loop_end: f32,
    pub loops: i32,
    pub loop_start: f32,
    pub muted: bool,
    pub on_complete: Signal<()>,
    pub pan: f32,
    pub playback_rate: f32,
    pub source: Ref<AudioResource>,
    pub state: AudioChannelState,
    pub(crate) channel_runtime: Option<AudioChannelRuntime>,
    pub(crate) signals: Option<Ref<MediaChannelSignals>>,
}

// flight-lint: allow(f64) host audio clocks use JS-number seconds
pub(crate) struct AudioChannelRuntime {
    pub backend: HostAudioDeviceCapability,
    pub buffer_handle: AudioBufferHandle,
    pub device: AudioDeviceHandle,
    pub loops_remaining: i32,
    pub source_handle: AudioSourceHandle,
    pub source_route: Option<AudioSourceRoute>,
    pub started_at: f64,
}

/// One video playback channel. The retained element lets channel teardown remove its listener even
/// after the independently owned `VideoResource` has already been destroyed.
pub struct VideoChannel {
    pub current_time: f32,
    pub gain: f32,
    pub length: f32,
    pub loops: i32,
    pub muted: bool,
    pub on_complete: Signal<()>,
    pub playback_rate: f32,
    pub source: Option<Ref<VideoResource>>,
    pub state: VideoChannelState,
    pub(crate) retained_element: Option<Arc<HostImageSource>>,
    pub(crate) signals: Option<Ref<MediaChannelSignals>>,
    pub(crate) video_runtime: Option<VideoChannelRuntime>,
}

pub(crate) struct VideoChannelRuntime {
    pub host_video: HostVideoCapability,
    pub host_spawn: HostSpawnCapability,
    pub runtime_state: VideoChannelRuntimeStateRef,
}

/// Caller-owned replacement for the source's `WeakMap<HostImageSource, VideoChannelRuntime>`.
/// Entries weakly key the exact opaque source identity, so a stopped-but-undestroyed channel does
/// not make its source, channel, or listener permanently live through this registry.
#[derive(Default)]
pub struct VideoChannelRuntimeState {
    pub(crate) source_runtimes: Vec<VideoSourceRuntime>,
}

pub(crate) struct VideoSourceRuntime {
    pub element: Weak<HostImageSource>,
    pub loops_remaining: i32,
    pub on_ended: Weak<dyn Fn() + Send + Sync>,
}

/// Shared caller-owned video-channel runtime state.
pub type VideoChannelRuntimeStateRef = Ref<VideoChannelRuntimeState>;

/// Audio-bus construction options.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AudioBusOptions {
    pub gain: Option<f32>,
    pub muted: Option<bool>,
    pub name: Option<String>,
    pub pan: Option<f32>,
}

/// Mixer construction options.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AudioMixerOptions {
    pub master_gain: Option<f32>,
    pub master_muted: Option<bool>,
}

/// An entity bus shared by any number of mixers. Its private memberships replace the source's
/// reverse object-keyed map and are removed deterministically with each mixer.
pub struct AudioBus {
    runtime: EntityRuntimeSlot,
    pub gain: f32,
    pub muted: bool,
    pub name: String,
    pub pan: f32,
    pub(crate) memberships: Vec<AudioBusMembership>,
}

#[derive(Clone)]
pub(crate) struct AudioBusMembership {
    pub graph: AudioMixerGraphHandle,
    pub mixer: Weak<std::sync::RwLock<AudioMixer>>,
    pub node: AudioBusNodeHandle,
}

/// An entity mixer with host graph state held on the object that owns it.
pub struct AudioMixer {
    runtime: EntityRuntimeSlot,
    pub master_gain: f32,
    pub master_muted: bool,
    pub(crate) mixer_runtime: Option<AudioMixerRuntime>,
}

pub(crate) struct AudioMixerRuntime {
    pub active_channels: Vec<Ref<AudioChannel>>,
    pub buses: Vec<AudioMixerBusBinding>,
    pub channels_paused_by_mixer: Vec<Ref<AudioChannel>>,
    pub channel_to_bus: Vec<AudioMixerChannelBinding>,
    pub graph: AudioMixerGraphHandle,
}

pub(crate) struct AudioMixerBusBinding {
    pub bus: Ref<AudioBus>,
    pub node: AudioBusNodeHandle,
}

pub(crate) struct AudioMixerChannelBinding {
    pub bus: Ref<AudioBus>,
    pub channel: Ref<AudioChannel>,
}

/// Optional bus-write callback.
pub type AudioBusMixerGuard = Arc<dyn Fn(AudioBusMixerOperation, &Ref<AudioBus>) + Send + Sync>;

/// Caller-owned replacement for the source's module-global mixer guard slot.
#[derive(Default)]
pub struct AudioMixerGuardState {
    pub guard: Option<AudioBusMixerGuard>,
}

/// Shared caller-owned mixer guard state.
pub type AudioMixerGuardStateRef = Ref<AudioMixerGuardState>;

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS AudioBusMixerOperation string union
pub fn get_audio_bus_mixer_operation_string(value: AudioBusMixerOperation) -> &'static str {
    return match value {
        AudioBusMixerOperation::Gain => "gain",
        AudioBusMixerOperation::Mute => "mute",
        AudioBusMixerOperation::Pan => "pan",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS AudioDeviceOperation keyof union
pub fn get_audio_device_operation_string(value: AudioDeviceOperation) -> &'static str {
    return match value {
        AudioDeviceOperation::CreateBuffer => "createBuffer",
        AudioDeviceOperation::CreateDevice => "createDevice",
        AudioDeviceOperation::CreateSource => "createSource",
        AudioDeviceOperation::DestroyBuffer => "destroyBuffer",
        AudioDeviceOperation::DestroyDevice => "destroyDevice",
        AudioDeviceOperation::DestroySource => "destroySource",
        AudioDeviceOperation::FadeSourceGain => "fadeSourceGain",
        AudioDeviceOperation::GetDeviceTime => "getDeviceTime",
        AudioDeviceOperation::OnSourceEnded => "onSourceEnded",
        AudioDeviceOperation::ResumeDevice => "resumeDevice",
        AudioDeviceOperation::SetSourceGain => "setSourceGain",
        AudioDeviceOperation::SetSourcePan => "setSourcePan",
        AudioDeviceOperation::SetSourcePlaybackRate => "setSourcePlaybackRate",
        AudioDeviceOperation::StartSource => "startSource",
        AudioDeviceOperation::StopSource => "stopSource",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS MediaReadyState string union
pub fn get_media_ready_state_string(value: MediaReadyState) -> &'static str {
    return match value {
        MediaReadyState::Buffering => "buffering",
        MediaReadyState::Error => "error",
        MediaReadyState::Idle => "idle",
        MediaReadyState::Ready => "ready",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the AudioBusMixerOperation string table
pub fn parse_audio_bus_mixer_operation(value: &str) -> Option<AudioBusMixerOperation> {
    return match value {
        "gain" => Some(AudioBusMixerOperation::Gain),
        "mute" => Some(AudioBusMixerOperation::Mute),
        "pan" => Some(AudioBusMixerOperation::Pan),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the AudioDeviceOperation string table
pub fn parse_audio_device_operation(value: &str) -> Option<AudioDeviceOperation> {
    return match value {
        "createBuffer" => Some(AudioDeviceOperation::CreateBuffer),
        "createDevice" => Some(AudioDeviceOperation::CreateDevice),
        "createSource" => Some(AudioDeviceOperation::CreateSource),
        "destroyBuffer" => Some(AudioDeviceOperation::DestroyBuffer),
        "destroyDevice" => Some(AudioDeviceOperation::DestroyDevice),
        "destroySource" => Some(AudioDeviceOperation::DestroySource),
        "fadeSourceGain" => Some(AudioDeviceOperation::FadeSourceGain),
        "getDeviceTime" => Some(AudioDeviceOperation::GetDeviceTime),
        "onSourceEnded" => Some(AudioDeviceOperation::OnSourceEnded),
        "resumeDevice" => Some(AudioDeviceOperation::ResumeDevice),
        "setSourceGain" => Some(AudioDeviceOperation::SetSourceGain),
        "setSourcePan" => Some(AudioDeviceOperation::SetSourcePan),
        "setSourcePlaybackRate" => Some(AudioDeviceOperation::SetSourcePlaybackRate),
        "startSource" => Some(AudioDeviceOperation::StartSource),
        "stopSource" => Some(AudioDeviceOperation::StopSource),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser paired with the MediaReadyState string table
pub fn parse_media_ready_state(value: &str) -> Option<MediaReadyState> {
    return match value {
        "buffering" => Some(MediaReadyState::Buffering),
        "error" => Some(MediaReadyState::Error),
        "idle" => Some(MediaReadyState::Idle),
        "ready" => Some(MediaReadyState::Ready),
        _ => None,
    };
}

impl Default for AudioBus {
    fn default() -> Self {
        return AudioBus {
            runtime: EntityRuntimeSlot::default(),
            gain: 0.0,
            muted: false,
            name: String::new(),
            pan: 0.0,
            memberships: Vec::new(),
        };
    }
}

impl Default for AudioMixer {
    fn default() -> Self {
        return AudioMixer {
            runtime: EntityRuntimeSlot::default(),
            master_gain: 0.0,
            master_muted: false,
            mixer_runtime: None,
        };
    }
}

flight_entity::impl_entity!(AudioBus);
flight_entity::impl_entity!(AudioMixer);
