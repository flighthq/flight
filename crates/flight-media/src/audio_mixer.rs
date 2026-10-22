use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_math::clamp;

use crate::audio_channel::{
    get_audio_channel_source_handle, pause_audio_channel, resume_audio_channel,
    set_audio_channel_source_route, stop_audio_channel,
};
use crate::types::*;

// flight-lint: allow(conform-params) D23 (B) zero-field create (foreman-f2e28724): callers assign gain, muted, name and pan after create
pub fn create_audio_bus() -> Ref<AudioBus> {
    let mut out: AudioBus = allocate_entity();
    initialize_audio_bus(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn create_audio_mixer(
    host_audio_mixer: &HostAudioMixerCapability,
    device: AudioDeviceHandle,
    options: Option<&AudioMixerOptions>,
) -> Ref<AudioMixer> {
    let master_gain = options
        .and_then(|options| options.master_gain)
        .unwrap_or(1.0);
    let master_muted = options
        .and_then(|options| options.master_muted)
        .unwrap_or(false);
    let graph =
        (host_audio_mixer.create_mixer_graph)(device, if master_muted { 0.0 } else { master_gain });
    let mut mixer: AudioMixer = allocate_entity();
    mixer.master_gain = master_gain;
    mixer.master_muted = master_muted;
    mixer.mixer_runtime = Some(AudioMixerRuntime {
        active_channels: Vec::new(),
        buses: Vec::new(),
        channels_paused_by_mixer: Vec::new(),
        channel_to_bus: Vec::new(),
        graph,
    });
    return Arc::new(RwLock::new(mixer));
}

// flight-lint: allow(conform-params) D23 (B) receiver-only initializer (foreman-f2e28724): reset public fields while preserving identity and mixer bindings
pub fn initialize_audio_bus(out: &mut AudioBus) {
    out.gain = 1.0;
    out.muted = false;
    out.name = String::new();
    out.pan = 0.0;
}

pub fn add_audio_bus_to_mixer(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    bus: &Ref<AudioBus>,
) {
    let graph = {
        let mixer = mixer.read().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_ref() else {
            return;
        };
        if runtime
            .buses
            .iter()
            .any(|binding| Arc::ptr_eq(&binding.bus, bus))
        {
            return;
        }
        runtime.graph
    };
    let (gain, pan) = {
        let bus = bus.read().unwrap();
        (if bus.muted { 0.0 } else { bus.gain }, bus.pan)
    };
    let node = (host_audio_mixer.create_bus_node)(graph, gain, pan);
    {
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            (host_audio_mixer.destroy_bus_node)(graph, node);
            return;
        };
        runtime.buses.push(AudioMixerBusBinding {
            bus: bus.clone(),
            node,
        });
    }
    bus.write().unwrap().memberships.push(AudioBusMembership {
        graph,
        mixer: Arc::downgrade(mixer),
        node,
    });
}

pub fn destroy_audio_mixer(host_audio_mixer: &HostAudioMixerCapability, mixer: &Ref<AudioMixer>) {
    let Some(runtime) = mixer.write().unwrap().mixer_runtime.take() else {
        return;
    };
    for channel in &runtime.active_channels {
        stop_audio_channel(channel);
        set_audio_channel_source_route(channel, None);
    }
    for binding in runtime.buses {
        binding
            .bus
            .write()
            .unwrap()
            .memberships
            .retain(|membership| match membership.mixer.upgrade() {
                Some(owner) => !Arc::ptr_eq(&owner, mixer),
                None => false,
            });
        (host_audio_mixer.destroy_bus_node)(runtime.graph, binding.node);
    }
    (host_audio_mixer.destroy_mixer_graph)(runtime.graph);
}

pub fn fade_audio_bus_gain(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    bus: &Ref<AudioBus>,
    target_gain: f32,
    duration_ms: f32,
) {
    let node = {
        let mixer = mixer.read().unwrap();
        mixer.mixer_runtime.as_ref().and_then(|runtime| {
            runtime
                .buses
                .iter()
                .find(|binding| Arc::ptr_eq(&binding.bus, bus))
                .map(|binding| (runtime.graph, binding.node))
        })
    };
    let muted = {
        let mut bus = bus.write().unwrap();
        bus.gain = target_gain;
        bus.muted
    };
    if let Some((graph, node)) = node {
        (host_audio_mixer.fade_bus_node_gain)(
            graph,
            node,
            if muted { 0.0 } else { target_gain },
            duration_ms,
        );
    }
}

pub fn get_audio_mixer_active_channels(mixer: &Ref<AudioMixer>) -> Vec<Ref<AudioChannel>> {
    return mixer
        .read()
        .unwrap()
        .mixer_runtime
        .as_ref()
        .map(|runtime| runtime.active_channels.clone())
        .unwrap_or_default();
}

pub fn pause_all_audio_mixer_channels(mixer: &Ref<AudioMixer>) {
    let channels = get_audio_mixer_active_channels(mixer);
    for channel in channels {
        if !crate::audio_channel::is_audio_channel_playing(&channel) {
            continue;
        }
        pause_audio_channel(&channel);
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            continue;
        };
        if !runtime
            .channels_paused_by_mixer
            .iter()
            .any(|paused| Arc::ptr_eq(paused, &channel))
        {
            runtime.channels_paused_by_mixer.push(channel);
        }
    }
}

