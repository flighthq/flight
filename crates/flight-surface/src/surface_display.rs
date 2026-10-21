//! Backing-store resize and logical display size (TS `surfaceDisplay.ts`).

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::surface::allocate_surface;
    use std::sync::Arc;

    fn capability(
        seen: std::sync::Arc<std::sync::Mutex<Vec<(f32, f32)>>>,
    ) -> HostSurfaceResizeCapability {
        return HostSurfaceResizeCapability {
            provider: Arc::new(()),
            resize: Arc::new(move |_surface: &SurfaceRef, width: f32, height: f32| {
                seen.lock().unwrap().push((width, height));
            }),
        };
    }

    #[test]
    fn resize_method_matches_resize_surface() {
        let method_seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let free_seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let method_capability = capability(method_seen.clone());
        let free_capability = capability(free_seen.clone());
        let surface: SurfaceRef = allocate_surface::<SurfaceBase>(None);
        method_capability.resize(&surface, 4.0, 2.0);
        resize_surface(&free_capability, &surface, 4.0, 2.0);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }
}

/// Resizes a surface's backing store in device pixels (TS `resizeSurface`).
pub fn resize_surface(
    capability: &HostSurfaceResizeCapability,
    surface: &SurfaceRef,
    width: f32,
    height: f32,
) {
    return (capability.resize)(surface, width, height);
}

/// Sets the logical presentation size, independent of the backing store (TS
/// `setSurfaceDisplaySize`).
pub fn set_surface_display_size(
    capability: &HostSurfaceDisplayCapability,
    surface: &SurfaceRef,
    width: f32,
    height: f32,
) {
    return (capability.set_display_size)(surface, width, height);
}

impl HostSurfaceResizeCapability {
    pub fn resize(&self, surface: &SurfaceRef, width: f32, height: f32) {
        return resize_surface(self, surface, width, height);
    }
}

impl HostSurfaceDisplayCapability {
    pub fn set_display_size(&self, surface: &SurfaceRef, width: f32, height: f32) {
        return set_surface_display_size(self, surface, width, height);
    }
}
