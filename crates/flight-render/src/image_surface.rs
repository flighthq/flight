//! flight-compiler: target-native

use flight_entity::{Ref, get_entity_id};
use flight_surface::{CanvasSurface, HostCanvasCapability};

use crate::CanvasHostSurfaces;

// flight-lint: allow(f64) the canvas size is a TS Number logical size carried as f64 to the host, which converts it to its own device extent (foreman-536d86b7)
// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn create_canvas_host_surface(
    surfaces: &mut CanvasHostSurfaces,
    host: &HostCanvasCapability,
    width: f64,
    height: f64,
) -> Option<Ref<CanvasSurface>> {
    let surface = (host.create_surface)(width, height)?;
    let id = get_entity_id(&*surface.read().unwrap());
    surfaces.hosts.insert(id, host.clone());
    return Some(surface);
}

// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn destroy_canvas_host_surface(
    surfaces: &mut CanvasHostSurfaces,
    surface: &Ref<CanvasSurface>,
) {
    let id = get_entity_id(&*surface.read().unwrap());
    let Some(host) = surfaces.hosts.remove(&id) else {
        return;
    };
    (host.destroy_surface)(surface);
}

// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn get_canvas_host_surface(
    surfaces: &CanvasHostSurfaces,
    surface: &Ref<CanvasSurface>,
) -> Option<HostCanvasCapability> {
    let id = get_entity_id(&*surface.read().unwrap());
    return surfaces.hosts.get(&id).cloned();
}
