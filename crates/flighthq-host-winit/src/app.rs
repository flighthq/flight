//! `HostWinitApp` — the winit `ApplicationHandler` that owns the window, the
//! wgpu surface/render state, the input manager, and the per-frame protocol.
//!
//! Lifecycle:
//!   - `Resumed`: build the window + wgpu surface, register the wgpu renderers,
//!     install the window/screen backends, and run the user `scene_setup` to
//!     build the scene (returning the stage source id).
//!   - `RedrawRequested`: run `frame_update(dt, ...)`, then the documented
//!     render protocol via [`crate::frame::render_winit_frame`], then request the
//!     next redraw (continuous animation).
//!   - `Resized`: reconfigure the surface + render state.
//!   - `CloseRequested`: exit the event loop.
//!   - pointer/keyboard `WindowEvent`s: translate and dispatch into the
//!     `InputManager` (the host's input seam).
//!
//! The whole event loop needs a real display and GPU, so this module is
//! compile-checked only; the demo `cargo run` exercises it on a host machine.

use std::sync::Arc;
use std::time::Instant;

use flighthq_displayobject_wgpu::{
    register_default_wgpu_material, register_wgpu_color_transform_materials,
    register_wgpu_display_object_renderer, register_wgpu_sprite_renderer,
};
use flighthq_input::{
    InputManager, create_input_manager, dispatch_keyboard_event, dispatch_pointer_down_event,
    dispatch_pointer_move_event, dispatch_pointer_up_event, dispatch_wheel_event,
    get_key_code_from_key_name, get_key_modifier_from_flags,
};
use flighthq_render_wgpu::{WgpuRenderOptions, WgpuRenderState};

use winit::application::ApplicationHandler;
use winit::event::{Modifiers, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::ModifiersState;
use winit::window::{Window, WindowId};

use crate::bootstrap::{HostWinitSurface, create_winit_surface, resize_winit_surface};
use crate::frame::render_winit_frame;
use crate::input_translation::{
    build_winit_keyboard_data, build_winit_pointer_data, is_winit_press,
    translate_winit_mouse_button, translate_winit_scroll_delta, winit_key_name,
    winit_mouse_button_mask,
};
use crate::screen_backend::set_winit_screen_backend;
use crate::window_backend::set_winit_window_backend;

/// Builds the scene once the GPU is ready. Receives the live render state and
/// input manager (so a scene can connect input signals at setup time) and
/// returns the `source_id` of the stage display object to render each frame.
pub type WinitSceneSetup = dyn FnMut(&mut WgpuRenderState, &mut InputManager) -> u64;

/// Runs once per frame as the draw step, with the elapsed seconds since the last
/// frame. It executes between the background clear and submit, with the render
/// pass open, so the application advances animation/state, runs
/// `flighthq_render::prepare_display_object_render` over its scene, and then
/// `render_wgpu_display_object` to walk and draw the scene with its own topology,
/// proxy, and shape-geometry closures.
pub type WinitFrameUpdate = dyn FnMut(f32, &mut WgpuRenderState, &mut InputManager);

/// Window/render configuration for [`run_winit_app`].
#[derive(Clone, Debug)]
pub struct WinitAppConfig {
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub render_options: WgpuRenderOptions,
}

impl Default for WinitAppConfig {
    fn default() -> Self {
        Self {
            title: "Flight".to_string(),
            width: 800,
            height: 600,
            render_options: WgpuRenderOptions::default(),
        }
    }
}

/// The winit application handler. Construct via [`create_winit_app`] and drive it
/// with [`run_winit_app`], or hand it to `EventLoop::run_app` directly for full
/// control over the event loop.
pub struct HostWinitApp<'cb> {
    config: WinitAppConfig,
    scene_setup: &'cb mut WinitSceneSetup,
    frame_update: &'cb mut WinitFrameUpdate,
    instance: wgpu::Instance,
    host: Option<HostWinitSurface>,
    input: InputManager,
    stage_source_id: u64,
    cursor_x: f32,
    cursor_y: f32,
    buttons: u32,
    modifiers: ModifiersState,
    last_frame: Option<Instant>,
}

/// Creates a [`HostWinitApp`] bound to `config` and the user callbacks. No window
/// or GPU resource is created until the event loop emits `Resumed`.
pub fn create_winit_app<'cb>(
    config: WinitAppConfig,
    scene_setup: &'cb mut WinitSceneSetup,
    frame_update: &'cb mut WinitFrameUpdate,
) -> HostWinitApp<'cb> {
    HostWinitApp {
        config,
        scene_setup,
        frame_update,
        instance: wgpu::Instance::default(),
        host: None,
        input: create_input_manager(),
        stage_source_id: 0,
        cursor_x: 0.0,
        cursor_y: 0.0,
        buttons: 0,
        modifiers: ModifiersState::empty(),
        last_frame: None,
    }
}

/// Creates the event loop and runs a [`HostWinitApp`] to completion: opens a
/// window, sets up the wgpu render state, calls `scene_setup` to build the scene,
/// then drives the render loop calling `frame_update` each frame. Returns when
/// the window is closed.
///
/// Example the demo uses:
///
/// ```bash
/// cargo run --example spinning_square -p flighthq-host-winit
/// ```
pub fn run_winit_app(
    config: WinitAppConfig,
    scene_setup: &mut WinitSceneSetup,
    frame_update: &mut WinitFrameUpdate,
) {
    let event_loop = EventLoop::new().expect("create winit event loop");
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = create_winit_app(config, scene_setup, frame_update);
    event_loop.run_app(&mut app).expect("run winit app");
}

