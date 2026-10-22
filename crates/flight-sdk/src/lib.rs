//! The Flight SDK (TS `@flighthq/sdk`, D21): one dependency that re-exports every SDK crate's public
//! lane, one glob per crate as in `sdk/src/index.ts`. Contract lanes stay out; sugar travels with the
//! types. Host adapters are not included (D26: apps add the providers they want). Each crate is also
//! reachable as a module, mirroring the per-package subpaths (`@flighthq/sdk/geometry` is
//! `flight_sdk::geometry`). The `gl` and `wgpu` features (both on by default) gate the native render
//! backends. TS-only packages (the Canvas and DOM renderers, `effects-canvas`) have no crate; TS `mesh`
//! is `meshgeometry`.

mod sdk_host;

// Every crate root carries `contract` (and some carry `types`) modules. Contract lanes stay out of the
// SDK (D21), so these private names shadow the glob-imported ones.
#[allow(dead_code, hidden_glob_reexports)]
mod contract {}
#[allow(dead_code, hidden_glob_reexports)]
mod types {}

pub use sdk_host::*;

pub use flight_abc::*;
pub use flight_accessibility::*;
pub use flight_adjustments::*;
pub use flight_animation::*;
pub use flight_app::*;
pub use flight_assets::*;
pub use flight_audio::*;
pub use flight_binpack::*;
pub use flight_bitmap::*;
pub use flight_bitmapfont::*;
pub use flight_bitmapfont_formats::*;
pub use flight_bitmaptext::*;
pub use flight_buffer::*;
pub use flight_camera::*;
pub use flight_camera_controls::*;
pub use flight_capture::*;
pub use flight_clip::*;
pub use flight_clipboard::*;
pub use flight_clock::*;
pub use flight_collision::*;
pub use flight_color::*;
pub use flight_command::*;
pub use flight_compression::*;
pub use flight_connectivity::*;
pub use flight_debug::*;
pub use flight_device::*;
pub use flight_dialog::*;
pub use flight_easing::*;
pub use flight_effects::*;
#[cfg(feature = "gl")]
pub use flight_effects_gl::*;
#[cfg(feature = "wgpu")]
pub use flight_effects_wgpu::*;
pub use flight_encoding::*;
pub use flight_entity::*;
pub use flight_filesystem::*;
pub use flight_flow::*;
pub use flight_font::*;
pub use flight_font_formats::*;
pub use flight_geolocation::*;
pub use flight_geometry::*;
pub use flight_gizmo::*;
pub use flight_glyphatlas::*;
pub use flight_gui::*;
pub use flight_haptics::*;
pub use flight_host::*;
pub use flight_image::*;
pub use flight_image_codec::*;
pub use flight_importdiagnostics::*;
pub use flight_input::*;
pub use flight_interaction::*;
pub use flight_intl::*;
pub use flight_ipc::*;
pub use flight_keyboard::*;
pub use flight_layout::*;
pub use flight_lifecycle::*;
pub use flight_lighting::*;
pub use flight_loader::*;
pub use flight_log::*;
pub use flight_materials::*;
pub use flight_math::*;
pub use flight_media::*;
pub use flight_mediasession::*;
pub use flight_menu::*;
pub use flight_meshgeometry::*;
pub use flight_midi::*;
pub use flight_motionpath::*;
pub use flight_movieclip::*;
pub use flight_net::*;
pub use flight_node::*;
pub use flight_notification::*;
pub use flight_particleemitter::*;
pub use flight_particles::*;
pub use flight_particles_formats::*;
pub use flight_path::*;
pub use flight_path_boolean::*;
pub use flight_path_formats::*;
pub use flight_permissions::*;
pub use flight_physics2d::*;
pub use flight_physics2d_abi::*;
pub use flight_physics3d::*;
pub use flight_physics3d_abi::*;
pub use flight_picking::*;
pub use flight_platform::*;
pub use flight_power::*;
pub use flight_preferences::*;
pub use flight_protocol::*;
pub use flight_quadbatch::*;
pub use flight_regexp::*;
pub use flight_registry::*;
pub use flight_render::*;
#[cfg(feature = "gl")]
pub use flight_render_gl::*;
#[cfg(feature = "wgpu")]
pub use flight_render_wgpu::*;
pub use flight_requirement::*;
pub use flight_requirement_catalog::*;
pub use flight_requirement_codegen::*;
pub use flight_resource::*;
pub use flight_scene_document::*;
pub use flight_scene2d::*;
pub use flight_scene2d_formats::*;
#[cfg(feature = "gl")]
pub use flight_scene2d_gl::*;
pub use flight_scene2d_resources::*;
#[cfg(feature = "wgpu")]
pub use flight_scene2d_wgpu::*;
pub use flight_scene3d::*;
pub use flight_scene3d_formats::*;
#[cfg(feature = "gl")]
pub use flight_scene3d_gl::*;
pub use flight_scene3d_resources::*;
#[cfg(feature = "wgpu")]
pub use flight_scene3d_wgpu::*;
pub use flight_screen::*;
pub use flight_selection::*;
pub use flight_sensors::*;
pub use flight_shading::*;
pub use flight_shape::*;
pub use flight_shape_formats::*;
pub use flight_share::*;
pub use flight_shell::*;
pub use flight_shortcut::*;
pub use flight_signals::*;
pub use flight_skeleton2d::*;
pub use flight_skeleton2d_formats::*;
pub use flight_skeleton3d::*;
pub use flight_snapshot::*;
pub use flight_socket::*;
pub use flight_spatial::*;
pub use flight_spring::*;
pub use flight_spritesheet::*;
pub use flight_spritesheet_formats::*;
pub use flight_statechart::*;
pub use flight_statusbar::*;
pub use flight_stream::*;
pub use flight_surface::*;
pub use flight_swf::*;
pub use flight_text::*;
pub use flight_text_markup::*;
pub use flight_textbidi::*;
pub use flight_textformat::*;
pub use flight_textinput::*;
pub use flight_textlayout::*;
pub use flight_textsegment::*;
pub use flight_textshaper::*;
pub use flight_texture::*;
pub use flight_texture_formats::*;
pub use flight_textureatlas::*;
pub use flight_textureatlas_formats::*;
pub use flight_tilemap::*;
pub use flight_tilemap_formats::*;
pub use flight_timeline::*;
pub use flight_tokens::*;
pub use flight_tray::*;
pub use flight_tween::*;
pub use flight_updater::*;
pub use flight_useragent::*;
pub use flight_velocity::*;
pub use flight_video::*;
// The webcam public lane is empty (TS `@flighthq/webcam` index exports nothing yet).
#[allow(unused_imports)]
pub use flight_webcam::*;
pub use flight_xml::*;

