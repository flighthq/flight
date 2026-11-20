#![doc = include_str!("../README.md")]

mod opentype_backend;
#[cfg(feature = "system-discovery")]
mod system_discovery;
mod text_host;
#[cfg(test)]
mod text_host_panic_tests;
mod types;

pub mod contract;

pub use contract::TextHost;
pub use contract::TextHostFaceOptions;
pub use contract::TextHostOperationExplanation;
pub use contract::TextHostOperationExplanationReason;
pub use contract::TextHostOptions;
pub use contract::create_text_host;
pub use contract::create_text_host_face_options;
pub use contract::create_text_host_options;
pub use contract::discover_system_font_with_text_host;
pub use contract::dispose_text_host;
pub use contract::explain_text_host_discover;
pub use contract::explain_text_host_load;
pub use contract::explain_text_host_metrics;
pub use contract::explain_text_host_rasterize;
pub use contract::explain_text_host_shape;
pub use contract::get_text_host_font_capabilities;
pub use contract::get_text_host_font_variation_axes;
pub use contract::get_text_host_glyph_capabilities;
pub use contract::get_text_host_shaper_capabilities;
pub use contract::is_text_host_disposed;
pub use contract::load_font_bytes_with_text_host;
pub use contract::measure_font_with_text_host;
pub use contract::rasterize_glyph_with_text_host;
pub use contract::shape_text_with_text_host;