impl HostWinitApp<'_> {
    fn dispatch_pointer_event(&mut self, is_down: Option<bool>) {
        let mut data = build_winit_pointer_data(self.cursor_x, self.cursor_y, self.buttons);
        data.shift_key = self.modifiers.shift_key();
        data.ctrl_key = self.modifiers.control_key();
        data.alt_key = self.modifiers.alt_key();
        data.meta_key = self.modifiers.super_key();
        match is_down {
            Some(true) => dispatch_pointer_down_event(&mut self.input, data),
            Some(false) => dispatch_pointer_up_event(&mut self.input, data),
            None => dispatch_pointer_move_event(&mut self.input, data),
        }
    }
}

impl ApplicationHandler for HostWinitApp<'_> {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.host.is_some() {
            return;
        }

        let attributes = Window::default_attributes()
            .with_title(&self.config.title)
            .with_inner_size(winit::dpi::LogicalSize::new(
                self.config.width as f64,
                self.config.height as f64,
            ));
        let window = Arc::new(
            event_loop
                .create_window(attributes)
                .expect("create winit window"),
        );

        // Install the OS-integration seams from the live window/event loop.
        set_winit_window_backend(Arc::clone(&window));
        set_winit_screen_backend(
            event_loop.available_monitors(),
            event_loop.primary_monitor(),
        );

        let mut host = create_winit_surface(
            &self.instance,
            Arc::clone(&window),
            &self.config.render_options,
        )
        .expect("create wgpu surface/device for winit window");

        // Renderer registration is opt-in and happens once, after the render
        // state exists — never at module top level.
        register_wgpu_display_object_renderer(&mut host.render_state);
        register_wgpu_sprite_renderer(&mut host.render_state);
        register_default_wgpu_material(&mut host.render_state);
        register_wgpu_color_transform_materials(&mut host.render_state);

        self.stage_source_id = (self.scene_setup)(&mut host.render_state, &mut self.input);

        self.host = Some(host);
        self.last_frame = Some(Instant::now());
        window.request_redraw();
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),

            WindowEvent::Resized(size) => {
                if let Some(host) = self.host.as_mut() {
                    resize_winit_surface(host, size.width, size.height);
                    host.window.request_redraw();
                }
            }

            WindowEvent::ModifiersChanged(modifiers) => {
                self.modifiers = modifiers_state(&modifiers);
            }

            WindowEvent::CursorMoved { position, .. } => {
                self.cursor_x = position.x as f32;
                self.cursor_y = position.y as f32;
                self.dispatch_pointer_event(None);
            }

            WindowEvent::MouseInput { state, button, .. } => {
                if let Some(mapped) = translate_winit_mouse_button(button) {
                    let mask = winit_mouse_button_mask(mapped);
                    if is_winit_press(state) {
                        self.buttons |= mask;
                        self.dispatch_pointer_event(Some(true));
                    } else {
                        self.buttons &= !mask;
                        self.dispatch_pointer_event(Some(false));
                    }
                }
            }

            WindowEvent::MouseWheel { delta, .. } => {
                let (dx, dy, mode) = translate_winit_scroll_delta(delta);
                let data = build_winit_pointer_data(self.cursor_x, self.cursor_y, self.buttons);
                dispatch_wheel_event(
                    &mut self.input,
                    self.cursor_x,
                    self.cursor_y,
                    dx,
                    dy,
                    mode,
                    data,
                );
            }

            WindowEvent::KeyboardInput { event, .. } => {
                let key_name = winit_key_name(&event.logical_key);
                let key_code = get_key_code_from_key_name(&key_name);
                let modifier = modifier_mask(self.modifiers);
                let text = event.text.as_deref();
                let data = build_winit_keyboard_data(
                    &event.logical_key,
                    key_code,
                    modifier,
                    event.location,
                    text,
                    event.repeat,
                );
                dispatch_keyboard_event(&mut self.input, data, is_winit_press(event.state));
            }

            WindowEvent::RedrawRequested => {
                let now = Instant::now();
                let dt = self
                    .last_frame
                    .map(|prev| now.duration_since(prev).as_secs_f32())
                    .unwrap_or(0.0);
                self.last_frame = Some(now);

                let _stage = self.stage_source_id;
                let frame_update = &mut *self.frame_update;
                let input = &mut self.input;
                if let Some(host) = self.host.as_mut() {
                    // frame_update runs as the draw step: between the background
                    // clear and submit, with the render pass open, so it can run
                    // its prepare pass and the render_wgpu_display_object walk.
                    render_winit_frame(host, &mut |state| {
                        frame_update(dt, state, input);
                    });
                    host.window.request_redraw();
                }
            }

            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Extracts the modifier state from a winit `Modifiers` value.
fn modifiers_state(modifiers: &Modifiers) -> ModifiersState {
    modifiers.state()
}

// Maps a winit `ModifiersState` (side-agnostic) to a flighthq key-modifier
// bitmask, treating each held modifier as its left-side variant.
fn modifier_mask(state: ModifiersState) -> u32 {
    get_key_modifier_from_flags(
        state.shift_key(),
        false,
        state.control_key(),
        false,
        state.alt_key(),
        false,
        state.super_key(),
        false,
        false,
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifier_mask_maps_shift_and_ctrl() {
        let state = ModifiersState::SHIFT | ModifiersState::CONTROL;
        let mask = modifier_mask(state);
        assert!(mask & flighthq_types::input::key_modifier::SHIFT != 0);
        assert!(mask & flighthq_types::input::key_modifier::CTRL != 0);
        assert!(mask & flighthq_types::input::key_modifier::ALT == 0);
    }

    #[test]
    fn winit_app_config_default_is_sized() {
        let config = WinitAppConfig::default();
        assert_eq!(config.width, 800);
        assert_eq!(config.height, 600);
        assert_eq!(config.title, "Flight");
    }
}