fn report_unmixed_bus(
    guard_state: &AudioMixerGuardStateRef,
    bus: &Ref<AudioBus>,
    operation: AudioBusMixerOperation,
    memberships: &[AudioBusMembership],
) {
    if !memberships.is_empty() {
        return;
    }
    let guard = guard_state.read().unwrap().guard.clone();
    if let Some(guard) = guard {
        guard(operation, bus);
    }
}

pub fn resume_all_audio_mixer_channels(mixer: &Ref<AudioMixer>) {
    let channels = {
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            return;
        };
        std::mem::take(&mut runtime.channels_paused_by_mixer)
    };
    for channel in channels {
        if channel.read().unwrap().state == flight_audio::AudioChannelState::Paused {
            resume_audio_channel(&channel);
        }
    }
}

pub fn route_audio_channel_to_mixer_bus(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    channel: &Ref<AudioChannel>,
    bus: &Ref<AudioBus>,
) {
    add_audio_bus_to_mixer(host_audio_mixer, mixer, bus);
    let route = {
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            return;
        };
        let Some(node) = runtime
            .buses
            .iter()
            .find(|binding| Arc::ptr_eq(&binding.bus, bus))
            .map(|binding| binding.node)
        else {
            return;
        };
        if !runtime
            .active_channels
            .iter()
            .any(|active| Arc::ptr_eq(active, channel))
        {
            runtime.active_channels.push(channel.clone());
        }
        runtime
            .channel_to_bus
            .retain(|binding| !Arc::ptr_eq(&binding.channel, channel));
        runtime.channel_to_bus.push(AudioMixerChannelBinding {
            bus: bus.clone(),
            channel: channel.clone(),
        });
        (runtime.graph, node)
    };
    let host = host_audio_mixer.clone();
    let source_route: AudioSourceRoute = Arc::new(move |source| {
        (host.route_source_to_bus)(route.0, source, route.1);
    });
    set_audio_channel_source_route(channel, Some(source_route));
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global guard slot
pub fn set_audio_bus_gain(
    host_audio_mixer: &HostAudioMixerCapability,
    guard_state: &AudioMixerGuardStateRef,
    bus: &Ref<AudioBus>,
    value: f32,
) -> f32 {
    let (muted, memberships) = {
        let mut bus_value = bus.write().unwrap();
        bus_value.gain = value;
        (bus_value.muted, bus_value.memberships.clone())
    };
    report_unmixed_bus(guard_state, bus, AudioBusMixerOperation::Gain, &memberships);
    for membership in memberships {
        (host_audio_mixer.set_bus_node_gain)(
            membership.graph,
            membership.node,
            if muted { 0.0 } else { value },
        );
    }
    return value;
}