pub mod abc {
    pub use flight_abc::*;
}

pub mod accessibility {
    pub use flight_accessibility::*;
}

pub mod adjustments {
    pub use flight_adjustments::*;
}

pub mod animation {
    pub use flight_animation::*;
}

pub mod app {
    pub use flight_app::*;
}

pub mod assets {
    pub use flight_assets::*;
}

pub mod audio {
    pub use flight_audio::*;
}

pub mod binpack {
    pub use flight_binpack::*;
}

pub mod bitmap {
    pub use flight_bitmap::*;
}

pub mod bitmapfont {
    pub use flight_bitmapfont::*;
}

pub mod bitmapfont_formats {
    pub use flight_bitmapfont_formats::*;
}

pub mod bitmaptext {
    pub use flight_bitmaptext::*;
}

pub mod buffer {
    pub use flight_buffer::*;
}

pub mod camera {
    pub use flight_camera::*;
}

pub mod camera_controls {
    pub use flight_camera_controls::*;
}

pub mod capture {
    pub use flight_capture::*;
}

pub mod clip {
    pub use flight_clip::*;
}

pub mod clipboard {
    pub use flight_clipboard::*;
}

pub mod clock {
    pub use flight_clock::*;
}

pub mod collision {
    pub use flight_collision::*;
}

pub mod color {
    pub use flight_color::*;
}

pub mod command {
    pub use flight_command::*;
}

pub mod compression {
    pub use flight_compression::*;
}

pub mod connectivity {
    pub use flight_connectivity::*;
}

pub mod debug {
    pub use flight_debug::*;
}

pub mod device {
    pub use flight_device::*;
}

pub mod dialog {
    pub use flight_dialog::*;
}

pub mod easing {
    pub use flight_easing::*;
}

pub mod effects {
    pub use flight_effects::*;
}

#[cfg(feature = "gl")]
pub mod effects_gl {
    pub use flight_effects_gl::*;
}

