//! Fills the `flighthq-screen` [`ScreenBackend`] seam from winit monitors.
//!
//! winit only enumerates monitors through an `ActiveEventLoop`/`Window`, which
//! exists inside the event loop. So the host snapshots the monitors once (during
//! `Resumed`) into a `Vec<ScreenInfo>` and installs a backend that serves that
//! snapshot. The pure `ScreenInfo` builder ([`build_winit_screen_info`]) is the
//! unit-tested seam; live monitor enumeration is exercised by the demo run.

use std::sync::Arc;

use flighthq_types::Vector2Like;
use flighthq_types::screen::{ScreenBackend, ScreenChangeListener, ScreenInfo};

use winit::monitor::MonitorHandle;

/// A [`ScreenBackend`] serving a fixed monitor snapshot captured from winit.
pub struct WinitScreenBackend {
    screens: Vec<ScreenInfo>,
}

/// Builds a [`ScreenInfo`] from raw monitor geometry in physical pixels. Logical
/// width/height are derived by dividing by `scale_factor`; the work area is
/// reported as the full size (winit exposes no per-monitor work area).
pub fn build_winit_screen_info(
    id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    is_primary: bool,
) -> ScreenInfo {
    let scale = if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    } as f32;
    let logical_width = width as f32 / scale;
    let logical_height = height as f32 / scale;
    ScreenInfo {
        id,
        x: x as f32 / scale,
        y: y as f32 / scale,
        width: logical_width,
        height: logical_height,
        work_width: logical_width,
        work_height: logical_height,
        scale_factor: scale,
        is_primary,
        physical_width: width as f32,
        physical_height: height as f32,
        ..ScreenInfo::default()
    }
}

/// Converts a winit [`MonitorHandle`] (with `is_primary` resolved by the caller)
/// into a [`ScreenInfo`] via [`build_winit_screen_info`].
pub fn convert_winit_monitor(id: u32, monitor: &MonitorHandle, is_primary: bool) -> ScreenInfo {
    let size = monitor.size();
    let pos = monitor.position();
    build_winit_screen_info(
        id,
        pos.x,
        pos.y,
        size.width,
        size.height,
        monitor.scale_factor(),
        is_primary,
    )
}

/// Builds a [`WinitScreenBackend`] from an iterator of monitors and the primary
/// monitor, marking the matching entry primary. Call from inside the event loop
/// where monitor enumeration is available.
pub fn create_winit_screen_backend(
    monitors: impl Iterator<Item = MonitorHandle>,
    primary: Option<MonitorHandle>,
) -> Arc<WinitScreenBackend> {
    let screens = monitors
        .enumerate()
        .map(|(index, monitor)| {
            let is_primary = primary.as_ref() == Some(&monitor);
            convert_winit_monitor(index as u32, &monitor, is_primary)
        })
        .collect();
    Arc::new(WinitScreenBackend { screens })
}

/// Installs a winit-backed screen backend snapshot as the active screen backend.
pub fn set_winit_screen_backend(
    monitors: impl Iterator<Item = MonitorHandle>,
    primary: Option<MonitorHandle>,
) {
    flighthq_screen::set_screen_backend(Some(create_winit_screen_backend(monitors, primary)));
}

impl ScreenBackend for WinitScreenBackend {
    fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
        out.clear();
        out.extend(self.screens.iter().cloned());
        out
    }

    fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
        if let Some(primary) = self.screens.iter().find(|s| s.is_primary) {
            *out = primary.clone();
        } else if let Some(first) = self.screens.first() {
            *out = first.clone();
        }
        out
    }

    fn subscribe(&self, _listener: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync> {
        // The snapshot does not change; monitor hot-plug would be delivered by a
        // live backend wired to winit's window events. No-op unsubscribe.
        Box::new(|| {})
    }

    fn get_cursor_position<'a>(&self, out: &'a mut Vector2Like) -> &'a mut Vector2Like {
        // winit reports cursor position per-window via events, not a global
        // virtual-desktop query. The snapshot backend has no global cursor, so
        // it reports the (0, 0) sentinel; a live backend wires pointer events.
        out.x = 0.0;
        out.y = 0.0;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_winit_screen_info_derives_logical_size() {
        let info = build_winit_screen_info(0, 0, 0, 2560, 1440, 2.0, true);
        assert_eq!(info.width, 1280.0);
        assert_eq!(info.height, 720.0);
        assert_eq!(info.work_width, 1280.0);
        assert_eq!(info.scale_factor, 2.0);
        assert!(info.is_primary);
    }

    #[test]
    fn build_winit_screen_info_clamps_zero_scale() {
        let info = build_winit_screen_info(1, 100, 50, 800, 600, 0.0, false);
        assert_eq!(info.scale_factor, 1.0);
        assert_eq!(info.width, 800.0);
        assert_eq!(info.x, 100.0);
        assert_eq!(info.y, 50.0);
    }

    #[test]
    fn winit_screen_backend_serves_snapshot() {
        let backend = WinitScreenBackend {
            screens: vec![
                build_winit_screen_info(0, 0, 0, 1920, 1080, 1.0, false),
                build_winit_screen_info(1, 1920, 0, 2560, 1440, 1.0, true),
            ],
        };
        let mut out = Vec::new();
        backend.get_screens(&mut out);
        assert_eq!(out.len(), 2);

        let mut primary = ScreenInfo::default();
        backend.get_primary_screen(&mut primary);
        assert_eq!(primary.id, 1);
        assert!(primary.is_primary);
    }

    #[test]
    fn winit_screen_backend_primary_falls_back_to_first() {
        let backend = WinitScreenBackend {
            screens: vec![build_winit_screen_info(0, 0, 0, 800, 600, 1.0, false)],
        };
        let mut primary = ScreenInfo::default();
        backend.get_primary_screen(&mut primary);
        assert_eq!(primary.id, 0);
    }
}