/// Contract-only diagnostics seam.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global guard slot
pub fn set_audio_bus_mixer_guard(
    guard_state: &AudioMixerGuardStateRef,
    guard: Option<AudioBusMixerGuard>,
) {
    guard_state.write().unwrap().guard = guard;
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global guard slot
pub fn set_audio_bus_muted(
    host_audio_mixer: &HostAudioMixerCapability,
    guard_state: &AudioMixerGuardStateRef,
    bus: &Ref<AudioBus>,
    muted: bool,
) -> bool {
    let (gain, memberships) = {
        let mut bus_value = bus.write().unwrap();
        bus_value.muted = muted;
        (bus_value.gain, bus_value.memberships.clone())
    };
    report_unmixed_bus(guard_state, bus, AudioBusMixerOperation::Mute, &memberships);
    for membership in memberships {
        (host_audio_mixer.set_bus_node_gain)(
            membership.graph,
            membership.node,
            if muted { 0.0 } else { gain },
        );
    }
    return muted;
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module-global guard slot
pub fn set_audio_bus_pan(
    host_audio_mixer: &HostAudioMixerCapability,
    guard_state: &AudioMixerGuardStateRef,
    bus: &Ref<AudioBus>,
    value: f32,
) -> f32 {
    let value = clamp(value, -1.0, 1.0);
    let memberships = {
        let mut bus_value = bus.write().unwrap();
        bus_value.pan = value;
        bus_value.memberships.clone()
    };
    report_unmixed_bus(guard_state, bus, AudioBusMixerOperation::Pan, &memberships);
    for membership in memberships {
        (host_audio_mixer.set_bus_node_pan)(membership.graph, membership.node, value);
    }
    return value;
}

pub fn set_audio_mixer_master_gain(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    value: f32,
) -> f32 {
    let graph = {
        let mut mixer = mixer.write().unwrap();
        mixer.master_gain = value;
        let muted = mixer.master_muted;
        mixer
            .mixer_runtime
            .as_ref()
            .map(|runtime| (runtime.graph, muted))
    };
    if let Some((graph, muted)) = graph {
        (host_audio_mixer.set_master_gain)(graph, if muted { 0.0 } else { value });
    }
    return value;
}

pub fn set_audio_mixer_master_muted(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    muted: bool,
) -> bool {
    let graph = {
        let mut mixer = mixer.write().unwrap();
        mixer.master_muted = muted;
        let gain = mixer.master_gain;
        mixer
            .mixer_runtime
            .as_ref()
            .map(|runtime| (runtime.graph, gain))
    };
    if let Some((graph, gain)) = graph {
        (host_audio_mixer.set_master_gain)(graph, if muted { 0.0 } else { gain });
    }
    return muted;
}

pub fn stop_all_audio_mixer_channels(mixer: &Ref<AudioMixer>) {
    let channels = {
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            return;
        };
        runtime.channels_paused_by_mixer.clear();
        std::mem::take(&mut runtime.active_channels)
    };
    for channel in channels {
        stop_audio_channel(&channel);
    }
}

pub fn unroute_audio_channel_from_mixer_bus(
    host_audio_mixer: &HostAudioMixerCapability,
    mixer: &Ref<AudioMixer>,
    channel: &Ref<AudioChannel>,
) {
    let graph = {
        let mut mixer = mixer.write().unwrap();
        let Some(runtime) = mixer.mixer_runtime.as_mut() else {
            return;
        };
        runtime
            .active_channels
            .retain(|active| !Arc::ptr_eq(active, channel));
        runtime
            .channels_paused_by_mixer
            .retain(|paused| !Arc::ptr_eq(paused, channel));
        let _routed_bus = runtime
            .channel_to_bus
            .iter()
            .find(|binding| Arc::ptr_eq(&binding.channel, channel))
            .map(|binding| binding.bus.clone());
        runtime
            .channel_to_bus
            .retain(|binding| !Arc::ptr_eq(&binding.channel, channel));
        runtime.graph
    };
    set_audio_channel_source_route(channel, None);
    let source = get_audio_channel_source_handle(channel);
    (host_audio_mixer.unroute_source)(graph, source);
    (host_audio_mixer.route_source_to_default)(graph, source);
}
