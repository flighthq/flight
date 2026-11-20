#![doc = include_str!("../README.md")]

mod backend;
mod image_codecs_host;
#[cfg(feature = "jpeg")]
mod jpeg_backend;
#[cfg(feature = "png")]
mod png_backend;
mod types;

pub mod contract;

pub use contract::ImageCodecsHost;
pub use contract::ImageCodecsHostOperationExplanation;
pub use contract::ImageCodecsHostOperationExplanationReason;
pub use contract::ImageCodecsHostOptions;
pub use contract::create_image_codecs_host;
pub use contract::create_image_codecs_host_options;
pub use contract::decode_image_with_image_codecs_host;
pub use contract::destroy_image_codecs_host;
pub use contract::encode_image_with_image_codecs_host;
pub use contract::explain_image_codecs_host_decode;
pub use contract::explain_image_codecs_host_encode;
pub use contract::get_image_codecs_host_decode_capabilities;
pub use contract::get_image_codecs_host_encode_capabilities;
pub use contract::is_image_codecs_host_destroyed;