#[cfg(feature = "wgpu")]
pub mod effects_wgpu {
    pub use flight_effects_wgpu::*;
}

pub mod encoding {
    pub use flight_encoding::*;
}

pub mod entity {
    pub use flight_entity::*;
}

pub mod filesystem {
    pub use flight_filesystem::*;
}

pub mod flow {
    pub use flight_flow::*;
}

pub mod font {
    pub use flight_font::*;
}

pub mod font_formats {
    pub use flight_font_formats::*;
}

pub mod geolocation {
    pub use flight_geolocation::*;
}

pub mod geometry {
    pub use flight_geometry::*;
}

pub mod gizmo {
    pub use flight_gizmo::*;
}

pub mod glyphatlas {
    pub use flight_glyphatlas::*;
}

pub mod gui {
    pub use flight_gui::*;
}

pub mod haptics {
    pub use flight_haptics::*;
}

pub mod host {
    pub use flight_host::*;
}

pub mod image {
    pub use flight_image::*;
}

pub mod image_codec {
    pub use flight_image_codec::*;
}

pub mod importdiagnostics {
    pub use flight_importdiagnostics::*;
}

pub mod input {
    pub use flight_input::*;
}

pub mod interaction {
    pub use flight_interaction::*;
}

pub mod intl {
    pub use flight_intl::*;
}

pub mod ipc {
    pub use flight_ipc::*;
}

pub mod keyboard {
    pub use flight_keyboard::*;
}

pub mod layout {
    pub use flight_layout::*;
}

pub mod lifecycle {
    pub use flight_lifecycle::*;
}

pub mod lighting {
    pub use flight_lighting::*;
}

pub mod loader {
    pub use flight_loader::*;
}

pub mod log {
    pub use flight_log::*;
}

pub mod materials {
    pub use flight_materials::*;
}

pub mod math {
    pub use flight_math::*;
}

pub mod media {
    pub use flight_media::*;
}

pub mod mediasession {
    pub use flight_mediasession::*;
}

pub mod menu {
    pub use flight_menu::*;
}

pub mod meshgeometry {
    pub use flight_meshgeometry::*;
}

pub mod midi {
    pub use flight_midi::*;
}

pub mod motionpath {
    pub use flight_motionpath::*;
}

pub mod movieclip {
    pub use flight_movieclip::*;
}

pub mod net {
    pub use flight_net::*;
}

pub mod node {
    pub use flight_node::*;
}

pub mod notification {
    pub use flight_notification::*;
}

pub mod particleemitter {
    pub use flight_particleemitter::*;
}

pub mod particles {
    pub use flight_particles::*;
}

pub mod particles_formats {
    pub use flight_particles_formats::*;
}

pub mod path {
    pub use flight_path::*;
}

pub mod path_boolean {
    pub use flight_path_boolean::*;
}

pub mod path_formats {
    pub use flight_path_formats::*;
}

pub mod permissions {
    pub use flight_permissions::*;
}

pub mod physics2d {
    pub use flight_physics2d::*;
}

pub mod physics2d_abi {
    pub use flight_physics2d_abi::*;
}

pub mod physics3d {
    pub use flight_physics3d::*;
}

pub mod physics3d_abi {
    pub use flight_physics3d_abi::*;
}

pub mod picking {
    pub use flight_picking::*;
}

pub mod platform {
    pub use flight_platform::*;
}

pub mod power {
    pub use flight_power::*;
}

pub mod preferences {
    pub use flight_preferences::*;
}

pub mod protocol {
    pub use flight_protocol::*;
}

pub mod quadbatch {
    pub use flight_quadbatch::*;
}

pub mod regexp {
    pub use flight_regexp::*;
}

pub mod registry {
    pub use flight_registry::*;
}

pub mod render {
    pub use flight_render::*;
}

#[cfg(feature = "gl")]
pub mod render_gl {
    pub use flight_render_gl::*;
}

#[cfg(feature = "wgpu")]
pub mod render_wgpu {
    pub use flight_render_wgpu::*;
}

pub mod requirement {
    pub use flight_requirement::*;
}

pub mod requirement_catalog {
    pub use flight_requirement_catalog::*;
}

pub mod requirement_codegen {
    pub use flight_requirement_codegen::*;
}

pub mod resource {
    pub use flight_resource::*;
}

