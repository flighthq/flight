//! `flighthq-video` — video resources and URL constructors.

pub mod video_resource;

pub use video_resource::{
    create_video_resource, create_video_resource_from_url, create_video_resource_from_urls,
    dispose_video_resource, has_video_resource_data, load_video_resource_from_path,
    load_video_resource_from_url, load_video_resource_from_urls,
};
