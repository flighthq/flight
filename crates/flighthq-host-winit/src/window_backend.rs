//! Fills the `flighthq-application` [`WindowBackend`] seam over a winit window.
//!
//! A `WinitWindowBackend` holds the `Arc<Window>` created by the host and
//! forwards window-control commands (title, size, position, min/max/restore,
//! fullscreen, always-on-top, attention, constraints) to winit. Install it with
//! [`set_winit_window_backend`] so the SDK's `set_window_title`, `set_window_size`,
//! etc. drive the real OS window.
//!
//! Commands without a winit equivalent (icon, opacity, taskbar skip, menu-bar,
//! parent, progress, open) are no-ops here and noted; native desktop platforms
//! that expose them belong in a richer backend. `get_bounds` reports the window's
//! real outer position and inner size.

use std::sync::Arc;

use flighthq_application::WindowBackend;
use flighthq_types::misc::{ApplicationWindow, WindowBounds, WindowOptions};

use winit::dpi::{LogicalPosition, LogicalSize};
use winit::window::{Fullscreen, UserAttentionType, Window, WindowLevel};

/// A [`WindowBackend`] backed by a single winit window. The host creates one
/// window and one backend; multi-window hosts need a registry keyed by window id
/// (a future extension — see the module note).
pub struct WinitWindowBackend {
    window: Arc<Window>,
}

/// Creates a [`WinitWindowBackend`] forwarding to `window`.
pub fn create_winit_window_backend(window: Arc<Window>) -> Arc<WinitWindowBackend> {
    Arc::new(WinitWindowBackend { window })
}

/// Installs a [`WinitWindowBackend`] for `window` as the active window backend,
/// so `flighthq-application`'s window command functions drive this OS window.
pub fn set_winit_window_backend(window: Arc<Window>) {
    flighthq_application::set_window_backend(Some(create_winit_window_backend(window)));
}

impl WindowBackend for WinitWindowBackend {
    fn open(&self, _win: &mut ApplicationWindow, _options: &WindowOptions) -> bool {
        // The host owns window creation through the event loop; opening a brand
        // new OS window from here is not supported by this single-window backend.
        false
    }

    fn close(&self, _win: &ApplicationWindow) {
        // winit windows close when dropped / via event-loop exit, not from here.
    }

    fn center(&self, win: &ApplicationWindow) {
        if let Some(monitor) = self.window.current_monitor() {
            let screen = monitor.size();
            let x = (screen.width as f32 - win.width).max(0.0) / 2.0;
            let y = (screen.height as f32 - win.height).max(0.0) / 2.0;
            self.window.set_outer_position(LogicalPosition::new(x, y));
        }
    }

    fn focus(&self, _win: &ApplicationWindow) {
        self.window.focus_window();
    }

    fn get_bounds(&self, win: &ApplicationWindow, out: &mut WindowBounds) {
        let size = self.window.inner_size();
        let scale = self.window.scale_factor() as f32;
        out.width = size.width as f32 / scale;
        out.height = size.height as f32 / scale;
        match self.window.outer_position() {
            Ok(pos) => {
                out.x = pos.x as f32 / scale;
                out.y = pos.y as f32 / scale;
            }
            Err(_) => {
                out.x = win.x;
                out.y = win.y;
            }
        }
    }

    fn hide(&self, _win: &ApplicationWindow) {
        self.window.set_visible(false);
    }

    fn maximize(&self, _win: &ApplicationWindow) {
        self.window.set_maximized(true);
    }

    fn minimize(&self, _win: &ApplicationWindow) {
        self.window.set_minimized(true);
    }

    fn request_attention(&self, _win: &ApplicationWindow, attention: bool) {
        let request = attention.then_some(UserAttentionType::Informational);
        self.window.request_user_attention(request);
    }

    fn restore(&self, _win: &ApplicationWindow) {
        self.window.set_minimized(false);
        self.window.set_maximized(false);
    }

    fn set_always_on_top(&self, _win: &ApplicationWindow, always_on_top: bool) {
        let level = if always_on_top {
            WindowLevel::AlwaysOnTop
        } else {
            WindowLevel::Normal
        };
        self.window.set_window_level(level);
    }

    fn set_content_protection(&self, _win: &ApplicationWindow, enabled: bool) {
        self.window.set_content_protected(enabled);
    }

    fn flash_window_frame(&self, _win: &ApplicationWindow) {
        self.window
            .request_user_attention(Some(winit::window::UserAttentionType::Informational));
    }

    fn set_fullscreen(&self, _win: &ApplicationWindow, fullscreen: bool) {
        let mode = fullscreen.then(|| Fullscreen::Borderless(None));
        self.window.set_fullscreen(mode);
    }

    fn set_has_shadow(&self, _win: &ApplicationWindow, _has_shadow: bool) {
        // winit has no portable window-shadow control; a platform-specific
        // backend (macOS) fills this. No-op on the base host.
    }

    fn set_icon(&self, _win: &ApplicationWindow, _icon: &str) {
        // Loading an icon from a path/data-URL string is out of scope for the
        // base host; a native backend that decodes images fills this.
    }

    fn set_maximum_size(&self, _win: &ApplicationWindow, width: f32, height: f32) {
        let size = (width > 0.0 && height > 0.0).then_some(LogicalSize::new(width, height));
        self.window.set_max_inner_size(size);
    }

    fn set_menu_bar_visible(&self, _win: &ApplicationWindow, _visible: bool) {
        // No portable winit menu bar; owned by a native menu backend.
    }

    fn set_minimum_size(&self, _win: &ApplicationWindow, width: f32, height: f32) {
        let size = (width > 0.0 && height > 0.0).then_some(LogicalSize::new(width, height));
        self.window.set_min_inner_size(size);
    }

    fn set_opacity(&self, _win: &ApplicationWindow, _opacity: f32) {
        // winit has no portable per-window opacity setter.
    }

    fn set_parent(&self, _win: &ApplicationWindow, _parent: Option<&ApplicationWindow>) {
        // Parent/child windowing is platform-specific; not exposed here.
    }

    fn set_position(&self, _win: &ApplicationWindow, x: f32, y: f32) {
        self.window.set_outer_position(LogicalPosition::new(x, y));
    }

    fn set_progress(&self, _win: &ApplicationWindow, _progress: f32) {
        // Taskbar/dock progress is a native-shell concern.
    }

    fn set_resizable(&self, _win: &ApplicationWindow, resizable: bool) {
        self.window.set_resizable(resizable);
    }

    fn set_size(&self, _win: &ApplicationWindow, width: f32, height: f32) {
        let _ = self
            .window
            .request_inner_size(LogicalSize::new(width, height));
    }

    fn set_skip_taskbar(&self, _win: &ApplicationWindow, _skip: bool) {
        // Skip-taskbar is platform-specific; not exposed by base winit.
    }

    fn set_title(&self, _win: &ApplicationWindow, title: &str) {
        self.window.set_title(title);
    }

    fn show(&self, _win: &ApplicationWindow) {
        self.window.set_visible(true);
    }
}

#[cfg(test)]
mod tests {
    // Constructing a winit Window requires an active event loop and display, so
    // the backend is compile-checked only; behavior is verified by the demo run.
}