pub mod scene_document {
    pub use flight_scene_document::*;
}

pub mod scene2d {
    pub use flight_scene2d::*;
}

pub mod scene2d_formats {
    pub use flight_scene2d_formats::*;
}

#[cfg(feature = "gl")]
pub mod scene2d_gl {
    pub use flight_scene2d_gl::*;
}

pub mod scene2d_resources {
    pub use flight_scene2d_resources::*;
}

#[cfg(feature = "wgpu")]
pub mod scene2d_wgpu {
    pub use flight_scene2d_wgpu::*;
}

pub mod scene3d {
    pub use flight_scene3d::*;
}

pub mod scene3d_formats {
    pub use flight_scene3d_formats::*;
}

#[cfg(feature = "gl")]
pub mod scene3d_gl {
    pub use flight_scene3d_gl::*;
}

pub mod scene3d_resources {
    pub use flight_scene3d_resources::*;
}

#[cfg(feature = "wgpu")]
pub mod scene3d_wgpu {
    pub use flight_scene3d_wgpu::*;
}

pub mod screen {
    pub use flight_screen::*;
}

pub mod selection {
    pub use flight_selection::*;
}

pub mod sensors {
    pub use flight_sensors::*;
}

pub mod shading {
    pub use flight_shading::*;
}

pub mod shape {
    pub use flight_shape::*;
}

pub mod shape_formats {
    pub use flight_shape_formats::*;
}

pub mod share {
    pub use flight_share::*;
}

pub mod shell {
    pub use flight_shell::*;
}

pub mod shortcut {
    pub use flight_shortcut::*;
}

pub mod signals {
    pub use flight_signals::*;
}

pub mod skeleton2d {
    pub use flight_skeleton2d::*;
}

pub mod skeleton2d_formats {
    pub use flight_skeleton2d_formats::*;
}

pub mod skeleton3d {
    pub use flight_skeleton3d::*;
}

pub mod snapshot {
    pub use flight_snapshot::*;
}

pub mod socket {
    pub use flight_socket::*;
}

pub mod spatial {
    pub use flight_spatial::*;
}

pub mod spring {
    pub use flight_spring::*;
}

pub mod spritesheet {
    pub use flight_spritesheet::*;
}

pub mod spritesheet_formats {
    pub use flight_spritesheet_formats::*;
}

pub mod statechart {
    pub use flight_statechart::*;
}

pub mod statusbar {
    pub use flight_statusbar::*;
}

pub mod stream {
    pub use flight_stream::*;
}

pub mod surface {
    pub use flight_surface::*;
}

pub mod swf {
    pub use flight_swf::*;
}

pub mod text {
    pub use flight_text::*;
}

pub mod text_markup {
    pub use flight_text_markup::*;
}

pub mod textbidi {
    pub use flight_textbidi::*;
}

pub mod textformat {
    pub use flight_textformat::*;
}

pub mod textinput {
    pub use flight_textinput::*;
}

pub mod textlayout {
    pub use flight_textlayout::*;
}

pub mod textsegment {
    pub use flight_textsegment::*;
}

pub mod textshaper {
    pub use flight_textshaper::*;
}

pub mod texture {
    pub use flight_texture::*;
}

pub mod texture_formats {
    pub use flight_texture_formats::*;
}

pub mod textureatlas {
    pub use flight_textureatlas::*;
}

pub mod textureatlas_formats {
    pub use flight_textureatlas_formats::*;
}

pub mod tilemap {
    pub use flight_tilemap::*;
}

pub mod tilemap_formats {
    pub use flight_tilemap_formats::*;
}

pub mod timeline {
    pub use flight_timeline::*;
}

pub mod tokens {
    pub use flight_tokens::*;
}

pub mod tray {
    pub use flight_tray::*;
}

pub mod tween {
    pub use flight_tween::*;
}

pub mod updater {
    pub use flight_updater::*;
}

pub mod useragent {
    pub use flight_useragent::*;
}

pub mod velocity {
    pub use flight_velocity::*;
}

pub mod video {
    pub use flight_video::*;
}

pub mod webcam {
    // The webcam public lane is empty (TS `@flighthq/webcam` index exports nothing yet).
#[allow(unused_imports)]
pub use flight_webcam::*;
}

pub mod xml {
    pub use flight_xml::*;
}
