//! Flight SDK — the convenience re-export barrel.
//!
//! This crate is a single entry point that re-exports the public API of every
//! other Flight crate, so an application can depend on `flighthq-sdk` alone and
//! reach the whole SDK through one `use` path:
//!
//! ```ignore
//! use flighthq_sdk::*;
//! ```
//!
//! It contains no logic of its own. Every name here is owned by the crate it
//! comes from; this file only forwards them. Flight's globally-unique naming
//! discipline means these wildcard re-exports do not collide, so the barrel
//! tree-shakes (links) identically to depending on the individual crates
//! directly — depending on `flighthq-sdk` is a convenience, not a cost.
//!
//! Library authors and size-sensitive consumers should depend on the specific
//! crates they need (`flighthq-node`, `flighthq-render`, …) rather than this
//! barrel, so their public surface and dependency graph stay narrow.

// This crate is intentionally a barrel-of-barrels: it `pub use`s every Flight
// crate with a glob. Flight's globally-unique naming means the same item can be
// reachable through more than one re-export path (e.g. a type re-exported by both
// its owner and a higher crate), which rustc flags as ambiguous — harmless here
// by design, since the colliding paths resolve to the same item.
#![allow(ambiguous_glob_reexports)]

// Foundation: shared types, math, logging, entity/runtime primitives, geometry.
pub use flighthq_entity::*;
pub use flighthq_geometry::*;
pub use flighthq_log::*;
pub use flighthq_math::*;
pub use flighthq_signals::*;
pub use flighthq_types::*;

// Scene graph and graph families.
pub use flighthq_clip::*;
pub use flighthq_displayobject::*;
pub use flighthq_node::*;
pub use flighthq_path::*;
pub use flighthq_scene::*;
pub use flighthq_shape::*;
pub use flighthq_sprite::*;
pub use flighthq_velocity::*;

// 3D pipeline: mesh/light/texture/camera value crates.
pub use flighthq_camera::*;
pub use flighthq_lighting::*;
pub use flighthq_mesh::*;
pub use flighthq_texture::*;

// Rendering: registration/pipeline, backend cores, and per-subject leaves.
pub use flighthq_displayobject_gl::*;
pub use flighthq_displayobject_skia::*;
pub use flighthq_displayobject_wgpu::*;
pub use flighthq_render::*;
pub use flighthq_render_gl::*;
pub use flighthq_render_wgpu::*;
pub use flighthq_scene_gl::*;
pub use flighthq_scene_wgpu::*;

// Filters and effects: descriptors plus per-backend implementations.
pub use flighthq_effects::*;
pub use flighthq_effects_gl::*;
pub use flighthq_effects_wgpu::*;
pub use flighthq_filters::*;
pub use flighthq_filters_gl::*;
pub use flighthq_filters_wgpu::*;

// Materials and offscreen pixel surfaces.
pub use flighthq_filters_surface::*;
pub use flighthq_materials::*;
pub use flighthq_surface::*;

// Text.
pub use flighthq_text::*;
pub use flighthq_textinput::*;
pub use flighthq_textlayout::*;
pub use flighthq_textshaper::*;

// Resources and loading.
pub use flighthq_audio::*;
pub use flighthq_font::*;
pub use flighthq_image::*;
pub use flighthq_loader::*;
pub use flighthq_textureatlas::*;
pub use flighthq_tileset::*;
pub use flighthq_video::*;

// Animation: tweens, timelines, spritesheets, particles, keyframe animation.
pub use flighthq_animation::*;
pub use flighthq_easing::*;
pub use flighthq_particles::*;
pub use flighthq_particles_formats::*;
pub use flighthq_spritesheet::*;
pub use flighthq_spritesheet_formats::*;
pub use flighthq_timeline::*;
pub use flighthq_tween::*;

// Input and interaction.
pub use flighthq_input::*;
pub use flighthq_interaction::*;

// Application, windowing, and media.
pub use flighthq_application::*;
pub use flighthq_media::*;

// Platform integration suite: OS/host capabilities behind swappable backends.
pub use flighthq_clipboard::*;
pub use flighthq_device::*;
pub use flighthq_dialog::*;
pub use flighthq_filesystem::*;
pub use flighthq_filters_math::*;
pub use flighthq_geolocation::*;
pub use flighthq_haptics::*;
pub use flighthq_keyboard::*;
pub use flighthq_lifecycle::*;
pub use flighthq_menu::*;
pub use flighthq_network::*;
pub use flighthq_notification::*;
pub use flighthq_picking::*;
pub use flighthq_platform::*;
pub use flighthq_power::*;
pub use flighthq_scene_formats::*;
pub use flighthq_screen::*;
pub use flighthq_sensors::*;
pub use flighthq_share::*;
pub use flighthq_shell::*;
pub use flighthq_shortcut::*;
pub use flighthq_skeleton::*;
pub use flighthq_statusbar::*;
pub use flighthq_storage::*;
pub use flighthq_textureatlas_formats::*;
pub use flighthq_tray::*;
pub use flighthq_useragent::*;
pub use flighthq_webcam::*;

// Application/process layer: host shell integration beyond a single window.
pub use flighthq_app::*;
pub use flighthq_ipc::*;
pub use flighthq_protocol::*;
pub use flighthq_updater::*;

#[cfg(test)]
mod tests {
    // The barrel only forwards names; these reach a representative export from
    // each domain through the `flighthq_sdk` path to prove the re-export wiring.
    use crate as sdk;

    #[test]
    fn exports_create_application() {
        // Reaching the function item through the barrel proves the re-export.
        let _app = sdk::create_application();
    }

    #[test]
    fn exports_parse_user_agent_name() {
        // Reaching a useragent export through the barrel proves the re-export.
        let _name = sdk::parse_user_agent_name("");
    }
}
