// flight-lint: allow-file(contract-vocabulary) D17 shape renderer data retains opaque host surfaces and shared renderer-data handles

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity, get_entity_id};
use flight_image::HostImageCapability;
use flight_node::{NodeRef, RendererData, RendererDataRef};
use flight_render::{CanvasHostSurfaces, create_canvas_host_surface, destroy_canvas_host_surface};
use flight_render_gl::GlRenderState;
use flight_surface::{CanvasSurface, HostCanvasCapability, SurfaceRef};
use glow::HasContext;

use crate::types::GlShapeRendererData;

pub fn create_gl_shape_data(
    state: &mut GlRenderState,
    source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: GlShapeRendererData = allocate_entity();
    initialize_gl_shape_data(&mut out, state, source);
    return Some(Arc::new(RwLock::new(out)));
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
pub fn initialize_gl_shape_data(
    out: &mut GlShapeRendererData,
    _state: &GlRenderState,
    _source: &NodeRef,
) {
    out.image = None;
    out.last_content_id = -1;
    out.last_h = 0.0;
    out.last_pixel_ratio = 0.0;
    out.last_w = 0.0;
    out.mesh_version = -1;
    out.meshes = None;
    out.surface = None;
}

// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn acquire_gl_shape_raster_surface(
    surfaces: &mut CanvasHostSurfaces,
    canvas_host: &HostCanvasCapability,
    image_host: &HostImageCapability,
    data: &mut GlShapeRendererData,
) -> Option<Ref<CanvasSurface>> {
    if let Some(existing) = &data.surface {
        return Some(existing.clone());
    }
    let surface = create_canvas_host_surface(surfaces, canvas_host, 1.0, 1.0)?;
    data.surface = Some(surface.clone());
    let erased: SurfaceRef = surface.clone();
    data.image = image_host
        .create_image_from_surface
        .as_ref()
        .map(|create| create(&erased));
    return Some(surface);
}

/// Removes an image's premultiplied sRGB-agnostic texture from the shared context cache and deletes
/// it (TS `textureSourcePremultipliedTextureCache.get/delete` + `gl.deleteTexture`).
pub(crate) fn delete_gl_premultiplied_image_texture(
    state: &GlRenderState,
    image: &Ref<flight_image::ImageResource>,
) {
    let key = (get_entity_id(&*image.read().unwrap()), true, false);
    let entry = state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .by_texture_entity
        .remove(&key);
    if let Some(entry) = entry {
        // SAFETY: the cached texture belongs to this context and deletion occurs on the GL thread.
        unsafe { state.gl.delete_texture(entry.texture) };
    }
}

// The batch uploads this shape's raster resource into the shared cache. Teardown deletes that GPU
// texture and removes its key before destroying the host-owned surface; a shape that only ever
// tessellated owns neither resource.
pub fn destroy_gl_shape_data(state: &mut GlRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(shape_data) = get_gl_shape_data(&mut *guard) else {
        return;
    };
    if let Some(image) = &shape_data.image {
        delete_gl_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &shape_data.surface {
        destroy_canvas_host_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            surface,
        );
    }
}

pub fn get_gl_shape_data(data: &mut dyn RendererData) -> Option<&mut GlShapeRendererData> {
    return data.as_any_mut().downcast_mut::<GlShapeRendererData>();
}

pub fn to_gl_shape_renderer_data(data: GlShapeRendererData) -> RendererDataRef {
    return Arc::new(RwLock::new(data));
}
