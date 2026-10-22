// flight-lint: allow-file(contract-vocabulary) D17 shape renderer data retains opaque host surfaces, native wgpu buffers and shared renderer-data handles
//! The per-node shape cache shared by the three shape strategies (TS `wgpuShapeData.ts`): the
//! tessellated half (meshes and their GPU buffers) and the rasterized half (surface and image),
//! each allocated only when a strategy needs it.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity, get_entity_id};
use flight_image::{HostImageCapability, ImageResource};
use flight_node::{NodeRef, RendererData, RendererDataRef};
use flight_render::{CanvasHostSurfaces, create_canvas_host_surface, destroy_canvas_host_surface};
use flight_render_wgpu::{WgpuRenderState, get_wgpu_render_state_runtime};
use flight_surface::{CanvasSurface, HostCanvasCapability, SurfaceRef};

use crate::scene2d_wgpu_runtime::ensure_scene2d_wgpu_runtime;
use crate::types::*;

/// Allocates a shape's cache (TS `createWgpuShapeData`). Both halves start empty: nothing is
/// allocated until a strategy needs it, so a mesh-only scene carries no raster surface.
pub fn create_wgpu_shape_data(
    _state: &mut WgpuRenderState,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    let mut out: WgpuShapeRendererData = allocate_entity();
    out.image = None;
    out.surface = None;
    out.last_content_id = -1;
    out.last_pixel_ratio = 0.0;
    out.last_w = 0.0;
    out.last_h = 0.0;
    out.mesh_version = -1;
    out.meshes = None;
    return Some(Arc::new(RwLock::new(out)));
}

// The image a host wraps around a surface (TS `imageHost.createImageFromSurface?.(surface) ?? null`).
pub(crate) fn create_wgpu_surface_image(
    image_host: &HostImageCapability,
    surface: &Ref<CanvasSurface>,
) -> Option<Ref<ImageResource>> {
    let erased: SurfaceRef = surface.clone();
    return image_host
        .create_image_from_surface
        .as_ref()
        .map(|create| create(&erased));
}

/// Allocates the rasterization surface on first use (TS `acquireWgpuShapeRasterSurface`), wrapping
/// it as an image the quad batch treats like any other texture source. A refused allocation is
/// reported as `None` and not cached.
// flight-lint: allow(conform-params) D5 caller-owned ownership table replaces the TS module WeakMap
pub fn acquire_wgpu_shape_raster_surface(
    surfaces: &mut CanvasHostSurfaces,
    canvas_host: &HostCanvasCapability,
    image_host: &HostImageCapability,
    data: &mut WgpuShapeRendererData,
) -> Option<Ref<CanvasSurface>> {
    if let Some(existing) = &data.surface {
        return Some(existing.clone());
    }
    let surface = create_canvas_host_surface(surfaces, canvas_host, 1.0, 1.0)?;
    data.surface = Some(surface.clone());
    data.image = create_wgpu_surface_image(image_host, &surface);
    return Some(surface);
}

// Destroys the premultiplied GPU texture the batch uploaded for `image` and removes its key from the
// device cache (TS `textureSourcePremultipliedTextureCache.get/delete` + `texture.destroy()`).
pub(crate) fn destroy_wgpu_premultiplied_image_texture(
    state: &WgpuRenderState,
    image: &Ref<ImageResource>,
) {
    let key = get_entity_id(&*image.read().unwrap());
    let context = get_wgpu_render_state_runtime(state).context.clone();
    let entry = context
        .write()
        .unwrap()
        .texture_source_premultiplied_texture_cache
        .remove(&key);
    if let Some(entry) = entry {
        entry.read().unwrap().texture.destroy();
    }
}

/// Frees a shape's cache (TS `destroyWgpuShapeData`): the GPU texture uploaded for its raster
/// surface and that texture's cache key, then the provider-owned surface, then the mesh path's
/// per-shape buffers. A shape that only ever tessellated owns mesh state but no raster resources.
pub fn destroy_wgpu_shape_data(state: &mut WgpuRenderState, data: RendererDataRef) {
    let mut guard = data.write().unwrap();
    let Some(shape_data) = get_wgpu_shape_data(&mut *guard) else {
        return;
    };
    if let Some(image) = &shape_data.image {
        destroy_wgpu_premultiplied_image_texture(state, image);
    }
    if let Some(surface) = &shape_data.surface {
        destroy_canvas_host_surface(
            &mut ensure_scene2d_wgpu_runtime(state).canvas_host_surfaces,
            surface,
        );
    }
    let b = &mut shape_data.mesh_buffers;
    for buffer in &b.vertex_buffers {
        buffer.destroy();
    }
    for buffer in &b.index_buffers {
        buffer.destroy();
    }
    for buffer in &b.uniform_buffers {
        buffer.destroy();
    }
    for buffer in &b.color_scale_bias_uniform_buffers {
        buffer.destroy();
    }
    b.vertex_buffers.clear();
    b.vertex_capacities.clear();
    b.index_buffers.clear();
    b.index_capacities.clear();
    b.uniform_buffers.clear();
    b.bind_groups.clear();
    b.color_scale_bias_uniform_buffers.clear();
    b.color_scale_bias_bind_groups.clear();
}

/// Narrows renderer data to the shape cache (TS `getWgpuShapeData`).
pub fn get_wgpu_shape_data(data: &mut dyn RendererData) -> Option<&mut WgpuShapeRendererData> {
    return data.as_any_mut().downcast_mut::<WgpuShapeRendererData>();
}
