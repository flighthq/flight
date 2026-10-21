use std::sync::{Arc, RwLock};

use flight_entity::{Float32Array, Ref, allocate_entity};

use crate::types::{AudioBuffer, AudioResource};

pub fn create_audio_resource(buffer: Option<Ref<AudioBuffer>>) -> Ref<AudioResource> {
    let mut out: AudioResource = allocate_entity();
    initialize_audio_resource(&mut out, buffer);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_audio_resource(out: &mut AudioResource, buffer: Option<Ref<AudioBuffer>>) {
    out.buffer = buffer;
}

pub fn clone_audio_resource(resource: &Ref<AudioResource>) -> Ref<AudioResource> {
    let buffer = resource.read().unwrap().buffer.clone();
    return create_audio_resource(buffer);
}

pub fn dispose_audio_resource(resource: &Ref<AudioResource>) {
    resource.write().unwrap().buffer = None;
}

pub fn get_audio_resource_byte_size(resource: &Ref<AudioResource>) -> usize {
    let Some(buffer) = resource.read().unwrap().buffer.clone() else {
        return 0;
    };
    let buffer = buffer.read().unwrap();
    return buffer.channels.len() * buffer.length * std::mem::size_of::<f32>();
}

pub fn get_audio_resource_channel_count(resource: &Ref<AudioResource>) -> usize {
    let Some(buffer) = resource.read().unwrap().buffer.clone() else {
        return 0;
    };
    return buffer.read().unwrap().channels.len();
}

pub fn get_audio_resource_channel_data(
    resource: &Ref<AudioResource>,
    channel: i32,
) -> Option<Ref<Box<Float32Array>>> {
    if channel < 0 {
        return None;
    }
    let buffer = resource.read().unwrap().buffer.clone()?;
    return buffer
        .read()
        .unwrap()
        .channels
        .get(channel as usize)
        .cloned();
}

/// Returns decoded duration in seconds, matching Web Audio's double-precision derived attribute.
// flight-lint: allow(f64) AudioBuffer.duration is specified as a double-precision seconds value
pub fn get_audio_resource_duration(resource: &Ref<AudioResource>) -> f64 {
    let Some(buffer) = resource.read().unwrap().buffer.clone() else {
        return 0.0;
    };
    let buffer = buffer.read().unwrap();
    return buffer.length as f64 / f64::from(buffer.sample_rate);
}

pub fn get_audio_resource_sample_rate(resource: &Ref<AudioResource>) -> f32 {
    let Some(buffer) = resource.read().unwrap().buffer.clone() else {
        return 0.0;
    };
    return buffer.read().unwrap().sample_rate;
}

pub fn has_audio_resource_buffer(resource: &Ref<AudioResource>) -> bool {
    return resource.read().unwrap().buffer.is_some();
}

pub fn is_audio_resource_empty(resource: &Ref<AudioResource>) -> bool {
    let Some(buffer) = resource.read().unwrap().buffer.clone() else {
        return true;
    };
    return buffer.read().unwrap().length == 0;
}

impl AudioResource {
    pub fn new(buffer: Option<Ref<AudioBuffer>>) -> Ref<AudioResource> {
        return create_audio_resource(buffer);
    }
}
