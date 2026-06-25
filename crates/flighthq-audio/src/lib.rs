//! `flighthq-audio` — audio resources, URL constructors, and the shared audio context.

pub mod audio_resource;

pub use audio_resource::{
    create_audio_resource, create_audio_resource_from_url, create_audio_resource_from_urls,
    dispose_audio_resource, has_audio_resource_data, load_audio_resource_from_bytes,
    load_audio_resource_from_path, load_audio_resource_from_url, load_audio_resource_from_urls,
};
