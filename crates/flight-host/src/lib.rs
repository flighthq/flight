// flight-lint: conform-skip(getHostWgpu, hasHostWgpu) Principal 6f61648b tracked pending Host wgpu surface is restored with render-wgpu acceptance; see agents/plan.md
//! The portable host interface (TS `@flighthq/host`): the capability-group aggregate, typed
//! capability queries, and host diagnostics. The groups are owned by their feature crates (D8) and
//! aggregated here.

mod enable_host_guards;
mod host;
mod host_explain;
mod host_query;
mod sugar;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` re-exports enableHostGuards, hostExplain and hostQuery, but
// not host construction: an app imports a built host rather than constructing one, so
// `create_host` / `initialize_host` stay on `contract`. The host types are public.
pub use contract::Host;
pub use contract::HostCapabilityBackend;
pub use contract::HostCapabilityCoverage;
pub use contract::HostCapabilityExplanation;
pub use contract::HostCapabilityGroupExplanation;
pub use contract::HostExplanation;
pub use contract::enable_host_guards;
pub use contract::explain_host;
pub use contract::explain_host_audio_device;
pub use contract::explain_host_audio_mixer;
pub use contract::explain_host_image;
pub use contract::explain_host_input_ingress;
pub use contract::explain_host_text_segmenter;
pub use contract::explain_host_text_shaper;
pub use contract::explain_host_video;
pub use contract::get_host_audio_device;
pub use contract::get_host_audio_mixer;
pub use contract::get_host_bitmap_encode;
pub use contract::get_host_bitmap_readback;
pub use contract::get_host_clipboard_formats;
pub use contract::get_host_device;
pub use contract::get_host_file_system;
pub use contract::get_host_font_loading;
pub use contract::get_host_geolocation;
pub use contract::get_host_glyph_rasterizer;
pub use contract::get_host_haptics;
pub use contract::get_host_image;
pub use contract::get_host_input_ingress;
pub use contract::get_host_lifecycle;
pub use contract::get_host_net;
pub use contract::get_host_notification_permission;
pub use contract::get_host_platform;
pub use contract::get_host_power_keep_awake;
pub use contract::get_host_preferences;
pub use contract::get_host_preferences_persistence_query;
pub use contract::get_host_screen_query;
pub use contract::get_host_sensors;
pub use contract::get_host_socket;
pub use contract::get_host_soft_keyboard_info;
pub use contract::get_host_text_segmenter;
pub use contract::get_host_text_shaper;
pub use contract::get_host_video;
pub use contract::has_host_audio_device;
pub use contract::has_host_audio_mixer;
pub use contract::has_host_bitmap_encode;
pub use contract::has_host_bitmap_readback;
pub use contract::has_host_clipboard_formats;
pub use contract::has_host_device;
pub use contract::has_host_file_system;
pub use contract::has_host_font_loading;
pub use contract::has_host_geolocation;
pub use contract::has_host_glyph_rasterizer;
pub use contract::has_host_haptics;
pub use contract::has_host_image;
pub use contract::has_host_input_ingress;
pub use contract::has_host_lifecycle;
pub use contract::has_host_net;
pub use contract::has_host_notification_permission;
pub use contract::has_host_platform;
pub use contract::has_host_power_keep_awake;
pub use contract::has_host_preferences;
pub use contract::has_host_preferences_persistence_query;
pub use contract::has_host_screen_query;
pub use contract::has_host_sensors;
pub use contract::has_host_socket;
pub use contract::has_host_soft_keyboard_info;
pub use contract::has_host_text_segmenter;
pub use contract::has_host_text_shaper;
pub use contract::has_host_video;
